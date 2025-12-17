import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
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
  const queryClient = useQueryClient();
  
  const query = useQuery<BalanceData>({
    queryKey: ['/api/balance', address],
    enabled: !!address,
    staleTime: 2 * 60 * 1000, // 2 minutes - matches backend cache TTL
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in cache longer for instant display
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
  });
  
  // Force refresh function for pull-to-refresh or post-transaction
  const forceRefresh = useCallback(async () => {
    if (!address) return;
    const res = await fetch(`/api/balance/${address}?refresh=true`);
    if (!res.ok) throw new Error('Failed to fetch balance');
    const data = await res.json();
    queryClient.setQueryData(['/api/balance', address], data);
    return data;
  }, [address, queryClient]);
  
  return { ...query, forceRefresh };
}
