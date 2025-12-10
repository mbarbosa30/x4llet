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

// Chain styling helpers matching Send page
const getChainStyle = (chainId: number) => {
  switch (chainId) {
    case 8453: return { bg: 'bg-blue-500', letter: 'B' };      // Base
    case 42220: return { bg: 'bg-yellow-500', letter: 'C' };   // Celo
    case 100: return { bg: 'bg-green-600', letter: 'G' };      // Gnosis
    case 42161: return { bg: 'bg-cyan-500', letter: 'A' };     // Arbitrum
    default: return { bg: 'bg-gray-500', letter: '?' };
  }
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

  return (
    <div className="bg-card border border-foreground/10 p-6 relative min-h-[200px] flex flex-col" data-testid="card-balance">
      {/* Top row: icon top-left, title centered, fiat display top-right - fixed height */}
      <div className="relative h-5 flex items-center">
        <Wallet className="h-4 w-4 text-[#0055FF] absolute left-0" />
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 text-center flex-1">
          USDC Balance
        </div>
        <div className="absolute right-0 text-xs font-mono text-muted-foreground" data-testid="text-display-currency">
          {hasDisplayData ? (
            <span className="flex items-baseline gap-0.5">
              <span>≈</span>
              <span>{fiatCurrency}</span>
              <span className="font-bold">{Math.floor(animation.animatedValue).toLocaleString()}.{animation.mainDecimals}</span>
            </span>
          ) : (
            <span>≈ {fiatCurrency} --</span>
          )}
        </div>
      </div>
      
      {/* Center: Main balance display - vertically and horizontally centered */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <button
          onClick={onRefresh}
          disabled={isRefreshing || !onRefresh}
          className="bg-transparent p-0 border-none text-5xl font-bold tabular-nums flex items-center justify-center tracking-tight cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all disabled:cursor-default disabled:hover:opacity-100 disabled:active:scale-100 focus-visible:outline-none"
          data-testid="button-refresh-balance"
        >
          <span className={`text-3xl font-normal text-muted-foreground mr-1.5 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : ''}`}>$</span>
          <span className={`transition-opacity duration-300 ${isRefreshing ? 'opacity-50 animate-pulse' : ''}`} data-testid="text-balance">{balance}</span>
        </button>
      </div>
      
      {/* Bottom: Chain breakdown - matching Send page styling - fixed height */}
      <div className="flex items-center justify-center gap-4 h-6" data-testid="text-chain-breakdown">
        {chainBreakdown.length > 0 ? (
          chainBreakdown.map((chain) => {
            const style = getChainStyle(chain.chainId);
            return (
              <div key={chain.chainId} className="flex items-center gap-1.5">
                <span className={`inline-flex items-center justify-center w-4 h-4 text-[8px] font-bold text-white ${style.bg}`}>
                  {style.letter}
                </span>
                <span className="text-xs font-mono text-muted-foreground">${chain.balance}</span>
              </div>
            );
          })
        ) : (
          <span className="text-xs font-mono text-muted-foreground">--</span>
        )}
      </div>
    </div>
  );
}
