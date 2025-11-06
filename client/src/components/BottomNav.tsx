import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Shield, Wallet, Settings } from 'lucide-react';

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      data-testid="bottom-nav"
    >
      <div className="max-w-md mx-auto h-full grid grid-cols-3 gap-1 px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/signal')}
          className={`flex flex-col items-center justify-center gap-1 h-full rounded-none ${
            isActive('/signal') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-signal"
        >
          <Shield className="h-5 w-5" />
          <span className="text-xs">Signal</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/home')}
          className={`flex flex-col items-center justify-center gap-1 h-full rounded-none ${
            isActive('/home') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-wallet"
        >
          <Wallet className="h-5 w-5" />
          <span className="text-xs">Wallet</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/settings')}
          className={`flex flex-col items-center justify-center gap-1 h-full rounded-none ${
            isActive('/settings') ? 'text-primary' : 'text-muted-foreground'
          }`}
          data-testid="nav-settings"
        >
          <Settings className="h-5 w-5" />
          <span className="text-xs">Settings</span>
        </Button>
      </div>
    </nav>
  );
}
