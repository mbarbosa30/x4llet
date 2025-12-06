import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { WifiOff, Lock, Sparkles, Sliders, Gift, Layers, Network, Zap } from 'lucide-react';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import Footer from '@/components/Footer';

interface AaveApyData {
  chainId: number;
  apy: number;
  apyFormatted: string;
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [walletExists, setWalletExists] = useState<boolean | null>(null);

  const { data: aaveApyBase } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 8453],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/8453');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: aaveApyCelo } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42220],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42220');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
    staleTime: 60000,
  });

  const bestApy = Math.max(aaveApyBase?.apy || 0, aaveApyCelo?.apy || 0);
  const apyDisplay = bestApy > 0 ? `${bestApy.toFixed(1)}%` : null;

  useEffect(() => {
    let isActive = true;

    async function checkWalletState() {
      try {
        const exists = await hasWallet();
        const unlocked = isWalletUnlocked();

        if (!isActive) return;

        // Auto-redirect unlocked users to home
        if (exists && unlocked) {
          // Check for referral parameter and persist it
          const params = new URLSearchParams(window.location.search);
          const ref = params.get('ref');
          if (ref) {
            sessionStorage.setItem('pending_referral', ref);
          }
          setLocation('/home');
          return;
        }

        setWalletExists(exists);
      } catch (error) {
        console.error('Failed to check wallet state:', error);
        if (isActive) {
          setWalletExists(false);
        }
      }
    }

    checkWalletState();

    return () => {
      isActive = false;
    };
  }, [setLocation]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center py-4 px-6 pb-24">
        <div className="w-full max-w-md space-y-12">
          <div className="text-center space-y-6">
            <div>
              <div className="flex items-center justify-center gap-2 mb-4 mt-12">
                <div className="w-4 h-4 bg-[#0055FF]" aria-hidden="true" />
                <span className="text-sm font-extrabold uppercase tracking-tight">nanoPay</span>
              </div>
              <h1 className="text-4xl font-black uppercase tracking-tighter mb-4 leading-none">
                Money, <span className="text-[#0055FF]">Simplified.</span>
              </h1>
              <p className="text-muted-foreground mb-8 text-base font-medium">
                No internet? No gas? No ID? No problem.
              </p>
            </div>

            <div className="space-y-4 text-left max-w-sm mx-auto">
              <div className="flex items-start gap-3 border-l-2 border-[#0055FF] pl-3">
                <WifiOff className="h-4 w-4 text-[#0055FF] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide">Works Anywhere</div>
                  <div className="text-xs text-muted-foreground">Any browser. Offline-ready. Gasless transfers.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 border-l-2 border-[#0055FF] pl-3">
                <Lock className="h-4 w-4 text-[#0055FF] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide">Your Keys, Your Control</div>
                  <div className="text-xs text-muted-foreground">Encrypted on your device, locally. Nowhere else.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 border-l-2 border-[#0055FF] pl-3">
                <Sparkles className="h-4 w-4 text-[#0055FF] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide">
                    Auto Savings{apyDisplay && <span className="text-[#0055FF] text-xs ml-1.5">{apyDisplay} APY</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">One tap to start earning. Withdraw anytime.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 border-l-2 border-[#0055FF] pl-3">
                <Sliders className="h-4 w-4 text-[#0055FF] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide">Yield Allocation</div>
                  <div className="text-xs text-muted-foreground">Pool prizes, causes, AI credits, & more.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 border-l-2 border-[#0055FF] pl-3">
                <Gift className="h-4 w-4 text-[#0055FF] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide">Free Tokens</div>
                  <div className="text-xs text-muted-foreground">Daily UBI from GoodDollar & Circles.</div>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-4">
            <Button
              size="lg"
              className="w-full uppercase"
              onClick={() => setLocation('/create')}
              data-testid="button-create-wallet"
            >
              Create New Wallet
            </Button>
            
            <Button
              size="lg"
              variant="outline"
              className="w-full uppercase"
              onClick={() => setLocation('/restore')}
              data-testid="button-restore-wallet"
            >
              Restore Wallet
            </Button>

            <div className="text-center pt-2">
              <Link href="/unlock" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wide" data-testid="link-unlock">
                Already have a wallet? Unlock
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-foreground">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4 text-center">Powered By</div>
            <div className="space-y-3 text-left max-w-sm mx-auto">
              <div>
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wide">x402 Protocol</span>
                </div>
                <p className="text-xs text-muted-foreground pl-7 mt-1">Gasless autonomous execution, by default. USDC transfers via EIP-3009. Works off-line.</p>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <Sliders className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Yield Allocation</span>
                </div>
                <p className="text-xs text-muted-foreground pl-7 mt-1">Access prize-linked savings, vulnerable communities, AI tools & models, Buy Now Pay Later.</p>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <Network className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Trust Infrastructure</span>
                </div>
                <p className="text-xs text-muted-foreground pl-7 mt-1">MaxFlow graph signals computation, Circles web of trust, GoodDollar verification.</p>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <Layers className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Multi-Chain</span>
                </div>
                <p className="text-xs text-muted-foreground pl-7 mt-1">Seamless experience on Base, Celo, and Gnosis networks. More soon.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
      <Footer hideSignal />
    </div>
  );
}
