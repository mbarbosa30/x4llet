import { useQuery } from '@tanstack/react-query';

export interface AaveBalanceData {
  totalAUsdcBalance: string;
  chains: {
    base: { chainId: number; aUsdcBalance: string; apy: number };
    celo: { chainId: number; aUsdcBalance: string; apy: number };
    gnosis: { chainId: number; aUsdcBalance: string; apy: number };
    arbitrum: { chainId: number; aUsdcBalance: string; apy: number };
  };
}

export function useAaveBalance(address: string | null, enabled: boolean = true) {
  return useQuery<AaveBalanceData>({
    queryKey: ['/api/aave/balance', address],
    enabled: !!address && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });
}
