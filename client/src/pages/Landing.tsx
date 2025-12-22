import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Marquee, MarqueeItem } from '@/components/ui/marquee';
import { WifiOff, Wifi, Lock, Sparkles, Sliders, Gift, Layers, Network, Zap, Users, ArrowRightLeft, ArrowRight, Shield, Coins, TrendingUp, Wallet, ScanFace, Fingerprint, CircleDollarSign, Cpu, Clock, Rocket, Stamp, Fuel } from 'lucide-react';
import { SiTelegram } from 'react-icons/si';
import { hasWallet, isWalletUnlocked } from '@/lib/wallet';
import Footer from '@/components/Footer';

const StellarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.283 1.851A10.154 10.154 0 001.846 12.002c0 .259.01.516.03.773A1.847 1.847 0 01.872 14.56L0 15.005v2.074l2.568-1.309.832-.424.855-.436 16.912-8.627.833-.425V3.784l-4.868 2.483A10.123 10.123 0 0012.283 1.85zM21.126 6.92l-.832.424-.855.436-16.912 8.627-.833.425v2.074l4.868-2.483a10.123 10.123 0 004.849 4.417 10.154 10.154 0 0010.437-10.151c0-.259-.01-.516-.03-.773a1.847 1.847 0 011.004-1.785L24 6.846V4.772z"/>
  </svg>
);

interface AaveApyData {
  chainId: number;
  apy: number;
  apyFormatted: string;
}

interface GlobalStats {
  totalUsers: number;
  totalTransfers: number;
  totalXp: number;
  totalXpSpent: number;
  gasSponsoredUsd: number;
  stellar?: {
    currentApy: number;
    xlmSponsoredUsd: number;
  };
}

// Phone mockup component for desktop hero - Simplified to match npay1
function PhoneMockup({ balance = "$124.50" }: { balance?: string }) {
  const [isOffline, setIsOffline] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  
  // Handle stamp animation when going offline
  useEffect(() => {
    if (isOffline) {
      // Small delay before showing stamp animation
      const timer = setTimeout(() => setShowStamp(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowStamp(false);
    }
  }, [isOffline]);
  
  return (
    <div className="relative">
      {/* Offline Mode Toggle - Pill style */}
      <div className="flex justify-center mb-6">
        <button 
          onClick={() => setIsOffline(!isOffline)}
          className="flex items-center gap-3 px-4 py-2 bg-white border-2 border-foreground rounded-full"
          data-testid="toggle-offline-mode"
        >
          <span className="text-[11px] font-mono font-bold uppercase tracking-wide">Simulate Offline Mode</span>
          <div className={`w-10 h-5 rounded-full relative transition-colors ${isOffline ? 'bg-orange-500' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${isOffline ? 'right-0.5' : 'left-0.5'}`} />
          </div>
        </button>
      </div>
      
      {/* Phone device frame - Clean and simple, larger size */}
      <div className="w-[320px] bg-white border-2 border-foreground rounded-[24px] p-8 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <span className="text-xs font-mono font-bold uppercase tracking-wide">NANOPAY OS V1.0</span>
          <div className="flex items-center gap-1.5">
            {isOffline ? (
              <WifiOff className="h-4 w-4" />
            ) : (
              <Wifi className="h-4 w-4 text-green-500" />
            )}
            <span className="text-xs font-mono font-bold uppercase">{isOffline ? 'OFFLINE' : 'ONLINE'}</span>
          </div>
        </div>
        
        {/* Balance Section */}
        <div className="text-center py-10 relative">
          <div className="text-sm text-muted-foreground mb-2 font-mono italic">Total Balance</div>
          <div className="text-6xl font-black tracking-tight mb-6 font-mono">{balance}</div>
          
          {/* Badge - Shows SYNCED or NO SIGNAL */}
          <div className="relative inline-block">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono font-bold uppercase transition-colors ${
              isOffline 
                ? 'bg-gray-400 text-white' 
                : 'bg-green-500 text-white'
            }`}>
              {!isOffline && <Sparkles className="h-3 w-3" />}
              {isOffline ? 'NO SIGNAL' : 'SYNCED'}
            </div>
            
            {/* Stamp overlay - animates in when offline */}
            {isOffline && (
              <div 
                className={`absolute -top-2 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-500 text-white text-[11px] font-mono font-bold uppercase tracking-wide whitespace-nowrap transition-all duration-300 ease-out flex items-center gap-1.5 ${
                  showStamp 
                    ? 'opacity-100 scale-100' 
                    : 'opacity-0 scale-150'
                }`}
                style={{ transform: `translateX(-50%) rotate(-5deg) ${showStamp ? 'scale(1)' : 'scale(1.5)'}` }}
              >
                <Stamp className="h-3 w-3" />
                AUTHORIZATION SIGNED
              </div>
            )}
          </div>
        </div>
        
        {/* Buttons */}
        <div className="space-y-3 mt-6">
          <button className="w-full bg-foreground text-white py-4 text-sm font-mono font-bold uppercase flex items-center justify-center gap-2 border-2 border-foreground">
            <ArrowRight className="h-4 w-4" />
            Send Money
          </button>
          <button className="w-full border-2 border-foreground py-4 text-sm font-mono font-bold uppercase bg-white">
            Receive
          </button>
        </div>
      </div>
    </div>
  );
}

// Feature card for desktop
function FeatureCard({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="flex items-start gap-4 p-4">
      <div className="w-10 h-10 bg-[#0055FF]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-[#0055FF]" />
      </div>
      <div>
        <div className="font-semibold text-sm mb-1">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

// Mobile landing content (existing design)
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
            <div className="flex items-center gap-3">
              <WifiOff className="h-5 w-5 text-[#0055FF] flex-shrink-0" />
              <div className="w-px h-10 bg-[#0055FF]" />
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Works Anywhere</div>
                <div className="text-xs text-muted-foreground">Any browser. Offline-ready. No fees.</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-[#0055FF] flex-shrink-0" />
              <div className="w-px h-10 bg-[#0055FF]" />
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Your Keys, With You</div>
                <div className="text-xs text-muted-foreground">Encrypted on your device. Nowhere else.</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-[#0055FF] flex-shrink-0" />
              <div className="w-px h-10 bg-[#0055FF]" />
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
                  Auto Savings{apyDisplay && <span className="text-[#0055FF] text-xs ml-1"><span className="font-semibold">~{apyDisplay}</span> <span className="font-normal">APY</span></span>}
                </div>
                <div className="text-xs text-muted-foreground">One tap to start earning or withdraw.</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Sliders className="h-5 w-5 text-[#0055FF] flex-shrink-0" />
              <div className="w-px h-10 bg-[#0055FF]" />
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Yield Allocation</div>
                <div className="text-xs text-muted-foreground">Pool prizes, causes, AI credits, & more.</div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Gift className="h-5 w-5 text-[#0055FF] flex-shrink-0" />
              <div className="w-px h-10 bg-[#0055FF]" />
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-foreground/80">Claim Tokens</div>
                <div className="text-xs text-muted-foreground">Campaigns & airdrops from partners.</div>
              </div>
            </div>
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
          
          <p className="text-sm text-muted-foreground text-center pt-4 flex items-center justify-center gap-2">
            <StellarIcon className="h-4 w-4" />
            <span><span className="font-semibold">Stellar</span> version available. <Link href="/stellar" className="underline hover:text-foreground font-semibold" data-testid="link-stellar-landing">Access Now</Link></span>
          </p>
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
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Transactions</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-global-xp">
                  {Math.floor(globalStats.totalXpSpent || 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">XP Spent</p>
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
              <p className="text-sm text-muted-foreground pl-8">Seamless experience on Base, Celo, Gnosis, Arbitrum, and Stellar networks.</p>
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

// Desktop landing content (new design inspired by npay1)
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
    <div className="flex-1">
      {/* Desktop Header */}
      <header className="border-b border-foreground py-4 px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#0055FF]" />
            <span className="text-sm font-extrabold uppercase tracking-tight">nanoPay</span>
          </div>
          <nav className="flex items-center gap-8">
            <Link href="/how-it-works" className="text-sm font-mono font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
              How It Works
            </Link>
            <Link href="/faqs" className="text-sm font-mono font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
              FAQs
            </Link>
            <Link href="/context" className="text-sm font-mono font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide hidden md:block">
              Context
            </Link>
            <Button onClick={() => setLocation('/create')} data-testid="button-launch-app">
              Launch App <ArrowRight className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Live Stats Ticker */}
      <Marquee speed={40}>
        <MarqueeItem>{globalStats?.totalUsers || 0} Users</MarqueeItem>
        <MarqueeItem>{globalStats?.totalTransfers || 0} Transactions</MarqueeItem>
        <MarqueeItem>{apyDisplay || '3.1%'} APY on Savings</MarqueeItem>
        <MarqueeItem>Gasless on Base</MarqueeItem>
        <MarqueeItem>Gasless on Celo</MarqueeItem>
        <MarqueeItem>Gasless on Gnosis</MarqueeItem>
        <MarqueeItem>Gasless on Arbitrum</MarqueeItem>
        <MarqueeItem>Gasless on Stellar</MarqueeItem>
        <MarqueeItem>100% Self-Custody</MarqueeItem>
        <MarqueeItem>Offline-Ready</MarqueeItem>
      </Marquee>

      {/* Hero Section - Asymmetric Grid */}
      <section className="py-20 px-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-5 gap-12 items-center">
          <div className="lg:col-span-3 space-y-8">
            <div>
              <div className="inline-block border border-foreground px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                The Digital Public Utility
              </div>
              <h1 className="text-7xl font-black uppercase tracking-tighter leading-none mb-6">
                Money,<br />
                <span className="text-[#0055FF]">Simplified.</span><br />
                For Everyone.
              </h1>
              <p className="text-lg text-muted-foreground max-w-md">
                Reliable as a hammer. Fast as cash. Built for communities, not casinos.
              </p>
            </div>
            
            <div className="flex gap-4">
              <Button size="lg" onClick={() => setLocation('/create')} data-testid="button-hero-create">
                Create Wallet <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation('/unlock')} data-testid="button-unlock-wallet">
                Unlock Wallet
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <StellarIcon className="h-4 w-4" />
              <span><span className="font-semibold">Stellar</span> version available. <Link href="/stellar" className="underline hover:text-foreground font-semibold" data-testid="link-stellar-desktop">Access Now</Link></span>
            </p>
          </div>
          
          <div className="lg:col-span-2 flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* Metrics Section */}
      {globalStats && (globalStats.totalUsers > 0 || globalStats.totalTransfers > 0 || globalStats.totalXp > 0) && (
        <section className="py-16 px-8 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center gap-3 mb-12">
              <div className="w-24 h-px bg-foreground/20" />
              <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">Network Stats</h2>
              <div className="w-24 h-px bg-foreground/20" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-16 md:gap-24 text-center max-w-4xl mx-auto">
              <div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-4xl font-black tabular-nums" data-testid="text-desktop-users">
                  {globalStats.totalUsers.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide font-mono">Users</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-4xl font-black tabular-nums" data-testid="text-desktop-transfers">
                  {globalStats.totalTransfers.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide font-mono">Transactions</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-4xl font-black tabular-nums" data-testid="text-desktop-gas-sponsored">
                  ${(globalStats.gasSponsoredUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide font-mono">Gas Sponsored</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-4xl font-black tabular-nums" data-testid="text-desktop-xp">
                  {(globalStats.totalXpSpent || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide font-mono">XP Spent</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Powered By Section */}
      <section className="py-16 px-8 border-t border-foreground/10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-8">Powered By</div>
          <div className="flex flex-wrap justify-center gap-10 md:gap-20">
            <div className="text-center">
              <div className="text-lg font-mono font-bold">x402</div>
              <div className="text-sm text-muted-foreground">HTTP Payments Protocol</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold">EIP-3009</div>
              <div className="text-sm text-muted-foreground">Pre-Authorized Transfers</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold">ERC-4626</div>
              <div className="text-sm text-muted-foreground">Tokenized Vaults</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-mono font-bold">Max-flow/Min-cut</div>
              <div className="text-sm text-muted-foreground">Graph-based Signals</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Without The Circus Section */}
      <section className="py-20 px-8 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl font-black uppercase tracking-tight">
              Trust Without<br />The Circus.
            </h2>
            <p className="text-muted-foreground text-lg">
              ZK identity? On-chain résumés? No, thanks.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Tchau attestations and POAPs you'll never use</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Forget your "reputation" points from clicking buttons</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Flexing your tokens, likes or GitHub stars = 0</span>
              </div>
            </div>
            <p className="text-lg font-semibold">
              Humans vouch for humans. <a href="https://maxflow.one" target="_blank" rel="noopener noreferrer" className="text-[#0055FF] hover:underline">MaxFlow</a>'s math does the rest.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Card className="p-6 max-w-sm shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Sybil-Resistant Trust</div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 py-3 border-b border-foreground/10">
                  <div className="w-10 h-10 bg-green-100 flex items-center justify-center">
                    <ScanFace className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Liveness Check</div>
                    <div className="text-xs text-muted-foreground">Face scan passed</div>
                  </div>
                </div>
                <div className="py-3 border-b border-foreground/10">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-[#0055FF]">12</div>
                      <div className="text-xs text-muted-foreground">Vouches Received</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">8</div>
                      <div className="text-xs text-muted-foreground">Vouches Given</div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Trust Score</span>
                  <span className="text-2xl font-black">78<span className="text-sm font-normal text-muted-foreground">/100</span></span>
                </div>
                <div className="pt-3 border-t border-foreground/10">
                  <div className="text-xs font-mono uppercase tracking-widest text-green-600 mb-2">What Matters</div>
                  <div className="flex gap-3 text-xs font-medium">
                    <span>Maximum Flow</span>
                    <span>Path Redundancy</span>
                    <span>Edge Density</span>
                  </div>
                </div>
                <div className="pt-2">
                  <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground/50 mb-2">Not This</div>
                  <div className="flex gap-3 text-xs text-muted-foreground/50">
                    <span className="line-through">ZK Passport</span>
                    <span className="line-through">Attestations</span>
                    <span className="line-through">POAPs</span>
                    <span className="line-through">GitHub Stars</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Zero Fees Section */}
      <section className="py-20 px-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Card className="p-6 max-w-sm shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Transaction Receipt</div>
                <div className="text-xs font-mono text-muted-foreground">#0X8F...2A</div>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-foreground/10">
                  <span className="text-muted-foreground">Amount Sent:</span>
                  <span className="font-bold">10.00 USDC</span>
                </div>
                <div className="py-2 border-b border-foreground/10">
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Network Fee:</span>
                    <div className="text-right">
                      <div className="text-muted-foreground line-through decoration-[#E85D04] decoration-2">0.05 USDC</div>
                      <span className="inline-block px-2 py-0.5 mt-1 bg-[#00D664] text-white text-[10px] font-mono font-bold uppercase">Paid by Facilitator</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-bold">Total Deducted:</span>
                  <span className="font-bold text-lg">10.00 USDC</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4 italic">"We pay the gas so you don't have to."</p>
            </Card>
          </div>
          <div className="space-y-6">
            <h2 className="text-4xl font-black uppercase tracking-tight">
              Zero Hidden Fees.
            </h2>
            <p className="text-muted-foreground text-lg">
              Users are suspicious of "free". We're transparent. Protocol Facilitators pay the network fees so your community doesn't have to. 10 USDC sent is 10 USDC received.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">No gas tokens needed</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Instant settlement</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">100% On-chain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Savings Section */}
      <section className="py-20 px-8 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1 space-y-6">
            <h2 className="text-4xl font-black uppercase tracking-tight">
              Savings That<br />Feel Like Winning.
            </h2>
            <p className="text-muted-foreground text-lg">
              Don't just say "{apyDisplay || '3.1%'} APY." Experience the thrill of the prize pool. Save money, earn tickets, win prizes. No-loss lottery protocol integrated directly.
            </p>
            <Button size="lg" variant="outline" onClick={() => setLocation('/create')}>
              Start Saving <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="order-1 lg:order-2 flex justify-center">
            <Card className="p-6 max-w-sm shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Save & Win</div>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  If I keep <span className="font-bold text-foreground">$50</span> in nanoPay...
                </div>
                <div className="py-4 border-y border-foreground/10">
                  <div className="text-sm text-muted-foreground">...I could win up to</div>
                  <div className="text-4xl font-black text-[#0055FF]">$500</div>
                  <div className="text-sm text-muted-foreground">in the weekly pool</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Knowledge Access Section */}
      <section className="py-20 px-8">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="flex justify-center">
            <Card className="p-6 max-w-sm shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">AI Assistant</div>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-[#0055FF] flex items-center justify-center flex-shrink-0">
                    <Cpu className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-foreground/5 p-3 text-sm flex-1">
                    How do I start a small business?
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-foreground/10 flex items-center justify-center flex-shrink-0">
                    <Cpu className="h-4 w-4" />
                  </div>
                  <div className="bg-[#0055FF]/10 p-3 text-sm flex-1">
                    Great question! Here are the key steps to start your business...
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-foreground/10 text-center">
                <span className="text-xs font-mono text-muted-foreground">1 XP per question</span>
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <h2 className="text-4xl font-black uppercase tracking-tight">
              AI, Without Barriers.
            </h2>
            <p className="text-muted-foreground text-lg">
              Access to AI shouldn't be a privilege. Ask anything - education, health, business, skills, science. Learn, grow, and unlock opportunities that were once out of reach.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Education for everyone, everywhere</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Practical skills & real-world knowledge</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-[#0055FF]" />
                <span className="font-medium">Democratizing intelligence & curiosity</span>
              </div>
            </div>
            <Button size="lg" variant="outline" onClick={() => setLocation('/create')}>
              Start Learning <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Setup Section */}
      <section className="py-20 px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h2 className="text-4xl font-black uppercase tracking-tight mb-4">
            Setup in Seconds
          </h2>
          <p className="text-lg text-muted-foreground">Faster than tying your shoes.</p>
        </div>
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="text-center space-y-4">
            <div className="text-6xl font-black text-foreground/10">01</div>
            <div className="text-xs font-mono text-muted-foreground">Time: 0.1s</div>
            <h3 className="font-bold text-lg">Create Wallet</h3>
            <p className="text-sm text-muted-foreground">No email. No phone number.</p>
          </div>
          <div className="text-center space-y-4">
            <div className="text-6xl font-black text-foreground/10">02</div>
            <div className="text-xs font-mono text-muted-foreground">Time: Interactive</div>
            <h3 className="font-bold text-lg">Backup Key</h3>
            <p className="text-sm text-muted-foreground">Write it down. Keep it safe.</p>
          </div>
          <div className="text-center space-y-4">
            <div className="text-6xl font-black text-foreground/10">03</div>
            <div className="text-xs font-mono text-muted-foreground">Time: Ready</div>
            <h3 className="font-bold text-lg">Receive Funds</h3>
            <p className="text-sm text-muted-foreground">Start transacting instantly.</p>
          </div>
        </div>
        <div className="text-center mt-12">
          <Button size="lg" onClick={() => setLocation('/create')} data-testid="button-get-started">
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            Stellar version available. <Link href="/stellar" className="underline hover:text-foreground" data-testid="link-stellar-landing">Open →</Link>
          </p>
        </div>
      </section>

      {/* Chains Section */}
      <section className="py-12 px-8 bg-white border-t border-foreground/10">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-lg text-muted-foreground mb-2">
            Community signals meet on-chain finality.
          </p>
          <h2 className="text-2xl font-black tracking-tight mb-8">
            Lightweight. Gasless. Multichain.
          </h2>
          <div className="flex justify-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#0055FF]" />
              <span className="text-sm font-mono uppercase">Base</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#FCFF52]" />
              <span className="text-sm font-mono uppercase">Celo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#04795B]" />
              <span className="text-sm font-mono uppercase">Gnosis</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#28A0F0]" />
              <span className="text-sm font-mono uppercase">Arbitrum</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#000000]" />
              <span className="text-sm font-mono uppercase">Stellar</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-8 border-t border-foreground/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#0055FF]" />
            <span className="text-sm font-bold uppercase">nanoPay</span>
          </div>
          <div className="flex gap-8 items-center">
            <Link href="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground">How It Works</Link>
            <Link href="/faqs" className="text-sm text-muted-foreground hover:text-foreground">FAQs</Link>
            <Link href="/context" className="text-sm text-muted-foreground hover:text-foreground hidden md:block">Context</Link>
            <a 
              href="https://t.me/+zWefAe1jX9FhODU0" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              data-testid="link-telegram-landing"
            >
              <SiTelegram className="h-4 w-4" />
              Community
            </a>
          </div>
          <div className="text-sm text-muted-foreground">
            built by <a href="https://x.com/mbarrbosa" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Marco</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [walletExists, setWalletExists] = useState<boolean | null>(null);

  const { data: aaveApyBase } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 8453],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/8453');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - APY changes slowly
  });

  const { data: aaveApyCelo } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42220],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42220');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - APY changes slowly
  });

  const { data: globalStats } = useQuery<GlobalStats>({
    queryKey: ['/api/stats/global'],
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  const stellarApy = globalStats?.stellar?.currentApy || 0;
  const bestApy = Math.max(aaveApyBase?.apy || 0, aaveApyCelo?.apy || 0, stellarApy);
  const apyDisplay = bestApy > 0 ? `${bestApy.toFixed(1)}%` : null;

  useEffect(() => {
    let isActive = true;

    async function checkWalletState() {
      try {
        const exists = await hasWallet();
        const unlocked = isWalletUnlocked();

        if (!isActive) return;

        // Auto-redirect unlocked users to home
        if (exists && unlocked) {
          // Check for referral parameter and persist it
          const params = new URLSearchParams(window.location.search);
          const ref = params.get('ref');
          if (ref) {
            sessionStorage.setItem('pending_referral', ref);
          }
          setLocation('/home');
          return;
        }

        setWalletExists(exists);
      } catch (error) {
        console.error('Failed to check wallet state:', error);
        if (isActive) {
          setWalletExists(false);
        }
      }
    }

    checkWalletState();

    return () => {
      isActive = false;
    };
  }, [setLocation]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Show desktop layout on lg screens, mobile on smaller */}
      <div className="hidden lg:flex flex-col min-h-screen">
        <DesktopLanding 
          apyDisplay={apyDisplay}
          globalStats={globalStats}
          setLocation={setLocation}
        />
      </div>
      <div className="lg:hidden flex flex-col min-h-screen">
        <MobileLanding 
          walletExists={walletExists}
          apyDisplay={apyDisplay}
          globalStats={globalStats}
          setLocation={setLocation}
        />
        <Footer />
      </div>
    </div>
  );
}
