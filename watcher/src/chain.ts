import { createPublicClient, defineChain, http, type PublicClient } from 'viem';

export function makeClient(rpcUrl: string, chainId: number): PublicClient {
  const chain = defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'HSK', symbol: 'HSK', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
}
