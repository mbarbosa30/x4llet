import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Zap, Lock, Sparkles, TrendingUp, Gift, Layers, Fingerprint } from 'lucide-react';
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
              <div className="text-sm font-semibold text-primary mb-2 mt-12">nanoPay</div>
              <h1 className="text-3xl font-bold mb-3">Money, Simplified.</h1>
              <p className="text-muted-foreground mb-8 text-base">
                No internet? No gas? No ID? No problem.
              </p>
            </div>

            <div className="space-y-4 text-left max-w-sm mx-auto">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">It just works</div>
                  <div className="text-xs text-muted-foreground">Any browser. Offline. Gasless.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Your keys, your control</div>
                  <div className="text-xs text-muted-foreground">Encrypted on device, not servers.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">
                    Savings on autopilot{apyDisplay && <span className="text-success ml-1.5 font-normal">({apyDisplay} APY)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">One tap to earn. No lock-ups.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Put your yield to work</div>
                  <div className="text-xs text-muted-foreground">Allocate to prizes, causes, access, and more.</div>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">Claim free tokens</div>
                  <div className="text-xs text-muted-foreground">Daily UBI from GoodDollar & Circles.</div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-border/50">
              <div className="text-xs font-medium text-muted-foreground mb-3 text-center">Powered by</div>
              <div className="grid grid-cols-2 gap-3 text-left max-w-sm mx-auto">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">x402 Protocol</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Yield Allocation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Sybil-resistant ID</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Multi-chain</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setLocation('/create')}
              data-testid="button-create-wallet"
            >
              Create New Wallet
            </Button>
            
            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/restore')}
              data-testid="button-restore-wallet"
            >
              Restore Wallet
            </Button>

            <div className="text-center pt-2">
              <Link href="/unlock" className="text-sm text-muted-foreground hover:text-foreground" data-testid="link-unlock">
                Already have a wallet? Unlock
              </Link>
            </div>
          </div>

        </div>
      </div>
      <Footer hideSignal />
    </div>
  );
}
