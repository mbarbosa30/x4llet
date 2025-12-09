import { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Marquee, MarqueeItem } from '@/components/ui/marquee';
import { WifiOff, Lock, Sparkles, Sliders, Gift, Layers, Network, Zap, Users, ArrowRightLeft, ArrowRight, Shield, Coins, TrendingUp, Wallet, ScanFace, Fingerprint, CircleDollarSign, Cpu, Clock, Rocket } from 'lucide-react';
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

// Phone mockup component for desktop hero
function PhoneMockup({ balance = "$124.50" }: { balance?: string }) {
  return (
    <div className="relative">
      {/* Phone frame */}
      <div className="bg-white border-2 border-foreground p-4 w-[280px] shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
        {/* Phone header */}
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-foreground/10">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#0055FF]" />
            <span className="text-[10px] font-mono font-bold uppercase">nanoPay</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[9px] font-mono text-muted-foreground">Online</span>
          </div>
        </div>
        
        {/* Balance display */}
        <div className="text-center py-6">
          <div className="text-xs text-muted-foreground mb-1 font-mono">Total Balance</div>
          <div className="text-4xl font-black tracking-tight mb-2">{balance}</div>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-mono">
            <Sparkles className="h-3 w-3" />
            Synced
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="space-y-2 mt-4">
          <button className="w-full bg-foreground text-white py-3 text-xs font-mono font-bold uppercase flex items-center justify-center gap-2">
            <ArrowRight className="h-3 w-3" />
            Send Money
          </button>
          <button className="w-full border border-foreground py-3 text-xs font-mono font-bold uppercase">
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
          <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground pt-4 mb-6 text-center">Trust Without The Circus</div>
          <div className="max-w-sm mx-auto mb-8">
            <div className="border border-foreground p-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white mb-6">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Identity Check</div>
              <div className="flex items-center gap-3 py-2 border-b border-foreground/10">
                <div className="w-8 h-8 bg-green-100 flex items-center justify-center">
                  <ScanFace className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="font-bold text-xs">Verified Human</div>
                  <div className="text-[10px] text-muted-foreground">Face scan complete</div>
                </div>
              </div>
              <div className="flex items-center gap-3 py-2">
                <div className="w-8 h-8 bg-green-100 flex items-center justify-center">
                  <Users className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="font-bold text-xs">Vouched by 3 friends</div>
                  <div className="text-[10px] text-muted-foreground">Trust score: 847</div>
                </div>
              </div>
              <div className="flex gap-3 pt-3 text-[10px] text-muted-foreground/50">
                <span className="line-through">ZK Passport</span>
                <span className="line-through">Attestations</span>
                <span className="line-through">POAPs</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              ZK identity? On-chain résumés? No, thanks.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-[#0055FF] mt-1.5 flex-shrink-0" />
                <span>Tchau attestations and POAPs you'll never use</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-[#0055FF] mt-1.5 flex-shrink-0" />
                <span>Forget your "reputation" points from clicking buttons</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-[#0055FF] mt-1.5 flex-shrink-0" />
                <span>Flexing your tokens, likes or GitHub stars = 0</span>
              </div>
            </div>
            <p className="text-sm font-semibold mt-4">
              Humans vouch for humans. Math does the rest.
            </p>
          </div>
        </div>

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
              Features
            </Link>
            <Link href="/faqs" className="text-sm font-mono font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
              Security
            </Link>
            <Link href="/context" className="text-sm font-mono font-medium text-muted-foreground hover:text-foreground uppercase tracking-wide">
              Community
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
        <MarqueeItem>{globalStats?.totalTransfers || 0} Transfers</MarqueeItem>
        <MarqueeItem>{apyDisplay || '3.1%'} APY on Savings</MarqueeItem>
        <MarqueeItem>Gasless on Base</MarqueeItem>
        <MarqueeItem>Gasless on Celo</MarqueeItem>
        <MarqueeItem>Gasless on Gnosis</MarqueeItem>
        <MarqueeItem>Gasless on Arbitrum</MarqueeItem>
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
              <h1 className="text-6xl font-black uppercase tracking-tighter leading-none mb-6">
                Money That<br />
                <span className="text-[#0055FF]">Works</span><br />
                Offline.
              </h1>
              <p className="text-lg text-muted-foreground max-w-md">
                Reliable as a hammer. Fast as cash. Built for communities, not casinos.
              </p>
            </div>
            
            <div className="flex gap-4">
              <Button size="lg" onClick={() => setLocation('/create')} data-testid="button-hero-create">
                Create Wallet <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation('/context')} data-testid="button-read-manifesto">
                Read Manifesto
              </Button>
            </div>
          </div>
          
          <div className="lg:col-span-2 flex justify-center lg:justify-end">
            <PhoneMockup balance="$124.50" />
          </div>
        </div>
      </section>

      {/* Tagline Section */}
      <section className="py-16 px-8 border-t border-foreground/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black tracking-tight mb-6">
            Vouched for by your community.<br />
            Verified by math, not paperwork.
          </h2>
          <div className="flex justify-center gap-8 mt-8">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-foreground" />
              <span className="text-sm font-mono uppercase">Base</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-foreground" />
              <span className="text-sm font-mono uppercase">Celo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-foreground" />
              <span className="text-sm font-mono uppercase">Gnosis</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-foreground" />
              <span className="text-sm font-mono uppercase">Arbitrum</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Without The Circus Section */}
      <section className="py-20 px-8 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Card className="p-6 max-w-sm shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Identity Check</div>
              <div className="space-y-4">
                <div className="flex items-center gap-3 py-3 border-b border-foreground/10">
                  <div className="w-10 h-10 bg-green-100 flex items-center justify-center">
                    <ScanFace className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Verified Human</div>
                    <div className="text-xs text-muted-foreground">Face scan complete</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 py-3 border-b border-foreground/10">
                  <div className="w-10 h-10 bg-green-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Vouched by 3 friends</div>
                    <div className="text-xs text-muted-foreground">Trust score: 847</div>
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground/50 line-through">
                    <span>ZK Passport</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground/50 line-through">
                    <span>Attestations</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground/50 line-through">
                    <span>POAPs</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
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
              Humans vouch for humans. Math does the rest.
            </p>
          </div>
        </div>
      </section>

      {/* Zero Fees Section */}
      <section className="py-20 px-8 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <Card className="p-6 max-w-sm shadow-[8px_8px_0px_0px_rgb(0,0,0)]">
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">Transaction Receipt</div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-foreground/10">
                  <span className="text-muted-foreground">Amount Sent:</span>
                  <span className="font-bold">10.00 USDC</span>
                </div>
                <div className="flex justify-between py-2 border-b border-foreground/10">
                  <span className="text-muted-foreground">Network Fee:</span>
                  <div className="text-right">
                    <span className="line-through text-muted-foreground/50 mr-2">0.05 USDC</span>
                    <span className="text-[#0055FF] font-bold">Paid by Relayer</span>
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
              Users are suspicious of "free". We're transparent. Protocol Relayers pay the network fees so your community doesn't have to. 10 USDC sent is 10 USDC received.
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
      <section className="py-20 px-8">
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
        </div>
      </section>

      {/* Stats Section */}
      {globalStats && (globalStats.totalUsers > 0 || globalStats.totalTransfers > 0) && (
        <section className="py-16 px-8 border-t border-foreground/10">
          <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-4xl font-black tabular-nums">{globalStats.totalUsers.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-wide mt-2">Users</p>
            </div>
            <div>
              <p className="text-4xl font-black tabular-nums">{globalStats.totalTransfers.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-wide mt-2">Transfers</p>
            </div>
            <div>
              <p className="text-4xl font-black tabular-nums">{globalStats.totalXp.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              <p className="text-sm text-muted-foreground uppercase tracking-wide mt-2">XP Earned</p>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-12 px-8 border-t border-foreground/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#0055FF]" />
            <span className="text-sm font-bold uppercase">nanoPay</span>
          </div>
          <div className="flex gap-8">
            <Link href="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground">How It Works</Link>
            <Link href="/faqs" className="text-sm text-muted-foreground hover:text-foreground">FAQs</Link>
            <Link href="/context" className="text-sm text-muted-foreground hover:text-foreground">Context</Link>
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
    staleTime: 60000,
  });

  const { data: aaveApyCelo } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42220],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42220');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
    staleTime: 60000,
  });

  const bestApy = Math.max(aaveApyBase?.apy || 0, aaveApyCelo?.apy || 0);
  const apyDisplay = bestApy > 0 ? `${bestApy.toFixed(1)}%` : null;

  const { data: globalStats } = useQuery<GlobalStats>({
    queryKey: ['/api/stats/global'],
    staleTime: 60000,
  });

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
