import { useQuery } from '@tanstack/react-query';
import type { BalanceResponse } from '@shared/schema';

export interface BalanceData extends BalanceResponse {
  chains?: {
    base: { balance: string; balanceMicro: string; chainId: number };
    celo: { balance: string; balanceMicro: string; chainId: number };
    gnosis: { balance: string; balanceMicro: string; chainId: number };
    arbitrum?: { balance: string; balanceMicro: string; chainId: number };
  };
}

export function useBalance(address: string | null) {
  return useQuery<BalanceData>({
    queryKey: ['/api/balance', address],
    enabled: !!address,
    staleTime: 30 * 1000, // 30 seconds - allows background refresh after transactions
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
  });
}
