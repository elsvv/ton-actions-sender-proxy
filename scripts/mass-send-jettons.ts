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

  const filename = 'drop-results.csv';
  const data: {
    address: string;
  }[] = await loadCsv(join(__dirname, filename));

  const count = BigInt(data.length);

  const singleTransferValue = toNano('0.05');

  const value = singleTransferValue * count + toNano('0.1');

  const allAmount = toNano('10000000');

  const tokenAddress = Address.parse('EQDNJzbNKA8Ix2X7Tv1_jxdCqehPQgJaNbisoIkSq5srnfLs');
  const minter = provider.open(JettonMaster.create(tokenAddress));

  const senderWalletAddress = await minter.getWalletAddress(proxy.address);

  const transferBody = beginCell().storeUint(0, 32).storeStringTail('Follow the Fire 🔥').endCell();

  await proxy.sendMessagesWitCashback(
    provider.sender(),
    value,
    await Promise.all(
      data.map(async (d) => {
        const toAddress = Address.parse(d.address);
        return {
          value: singleTransferValue,
          dest: senderWalletAddress,
          body: JettonWallet.transferMessage({
            to: toAddress,
            amount: allAmount / count,
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
