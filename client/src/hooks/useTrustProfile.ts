import { useQuery } from '@tanstack/react-query';

export interface TrustProfile {
  address: string;
  sybil: {
    score: number;
    tier: 'clear' | 'warn' | 'limit' | 'block';
    signals: string[];
    xpMultiplier: number;
    isOverridden: boolean;
  };
  localFace: {
    enrolled: boolean;
    duplicate: boolean;
    lastVerified: string | null;
  };
  maxflow: {
    score: number;
    tier: 'new' | 'standard' | 'trusted' | 'verified';
    vouches: number;
    outgoingVouches: number;
  };
  limits: {
    dailyXpCap: number;
    canRedeemUsdc: boolean;
    usdcBlockReason: string | null;
    currentXp: number | null;
    pendingFaceXp: number;
  };
  updatedAt: string;
}

export function useTrustProfile(address: string | null) {
  return useQuery<TrustProfile>({
    queryKey: ['/api/trust-profile', address],
    queryFn: async () => {
      if (!address) throw new Error('No address');
      const res = await fetch(`/api/trust-profile/${address}`);
      if (!res.ok) throw new Error('Failed to fetch trust profile');
      return res.json();
    },
    enabled: !!address,
    staleTime: 30000,
    retry: 1,
  });
}
