import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Zap, Lock, WifiOff, Coins } from 'lucide-react';
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
              <h1 className="text-3xl font-bold mb-2">offPay</h1>
              <p className="text-muted-foreground">
                Your lightweight crypto wallet
              </p>
            </div>

            <div className="space-y-2 text-left max-w-xs mx-auto">
              <div className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Lightweight & fast</span>
              </div>
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Secure encrypted keys</span>
              </div>
              <div className="flex items-center gap-3">
                <WifiOff className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Works offline</span>
              </div>
              <div className="flex items-center gap-3">
                <Coins className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm">Free gasless transfers</span>
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
        </div>
      </div>
      <Footer />
    </div>
  );
}
