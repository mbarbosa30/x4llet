import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import { Loader2 } from 'lucide-react';

export default function Landing() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function checkWalletState() {
      try {
        const walletExists = await hasWallet();
        const unlocked = isWalletUnlocked();

        if (!isActive) return;

        if (!walletExists) {
          setLocation('/create');
        } else if (unlocked) {
          setLocation('/home');
        } else {
          setLocation('/unlock');
        }
      } catch (error) {
        console.error('Failed to check wallet state:', error);
        if (isActive) {
          setLocation('/create');
        }
      }
    }

    checkWalletState();

    return () => {
      isActive = false;
    };
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Loading wallet...</p>
      </div>
    </div>
  );
}
