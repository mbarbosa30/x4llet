import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function HowItWorks() {
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
          <h1 className="ml-2 text-lg text-section">How It Works</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-md mx-auto p-4 space-y-8">
        
        <section className="space-y-4">
          <h2 className="text-xl text-section">x402 Protocol</h2>
          <p className="text-sm text-muted-foreground">
            x402 enables gasless USDC payments that work offline. You sign an authorization on your device; 
            our facilitator submits it on-chain and covers gas fees. No ETH or CELO needed.
          </p>
          <p className="font-label text-muted-foreground">
            Offline Flow
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>Receiver shows a Payment Request QR (works offline)</li>
            <li>Payer scans and signs locally (works offline)</li>
            <li>Payer shows Authorization QR to receiver</li>
            <li>Anyone with the authorization can submit when online</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            This works because EIP-3009 allows anyone possessing the signed authorization to execute it—not just the sender.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">Security & Passkeys</h2>
          <p className="text-sm text-muted-foreground">
            Your private key is encrypted with AES-GCM and stored locally in IndexedDB. The wallet auto-locks after inactivity.
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Passkey unlock:</span> Enable Face ID or fingerprint in Settings to unlock without typing your password. 
            Uses WebAuthn with PRF extension for secure key derivation—your biometric never leaves your device.
          </p>
          <p className="text-sm text-muted-foreground font-medium">
            No password recovery exists. Always keep a backup of your private key.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">Networks</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li><span className="font-medium">Base</span> — Native USDC. Aave V3 savings.</li>
            <li><span className="font-medium">Celo</span> — Native USDC. Aave V3 savings. GoodDollar UBI.</li>
            <li><span className="font-medium">Gnosis</span> — Circle bridged USDC.e. Circles social money.</li>
            <li><span className="font-medium">Arbitrum</span> — Native USDC. Aave V3 savings.</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Your wallet address is the same on all networks. Switch in Settings.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">Savings & Yield</h2>
          <p className="text-sm text-muted-foreground">
            Deposit USDC into Aave V3 to earn interest. You receive aUSDC tokens representing your deposit plus accrued yield.
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>No gas tokens needed—sign an authorization and we handle the rest</li>
            <li>Withdraw anytime, no lock-up periods</li>
            <li>APY is variable based on lending pool demand</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Aave is battle-tested (running since 2020, audited, billions in TVL) but all DeFi carries smart contract risk.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">Yield Allocation</h2>
          <p className="text-sm text-muted-foreground">
            Choose what happens to your yield. Keep 100%, or allocate a percentage to the prize pool.
          </p>
          <p className="text-sm text-muted-foreground">
            Adjustable anytime in the Pool page. Your principal is never touched—only yield gets redirected.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">Prize Pool</h2>
          <p className="text-sm text-muted-foreground">
            A weekly prize-linked savings pool funded by participant yield contributions.
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>Contribute yield → earn tickets</li>
            <li>One winner drawn each week</li>
            <li>Referral bonus: 10% of your referrals' ticket earnings</li>
            <li>Sponsored donations boost the prize but don't add tickets</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Higher yield contribution = more tickets = better odds. But even small contributions get you in the draw.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">MaxFlow Signal</h2>
          <p className="text-sm text-muted-foreground">
            A graph-based trust signal that measures your network health through flow computation. Anti-sybil by design.
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Vouching:</span> When you vouch for someone, you add them to your trust network. 
            But vouching for fake accounts hurts your own score—creating a self-policing system.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">GoodDollar</h2>
          <p className="text-sm text-muted-foreground">
            Daily UBI tokens (G$) on Celo for verified humans. Funded by DeFi interest and donations.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>Verify your face once (privacy-preserving hash, not stored)</li>
            <li>Claim G$ daily in nanoPay</li>
            <li>Re-verify every ~180 days</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl text-section">Circles</h2>
          <p className="text-sm text-muted-foreground">
            Community social money on Gnosis. Every registered human mints CRC at the same rate.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>Register your avatar (one per human)</li>
            <li>Claim 1 CRC per hour, up to 24/day</li>
            <li>Trust friends to let CRC flow between you</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            CRC has ~7% yearly demurrage (decay) to keep it circulating. The trust network determines whose CRC you can accept.
          </p>
        </section>

        </div>
      </main>
    </div>
  );
}
