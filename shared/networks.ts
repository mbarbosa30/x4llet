export interface NetworkConfig {
  chainId: number;
  name: string;
  usdcAddress: string;
  rpcUrl: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  base: {
    chainId: 8453,
    name: 'Base',
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    rpcUrl: 'https://mainnet.base.org',
  },
  celo: {
    chainId: 42220,
    name: 'Celo',
    usdcAddress: '0xef4229c8c3250C675F21BCefa42f58EfbfF6002a',
    rpcUrl: 'https://forno.celo.org',
  },
};

export function getNetworkConfig(network: 'base' | 'celo'): NetworkConfig {
  return NETWORKS[network];
}
