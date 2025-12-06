import { Card } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, TooltipProps } from 'recharts';
import { useInflationAnimation } from '@/hooks/use-inflation-animation';
import { useEarningAnimation } from '@/hooks/use-earning-animation';
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
  earnMode?: boolean;
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
  chains,
  aaveBalance,
  earnMode,
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

  // Calculate total balance (liquid + Aave) using BigInt for precision
  const totalBalanceMicro = (() => {
    const liquid = balanceMicro ? BigInt(balanceMicro) : 0n;
    const aave = aaveBalance?.totalAUsdcBalance ? BigInt(aaveBalance.totalAUsdcBalance) : 0n;
    return String(liquid + aave);
  })();

  // Animate fiat value with inflation effect (using total balance including Aave)
  const animation = useInflationAnimation({
    usdcMicro: totalBalanceMicro,
    exchangeRate: exchangeRate || 1,
    inflationRate: inflationData?.annualRate || 0,
    enabled: totalBalanceMicro !== '0' && !!exchangeRate && !!inflationData,
  });

  // Calculate balance-weighted APY across chains (including Gnosis)
  const calculateWeightedApy = () => {
    if (!aaveBalance) return 0;
    
    const baseBalance = parseFloat(aaveBalance.chains.base.aUsdcBalance);
    const celoBalance = parseFloat(aaveBalance.chains.celo.aUsdcBalance);
    const gnosisBalance = aaveBalance.chains.gnosis ? parseFloat(aaveBalance.chains.gnosis.aUsdcBalance) : 0;
    const totalBalance = baseBalance + celoBalance + gnosisBalance;
    
    if (totalBalance === 0) return 0;
    
    // Weight APY by the actual balance distribution
    const gnosisApy = aaveBalance.chains.gnosis?.apy || 0;
    const weightedApy = (
      (aaveBalance.chains.base.apy * baseBalance) + 
      (aaveBalance.chains.celo.apy * celoBalance) +
      (gnosisApy * gnosisBalance)
    ) / totalBalance;
    
    return weightedApy;
  };
  
  const weightedApy = calculateWeightedApy();

  // Animate USDC balance with earning effect when Earn Mode is active
  const earningAnimation = useEarningAnimation({
    usdcMicro: balanceMicro || '0',
    aaveBalanceMicro: aaveBalance?.totalAUsdcBalance || '0',
    apyRate: weightedApy / 100,
    enabled: !!earnMode && !!aaveBalance && BigInt(aaveBalance.totalAUsdcBalance) > 0n,
  });
  
  const isEarning = earnMode && aaveBalance && BigInt(aaveBalance.totalAUsdcBalance) > 0n;

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
    <Card className="p-8 text-center relative overflow-hidden border-foreground" data-testid="card-balance">
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
                type="natural" 
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
        <div className="text-xs text-muted-foreground mb-2 font-mono uppercase tracking-widest">{currency} Balance</div>
        <div className="text-5xl font-black tabular-nums mb-2 flex items-center justify-center tracking-tighter" data-testid="text-balance">
          <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
          {isEarning ? (
            <span className="inline-flex items-baseline">
              <span>{Math.floor(earningAnimation.animatedValue)}</span>
              <span className="opacity-90">.{earningAnimation.mainDecimals}</span>
              {earningAnimation.extraDecimals && (
                <span className="text-[0.28em] font-light text-success opacity-70 relative ml-0.5" style={{ top: '-0.65em' }}>
                  {earningAnimation.extraDecimals}
                </span>
              )}
            </span>
          ) : (
            <span>{balance}</span>
          )}
        </div>
        
        {/* Chain breakdown - always show when chains data is available */}
        {chains && (
          <div className="text-xs text-muted-foreground mb-3 flex items-center justify-center gap-3 opacity-40 flex-wrap">
            <span data-testid="text-base-balance">${chains.base.balance} Base</span>
            <span className="opacity-50">+</span>
            <span data-testid="text-celo-balance">${chains.celo.balance} Celo</span>
            {chains.gnosis && BigInt(chains.gnosis.balanceMicro) > 0n && (
              <>
                <span className="opacity-50">+</span>
                <span data-testid="text-gnosis-balance">${chains.gnosis.balance} Gnosis</span>
              </>
            )}
          </div>
        )}

        {/* Aave earning indicator */}
        {earnMode && aaveBalance && BigInt(aaveBalance.totalAUsdcBalance) > 0n && (
          <div 
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-wide mb-3"
            data-testid="badge-earning"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span>
              Earning {weightedApy.toFixed(2)}% APY
            </span>
          </div>
        )}
        
        {balanceMicro && exchangeRate && (
          <div className="text-base" data-testid="text-fiat-value">
            <div className="flex items-baseline justify-center">
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
