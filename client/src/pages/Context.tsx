import { useLocation, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Shield, Users, Zap, Globe, HeartHandshake, TrendingUp, AlertCircle, PiggyBank, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

function FeatureCard({ icon: Icon, title, children }: { icon: any, title: string, children: React.ReactNode }) {
  return (
    <div className="border-2 border-foreground p-5 shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-[#0055FF]/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-[#0055FF]" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-base mb-2">{title}</h3>
          <div className="text-sm text-muted-foreground space-y-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Context() {
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
              <span className="text-sm font-bold uppercase">Context</span>
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
              The Big Picture
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
              No Internet? No Gas?<br />
              <span className="text-[#0055FF]">No Problem.</span>
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              nanoPay is a lightweight PWA wallet for the real world—unreliable connectivity, budget phones, shared devices. 
              Beyond payments: savings, prize pools, and trust infrastructure.
            </p>
          </section>

          {/* Who Benefits */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Who Benefits</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <FeatureCard icon={Users} title="Individuals">
                <p>Pay and receive without gas fees or complex setup. Build verifiable identity through trust networks.</p>
              </FeatureCard>
              <FeatureCard icon={HeartHandshake} title="Communities & NGOs">
                <p>Safer disbursements via claim links. Auditable, lower leakage than vouchers.</p>
              </FeatureCard>
              <FeatureCard icon={Zap} title="Vendors">
                <p>Accept USDC for goods and services. Instant settlement, no chargebacks.</p>
              </FeatureCard>
            </div>
          </section>

          {/* How Payments Work */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">How x402 Payments Work</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard icon={Zap} title="You Sign, We Relay">
                <p>Sign an authorization off-chain using EIP-3009. Our facilitator submits it on-chain and covers gas.</p>
              </FeatureCard>
              <FeatureCard icon={Globe} title="Works Offline">
                <p>Sign when disconnected. Submit when you (or anyone with the authorization) get online.</p>
              </FeatureCard>
            </div>
          </section>

          {/* Security */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Security</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard icon={Shield} title="Self-Custodial">
                <ul className="space-y-1.5">
                  <li>Your keys stay on your device. We never hold your funds.</li>
                  <li>Keys encrypted with AES-GCM. Auto-lock on inactivity.</li>
                  <li>Unlock with Face ID or fingerprint instead of password.</li>
                </ul>
              </FeatureCard>
              <FeatureCard icon={Globe} title="Networks">
                <ul className="space-y-1.5">
                  <li><strong>Base</strong> — Native USDC. Aave V3 savings.</li>
                  <li><strong>Celo</strong> — Native USDC. Aave V3. GoodDollar.</li>
                  <li><strong>Gnosis</strong> — USDC.e. Circles social money.</li>
                  <li><strong>Arbitrum</strong> — Native USDC. Aave V3.</li>
                </ul>
              </FeatureCard>
            </div>
          </section>

          {/* Savings & Pool */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Savings & Pool</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard icon={PiggyBank} title="Savings on Autopilot">
                <ul className="space-y-1.5">
                  <li>Deposit USDC into Aave V3 to earn yield automatically.</li>
                  <li>No lock-up periods. Withdraw anytime.</li>
                  <li>Allocate yield: keep it all, or redirect to the prize pool.</li>
                </ul>
              </FeatureCard>
              <FeatureCard icon={Gift} title="Prize-Linked Savings">
                <ul className="space-y-1.5">
                  <li>Contribute yield to a weekly prize pool.</li>
                  <li>One winner drawn each week takes the pool.</li>
                  <li>10% referral bonus on tickets. Your principal is never at risk.</li>
                </ul>
              </FeatureCard>
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
              <FeatureCard icon={HeartHandshake} title="MaxFlow">
                <p>Graph-based signal measuring trust network health. Anti-sybil by design. Claim XP daily based on your score.</p>
              </FeatureCard>
              <FeatureCard icon={Users} title="Circles">
                <p>Community social money on Gnosis. Claim 1 CRC/hour. Build trust with friends.</p>
              </FeatureCard>
              <FeatureCard icon={Gift} title="GoodDollar">
                <p>Daily UBI claims on Celo after one-time face verification. Convert G$ to XP in Trust Hub.</p>
              </FeatureCard>
              <FeatureCard icon={Sparkles} title="XP Rewards">
                <p>Earn XP from MaxFlow claims or GoodDollar conversion. Spend on USDC savings (100 XP = 1 USDC), AI chat (1 XP per message), or SENADOR tokens.</p>
              </FeatureCard>
            </div>
          </section>

          {/* Coming Soon & Good to Know */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">More Info</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <FeatureCard icon={TrendingUp} title="Coming Soon">
                <ul className="space-y-1.5">
                  <li>Social recovery through trusted guardians.</li>
                  <li>More yield destinations: communities, BNPL, AI tools.</li>
                  <li>Spending controls and daily limits.</li>
                </ul>
              </FeatureCard>
              <FeatureCard icon={AlertCircle} title="Good to Know">
                <ul className="space-y-1.5">
                  <li>Signing works offline. Execution requires connectivity.</li>
                  <li>Self-custodial means you're responsible for your backup.</li>
                  <li>DeFi protocols carry smart contract risk.</li>
                </ul>
              </FeatureCard>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center py-8 space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Ready to Get Started?
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
            <Link href="/how-it-works" className="text-sm text-muted-foreground hover:text-foreground">How It Works</Link>
            <Link href="/faqs" className="text-sm text-muted-foreground hover:text-foreground">FAQs</Link>
          </div>
          <div className="text-sm text-muted-foreground">
            built by <a href="https://x.com/mbarrbosa" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Marco</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
