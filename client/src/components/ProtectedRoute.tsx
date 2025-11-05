import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const walletExists = await hasWallet();
      const unlocked = isWalletUnlocked();

      if (!walletExists) {
        setChecking(false);
        setLocation('/create');
        return;
      }

      if (!unlocked) {
        setChecking(false);
        setLocation('/unlock');
        return;
      }

      setAuthorized(true);
      setChecking(false);
    }

    checkAccess();
  }, [setLocation]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
