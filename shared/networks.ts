import { getAddress } from 'viem';

export interface NetworkConfig {
  chainId: number;
  name: string;
  usdcAddress: string;
  rpcUrl: string;
  aavePoolAddress?: string;
  aUsdcAddress?: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  base: {
    chainId: 8453,
    name: 'Base',
    usdcAddress: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
    rpcUrl: 'https://mainnet.base.org',
    aavePoolAddress: getAddress('0xA238Dd80C259a72E81d7e4664a9801593F98d1c5'),
    aUsdcAddress: getAddress('0x4e65fE4DbA92790696d040aC24Aa414708F5c0AB'),
  },
  celo: {
    chainId: 42220,
    name: 'Celo',
    usdcAddress: getAddress('0xcebA9300f2b948710d2653dD7B07f33A8B32118C'),
    rpcUrl: 'https://forno.celo.org',
    aavePoolAddress: getAddress('0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402'),
    aUsdcAddress: getAddress('0xFF8309b9e99bfd2D4021bc71a362aBD93dBd4785'),
  },
  gnosis: {
    chainId: 100,
    name: 'Gnosis',
    usdcAddress: getAddress('0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0'),
    rpcUrl: 'https://rpc.gnosischain.com',
    aavePoolAddress: getAddress('0xb50201558B00496A145fE76f7424749556E326D8'),
    aUsdcAddress: getAddress('0xC0333cb85B59a788d8C7CAe5e1Fd6E229A3E5a65'),
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum',
    usdcAddress: getAddress('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    aavePoolAddress: getAddress('0x794a61358D6845594F94dc1DB02A252b5b4814aD'),
    aUsdcAddress: getAddress('0x724dc807b04555b71ed48a6896b6F41593b8C637'),
  },
};

export function getNetworkConfig(network: 'base' | 'celo' | 'gnosis' | 'arbitrum'): NetworkConfig {
  return NETWORKS[network];
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find(n => n.chainId === chainId);
}
