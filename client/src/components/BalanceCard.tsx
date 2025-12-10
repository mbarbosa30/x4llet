import { useQuery } from '@tanstack/react-query';
import { useInflationAnimation } from '@/hooks/use-inflation-animation';
import AnimatedBalance from './AnimatedBalance';
import { Wallet } from 'lucide-react';

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
    arbitrum?: AaveChainBalance;
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
    arbitrum?: ChainBalance;
  };
  aaveBalance?: AaveBalance;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

interface InflationData {
  currency: string;
  dailyRate: number;
  monthlyRate: number;
  annualRate: number;
}

const CHAIN_COLORS: Record<number, string> = {
  8453: '#0052FF',   // Base - blue
  42220: '#FCFF52',  // Celo - yellow
  100: '#04795B',    // Gnosis - green
  42161: '#12AAFF',  // Arbitrum - cyan
};

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

  // Build chain breakdown with dots and amounts
  const chainBreakdown = chains ? [
    { chainId: 8453, balance: chains.base.balance, balanceMicro: chains.base.balanceMicro },
    { chainId: 42220, balance: chains.celo.balance, balanceMicro: chains.celo.balanceMicro },
    chains.gnosis ? { chainId: 100, balance: chains.gnosis.balance, balanceMicro: chains.gnosis.balanceMicro } : null,
    chains.arbitrum ? { chainId: 42161, balance: chains.arbitrum.balance, balanceMicro: chains.arbitrum.balanceMicro } : null,
  ].filter((c): c is { chainId: number; balance: string; balanceMicro: string } => 
    c !== null && BigInt(c.balanceMicro) > 0n
  ) : [];

  // Compute display currency value
  const hasDisplayData = !!balanceMicro && !!exchangeRate;
  const displayValue = hasDisplayData ? animation.animatedValue : 0;
  const displayMain = hasDisplayData ? animation.mainDecimals : '00';
  const displayExtra = hasDisplayData ? animation.extraDecimals : '';

  return (
    <div className="bg-card border border-foreground/10 p-6 relative min-h-[180px]" data-testid="card-balance">
      <div className="relative z-10 space-y-4">
        {/* Top row: Label left, chain dots right - matching Earn card APY section height */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#0055FF]" />
            USDC Balance
          </div>
          <div className="flex items-center gap-3 px-2.5 py-1" data-testid="text-chain-breakdown">
            {chainBreakdown.length > 0 ? (
              chainBreakdown.map((chain) => (
                <div key={chain.chainId} className="flex items-center gap-1.5">
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: CHAIN_COLORS[chain.chainId] || '#888' }}
                  />
                  <span className="text-xs font-mono text-muted-foreground">${chain.balance}</span>
                </div>
              ))
            ) : (
              <span className="text-xs font-mono text-muted-foreground">--</span>
            )}
          </div>
        </div>
        
        {/* Middle: Main balance display - matching Earn card structure */}
        <div className="text-center py-4">
          <div className="space-y-1">
            <button
              onClick={onRefresh}
              disabled={isRefreshing || !onRefresh}
              className="w-full bg-transparent p-0 border-none text-5xl font-bold tabular-nums flex items-center justify-center tracking-tight cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all disabled:cursor-default disabled:hover:opacity-100 disabled:active:scale-100 focus-visible:outline-none"
              data-testid="button-refresh-balance"
            >
              <span className={`text-3xl font-normal text-muted-foreground mr-1.5 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : ''}`}>$</span>
              <span className={`transition-opacity duration-300 ${isRefreshing ? 'opacity-50 animate-pulse' : ''}`} data-testid="text-balance">{balance}</span>
            </button>
            <div className="flex items-center justify-center gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground" data-testid="text-display-currency">
              <span>≈</span>
              {hasDisplayData ? (
                <AnimatedBalance
                  value={animation.animatedValue}
                  mainDecimals={animation.mainDecimals}
                  extraDecimals={animation.extraDecimals}
                  currency={fiatCurrency}
                  className="inline-flex items-baseline"
                />
              ) : (
                <span>-- {fiatCurrency}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
