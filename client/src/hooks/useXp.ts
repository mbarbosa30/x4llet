import { useQuery } from '@tanstack/react-query';

export interface XpData {
  totalXp: number;
  pendingFaceXp: number;
  claimCount: number;
  lastClaimTime: string | null;
  canClaim: boolean;
  nextClaimTime: string | null;
  timeUntilNextClaim: number | null;
}

interface UseXpOptions {
  staleTime?: number;
}

export function useXp(address: string | null, options?: UseXpOptions) {
  const { staleTime = 5 * 60 * 1000 } = options ?? {};
  
  return useQuery<XpData>({
    queryKey: ['/api/xp', address],
    enabled: !!address,
    staleTime,
  });
}
