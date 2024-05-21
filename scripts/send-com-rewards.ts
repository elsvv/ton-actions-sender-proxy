import { Address, beginCell, toNano } from '@ton/core';
import { ProxySender } from '../wrappers/ProxySender';
import { NetworkProvider } from '@ton/blueprint';
import { loadCsv } from '../utils';
import { join } from 'path';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster } from '@ton/ton';

export async function run(provider: NetworkProvider) {
  const massSenderAddress = Address.parse('EQB3d_qgV83BVI0LM8tItZPtKR09Eu82OuAVKMxeb4HthI_J');
  const proxy = provider.open(ProxySender.createFromAddress(massSenderAddress));

  const filename = 'com-reward.csv';
  let data: {
    addr: string;
    burns_num: string;
  }[] = await loadCsv(join(__dirname, filename));

  data = data.filter((d: any) => d.addr);

  console.log('data', data);

  const count = BigInt(data.length);

  const singleTransferValue = toNano('0.05');

  const value = singleTransferValue * count + toNano('0.1');

  const tokenAddress = Address.parse('EQDNJzbNKA8Ix2X7Tv1_jxdCqehPQgJaNbisoIkSq5srnfLs');
  const minter = provider.open(JettonMaster.create(tokenAddress));

  const senderWalletAddress = await minter.getWalletAddress(proxy.address);

  const transferBody = beginCell().storeUint(0, 32).storeStringTail('BURN Community rewards 1 🔥').endCell();

  await proxy.sendMessagesWitCashback(
    provider.sender(),
    value,
    await Promise.all(
      data.map(async (d) => {
        const toAddress = Address.parse(d.addr);
        const noSpace = d.burns_num.replace(/\s+/, '');
        const parsedAmount = Number(noSpace.replace(/,/g, '.'));
        const amount = toNano(parsedAmount);

        return {
          value: singleTransferValue,
          dest: senderWalletAddress,
          body: JettonWallet.transferMessage({
            to: toAddress,
            amount: amount,
            forwardAmount: 1n,
            forwardPayload: transferBody,
            responseAddress: provider.sender().address!,
          }),
        };
      })
    ),
    provider.sender().address!
  );
}
