import { useLocation } from 'wouter';
import { Coins, Wallet, TrendingUp, Sparkles } from 'lucide-react';

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => location === path;

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-foreground text-background border-t border-foreground"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom)',
        position: 'fixed',
        zIndex: 9999
      }}
      data-testid="bottom-nav"
    >
      <div className="max-w-md mx-auto h-14 flex items-center px-1">
        <button
          onClick={() => setLocation('/claim')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 font-semibold uppercase text-xs tracking-wide transition-colors ${
            isActive('/claim') ? 'text-[#0055FF]' : 'text-background/70 hover:text-background'
          }`}
          data-testid="nav-claim"
        >
          <Coins className="h-5 w-5" />
          <span>Claim</span>
        </button>

        <button
          onClick={() => setLocation('/home')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 font-semibold uppercase text-xs tracking-wide transition-colors ${
            isActive('/home') ? 'text-[#0055FF]' : 'text-background/70 hover:text-background'
          }`}
          data-testid="nav-wallet"
        >
          <Wallet className="h-5 w-5" />
          <span>Wallet</span>
        </button>

        <button
          onClick={() => setLocation('/earn')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 font-semibold uppercase text-xs tracking-wide transition-colors ${
            isActive('/earn') ? 'text-[#0055FF]' : 'text-background/70 hover:text-background'
          }`}
          data-testid="nav-earn"
        >
          <TrendingUp className="h-5 w-5" />
          <span>Earn</span>
        </button>

        <button
          onClick={() => setLocation('/pool')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-12 px-1 font-semibold uppercase text-xs tracking-wide transition-colors ${
            isActive('/pool') ? 'text-[#0055FF]' : 'text-background/70 hover:text-background'
          }`}
          data-testid="nav-pool"
        >
          <Sparkles className="h-5 w-5" />
          <span>Pool</span>
        </button>
      </div>
    </nav>
  );
}
