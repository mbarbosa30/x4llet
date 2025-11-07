import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface BalanceCardProps {
  balance: string;
  currency: string;
  fiatValue?: string;
  fiatCurrency?: string;
  address?: string;
  chainId?: number;
}

interface BalanceHistoryPoint {
  timestamp: string;
  balance: string;
}

interface InflationData {
  currency: string;
  dailyRate: number;
  monthlyRate: number;
}

export default function BalanceCard({ 
  balance, 
  currency, 
  fiatValue, 
  fiatCurrency = 'USD',
  address,
  chainId,
}: BalanceCardProps) {
  const [animatedFiatValue, setAnimatedFiatValue] = useState<number | null>(null);

  // Fetch balance history for chart (90 days)
  const { data: balanceHistory } = useQuery<BalanceHistoryPoint[]>({
    queryKey: ['/api/balance-history', address, chainId],
    enabled: !!address && !!chainId,
    queryFn: async () => {
      const res = await fetch(`/api/balance-history/${address}?chainId=${chainId}&days=90`);
      if (!res.ok) throw new Error('Failed to fetch balance history');
      return res.json();
    },
  });

  // Fetch inflation rate for animation
  const { data: inflationData } = useQuery<InflationData>({
    queryKey: ['/api/inflation-rate', fiatCurrency],
    enabled: !!fiatValue,
    queryFn: async () => {
      const res = await fetch(`/api/inflation-rate/${fiatCurrency}`);
      if (!res.ok) throw new Error('Failed to fetch inflation rate');
      return res.json();
    },
  });

  // Initialize animated value when fiatValue changes
  useEffect(() => {
    if (fiatValue) {
      setAnimatedFiatValue(parseFloat(fiatValue));
    }
  }, [fiatValue]);

  // Animate fiat value based on inflation rate
  useEffect(() => {
    if (!inflationData || animatedFiatValue === null || inflationData.dailyRate === 0) {
      return;
    }

    const secondlyRate = inflationData.dailyRate / (24 * 60 * 60);
    
    const interval = setInterval(() => {
      setAnimatedFiatValue((prev) => {
        if (prev === null) return prev;
        return prev * (1 + secondlyRate);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [inflationData, animatedFiatValue]);

  // Prepare chart data
  const chartData = balanceHistory?.map((point) => ({
    value: parseFloat(point.balance) / 1e6, // Convert to USDC units
  })) || [];

  const displayFiatValue = animatedFiatValue !== null
    ? animatedFiatValue.toFixed(2)
    : fiatValue;

  return (
    <Card className="p-8 text-center relative overflow-hidden" data-testid="card-balance">
      {/* Background chart */}
      {chartData.length > 1 && (
        <div className="absolute inset-0 opacity-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="currentColor" 
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Content overlay */}
      <div className="relative z-10">
        <div className="text-sm text-muted-foreground mb-2">{currency} Balance</div>
        <div className="text-5xl font-medium tabular-nums mb-2" data-testid="text-balance">
          {balance}
        </div>
        {displayFiatValue && (
          <div className="text-sm text-muted-foreground" data-testid="text-fiat-value">
            ≈ {fiatCurrency} {displayFiatValue}
            {inflationData && inflationData.dailyRate !== 0 && (
              <span className="ml-1 text-xs opacity-60">
                ({inflationData.dailyRate > 0 ? '+' : ''}{(inflationData.monthlyRate * 100).toFixed(2)}%/mo)
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
