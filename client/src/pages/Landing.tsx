import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Smartphone, Lock, WifiOff, Coins, Globe, Network } from 'lucide-react';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import Footer from '@/components/Footer';

export default function Landing() {
  const [, setLocation] = useLocation();
  const [walletExists, setWalletExists] = useState<boolean | null>(null);

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
      <div className="flex-1 flex items-center justify-center p-4 pb-24">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-3 mt-12">Send money like a message.</h1>
              <p className="text-muted-foreground mb-12 text-base">
                A tiny, no-install wallet that just works—even on shaky internet.
              </p>
            </div>

            <div className="space-y-4 text-left max-w-sm mx-auto">
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Smartphone className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Lightweight, free & fast</div>
                    <div className="text-xs text-muted-foreground">Opens in your browser. No app store. Built for low-end phones.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Your keys stay with you</div>
                    <div className="text-xs text-muted-foreground">Stored locally, encrypted on your device—never on our servers.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <WifiOff className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Low-signal friendly</div>
                    <div className="text-xs text-muted-foreground">Create a short claim link offline; anyone online can execute it. Funds still go to the intended address.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Coins className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Gasless by default</div>
                    <div className="text-xs text-muted-foreground">Standards-based (EIP-3009). You sign; our relayer pays gas.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Pay over HTTP (x402)</div>
                    <div className="text-xs text-muted-foreground">Account-free pay-per-use for sites, kiosks, p2p and APIs.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Network className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Trust, computed</div>
                    <div className="text-xs text-muted-foreground">Your reputation scoring as signal through flow computation.</div>
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

            {walletExists && (
              <div className="text-center pt-2">
                <Link href="/unlock" className="text-sm text-muted-foreground hover:text-foreground" data-testid="link-unlock">
                  Already have a wallet? Unlock
                </Link>
              </div>
            )}
          </div>

          <div className="text-center max-w-md mx-auto pt-8 text-sm text-muted-foreground leading-relaxed">
            <p>
              Your wallet holds USDC on Base and Celo networks. Build both financial and reputation capital with every transaction.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
