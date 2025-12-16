import { useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Faqs() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        requestAnimationFrame(() => {
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

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
              <span className="text-sm font-bold uppercase">FAQs</span>
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
              Common Questions
            </div>
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
              Got Questions?<br />
              <span className="text-[#0055FF]">We've Got Answers.</span>
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Everything you need to know about nanoPay, gasless payments, and trust infrastructure.
            </p>
          </section>

          {/* Basics */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Basics</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="x402" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-x402">
                    What is x402?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      x402 is the protocol that enables gasless USDC payments that work offline. You sign an authorization on your device; 
                      our facilitator submits it on-chain and covers gas. No ETH or CELO needed, no internet required to sign.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="offline" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-offline">
                    How do offline payments work?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
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

                <AccordionItem value="networks" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-networks">
                    What networks are supported?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><span className="font-medium">Base</span> — Native USDC. Aave V3 savings.</li>
                      <li><span className="font-medium">Celo</span> — Native USDC. Aave V3 savings. GoodDollar UBI.</li>
                      <li><span className="font-medium">Gnosis</span> — Circle bridged USDC.e. Circles social money.</li>
                      <li><span className="font-medium">Arbitrum</span> — Native USDC. Aave V3 savings.</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Same wallet address on all networks. Switch in Settings.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* Security */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Security</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="security" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-security">
                    Is my wallet secure?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Your private key is encrypted with AES-GCM and stored locally in IndexedDB. It never leaves your device. 
                      All transactions are signed locally. This is non-custodial—you're responsible for your password and backup.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="passkey" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-passkey">
                    What are passkeys?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Passkeys let you unlock your wallet with Face ID or fingerprint instead of typing your password. 
                      Enable in Settings after unlocking your wallet. Uses WebAuthn—your biometric never leaves your device.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="password" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-password">
                    What if I forget my password?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      No password recovery exists. Restore your wallet using the private key backup you saved when creating it. 
                      That's why backing up is critical.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="backup" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-backup">
                    How do I back up my wallet?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Go to Settings and export your private key. Store it securely offline. Anyone with your private key can access your funds.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* Savings & Yield */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Savings & Yield</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="earn-mode" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-earn-mode">
                    How does Earn Mode work?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Deposit USDC into Aave V3 to earn interest. You receive aUSDC tokens representing your deposit plus accrued yield. 
                      No gas tokens needed—sign an authorization and we handle the rest. Withdraw anytime.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="earn-safe" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-earn-safe">
                    Is Aave safe?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Aave is battle-tested (since 2020), audited, and holds billions in TVL. Funds are held by smart contracts, not a company. 
                      However, all DeFi carries smart contract risk. Only deposit what you're comfortable with.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="yield-allocation" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-yield-allocation">
                    What is yield allocation?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Choose what happens to your Aave yield. Keep 100%, or direct a percentage to the weekly prize pool. 
                      Adjust anytime in the Pool page. Your principal is never touched—only yield gets redirected.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* Prize Pool */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Prize Pool</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="pool" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-pool">
                    What is the Prize Pool?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      A weekly prize-linked savings pool funded entirely by participant yield contributions. 
                      Contribute a percentage of your Aave yield to earn tickets. One winner drawn each week takes the pool. 
                      Your principal is never at risk—only yield goes in.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="pool-tickets" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-pool-tickets">
                    How do tickets work?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      You earn tickets based on how much yield you contribute. More yield = more tickets = better odds. 
                      Even small contributions get you in the draw.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="referrals" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-referrals">
                    How do referrals work?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Share your referral code (found in the Pool page). When someone uses it and contributes yield, you earn 10% of their ticket earnings as bonus tickets. 
                      Their tickets are not reduced—it's extra.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="pool-sponsors" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-pool-sponsors">
                    What are sponsored prizes?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Donations from sponsors boost the prize pool but don't add tickets. This increases the prize without changing anyone's odds—everyone benefits equally.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* MaxFlow */}
          <section id="maxflow" className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">MaxFlow</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="maxflow-what" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-what">
                    What is MaxFlow?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      MaxFlow is neutral reputation infrastructure that measures your network health through graph algorithms. 
                      Instead of verifying identity through documents or biometrics, it analyzes the structure and quality of your social connections. 
                      Your signal score (0-100) reflects how well-integrated you are in a trusted network—useful for creditworthiness, access control, and governance weight.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-signal" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-signal">
                    What does my signal score mean?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Your signal score represents the strength of your connection to the trust network's anchor points. Higher scores indicate:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Multiple independent paths through trusted endorsers</li>
                      <li>Stronger redundancy in your trust connections</li>
                      <li>Higher daily XP earning potential</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Scores range from 0 to 100. A score of 0 means you haven't been vouched into the network yet.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-algorithm" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-algorithm">
                    How does the algorithm work?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Your score depends on who vouches for you, and their trustworthiness depends on who vouches for them—recursive trust weighting.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><span className="font-medium">60% Flow Component:</span> Sum of your vouchers' scores, weighted by their quality. High-score vouchers matter more.</li>
                      <li><span className="font-medium">40% Structure Component:</span> Min-cut redundancy (how many connections must be removed to isolate you) plus path diversity bonuses.</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      The algorithm iterates across the entire network until scores converge—typically 4-6 rounds.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-vouch" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-vouch">
                    How do I get vouched?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      To build your signal, you need others in the network to vouch for you:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Share your wallet address with someone who has a MaxFlow signal</li>
                      <li>They can vouch for you from their Signal page</li>
                      <li>Once vouched, your signal will be calculated within a few hours</li>
                    </ol>
                    <p className="text-sm text-muted-foreground mt-2">
                      The more people who vouch for you (especially those with high signals), the stronger your own signal becomes.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-give-vouch" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-give-vouch">
                    How do I vouch for others?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      If you have a MaxFlow signal, you can vouch for others:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Go to the Signal page in your wallet</li>
                      <li>Click "Vouch for Address"</li>
                      <li>Enter or scan the person's wallet address</li>
                      <li>Sign the vouch transaction (gasless)</li>
                    </ol>
                    <p className="text-sm text-amber-600 dark:text-amber-500 mt-2">
                      Only vouch for people you genuinely trust—your endorsements affect your own reputation.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-improve" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-improve">
                    How do I improve my score?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><span className="font-medium">Get vouches from high-score users:</span> Quality over quantity. One vouch from a 80+ user is worth more than five from 20-score accounts.</li>
                      <li><span className="font-medium">Build genuine connections:</span> Participate in trusted communities. Real relationships create organic vouching.</li>
                      <li><span className="font-medium">Create path redundancy:</span> Vouches from different parts of the network increase your min-cut and structural score.</li>
                      <li><span className="font-medium">Don't over-vouch:</span> Endorsing more than 10 people starts reducing your own score through dilution penalties.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-sybil" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-sybil">
                    Why can't fake accounts game the system?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      Sybil attacks fail because of recursive trust:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Fake accounts vouching for each other all have low scores because none have high-quality endorsers</li>
                      <li>You can't bootstrap from nothing—the cluster stays near zero</li>
                      <li>Getting one real person to vouch helps, but dilution penalties limit "vouch merchants"</li>
                      <li>Min-cut requirements ensure multiple independent paths, not just one bridge</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Attack patterns consistently score below 60, while genuine users with organic networks score 70+.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="maxflow-dilution" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-maxflow-dilution">
                    Why does vouching cost me score?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      The dilution penalty creates accountability:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>1-10 vouches: No penalty</li>
                      <li>11-15 vouches: Gentle decay (down to 85%)</li>
                      <li>16-25 vouches: Steeper decay (down to 55%)</li>
                      <li>25+ vouches: Asymptotic floor at 40%</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      This prevents "vouch merchants" from selling endorsements. Each vouch you give dilutes your capacity, so you're incentivized to vouch only for people you genuinely trust.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* Experience Points */}
          <section id="experience-points" className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Experience Points</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="xp-what" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-xp-what">
                    What are Experience Points (XP)?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      XP are rewards for participating in the trust network. They represent your ongoing engagement with MaxFlow—building connections, 
                      maintaining your network health, and being an active member of the community. Unlike tokens that can be bought, XP can only be earned through genuine network participation.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="xp-earn" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-xp-earn">
                    How do I earn XP?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      There are two ways to earn XP:
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      <span className="font-medium">1. Daily MaxFlow Claims:</span> Claim XP once per day from the Signal page. Uses a blended formula that rewards high trust while still giving newcomers meaningful rewards:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mb-3">
                      <li><span className="font-medium">Formula:</span> (Signal²/100 + √Signal) ÷ 2</li>
                      <li><span className="font-medium">Signal 100:</span> 55 XP per day</li>
                      <li><span className="font-medium">Signal 50:</span> 16 XP per day</li>
                      <li><span className="font-medium">Signal 10:</span> 2.08 XP per day</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mb-2">
                      <span className="font-medium">2. GoodDollar to XP:</span> Verified GoodDollar users can exchange G$ tokens for XP in the Trust Hub at a rate of 10 G$ = 1 XP. This lets you convert your daily UBI claims into XP toward USDC redemption.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Both methods let you accumulate XP toward the 100 XP threshold for USDC redemption.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="xp-store" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-xp-store">
                    What is the XP Store?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      The XP Store lets you spend accumulated XP in several ways:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><span className="font-medium">100 XP → 1 USDC:</span> Deposited directly to your Aave savings on Celo</li>
                      <li><span className="font-medium">1 XP per AI message:</span> Use the built-in AI assistant for crypto questions</li>
                      <li><span className="font-medium">1 XP → 1 SENADOR:</span> Experimental token exchange (high-risk)</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      This creates tangible rewards for network participation while offering multiple ways to use your earned XP.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="xp-ai-chat" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-xp-ai-chat">
                    What is AI Chat?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      AI Chat is a built-in assistant that helps you understand crypto, DeFi, and how to use nanoPay features. Each message costs 1 XP.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Ask questions about blockchain, staking, or gasless payments</li>
                      <li>Get help understanding Aave, GoodDollar, or Circles</li>
                      <li>Learn about trust networks and how to build your signal</li>
                      <li>Conversations are private and stored locally</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Access AI Chat from the Settings page when you have XP available.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="xp-future" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-xp-future">
                    What's the future potential of XP?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      XP represents your cumulative trust network history. Potential future uses:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><span className="font-medium">Credit scoring:</span> Long XP history could unlock higher borrowing limits or better rates</li>
                      <li><span className="font-medium">Access tiers:</span> Premium features or early access based on XP thresholds</li>
                      <li><span className="font-medium">Governance weight:</span> XP could inform voting power in community decisions</li>
                      <li><span className="font-medium">Reputation portability:</span> Prove your engagement history to other platforms</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      Your XP accumulates over time—early and consistent participation builds lasting value.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* SENADOR Token */}
          <section id="senador-token" className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">SENADOR Token</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="senador-what" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-senador-what">
                    What is SENADOR DUPONT?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      SENADOR DUPONT is an experimental token on the Celo network that can be obtained by exchanging XP at a 1:1 ratio. 
                      It is a community-driven experiment and should be treated as a high-risk crypto asset.
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-500 font-medium">
                      This is NOT investment advice. SENADOR has no guaranteed value and its price can fluctuate significantly.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="senador-risks" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-senador-risks">
                    What are the risks?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mb-3">
                      <li><span className="font-medium">Highly volatile:</span> Price can drop to zero or increase unpredictably</li>
                      <li><span className="font-medium">Experimental:</span> This is an experimental project with no guarantees</li>
                      <li><span className="font-medium">No refunds:</span> XP exchanged for SENADOR cannot be recovered</li>
                      <li><span className="font-medium">Limited liquidity:</span> You may not be able to sell at your desired price</li>
                      <li><span className="font-medium">Regulatory uncertainty:</span> Crypto assets face evolving regulations</li>
                    </ul>
                    <p className="text-sm text-red-600 dark:text-red-500 font-medium">
                      Only exchange XP you can afford to lose entirely. This is a high-risk crypto asset.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="senador-exchange" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-senador-exchange">
                    How do I exchange XP for SENADOR?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Go to the Signal page (Trust Hub)</li>
                      <li>Scroll down to the SENADOR section</li>
                      <li>Enter the amount of XP you want to exchange</li>
                      <li>Confirm the exchange in the dialog</li>
                      <li>SENADOR tokens will be sent to your wallet on Celo</li>
                    </ol>
                    <p className="text-sm text-muted-foreground mt-2">
                      Exchange rate: 1 XP = 1 SENADOR. This exchange is irreversible.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="senador-disclaimer" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-senador-disclaimer">
                    Important Disclaimer
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm space-y-2">
                      <p className="text-amber-800 dark:text-amber-200 font-medium">
                        SENADOR DUPONT is provided "as is" without any warranties.
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 text-xs">
                        By exchanging XP for SENADOR, you acknowledge that: (1) this is an experimental crypto asset, 
                        (2) you may lose your entire investment, (3) past performance does not indicate future results, 
                        (4) you are solely responsible for your own investment decisions, and (5) this does not constitute 
                        financial, investment, or legal advice.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* Other Trust Systems */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Other Trust Systems</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="gooddollar" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-gooddollar">
                    What is GoodDollar?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Daily UBI tokens (G$) on Celo for verified humans. Verify your face once (privacy-preserving), then claim daily in nanoPay. 
                      Re-verify every ~180 days to maintain eligibility.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="circles" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-circles">
                    What is Circles?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Community social money on Gnosis. Register your avatar, claim 1 CRC per hour (up to 24/day), and trust friends to let CRC flow between you. 
                      ~7% yearly demurrage keeps it circulating.
                    </p>
                    <a 
                      href="https://circles.garden" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                    >
                      Visit circles.garden
                    </a>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* Other */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-px bg-foreground flex-1" />
              <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Other</h2>
              <div className="w-8 h-px bg-foreground flex-1" />
            </div>
            <div className="border-2 border-foreground shadow-[4px_4px_0px_0px_rgb(0,0,0)] bg-white">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="usdc" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-usdc">
                    What is USDC?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      A stablecoin designed to maintain $1.00 USD value. Issued by Circle, backed by US dollar reserves. 
                      nanoPay supports native USDC on Base, Celo, and Arbitrum, and Circle's bridged USDC.e on Gnosis.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="balance" className="border-b border-foreground/20 last:border-0">
                  <AccordionTrigger className="font-mono text-sm uppercase tracking-wide text-left px-5" data-testid="faq-balance">
                    Why doesn't my balance update immediately?
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Balances refresh every 10 seconds. After receiving funds, wait a few seconds for blockchain confirmation. 
                      Pull down on the home screen to refresh manually.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center py-8 space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Still Have Questions?
            </h2>
            <div className="flex justify-center gap-4">
              <Button size="lg" onClick={() => setLocation('/create')} data-testid="button-create-wallet">
                Create Wallet <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation('/how-it-works')} data-testid="button-view-how-it-works">
                How It Works
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
