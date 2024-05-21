import { toNano } from '@ton/core';
import { ProxySender } from '../wrappers/ProxySender';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
  const proxy = provider.open(
    ProxySender.createFromConfig({ ownerAddress: provider.sender().address! }, await compile('ProxySender'))
  );

  await proxy.sendDeploy(provider.sender(), toNano('0.02'));

  console.log('Mass sender address:');
  console.log(proxy.address);

  await provider.waitForDeploy(proxy.address);
}
