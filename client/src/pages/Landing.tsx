import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Smartphone, Lock, WifiOff, Coins, Globe, Network, Sparkles } from 'lucide-react';
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
              <p className="text-muted-foreground mb-12 text-base">
                No internet? No gas? No problem.
              </p>
            </div>

            <div className="space-y-4 text-left max-w-sm mx-auto">
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Smartphone className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Lightweight, free & fast</div>
                    <div className="text-xs text-muted-foreground">Opens in any browser. No download, no app store.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Your keys stay with you</div>
                    <div className="text-xs text-muted-foreground">Encrypted on your device, not our servers.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <WifiOff className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Low-signal friendly</div>
                    <div className="text-xs text-muted-foreground">Onchain transfers, even if sender & receiver are offline.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Coins className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Gasless by default</div>
                    <div className="text-xs text-muted-foreground">Network fees are covered, automatically.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Pay over HTTP (x402)</div>
                    <div className="text-xs text-muted-foreground">Transfer money over HTTP. Any amount, anywhere.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Network className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Trust, computed</div>
                    <div className="text-xs text-muted-foreground">Build trust through your network, not transactions.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">
                      Savings on autopilot{apyDisplay && <span className="text-success ml-1.5 font-normal">({apyDisplay} APY)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">One tap to earn. No complexity, no lock-ups.</div>
                  </div>
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
