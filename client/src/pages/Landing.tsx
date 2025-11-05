import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import { Loader2 } from 'lucide-react';

export default function Landing() {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkWalletState() {
      console.log('[Landing] Checking wallet state...');
      try {
        const walletExists = await hasWallet();
        const unlocked = isWalletUnlocked();
        console.log('[Landing] Wallet exists:', walletExists, 'Unlocked:', unlocked);

        if (!walletExists) {
          console.log('[Landing] Redirecting to /create');
          setLocation('/create');
        } else if (unlocked) {
          console.log('[Landing] Redirecting to /home');
          setLocation('/home');
        } else {
          console.log('[Landing] Redirecting to /unlock');
          setLocation('/unlock');
        }
      } catch (error) {
        console.error('Failed to check wallet state:', error);
        setLocation('/create');
      }
    }

    checkWalletState();
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
