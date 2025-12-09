import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { hasWallet } from '@/lib/wallet';
import { useWalletStore } from '@/lib/walletStore';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { isUnlocked } = useWalletStore();
  const [walletChecked, setWalletChecked] = useState(false);
  const [walletExists, setWalletExists] = useState(true);

  // Only check if wallet exists once (async), unlock state is tracked synchronously
  useEffect(() => {
    async function checkWalletExists() {
      const exists = await hasWallet();
      setWalletExists(exists);
      setWalletChecked(true);
      
      if (!exists) {
        setLocation('/create');
      }
    }
    
    // If already unlocked, we know wallet exists - skip the check
    if (isUnlocked) {
      setWalletChecked(true);
      setWalletExists(true);
    } else {
      checkWalletExists();
    }
  }, [setLocation, isUnlocked]);

  // Redirect to unlock if wallet exists but not unlocked
  useEffect(() => {
    if (walletChecked && walletExists && !isUnlocked) {
      setLocation('/unlock');
    }
  }, [walletChecked, walletExists, isUnlocked, setLocation]);

  // Show loading only during initial wallet existence check (not on every navigation)
  if (!walletChecked) {
    return (
      <div 
        className="flex items-center justify-center bg-background"
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
          minHeight: '100vh'
        }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authorized - redirect is happening
  if (!walletExists || !isUnlocked) {
    return null;
  }

  return <>{children}</>;
}
