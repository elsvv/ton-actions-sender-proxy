import { toNano } from '@ton/core';
import { ProxySender } from '../wrappers/ProxySender';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
  const proxy = provider.open(
    ProxySender.createFromConfig({ ownerAddress: provider.sender().address! }, await compile('ProxySender'))
  );

  await proxy.sendDeploy(provider.sender(), toNano('0.05'));

  await provider.waitForDeploy(proxy.address);

  // run methods on `proxy`
}
