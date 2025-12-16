import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Wallet, Shield, Sparkles, Send, WifiOff, Zap, Lock, Fingerprint, Layers, TrendingUp, Sliders, Gift, Network, Users, CircleDollarSign, Cpu, Clock, Rocket } from 'lucide-react';

function StepCard({ step, icon: Icon, title, description }: { step: string, icon: any, title: string, description: string }) {
  return (
    <div className="border-2 border-foreground p-5 shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="text-3xl font-black text-foreground/20">{step}</div>
        </div>
        <div className="flex-1">
          <div className="w-10 h-10 bg-[#0055FF]/10 flex items-center justify-center mb-3">
            <Icon className="h-5 w-5 text-[#0055FF]" />
          </div>
          <h3 className="font-bold text-base mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, items }: { icon: any, title: string, description: string, items?: string[] }) {
  return (
    <div className="border-2 border-foreground p-5 shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
      <div className="w-10 h-10 bg-[#0055FF]/10 flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-[#0055FF]" />
      </div>
      <h3 className="font-bold text-base mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{description}</p>
      {items && (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <div className="w-1.5 h-1.5 bg-[#0055FF] mt-1.5 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoadmapCard({ icon: Icon, quarter, title, description }: { icon: any, quarter: string, title: string, description: string }) {
  return (
    <div className="border-2 border-dashed border-foreground/40 p-5 bg-foreground/5">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{quarter}</span>
      </div>
      <h3 className="font-bold text-sm mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function HowItWorks() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header 
        className="sticky top-0 z-50 border-b border-foreground bg-background"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))'
        }}
      >
        <div className="flex h-14 items-center justify-between px-4 max-w-4xl mx-auto">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation('/')}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 ml-2">
              <div className="w-3 h-3 bg-[#0055FF]" />
              <span className="text-sm font-bold uppercase">How It Works</span>
            </div>
          </div>
          <Button size="sm" onClick={() => setLocation('/create')} data-testid="button-get-started">
            Get Started <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">
          
          {/* Hero Section */}
          <section className="text-center space-y-4">
            <div className="inline-block border border-foreground px-3 py-1 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              The Complete Guide
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
              Simple Money.<br />
              <span className="text-[#0055FF]">Powerful Tools.</span>
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              From creating your wallet to earning rewards. Everything you need to know.
            </p>
          </section>

          {/* Getting Started Steps */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Getting Started</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <StepCard 
                step="01"
                icon={Wallet}
                title="Create Your Wallet"
                description="No email, no phone number, no KYC. Your wallet is generated instantly on your device. Completely private."
              />
              <StepCard 
                step="02"
                icon={Lock}
                title="Backup Your Key"
                description="Write down your recovery phrase. Keep it safe. This is the ONLY way to recover your wallet. No one else has access."
              />
              <StepCard 
                step="03"
                icon={Fingerprint}
                title="Enable Biometrics"
                description="Optional Face ID or fingerprint unlock. Uses WebAuthn with PRF extension—your biometric never leaves your device."
              />
              <StepCard 
                step="04"
                icon={Send}
                title="Start Transacting"
                description="Send and receive USDC instantly. No gas fees, no waiting. Works across Base, Celo, Gnosis, and Arbitrum."
              />
            </div>
          </section>

          {/* Core Features */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Core Features</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard 
                icon={Zap}
                title="Gasless Payments (x402)"
                description="EIP-3009 enables signed authorizations that anyone can submit. Our facilitator covers all gas fees."
                items={[
                  "Sign payments offline",
                  "No ETH or CELO needed",
                  "10 USDC sent = 10 USDC received"
                ]}
              />
              <FeatureCard 
                icon={WifiOff}
                title="Offline Mode"
                description="Both parties can be offline. Sign locally, show QR to recipient. Submit when anyone gets online."
                items={[
                  "QR-based authorization transfer",
                  "Works in low-connectivity areas",
                  "No internet required to sign"
                ]}
              />
              <FeatureCard 
                icon={Shield}
                title="Self-Custody Security"
                description="Your private key is encrypted with AES-GCM and stored locally. Auto-locks after inactivity."
                items={[
                  "Keys never leave your device",
                  "No password recovery exists",
                  "Always backup your phrase"
                ]}
              />
              <FeatureCard 
                icon={Layers}
                title="Multi-Chain Support"
                description="One wallet address across all networks. Switch chains instantly in Settings."
                items={[
                  "Base — Native USDC, Aave savings",
                  "Celo — Native USDC, GoodDollar",
                  "Gnosis — USDC.e, Circles",
                  "Arbitrum — Native USDC, Aave",
                  "Stellar — XLM staking (coming soon)"
                ]}
              />
            </div>
          </section>

          {/* Earning Features */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Earn & Grow</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard 
                icon={TrendingUp}
                title="Aave Savings"
                description="Deposit USDC into Aave V3 to earn interest. Withdraw anytime, no lock-up periods."
                items={[
                  "Variable APY based on demand",
                  "Battle-tested since 2020",
                  "One-tap deposit/withdraw"
                ]}
              />
              <FeatureCard 
                icon={Sliders}
                title="Yield Allocation"
                description="Choose what happens to your yield. Keep 100%, or redirect a percentage to the prize pool or causes."
                items={[
                  "Adjustable anytime",
                  "Principal never touched",
                  "Only yield gets redirected"
                ]}
              />
              <FeatureCard 
                icon={Gift}
                title="Prize Pool"
                description="Weekly prize-linked savings pool funded by participant yield contributions."
                items={[
                  "Contribute yield → earn tickets",
                  "One winner drawn each week",
                  "10% referral bonus on tickets"
                ]}
              />
              <FeatureCard 
                icon={CircleDollarSign}
                title="GoodDollar UBI"
                description="Daily UBI tokens (G$) on Celo for verified humans. Funded by DeFi interest and donations."
                items={[
                  "Face verify once (privacy-preserving)",
                  "Claim G$ daily in nanoPay",
                  "Re-verify every ~180 days"
                ]}
              />
              <FeatureCard 
                icon={Sparkles}
                title="XP Rewards"
                description="Earn Experience Points for network participation. Spend on USDC savings or AI assistance."
                items={[
                  "Claim daily from MaxFlow signal",
                  "GoodDollar users: convert G$ to XP",
                  "100 XP → 1 USDC savings on Celo",
                  "1 XP per AI chat message"
                ]}
              />
            </div>
          </section>

          {/* Trust Infrastructure */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Trust Infrastructure</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard 
                icon={Network}
                title="MaxFlow Signal"
                description="Graph-based trust signal measuring network health through flow computation. Anti-sybil by design."
                items={[
                  "Vouch for real humans",
                  "Fake vouches hurt your score",
                  "Self-policing trust network"
                ]}
              />
              <FeatureCard 
                icon={Users}
                title="Circles Protocol"
                description="Community social money on Gnosis. Every registered human mints CRC at the same rate."
                items={[
                  "Register one avatar per human",
                  "Claim 1 CRC per hour (24/day max)",
                  "Trust friends for CRC flow"
                ]}
              />
            </div>
          </section>

          {/* Roadmap */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Coming Soon</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <RoadmapCard 
                icon={Cpu}
                quarter="Soon"
                title="AI Credits Allocation"
                description="Allocate yield to LLM compute credits. AI access funded by savings interest."
              />
              <RoadmapCard 
                icon={Clock}
                quarter="Soon"
                title="Buy Now Pay Later"
                description="Sybil-resistant credit scoring. Micro-credit backed by reputation."
              />
              <RoadmapCard 
                icon={Rocket}
                quarter="Soon"
                title="Cross-Chain Transfers"
                description="Seamless USDC transfers between all supported chains."
              />
            </div>
          </section>

          {/* CTA */}
          <section className="text-center py-8 space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Ready to Start?
            </h2>
            <div className="flex justify-center gap-4">
              <Button size="lg" onClick={() => setLocation('/create')} data-testid="button-create-wallet">
                Create Wallet <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation('/faqs')} data-testid="button-view-faqs">
                View FAQs
              </Button>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground py-6 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#0055FF]" />
            <span className="text-sm font-bold uppercase">nanoPay</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Home</Link>
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
