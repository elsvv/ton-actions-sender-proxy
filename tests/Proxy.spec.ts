import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, SendMode, beginCell } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { InternalMsgParams, ProxySender } from '../wrappers/ProxySender';

describe('Proxy', () => {
  let code: Cell;
  let blockchain: Blockchain;
  let owner: SandboxContract<TreasuryContract>;
  let proxy: SandboxContract<ProxySender>;

  beforeAll(async () => {
    code = await compile('ProxySender');
    blockchain = await Blockchain.create();
    owner = await blockchain.treasury('owner');

    proxy = blockchain.openContract(ProxySender.createFromConfig({ ownerAddress: owner.address }, code));
  });

  it('should deploy', async () => {
    const deployResult = await proxy.sendDeploy(owner.getSender(), toNano('0.1'));
    expect(deployResult.transactions).toHaveTransaction({
      from: owner.address,
      to: proxy.address,
      deploy: true,
      success: true,
    });
  });

  it('should store a correct owner', async () => {
    expect(await proxy.getOwnerAddress()).toEqualAddress(owner.address);
  });

  const rawMsgsCount = 255;
  it(`should resend ${rawMsgsCount} raw msgs`, async () => {
    let actions: { mode: SendMode; msg: InternalMsgParams }[] = [];
    for (let i = 0; i < rawMsgsCount; i++) {
      const dest = await blockchain.treasury(`dest=${i}`);
      actions.push({
        mode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
        msg: { dest: dest.address, value: 1n, body: beginCell().storeUint(i, 32).endCell(), bounce: false },
      });
    }

    const result = await proxy.sendRawMessages(owner.getSender(), toNano((0.1 * rawMsgsCount + 1).toString()), actions);
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: proxy.address,
      success: true,
    });

    for (let i = 0; i < rawMsgsCount; i++) {
      const action = actions[i];

      expect(result.transactions).toHaveTransaction({
        from: proxy.address,
        to: action.msg.dest,
        success: false,
        body: (x) => Boolean(action.msg.body) && x.equals(action.msg.body!),
      });
    }
  });

  const msgsCount = 253;
  it(`should resend ${msgsCount} msgs with a cashback`, async () => {
    let msgs: InternalMsgParams[] = [];
    for (let i = 0; i < msgsCount; i++) {
      const dest = await blockchain.treasury(`dest=${i}`);
      msgs.push({ dest: dest.address, value: 1n, body: beginCell().storeUint(i, 32).endCell(), bounce: false });
    }

    const result = await proxy.sendMessagesWitCashback(
      owner.getSender(),
      toNano((0.1 * msgsCount + 1).toString()),
      msgs,
      owner.address
    );
    expect(result.transactions).toHaveTransaction({
      from: owner.address,
      to: proxy.address,
      success: true,
    });

    expect(result.transactions).toHaveTransaction({
      from: proxy.address,
      to: owner.address,
      success: true,
    });

    for (let i = 0; i < msgsCount; i++) {
      const msg = msgs[i];

      expect(result.transactions).toHaveTransaction({
        from: proxy.address,
        to: msg.dest,
        success: false,
        body: (x) => Boolean(msg.body) && x.equals(msg.body!),
      });
    }

    expect((await blockchain.getContract(proxy.address)).balance).toEqual(ProxySender.MIN_TONS_FOR_STORAGE);
  });
});
