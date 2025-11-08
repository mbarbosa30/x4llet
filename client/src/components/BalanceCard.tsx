import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, TooltipProps } from 'recharts';
import { useInflationAnimation } from '@/hooks/use-inflation-animation';
import AnimatedBalance from './AnimatedBalance';
import { useState, useEffect } from 'react';

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

interface ChartDataPoint {
  value: number;
  balanceMicro: string;
  timestamp: string;
}

// Custom tooltip wrapper that updates hovered point state
function TooltipWrapper({ 
  active, 
  payload,
  fiatCurrency,
  tooltipAnimation,
  onHoverPoint,
}: TooltipProps<number, string> & { 
  fiatCurrency: string;
  tooltipAnimation: {
    animatedValue: number;
    mainDecimals: string;
    extraDecimals: string;
  } | null;
  onHoverPoint: (balanceMicro: string | null) => void;
}) {
  // Extract stable values to compare
  const activeBalanceMicro = active && payload && payload.length > 0
    ? (payload[0].payload as ChartDataPoint).balanceMicro
    : null;

  // Update parent state when tooltip becomes active/inactive (in effect to avoid render-time state updates)
  useEffect(() => {
    onHoverPoint(activeBalanceMicro);
    // Only depend on activeBalanceMicro (primitive value) to avoid unnecessary updates
  }, [activeBalanceMicro, onHoverPoint]);

  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload as ChartDataPoint;
  const usdcBalance = data.value.toFixed(2);

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <div className="text-xs text-muted-foreground mb-1">
        {new Date(data.timestamp).toLocaleDateString()}
      </div>
      <div className="font-medium">
        {usdcBalance} USDC
      </div>
      {tooltipAnimation && (
        <div className="text-xs text-muted-foreground mt-0.5 flex items-baseline gap-1">
          <span>≈</span>
          <AnimatedBalance
            value={tooltipAnimation.animatedValue}
            mainDecimals={tooltipAnimation.mainDecimals}
            extraDecimals={tooltipAnimation.extraDecimals}
            currency={fiatCurrency}
            className="text-xs"
          />
          <span className="text-[10px] opacity-70">(inflated)</span>
        </div>
      )}
    </div>
  );
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

  // Prepare chart data with enriched data for tooltip
  const chartData = balanceHistory?.map((point) => ({
    value: parseFloat(point.balance) / 1e6, // Convert to USDC units for chart
    balanceMicro: point.balance, // Micro-USDC for tooltip calculation
    timestamp: point.timestamp, // Timestamp for tooltip display
  })) || [];

  // Track hovered point for tooltip animation (using primitive balanceMicro as key)
  const [hoveredBalanceMicro, setHoveredBalanceMicro] = useState<string | null>(null);
  
  // Find the full data point from balanceMicro
  const hoveredPoint = hoveredBalanceMicro
    ? chartData.find(d => d.balanceMicro === hoveredBalanceMicro) || null
    : null;

  // Animate tooltip value with inflation effect (separate from main animation)
  const tooltipAnimation = useInflationAnimation({
    usdcMicro: hoveredPoint?.balanceMicro || '0',
    exchangeRate: exchangeRate || 1,
    inflationRate: inflationData?.annualRate || 0,
    enabled: !!hoveredPoint && !!exchangeRate && !!inflationData,
  });

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
              <Tooltip 
                content={<TooltipWrapper 
                  fiatCurrency={fiatCurrency} 
                  tooltipAnimation={tooltipAnimation}
                  onHoverPoint={setHoveredBalanceMicro}
                />}
                cursor={{ stroke: 'currentColor', strokeWidth: 1, strokeDasharray: '5 5' }}
              />
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
        <div className="text-5xl font-medium tabular-nums mb-2 flex items-center justify-center" data-testid="text-balance">
          <span className="text-3xl opacity-70 mr-1.5">$</span>
          <span>{balance}</span>
        </div>
        {balanceMicro && exchangeRate && (
          <div className="text-base" data-testid="text-fiat-value">
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
          </div>
        )}
      </div>
    </Card>
  );
}
