import { useQuery } from '@tanstack/react-query';
import { useInflationAnimation } from '@/hooks/use-inflation-animation';
import AnimatedBalance from './AnimatedBalance';

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

  return (
    <div className="bg-card border border-foreground p-6 text-center relative" data-testid="card-balance">
      {/* Content */}
      <div className="relative z-10">
        <div className="text-[10px] mb-4 font-mono text-muted-foreground">Total Balance</div>
        
        <button
          onClick={onRefresh}
          disabled={isRefreshing || !onRefresh}
          className="w-full bg-transparent p-0 border-none text-5xl font-black tabular-nums mb-3 flex items-center justify-center tracking-tight cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all disabled:cursor-default disabled:hover:opacity-100 disabled:active:scale-100 focus-visible:outline-none"
          data-testid="button-refresh-balance"
        >
          <span className={`text-4xl font-black text-foreground/40 mr-1 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : ''}`}>$</span>
          <span className={`transition-opacity duration-300 ${isRefreshing ? 'opacity-50 animate-pulse' : ''}`} data-testid="text-balance">{balance}</span>
        </button>

        {balanceMicro && exchangeRate && (
          <div className="text-sm text-muted-foreground mb-4" data-testid="text-fiat-value">
            <div className="flex items-baseline justify-center gap-1">
              <span>≈</span>
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
        
        {/* Chain breakdown - minimal */}
        {chains && (
          <div className="text-[10px] font-mono text-muted-foreground pt-3 border-t border-foreground/10" data-testid="text-chain-breakdown">
            {[
              BigInt(chains.base.balanceMicro) > 0n && `Base $${chains.base.balance}`,
              BigInt(chains.celo.balanceMicro) > 0n && `Celo $${chains.celo.balance}`,
              chains.gnosis && BigInt(chains.gnosis.balanceMicro) > 0n && `Gnosis $${chains.gnosis.balance}`,
              chains.arbitrum && BigInt(chains.arbitrum.balanceMicro) > 0n && `Arb $${chains.arbitrum.balance}`,
            ].filter(Boolean).join(' · ') || 'No balance yet'}
          </div>
        )}
      </div>
    </div>
  );
}
