import { Address, beginCell, Cell, Contract, ContractProvider, Sender, SendMode, toNano } from '@ton/core';

type BaseTransferParams = {
  amount: bigint;
  to: Address;
  responseAddress?: Address;
  customPayload?: Cell;
};

type ForwardTransferParams =
  | { forwardAmount: bigint; forwardPayload: Cell }
  | { forwardAmount?: bigint; forwardPayload?: Cell };

type TransferParams = BaseTransferParams & ForwardTransferParams;

type BurnParams = { amount: bigint; responseAddress: Address; customPayload?: Cell };

export const jettonWalletOPs = {
  transfer: 0xf8a7ea5,
  internal_transfer: 0x178d4519,
  transfer_notification: 0x7362d09c,
  excesses: 0xd53276db,
  burn: 0x595f07bc,
  burn_notification: 0x7bdd97de,
  provide_wallet_address: 0x2c76b973,
  take_wallet_address: 0xd1735400,
};

export class JettonWallet implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address) {
    return new JettonWallet(address);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getJettonBalance(provider: ContractProvider) {
    let state = await provider.getState();
    if (state.state.type !== 'active') {
      return 0n;
    }
    let res = await provider.get('get_wallet_data', []);
    return res.stack.readBigNumber();
  }
  static transferMessage(params: TransferParams) {
    return beginCell()
      .storeUint(0xf8a7ea5, 32)
      .storeUint(0, 64) // op, queryId
      .storeCoins(params.amount)
      .storeAddress(params.to)
      .storeAddress(params.responseAddress)
      .storeMaybeRef(params.customPayload)
      .storeCoins(params.forwardAmount ?? toNano('0.000000001')) // notify message
      .storeMaybeRef(params.forwardPayload)
      .endCell();
  }
  async sendTransfer(provider: ContractProvider, via: Sender, value: bigint, params: TransferParams) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      value,
      body: JettonWallet.transferMessage(params),
    });
  }
  /*
    burn#595f07bc query_id:uint64 amount:(VarUInteger 16)
                  response_destination:MsgAddress custom_payload:(Maybe ^Cell)
                  = InternalMsgBody;
  */
  static burnMessage(params: BurnParams) {
    return beginCell()
      .storeUint(0x595f07bc, 32)
      .storeUint(0, 64) // op, queryId
      .storeCoins(params.amount)
      .storeAddress(params.responseAddress)
      .storeMaybeRef(params.customPayload)
      .endCell();
  }

  async sendBurn(provider: ContractProvider, via: Sender, value: bigint, params: BurnParams) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: JettonWallet.burnMessage(params),
      value: value,
    });
  }
  /*
    withdraw_tons#107c49ef query_id:uint64 = InternalMsgBody;
  */
  static withdrawTonsMessage() {
    return beginCell()
      .storeUint(0x6d8e5e3c, 32)
      .storeUint(0, 64) // op, queryId
      .endCell();
  }

  async sendWithdrawTons(provider: ContractProvider, via: Sender) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: JettonWallet.withdrawTonsMessage(),
      value: toNano('0.1'),
    });
  }
  /*
    withdraw_jettons#10 query_id:uint64 wallet:MsgAddressInt amount:Coins = InternalMsgBody;
  */
  static withdrawJettonsMessage(from: Address, amount: bigint) {
    return beginCell()
      .storeUint(0x768a50b2, 32)
      .storeUint(0, 64) // op, queryId
      .storeAddress(from)
      .storeCoins(amount)
      .storeMaybeRef(null)
      .endCell();
  }

  async sendWithdrawJettons(provider: ContractProvider, via: Sender, from: Address, amount: bigint) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: JettonWallet.withdrawJettonsMessage(from, amount),
      value: toNano('0.1'),
    });
  }
}
