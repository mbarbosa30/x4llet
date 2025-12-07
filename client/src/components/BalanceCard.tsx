import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, TooltipProps } from 'recharts';
import { useInflationAnimation } from '@/hooks/use-inflation-animation';
import AnimatedBalance from './AnimatedBalance';
import { useState, useEffect } from 'react';

interface ChainBalance {
  chainId: number;
  balance: string;
  balanceMicro: string;
}

interface AaveChainBalance {
  chainId: number;
  aUsdcBalance: string;
  apy: number;
}

interface AaveBalance {
  totalAUsdcBalance: string;
  chains: {
    base: AaveChainBalance;
    celo: AaveChainBalance;
    gnosis?: AaveChainBalance;
  };
}

interface BalanceCardProps {
  balance: string;
  currency: string;
  balanceMicro?: string;
  exchangeRate?: number;
  fiatCurrency?: string;
  address?: string;
  chainId?: number;
  chains?: {
    base: ChainBalance;
    celo: ChainBalance;
    gnosis?: ChainBalance;
  };
  aaveBalance?: AaveBalance;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
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
    <div className="bg-popover border border-foreground/10 p-3 text-sm">
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
  chains,
  aaveBalance,
  onRefresh,
  isRefreshing,
}: BalanceCardProps) {

  // Fetch aggregated balance history (chainId=0) when no specific chain selected
  const { data: aggregatedHistory } = useQuery<BalanceHistoryPoint[]>({
    queryKey: ['/api/balance-history', address, 0],
    enabled: !!address && !chainId,
    queryFn: async () => {
      const res = await fetch(`/api/balance-history/${address}?chainId=0&days=90`);
      if (!res.ok) throw new Error('Failed to fetch aggregated balance history');
      return res.json();
    },
  });

  // Fetch single chain history when chainId is specified
  const { data: singleChainHistory } = useQuery<BalanceHistoryPoint[]>({
    queryKey: ['/api/balance-history', address, chainId],
    enabled: !!address && !!chainId,
    queryFn: async () => {
      const res = await fetch(`/api/balance-history/${address}?chainId=${chainId}&days=90`);
      if (!res.ok) throw new Error('Failed to fetch balance history');
      return res.json();
    },
  });

  // Use aggregated history when no specific chain selected, otherwise use single chain
  const balanceHistory = chainId ? singleChainHistory : aggregatedHistory;

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

  // Use liquid USDC balance only (aUSDC is shown separately in Earn section)
  const liquidBalanceMicro = balanceMicro || '0';

  // Animate fiat value with inflation effect (using liquid USDC only)
  const animation = useInflationAnimation({
    usdcMicro: liquidBalanceMicro,
    exchangeRate: exchangeRate || 1,
    inflationRate: inflationData?.annualRate || 0,
    enabled: liquidBalanceMicro !== '0' && !!exchangeRate && !!inflationData,
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
    <div className="bg-card border border-foreground/10 p-8 text-center relative overflow-hidden" data-testid="card-balance">
      {/* Background chart - subtle */}
      {chartData.length > 1 && (
        <div className="absolute inset-0 opacity-[0.04]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <YAxis domain={getYDomain()} hide />
              <Tooltip 
                content={<TooltipWrapper 
                  fiatCurrency={fiatCurrency} 
                  tooltipAnimation={tooltipAnimation}
                  onHoverPoint={setHoveredBalanceMicro}
                />}
                cursor={{ stroke: 'hsl(var(--foreground))', strokeWidth: 1, strokeDasharray: '5 5' }}
              />
              <Line 
                type="natural" 
                dataKey="value" 
                stroke="hsl(var(--foreground))" 
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
        <div className="text-xs mb-2 font-mono uppercase tracking-widest text-muted-foreground"><span className="font-bold">{currency}</span> Balance</div>
        
        {/* Chain breakdown - between label and main amount */}
        {chains && (
          <div className="text-[10px] mb-2 font-mono text-muted-foreground" data-testid="text-chain-breakdown">
            {[
              BigInt(chains.base.balanceMicro) > 0n && `Base $${chains.base.balance}`,
              BigInt(chains.celo.balanceMicro) > 0n && `Celo $${chains.celo.balance}`,
              chains.gnosis && BigInt(chains.gnosis.balanceMicro) > 0n && `Gnosis $${chains.gnosis.balance}`,
            ].filter(Boolean).join(' · ') || 'No balance'}
          </div>
        )}
        
        <button
          onClick={onRefresh}
          disabled={isRefreshing || !onRefresh}
          className="w-full bg-transparent p-0 border-none text-5xl font-bold tabular-nums mb-2 flex items-center justify-center tracking-tight cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all disabled:cursor-default disabled:hover:opacity-100 disabled:active:scale-100 focus-visible:outline-none group"
          data-testid="button-refresh-balance"
        >
          <span className={`text-3xl font-normal text-muted-foreground mr-1.5 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : ''}`}>$</span>
          <span className={`transition-opacity duration-300 ${isRefreshing ? 'opacity-50 animate-pulse' : ''}`} data-testid="text-balance">{balance}</span>
        </button>

        {balanceMicro && exchangeRate && (
          <div className="text-base text-muted-foreground" data-testid="text-fiat-value">
            <div className="flex items-baseline justify-center">
              <span className="mr-2">≈</span>
              <AnimatedBalance
                value={animation.animatedValue}
                mainDecimals={animation.mainDecimals}
                extraDecimals={animation.extraDecimals}
                currency={fiatCurrency}
                className=""
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
