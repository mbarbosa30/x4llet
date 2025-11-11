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
              <div className="text-sm font-semibold text-primary mb-2 mt-12">nanoPay</div>
              <h1 className="text-3xl font-bold mb-3">Send money like a message.</h1>
              <p className="text-muted-foreground mb-12 text-base">
                Works in your browser, even offline. No app needed.
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
                    <div className="text-xs text-muted-foreground">Both sender and receiver can be offline. Transfers happen onchain.</div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-start gap-3">
                  <Coins className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">Gasless by default</div>
                    <div className="text-xs text-muted-foreground">You never pay network fees—we cover them.</div>
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

            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/unlock')}
              data-testid="button-unlock-wallet"
            >
              Unlock Wallet
            </Button>
          </div>

        </div>
      </div>
      <Footer />
    </div>
  );
}
