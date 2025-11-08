import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Shield, Wallet, Settings } from 'lucide-react';

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
      <div className="max-w-md mx-auto h-16 flex items-center px-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation('/signal')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-12 rounded-none ${
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
          className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-12 rounded-none ${
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
          className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-12 rounded-none ${
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
