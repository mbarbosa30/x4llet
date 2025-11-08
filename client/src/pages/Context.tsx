import { useLocation } from 'wouter';
import { ArrowLeft, Shield, Users, Zap, Globe, HeartHandshake, Wrench, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function Context() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header 
        className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(3.5rem + env(safe-area-inset-top))'
        }}
      >
        <div className="flex h-14 items-center px-4 max-w-md mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/settings')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="ml-2 text-lg font-semibold">Context</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-md mx-auto px-4 pt-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">What this wallet is (and why it exists)</h2>
            <p className="text-muted-foreground leading-relaxed">
              A lightweight, no-install wallet built as a PWA for the real world—unreliable data, budget phones, shared devices. It sends and receives stablecoins gaslessly (you sign off-chain; we relay on-chain) and supports execute-by-link so a trusted person with internet can finalize a transfer for you. It also speaks HTTP 402 ("Payment Required"), letting websites, services, and agents charge per use without accounts.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Beyond payments, nanoPay integrates MaxFlow network signal—a flow-driven computation that measures your trust network health. This creates verifiable network identity that's resistant to sybil attacks, useful for community coordination, resource allocation, and proving authenticity without centralized verification.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our aim is simple: cash-like digital payments that work for everyone—refugees, informal workers, community programs, and partners who need safer, faster rails for aid and commerce.
            </p>
          </div>

          <Separator />

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Who benefits</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Individuals in low-connectivity settings:</strong> quick setup, readable balances, pay/receive without handling gas or jargon. MaxFlow signal provides verifiable identity without documents.</li>
                  <li><strong>Communities & NGOs:</strong> safer disbursements via short-lived claim links; auditable, lower leakage than paper vouchers. MaxFlow helps identify authentic community members for resource allocation.</li>
                  <li><strong>Vendors & local services:</strong> charge per use (Wi-Fi minutes, charging, printing, rides) via x402, settle instantly in stablecoins.</li>
                  <li><strong>Browsers/telcos/fintechs:</strong> a drop-in Wallet-as-a-Service layer (relayer + x402 + link execution) to power gasless stablecoin UX.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">How payments work</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>You sign; we relay:</strong> We use standards like EIP-3009 (e.g., USDC's transferWithAuthorization / receiveWithAuthorization). You approve a payment off-chain; our relayer submits it on-chain and pays gas.</li>
                  <li><strong>Execute-by-link:</strong> Claim links (default) mean funds can only be claimed by the intended recipient address (safer if an SMS or chat link leaks). Short expiry + one-time use: links auto-expire and can't be replayed.</li>
                  <li><strong>Pay-over-HTTP (x402):</strong> When a site returns "Payment Required", the wallet shows a small pay sheet; you approve; the page unlocks—no new account or KYC forms.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Safety & privacy by design</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Self-custodial:</strong> your key stays on your device; we never hold your funds.</li>
                  <li><strong>Encrypted vault:</strong> keys are encrypted at rest; auto-lock on inactivity; no keys in localStorage; no analytics on sensitive actions.</li>
                  <li><strong>Clear confirmations:</strong> every payment shows recipient, amount, network, and contract before you approve.</li>
                  <li><strong>Single-use, expiring links:</strong> each link has a unique nonce, short expiry, and idempotent execution.</li>
                  <li><strong>Allowlisted networks & tokens:</strong> we default to native USDC on supported chains; bridged or incompatible tokens are blocked.</li>
                  <li><strong>Minimal data exhaust:</strong> we store only what's needed to relay transactions (e.g., nonces). Browsing history and balances stay on your device.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Supported tokens & networks</h3>
                <p className="text-sm text-muted-foreground">
                  <strong>Primary:</strong> native USDC on supported networks (e.g., Base, Celo).
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Fallbacks:</strong> where EIP-3009 isn't available, we may use ERC-2612 permit via a single-use executor (if the token supports it).
                </p>
                <p className="text-sm text-muted-foreground">
                  Availability can vary by region and partner integration. We'll always show the exact network and contract before you approve.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <HeartHandshake className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Aid & program payouts</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Claim-only disbursements:</strong> beneficiaries receive claim links that only their wallet can execute.</li>
                  <li><strong>Revocation & expiry:</strong> unclaimed links expire quickly; issuers can cancel outstanding links where supported.</li>
                  <li><strong>Transparency:</strong> each payout has a human-readable receipt; auditors can verify on-chain.</li>
                  <li><strong>Cash-out flexibility:</strong> programs can pair wallet payouts with local agents, mobile money, or bank rails (outside the wallet).</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Wrench className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Partners: Wallet-as-a-Service (WaaS)</h3>
                <p className="text-sm text-muted-foreground">
                  Integrate gasless payments and x402 in days, not months:
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>Relayer API:</strong> submit EIP-3009/permit authorizations; sponsor gas; get tx receipts.</li>
                  <li><strong>x402 gateway:</strong> standard 402 challenges for pay-per-use content/services.</li>
                  <li><strong>Capsule links:</strong> create short, expiring execute-by-link flows (claim or push).</li>
                  <li><strong>White-label PWA hooks:</strong> keep your UX—use ours under the hood.</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  Contact us if you're a browser, telco, NGO, or fintech looking to pilot.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Roadmap highlights</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li><strong>More local ramps:</strong> improved cash-in/out partners and bank/fiat bridges.</li>
                  <li><strong>Guardians & recovery:</strong> optional social/guardian recovery (no seed phrases).</li>
                  <li><strong>Spending controls:</strong> daily caps and "new-recipient" cool-offs on by default.</li>
                  <li><strong>Accessibility:</strong> low-bandwidth mode, larger text, right-to-left support.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-semibold">Known limitations</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>Requires some connectivity to execute a payment (signing can be done offline, then executed when online).</li>
                  <li>Token support is intentionally strict (security &gt; breadth).</li>
                  <li>Not a bank or money transmitter; self-custodial wallet software only.</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3 border-muted-foreground/20">
            <h3 className="font-semibold">Responsible use & disclaimers</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Use this wallet only where digital assets are legal and appropriate. Values can fluctuate; stablecoins carry issuer and network risk. Always confirm recipient and network details before approving a payment. If a device is lost or compromised, rotate your wallet immediately using your backup.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="font-semibold">Questions or partnerships</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><strong>Help & docs:</strong> See "Help" in the menu for guides and FAQs.</li>
              <li><strong>Partnerships:</strong> Reach out from the Partners link for WaaS, pilots, and integrations.</li>
              <li><strong>Feedback:</strong> We're listening—tap Send feedback to help us improve.</li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
