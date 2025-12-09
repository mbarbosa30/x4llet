import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { WifiOff, Lock, Sparkles, Sliders, Gift, Layers, Network, Zap, Users, ArrowRightLeft, ArrowRight } from 'lucide-react';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import Footer from '@/components/Footer';

interface AaveApyData {
  chainId: number;
  apy: number;
  apyFormatted: string;
}

interface GlobalStats {
  totalUsers: number;
  totalTransfers: number;
  totalXp: number;
}

// Feature item component - shared between mobile and desktop
function FeatureItem({ icon: Icon, title, subtitle }: { icon: any, title: React.ReactNode, subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-[#0055FF] flex-shrink-0" />
      <div className="w-px h-10 bg-[#0055FF]" />
      <div>
        <div className="text-sm font-semibold uppercase tracking-wide text-foreground/80">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

// Mobile landing content
function MobileLanding({ 
  walletExists, 
  apyDisplay, 
  globalStats, 
  setLocation 
}: { 
  walletExists: boolean | null;
  apyDisplay: string | null;
  globalStats: GlobalStats | undefined;
  setLocation: (path: string) => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center py-4 px-6 pb-16">
      <div className="w-full max-w-md space-y-12">
        <div className="text-center space-y-6">
          <div>
            <div className="flex items-center justify-center gap-2 mb-4 mt-12">
              <div className="w-4 h-4 bg-[#0055FF]" aria-hidden="true" />
              <span className="text-sm font-extrabold uppercase tracking-tight">nanoPay</span>
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-4 leading-none">
              Money, <span className="text-[#0055FF]">Simplified.</span>
            </h1>
            <p className="text-muted-foreground mb-8 text-base">
              <span className="font-normal">No internet? No gas? No ID?</span> <span className="font-medium">No problem.</span>
            </p>
          </div>

          <div className="space-y-5 text-left max-w-sm mx-auto py-4">
            <FeatureItem icon={WifiOff} title="Works Anywhere" subtitle="Any browser. Offline-ready. No fees." />
            <FeatureItem icon={Lock} title="Your Keys, With You" subtitle="Encrypted on your device. Nowhere else." />
            <FeatureItem 
              icon={Sparkles} 
              title={<>Auto Savings{apyDisplay && <span className="text-[#0055FF] text-xs ml-1"><span className="font-semibold">~{apyDisplay}</span> <span className="font-normal">APY</span></span>}</>} 
              subtitle="One tap to start earning or withdraw." 
            />
            <FeatureItem icon={Sliders} title="Yield Allocation" subtitle="Pool prizes, causes, AI credits, & more." />
            <FeatureItem icon={Gift} title="Claim Tokens" subtitle="Campaigns & airdrops from partners." />
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

          <div className="text-center pt-2">
            <Link href="/unlock" className="text-sm text-muted-foreground hover:text-foreground uppercase tracking-wide" data-testid="link-unlock">
              Already have a wallet? <span className="font-bold">UNLOCK</span>
            </Link>
          </div>
        </div>

        {globalStats && (globalStats.totalUsers > 0 || globalStats.totalTransfers > 0 || globalStats.totalXp > 0) && (
          <div className="pt-8 pb-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-global-users">
                  {globalStats.totalUsers.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Users</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-global-transfers">
                  {globalStats.totalTransfers.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Transfers</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-global-xp">
                  {globalStats.totalXp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">XP Earned</p>
              </div>
            </div>
          </div>
        )}

        <div className="pt-10 border-t border-foreground/10">
          <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground pt-4 mb-10 text-center">Powered By</div>
          <div className="space-y-5 text-left max-w-sm mx-auto">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase tracking-wide">x402 Protocol</span>
              </div>
              <p className="text-sm text-muted-foreground pl-8">Gasless autonomous execution, by default. USDC transfers via EIP-3009. Works off-line.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Sliders className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase tracking-wide">ERC-4626 Potential</span>
              </div>
              <p className="text-sm text-muted-foreground pl-8">Access prize-linked savings, vulnerable communities, AI tools, & Buy Now Pay Later.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Network className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase tracking-wide">Trust Infrastructure</span>
              </div>
              <p className="text-sm text-muted-foreground pl-8">MaxFlow graph signals computation, Circles web of trust, GoodDollar verification.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Layers className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase tracking-wide">Multi-Chain</span>
              </div>
              <p className="text-sm text-muted-foreground pl-8">Seamless experience on Base, Celo, Gnosis, and Arbitrum networks.</p>
            </div>
          </div>
        </div>

        <div className="text-center pt-2">
          <span className="text-xs font-mono font-light text-muted-foreground">built by </span>
          <a 
            href="https://x.com/mbarrbosa" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs font-mono font-light text-muted-foreground hover:text-foreground underline underline-offset-2"
            data-testid="link-builder"
          >
            Marco
          </a>
        </div>
      </div>
    </div>
  );
}

// Desktop landing - cleaner design mirroring mobile structure
function DesktopLanding({ 
  apyDisplay, 
  globalStats,
  setLocation 
}: { 
  apyDisplay: string | null;
  globalStats: GlobalStats | undefined;
  setLocation: (path: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Minimal Header */}
      <header className="border-b border-foreground/10 py-4 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#0055FF]" />
            <span className="text-sm font-extrabold uppercase tracking-tight">nanoPay</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground">
              How It Works
            </Link>
            <Link href="/faqs" className="text-sm text-muted-foreground hover:text-foreground">
              FAQs
            </Link>
            <Button onClick={() => setLocation('/create')} data-testid="button-launch-app">
              Launch App
            </Button>
          </div>
        </div>
      </header>

      {/* Hero - Two Column Layout */}
      <section className="flex-1 flex items-center px-8 py-16">
        <div className="max-w-6xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Headline + Features */}
          <div className="space-y-10">
            <div>
              <h1 className="text-6xl font-black uppercase tracking-tighter leading-[0.9] mb-6">
                Money,<br />
                <span className="text-[#0055FF]">Simplified.</span>
              </h1>
              <p className="text-xl text-muted-foreground">
                No internet? No gas? No ID? <span className="font-medium text-foreground">No problem.</span>
              </p>
            </div>

            {/* Features - same as mobile */}
            <div className="space-y-4">
              <FeatureItem icon={WifiOff} title="Works Anywhere" subtitle="Any browser. Offline-ready. No fees." />
              <FeatureItem icon={Lock} title="Your Keys, With You" subtitle="Encrypted on your device. Nowhere else." />
              <FeatureItem 
                icon={Sparkles} 
                title={<>Auto Savings{apyDisplay && <span className="text-[#0055FF] text-xs ml-1">~{apyDisplay} APY</span>}</>} 
                subtitle="One tap to start earning or withdraw." 
              />
              <FeatureItem icon={Sliders} title="Yield Allocation" subtitle="Pool prizes, causes, AI credits, & more." />
              <FeatureItem icon={Gift} title="Claim Tokens" subtitle="Campaigns & airdrops from partners." />
            </div>

            {/* CTAs */}
            <div className="flex gap-4">
              <Button size="lg" onClick={() => setLocation('/create')} data-testid="button-hero-create">
                Create Wallet <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation('/restore')} data-testid="button-hero-restore">
                Restore Wallet
              </Button>
            </div>
          </div>

          {/* Right: Phone Mockup + Stats */}
          <div className="flex flex-col items-center gap-10">
            {/* Phone mockup - brutalist style */}
            <div className="bg-white border-2 border-foreground p-6 w-[300px] shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              {/* Phone header */}
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-foreground/10">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-[#0055FF]" />
                  <span className="text-[10px] font-mono font-bold uppercase">nanoPay</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500" />
                  <span className="text-[9px] font-mono text-muted-foreground">Online</span>
                </div>
              </div>
              
              {/* Balance display */}
              <div className="text-center py-8">
                <div className="text-xs text-muted-foreground mb-2 font-mono uppercase">Total Balance</div>
                <div className="text-5xl font-black tracking-tight mb-2">$124.50</div>
                <div className="text-xs font-mono text-muted-foreground">Base · Celo · Gnosis · Arb</div>
              </div>
              
              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button className="bg-foreground text-background py-3 text-xs font-mono font-bold uppercase flex items-center justify-center gap-1 border border-foreground">
                  <ArrowRight className="h-3 w-3" />
                  Send
                </button>
                <button className="border border-foreground py-3 text-xs font-mono font-bold uppercase">
                  Receive
                </button>
              </div>
            </div>

            {/* Stats below phone */}
            {globalStats && (globalStats.totalUsers > 0 || globalStats.totalTransfers > 0) && (
              <div className="grid grid-cols-3 gap-8 text-center">
                <div>
                  <p className="text-2xl font-black tabular-nums">{globalStats.totalUsers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Users</p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums">{globalStats.totalTransfers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Transfers</p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums">{globalStats.totalXp.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">XP</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Powered By Section */}
      <section className="border-t border-foreground/10 py-12 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-8 text-center">Powered By</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase">x402 Protocol</span>
              </div>
              <p className="text-xs text-muted-foreground">Gasless USDC transfers via EIP-3009. Works offline.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase">ERC-4626</span>
              </div>
              <p className="text-xs text-muted-foreground">Prize-linked savings and yield allocation.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase">Trust Infra</span>
              </div>
              <p className="text-xs text-muted-foreground">MaxFlow, Circles, and GoodDollar verification.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold uppercase">Multi-Chain</span>
              </div>
              <p className="text-xs text-muted-foreground">Base, Celo, Gnosis, and Arbitrum networks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-foreground/10 py-6 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">
            built by{' '}
            <a 
              href="https://x.com/mbarrbosa" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground underline underline-offset-2"
            >
              Marco
            </a>
          </span>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/context" className="hover:text-foreground">Manifesto</Link>
            <Link href="/how-it-works" className="hover:text-foreground">How It Works</Link>
            <Link href="/faqs" className="hover:text-foreground">FAQs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [walletExists, setWalletExists] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkWallet = async () => {
      const exists = await hasWallet();
      setWalletExists(exists);
      
      if (exists) {
        const unlocked = await isWalletUnlocked();
        if (unlocked) {
          setLocation('/home');
        }
      }
    };
    checkWallet();
  }, [setLocation]);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  // Fetch Aave APY for display
  const { data: aaveApyData } = useQuery<AaveApyData[]>({
    queryKey: ['/api/aave/apy'],
  });

  // Fetch global stats
  const { data: globalStats } = useQuery<GlobalStats>({
    queryKey: ['/api/global-stats'],
  });

  // Get highest APY for display
  const apyDisplay = aaveApyData && aaveApyData.length > 0
    ? Math.max(...aaveApyData.map(d => d.apy)).toFixed(1) + '%'
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isDesktop ? (
        <DesktopLanding 
          apyDisplay={apyDisplay}
          globalStats={globalStats}
          setLocation={setLocation}
        />
      ) : (
        <MobileLanding
          walletExists={walletExists}
          apyDisplay={apyDisplay}
          globalStats={globalStats}
          setLocation={setLocation}
        />
      )}
    </div>
  );
}
