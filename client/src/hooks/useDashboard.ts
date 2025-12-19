import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { Transaction } from '@shared/schema';

interface ChainBalance {
  chainId: number;
  balance: string;
  balanceMicro: string;
}

export interface DashboardBalance {
  balance: string;
  balanceMicro: string;
  decimals: number;
  nonce: number;
  chains: {
    base: ChainBalance;
    celo: ChainBalance;
    gnosis: ChainBalance;
    arbitrum: ChainBalance;
  };
}

export interface DashboardXp {
  totalXp: number;
  claimCount: number;
  lastClaimTime: string | null;
  canClaim: boolean;
  nextClaimTime: string | null;
  timeUntilNextClaim: number | null;
}

export interface DashboardMaxFlow {
  local_health?: number;
  vouch_counts?: {
    incoming_active?: number;
    outgoing_active?: number;
  };
  cached_at?: string;
}

export interface DashboardSybil {
  suspicious: boolean;
  reason?: string;
}

export interface DashboardData {
  balance: DashboardBalance;
  transactions: (Transaction & { chainId: number })[];
  xp: DashboardXp;
  maxflow: DashboardMaxFlow | null;
  sybil: DashboardSybil | null;
}

export function useDashboard(address: string | null) {
  return useQuery<DashboardData>({
    queryKey: ['/api/dashboard', address],
    enabled: !!address,
    staleTime: 2 * 60 * 1000, // 2 minutes - reduce refetches
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
    refetchOnWindowFocus: false, // Don't refetch when tab regains focus
    refetchOnReconnect: false, // Don't refetch on network reconnect
    placeholderData: keepPreviousData, // Show cached data while refreshing
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/${address}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard');
      return res.json();
    },
  });
}
