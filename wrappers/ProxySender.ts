import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  CurrencyCollection,
  MessageRelaxed,
  Sender,
  SendMode,
  StateInit,
  storeCurrencyCollection,
  storeMessageRelaxed,
  toNano,
} from '@ton/core';

import codeRaw from '../build/ProxySender.compiled.json';

export type ProxyConfig = {
  ownerAddress: Address;
};

export function proxyConfigToCell(config: ProxyConfig): Cell {
  return beginCell().storeAddress(config.ownerAddress).endCell();
}

export type InternalMsgParams = {
  bounce?: boolean;
  dest: Address;
  value: bigint | CurrencyCollection;
  body?: Cell;
  init?: StateInit | null;
};

function createMsgInternal(params: InternalMsgParams): MessageRelaxed {
  return {
    info: {
      type: 'internal',
      ihrDisabled: true,
      bounce: params.bounce ?? true,
      bounced: false,
      dest: params.dest,
      value: typeof params.value === 'bigint' ? { coins: params.value } : params.value,
      ihrFee: 0n,
      forwardFee: 0n,
      createdLt: 0n,
      createdAt: 0,
    },
    body: params.body || Cell.EMPTY,
    init: params.init,
  };
}

function packActionSendMsg(mode: SendMode, msg: InternalMsgParams) {
  const ActionSendMsgTag = 0x0ec3c86d;
  return beginCell()
    .storeUint(ActionSendMsgTag, 32)
    .storeUint(mode, 8)
    .storeRef(
      beginCell()
        .store(storeMessageRelaxed(createMsgInternal(msg)))
        .endCell()
    )
    .endCell();
}

function packActionRawReserve(mode: number, coins: bigint) {
  const ActionRawReserveTag = 0x36e6b809;
  return beginCell()
    .storeUint(ActionRawReserveTag, 32)
    .storeUint(mode, 8)
    .store(storeCurrencyCollection({ coins }))
    .endCell();
}

function packActionsList(rawActions: Cell[]): Cell {
  let actionsCell = Cell.EMPTY;
  for (const action of rawActions) {
    actionsCell = beginCell().storeRef(actionsCell).storeSlice(action.asSlice()).endCell();
  }
  return actionsCell;
}

export class ProxySender implements Contract {
  static CODE_BOC_HEX = codeRaw.hex;
  static MIN_TONS_FOR_STORAGE = toNano('0.005');

  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

  static createFromAddress(address: Address) {
    return new ProxySender(address);
  }

  static createFromConfig(config: ProxyConfig, code: Cell, workchain = 0) {
    const data = proxyConfigToCell(config);
    const init = { code, data };
    return new ProxySender(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendRawMessages(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    msgActions: { mode: SendMode; msg: InternalMsgParams }[]
  ) {
    if (msgActions.length > 255) {
      throw new Error(`${msgActions.length} messages were provided. You can send max 255 actions.`);
    }
    msgActions = [...msgActions];
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeRef(packActionsList(msgActions.reverse().map(({ mode, msg }) => packActionSendMsg(mode, msg))))
        .endCell(),
    });
  }

  async sendMessagesWitCashback(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    msgs: InternalMsgParams[],
    gasToAddress: Address
  ) {
    if (msgs.length > 253) {
      throw new Error(`${msgs.length} messages were provided. For a cashback call, max limit is 253.`);
    }

    let actions: Cell[] = msgs.map((m) => packActionSendMsg(SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS, m));
    actions.push(packActionRawReserve(0, ProxySender.MIN_TONS_FOR_STORAGE));
    actions.push(packActionSendMsg(SendMode.CARRY_ALL_REMAINING_BALANCE, { value: 0n, dest: gasToAddress }));

    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().storeRef(packActionsList(actions)).endCell(),
    });
  }

  async getOwnerAddress(provider: ContractProvider) {
    const result = await provider.get('get_proxy_owner_address', []);
    return result.stack.readAddress();
  }
}
