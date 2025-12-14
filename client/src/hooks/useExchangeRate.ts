import { useQuery } from '@tanstack/react-query';

export interface ExchangeRateData {
  currency: string;
  rate: number;
}

interface UseExchangeRateOptions {
  skipUsd?: boolean;
}

export function useExchangeRate(currency: string | null, options?: UseExchangeRateOptions) {
  const { skipUsd = true } = options ?? {};
  
  return useQuery<ExchangeRateData>({
    queryKey: ['/api/exchange-rate', currency],
    enabled: !!currency && (!skipUsd || currency !== 'USD'),
    staleTime: 15 * 60 * 1000, // 15 minutes - exchange rates change slowly
    queryFn: async () => {
      const res = await fetch(`/api/exchange-rate/${currency}`);
      if (!res.ok) throw new Error('Failed to fetch exchange rate');
      return res.json();
    },
  });
}
