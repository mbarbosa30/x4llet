import { useLocation } from 'wouter';
import { Wallet, TrendingUp, Bot, HandCoins } from 'lucide-react';

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => location === path || location.startsWith(path + '?');

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-background border-t border-foreground"
      style={{ 
        paddingBottom: 'env(safe-area-inset-bottom)',
        position: 'fixed',
        zIndex: 9999
      }}
      data-testid="bottom-nav"
    >
      <div className="max-w-md mx-auto h-16 flex items-center">
        <button
          onClick={() => setLocation('/maxflow')}
          className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-14 text-[10px] font-mono font-semibold uppercase tracking-widest transition-colors ${
            isActive('/maxflow') ? 'text-[#0055FF]' : 'text-foreground/60'
          }`}
          data-testid="nav-claim"
        >
          <HandCoins className="h-5 w-5" strokeWidth={2} />
          <span>CLAIM</span>
          {isActive('/maxflow') && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#0055FF]" />}
        </button>

        <button
          onClick={() => setLocation('/home')}
          className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-14 text-[10px] font-mono font-semibold uppercase tracking-widest transition-colors ${
            isActive('/home') ? 'text-[#0055FF]' : 'text-foreground/60'
          }`}
          data-testid="nav-wallet"
        >
          <Wallet className="h-5 w-5" strokeWidth={2} />
          <span>WALLET</span>
          {isActive('/home') && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#0055FF]" />}
        </button>

        <button
          onClick={() => setLocation('/earn')}
          className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-14 text-[10px] font-mono font-semibold uppercase tracking-widest transition-colors ${
            isActive('/earn') ? 'text-[#0055FF]' : 'text-foreground/60'
          }`}
          data-testid="nav-earn"
        >
          <TrendingUp className="h-5 w-5" strokeWidth={2} />
          <span>EARN</span>
          {isActive('/earn') && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#0055FF]" />}
        </button>

        <button
          onClick={() => setLocation('/ai')}
          className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-14 text-[10px] font-mono font-semibold uppercase tracking-widest transition-colors ${
            isActive('/ai') ? 'text-[#0055FF]' : 'text-foreground/60'
          }`}
          data-testid="nav-ai"
        >
          <Bot className="h-5 w-5" strokeWidth={2} />
          <span>AI</span>
          {isActive('/ai') && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#0055FF]" />}
        </button>
      </div>
    </nav>
  );
}
