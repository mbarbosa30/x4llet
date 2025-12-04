import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Faqs() {
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
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="ml-2 text-lg font-semibold">FAQs</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-md mx-auto p-4">
        <Accordion type="single" collapsible className="w-full">

          {/* Basics */}
          <AccordionItem value="x402">
            <AccordionTrigger data-testid="faq-x402">
              What is x402?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                x402 is the protocol that enables gasless USDC payments that work offline. You sign an authorization on your device; 
                our facilitator submits it on-chain and covers gas. No ETH or CELO needed, no internet required to sign.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="offline">
            <AccordionTrigger data-testid="faq-offline">
              How do offline payments work?
            </AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Receiver shows Payment Request QR (works offline)</li>
                <li>Payer scans and signs locally (works offline)</li>
                <li>Payer shows Authorization QR to receiver</li>
                <li>Anyone with the authorization submits when online</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-2">
                EIP-3009 allows anyone possessing the signed authorization to execute it—that's what enables both offline and gasless payments.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="networks">
            <AccordionTrigger data-testid="faq-networks">
              What networks are supported?
            </AccordionTrigger>
            <AccordionContent>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li><span className="font-medium">Base</span> — Native USDC. Aave V3 savings.</li>
                <li><span className="font-medium">Celo</span> — Native USDC. Aave V3 savings. GoodDollar UBI.</li>
                <li><span className="font-medium">Gnosis</span> — Circle bridged USDC.e. Circles social money.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Same wallet address on all networks. Switch in Settings.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Security */}
          <AccordionItem value="security">
            <AccordionTrigger data-testid="faq-security">
              Is my wallet secure?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Your private key is encrypted with AES-GCM and stored locally in IndexedDB. It never leaves your device. 
                All transactions are signed locally. This is non-custodial—you're responsible for your password and backup.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="passkey">
            <AccordionTrigger data-testid="faq-passkey">
              What are passkeys?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Passkeys let you unlock your wallet with Face ID or fingerprint instead of typing your password. 
                Enable in Settings after unlocking your wallet. Uses WebAuthn—your biometric never leaves your device.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="password">
            <AccordionTrigger data-testid="faq-password">
              What if I forget my password?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                No password recovery exists. Restore your wallet using the private key backup you saved when creating it. 
                That's why backing up is critical.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="backup">
            <AccordionTrigger data-testid="faq-backup">
              How do I back up my wallet?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Go to Settings and export your private key. Store it securely offline. Anyone with your private key can access your funds.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Savings & Yield */}
          <AccordionItem value="earn-mode">
            <AccordionTrigger data-testid="faq-earn-mode">
              How does Earn Mode work?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Deposit USDC into Aave V3 to earn interest. You receive aUSDC tokens representing your deposit plus accrued yield. 
                No gas tokens needed—sign an authorization and we handle the rest. Withdraw anytime.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="earn-safe">
            <AccordionTrigger data-testid="faq-earn-safe">
              Is Aave safe?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Aave is battle-tested (since 2020), audited, and holds billions in TVL. Funds are held by smart contracts, not a company. 
                However, all DeFi carries smart contract risk. Only deposit what you're comfortable with.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="yield-allocation">
            <AccordionTrigger data-testid="faq-yield-allocation">
              What is yield allocation?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Choose what happens to your Aave yield. Keep 100%, or direct a percentage to the weekly prize pool. 
                Adjust anytime in the Pool page. Your principal is never touched—only yield gets redirected.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Prize Pool */}
          <AccordionItem value="pool">
            <AccordionTrigger data-testid="faq-pool">
              What is the Prize Pool?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                A weekly prize-linked savings pool funded entirely by participant yield contributions. 
                Contribute a percentage of your Aave yield to earn tickets. One winner drawn each week takes the pool. 
                Your principal is never at risk—only yield goes in.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pool-tickets">
            <AccordionTrigger data-testid="faq-pool-tickets">
              How do tickets work?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                You earn tickets based on how much yield you contribute. More yield = more tickets = better odds. 
                Even small contributions get you in the draw.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="referrals">
            <AccordionTrigger data-testid="faq-referrals">
              How do referrals work?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Share your referral code (found in the Pool page). When someone uses it and contributes yield, you earn 10% of their ticket earnings as bonus tickets. 
                Their tickets are not reduced—it's extra.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pool-sponsors">
            <AccordionTrigger data-testid="faq-pool-sponsors">
              What are sponsored prizes?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Donations from sponsors boost the prize pool but don't add tickets. This increases the prize without changing anyone's odds—everyone benefits equally.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Trust Infrastructure */}
          <AccordionItem value="maxflow">
            <AccordionTrigger data-testid="faq-maxflow">
              What is MaxFlow?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                A graph-based trust signal that measures your network health through flow computation. Anti-sybil by design. 
                Vouching for fake accounts hurts your own score—creating a self-policing system.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="gooddollar">
            <AccordionTrigger data-testid="faq-gooddollar">
              What is GoodDollar?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Daily UBI tokens (G$) on Celo for verified humans. Verify your face once (privacy-preserving), then claim daily in nanoPay. 
                Re-verify every ~180 days to maintain eligibility.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="circles">
            <AccordionTrigger data-testid="faq-circles">
              What is Circles?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Community social money on Gnosis. Register your avatar, claim 1 CRC per hour (up to 24/day), and trust friends to let CRC flow between you. 
                ~7% yearly demurrage keeps it circulating.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Other */}
          <AccordionItem value="usdc">
            <AccordionTrigger data-testid="faq-usdc">
              What is USDC?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                A stablecoin designed to maintain $1.00 USD value. Issued by Circle, backed by US dollar reserves. 
                nanoPay supports native USDC on Base and Celo, and Circle's bridged USDC.e on Gnosis.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="balance">
            <AccordionTrigger data-testid="faq-balance">
              Why doesn't my balance update immediately?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Balances refresh every 10 seconds. After receiving funds, wait a few seconds for blockchain confirmation. 
                Pull down on the home screen to refresh manually.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
        </div>
      </main>
    </div>
  );
}
