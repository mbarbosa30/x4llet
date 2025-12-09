import { useLocation } from 'wouter';
import { ArrowLeft, Shield, Users, Zap, Globe, HeartHandshake, TrendingUp, AlertCircle, PiggyBank, Gift, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

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
        <div className="flex h-14 items-center px-4 max-w-md mx-auto">
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
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl text-section">No Internet? No Gas? No ID? No Problem.</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              nanoPay is a lightweight PWA wallet for the real world—unreliable connectivity, budget phones, shared devices. Send and receive USDC gaslessly via x402. Works offline. Your keys stay on your device.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Beyond payments: savings that earn yield, prize-linked pools, and trust infrastructure through MaxFlow, Circles, and GoodDollar—no centralized verification required.
            </p>
          </div>

          <Separator />

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Who Benefits</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Individuals:</strong> Pay and receive without gas fees or complex setup. Build verifiable identity through trust networks.</li>
                  <li><strong>Communities & NGOs:</strong> Safer disbursements via claim links. Auditable, lower leakage than vouchers.</li>
                  <li><strong>Vendors:</strong> Accept USDC for goods and services. Instant settlement, no chargebacks.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">How x402 Payments Work</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>You sign, we relay:</strong> Sign an authorization off-chain using EIP-3009. Our facilitator submits it on-chain and covers gas.</li>
                  <li><strong>Works offline:</strong> Sign when disconnected. Submit when you (or anyone with the authorization) get online.</li>
                  <li><strong>Single-use links:</strong> Claim links expire quickly and can only be used once by the intended recipient.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Security</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Self-custodial:</strong> Your keys stay on your device. We never hold your funds.</li>
                  <li><strong>Encrypted storage:</strong> Keys encrypted with AES-GCM. Auto-lock on inactivity.</li>
                  <li><strong>Passkey support:</strong> Unlock with Face ID or fingerprint instead of password.</li>
                  <li><strong>Clear confirmations:</strong> Every payment shows recipient, amount, and network before signing.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Networks</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Base:</strong> Native USDC. Aave V3 savings available.</li>
                  <li><strong>Celo:</strong> Native USDC. Aave V3 savings. GoodDollar UBI.</li>
                  <li><strong>Gnosis:</strong> Circle bridged USDC.e. Circles social money.</li>
                  <li><strong>Arbitrum:</strong> Native USDC. Aave V3 savings available.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Your wallet address is the same on all networks. Switch in Settings.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <PiggyBank className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Savings on Autopilot</h3>
                <p className="text-sm text-muted-foreground">
                  Deposit USDC into Aave V3 to earn yield automatically. No gas tokens needed—our facilitator handles on-chain transactions.
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Earn interest:</strong> Variable APY based on lending pool demand.</li>
                  <li><strong>Withdraw anytime:</strong> No lock-up periods. Your funds, your choice.</li>
                  <li><strong>Allocate your yield:</strong> Keep it all, or direct a percentage to the prize pool.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Prize-Linked Savings</h3>
                <p className="text-sm text-muted-foreground">
                  Opt-in to contribute a percentage of your yield to a weekly prize pool. The more yield you contribute, the more tickets you earn.
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Weekly draws:</strong> One winner takes the pool each week.</li>
                  <li><strong>Referral bonus:</strong> Earn 10% of your referrals' ticket contributions.</li>
                  <li><strong>Sponsored prizes:</strong> Donations boost the pool without adding tickets.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Your principal is never at risk—only yield goes to the pool.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <HeartHandshake className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Trust Infrastructure</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>MaxFlow:</strong> Graph-based signal that measures your trust network health. Anti-sybil by design.</li>
                  <li><strong>Circles:</strong> Community social money on Gnosis. Claim 1 CRC/hour. Build trust with friends.</li>
                  <li><strong>GoodDollar:</strong> Daily UBI claims on Celo after one-time face verification.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Coming Soon</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Social recovery:</strong> Recover your wallet through trusted guardians.</li>
                  <li><strong>More yield destinations:</strong> Direct yield to vulnerable communities, BNPL, or AI tools.</li>
                  <li><strong>Spending controls:</strong> Daily limits and new-recipient cool-offs.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4 shadow-[4px_4px_0px_0px_rgb(0,0,0)]">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-label text-foreground">Good to Know</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>Signing works offline. Execution requires connectivity.</li>
                  <li>Self-custodial means you're responsible for your backup. No recovery without it.</li>
                  <li>DeFi protocols carry smart contract risk. Only deposit what you're comfortable with.</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
