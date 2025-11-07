import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { useInflationAnimation } from '@/hooks/use-inflation-animation';
import AnimatedBalance from './AnimatedBalance';

interface BalanceCardProps {
  balance: string;
  currency: string;
  balanceMicro?: string; // Micro-USDC balance for animation
  exchangeRate?: number; // Exchange rate for local currency
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
  annualRate: number;
}

export default function BalanceCard({ 
  balance, 
  currency, 
  balanceMicro,
  exchangeRate,
  fiatCurrency = 'USD',
  address,
  chainId,
}: BalanceCardProps) {

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
    enabled: !!balanceMicro && !!exchangeRate,
    queryFn: async () => {
      const res = await fetch(`/api/inflation-rate/${fiatCurrency}`);
      if (!res.ok) throw new Error('Failed to fetch inflation rate');
      return res.json();
    },
  });

  // Animate fiat value with inflation effect
  const animation = useInflationAnimation({
    usdcMicro: balanceMicro || '0',
    exchangeRate: exchangeRate || 1,
    inflationRate: inflationData?.annualRate || 0,
    enabled: !!balanceMicro && !!exchangeRate && !!inflationData,
  });

  // Prepare chart data
  const chartData = balanceHistory?.map((point) => ({
    value: parseFloat(point.balance) / 1e6, // Convert to USDC units
  })) || [];

  // Calculate Y-axis domain with 10% padding for better framing
  const getYDomain = (): [number | string, number | string] => {
    if (chartData.length === 0) return ['dataMin', 'dataMax'];
    
    const values = chartData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    // Add 10% padding to top and bottom
    const padding = range * 0.1;
    return [min - padding, max + padding];
  };

  return (
    <Card className="p-8 text-center relative overflow-hidden" data-testid="card-balance">
      {/* Background chart */}
      {chartData.length > 1 && (
        <div className="absolute inset-0 opacity-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <YAxis domain={getYDomain()} hide />
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
        {balanceMicro && exchangeRate && (
          <div className="text-sm" data-testid="text-fiat-value">
            <div className="flex items-center justify-center">
              <span className="text-muted-foreground mr-2">≈</span>
              <AnimatedBalance
                value={animation.animatedValue}
                mainDecimals={animation.mainDecimals}
                extraDecimals={animation.extraDecimals}
                currency={fiatCurrency}
                className="text-muted-foreground"
              />
            </div>
            {inflationData && inflationData.monthlyRate !== 0 && (
              <div className="text-xs opacity-60 mt-1">
                ({inflationData.monthlyRate > 0 ? '+' : ''}{(inflationData.monthlyRate * 100).toFixed(2)}%/mo inflation)
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
