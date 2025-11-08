import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Zap, Lock, WifiOff, Coins, Network } from 'lucide-react';
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
              <h1 className="text-3xl font-bold mb-3 mt-12">nanoPay</h1>
              <p className="text-muted-foreground mb-12">
                Crypto wallet with built-in network strength
              </p>
            </div>

            <div className="space-y-2 text-left max-w-xs mx-auto">
              <div className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Lightweight, Free & Fast</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Keys stored locally, encrypted on your device</span>
              </div>
              <div className="flex items-center gap-3">
                <WifiOff className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Works / Transfers onchain even if Offline</span>
              </div>
              <div className="flex items-center gap-3">
                <Coins className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Gasless transfers powered by x402</span>
              </div>
              <div className="flex items-center gap-3">
                <Network className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Trust signal from max flow computation</span>
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
              Designed for everyone, everywhere. It works in low-bandwidth environments and functions completely offline. Your wallet holds USDC for payments and a MaxFlow signal score that proves your legitimacy and measures your trust network strength — building both financial and reputation capital.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
