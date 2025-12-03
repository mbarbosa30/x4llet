import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Gift, Wallet, Settings, TrendingUp } from 'lucide-react';

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-background border-t"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom)',
        position: 'fixed',
        zIndex: 9999
      }}
      data-testid="bottom-nav"
    >
      <div className="max-w-md mx-auto h-16 flex items-center px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/claim')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 rounded-none px-1 ${
            isActive('/claim') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-claim"
        >
          <Gift className="h-5 w-5" />
          <span className="text-[10px]">Claim</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/home')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 rounded-none px-1 ${
            isActive('/home') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-wallet"
        >
          <Wallet className="h-5 w-5" />
          <span className="text-[10px]">Wallet</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/earn')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 rounded-none px-1 ${
            isActive('/earn') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-earn"
        >
          <TrendingUp className="h-5 w-5" />
          <span className="text-[10px]">Earn</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/settings')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 rounded-none px-1 ${
            isActive('/settings') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-settings"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px]">Settings</span>
        </Button>
      </div>
    </nav>
  );
}
