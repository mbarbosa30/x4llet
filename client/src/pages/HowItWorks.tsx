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
          <h1 className="ml-2 text-lg font-semibold">How It Works</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-md mx-auto p-4 space-y-8">
        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">What is x402?</h2>
          <p className="text-sm text-muted-foreground">
            x402 is a protocol that enables offline gasless USDC payments. It's what makes this wallet unique - 
            allowing you to send money without internet connection and without needing to hold any tokens for gas fees.
          </p>
          <p className="text-sm text-muted-foreground">
            Traditional crypto wallets require you to be online and hold native tokens (like ETH or CELO) to pay transaction fees. 
            x402 solves both problems by using pre-signed authorizations and a facilitator service that covers gas costs.
          </p>
          <p className="text-sm text-muted-foreground font-medium">
            This technology makes crypto accessible in low-bandwidth environments and removes the complexity of managing multiple tokens.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">Your Wallet</h2>
          <p className="text-sm text-muted-foreground">
            This is a lightweight cryptocurrency wallet powered by x402 that lets you send and receive USDC on Base and Celo networks. 
            Your private keys are encrypted and stored locally on your device - you have complete control over your funds.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">Offline Payments with x402</h2>
          <p className="text-sm text-muted-foreground">
            The x402 protocol enables offline payments using EIP-3009, a standard that separates transaction signing from execution. 
            This means the payer signs an authorization off-chain, and anyone can submit it on-chain later:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
            <li>Receiver creates a Payment Request QR code (can be offline)</li>
            <li>Payer scans the QR and signs the authorization locally (works offline)</li>
            <li>Payer shows the Authorization QR to receiver</li>
            <li>Receiver (or anyone with the authorization) can submit it when they have internet</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            EIP-3009 is what makes this possible - it allows the payer to create a cryptographically signed authorization that 
            <span className="font-medium"> anyone who possesses it</span> can submit to the blockchain. In practice, the x402 facilitator service 
            handles submission and pays the gas fees. This separation of signing (payer) and execution (anyone with the authorization) enables both 
            offline and gasless payments.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">Gasless Transfers with x402</h2>
          <p className="text-sm text-muted-foreground">
            You don't need to hold native tokens (CELO or ETH) to send USDC. The x402 protocol uses EIP-3009, which separates 
            the signing of an authorization from its execution. You only sign a message - someone else submits the transaction.
          </p>
          <p className="text-sm text-muted-foreground">
            Because EIP-3009 allows <span className="font-medium">anyone who possesses the authorization</span> to execute it, the x402 
            facilitator service can pay the gas fees and submit the transaction on your behalf. You never need to acquire, 
            manage, or spend native tokens - making USDC transfers as simple as signing a message.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">Security</h2>
          <p className="text-sm text-muted-foreground">
            Your private key is encrypted with your password using strong cryptography (AES-GCM with PBKDF2). 
            The encrypted key is stored in your browser's IndexedDB. No one can access your funds without your password.
          </p>
          <p className="text-sm text-muted-foreground font-medium">
            Important: There is no password recovery. If you lose your password, you lose access to your funds. 
            Always back up your private key safely.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">MaxFlow Network Signal</h2>
          <p className="text-sm text-muted-foreground">
            Your wallet includes a MaxFlow signal score that measures your trust network health through flow-driven computation. 
            It's not a reputation score — it's based on how well you're connected through authentic vouches.
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">How vouching works:</span> When someone vouches for you, they add you to their trust network. 
            But here's the key: <span className="font-medium">who you vouch for affects your own score</span>. Vouching indiscriminately 
            dilutes your network quality, creating an anti-sybil mechanism that makes it costly to vouch for fake accounts.
          </p>
          <p className="text-sm text-muted-foreground">
            Your score is calculated based on network flow properties including path redundancy, maximum flow capacity, and average residual flow. 
            The stronger and more authentic your network connections, the higher your signal.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Networks</h2>
          <p className="text-sm text-muted-foreground">
            The wallet supports three networks:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li><span className="font-medium">Celo</span> - Mobile-first blockchain, home to GoodDollar UBI</li>
            <li><span className="font-medium">Base</span> - Ethereum Layer 2, wider DeFi ecosystem</li>
            <li><span className="font-medium">Gnosis</span> - Community-owned chain, home to Circles social money</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            You can switch networks in Settings. Your wallet address is the same on all networks.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">GoodDollar UBI</h2>
          <p className="text-sm text-muted-foreground">
            GoodDollar is a non-profit protocol that distributes free G$ tokens daily to verified humans around the world. 
            It's universal basic income on the blockchain — funded by interest from DeFi and donations.
          </p>
          <p className="text-sm text-muted-foreground font-medium">
            How it works:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
            <li>Verify your face once (privacy-preserving — only a hash is stored)</li>
            <li>Claim your G$ every day right here in nanoPay</li>
            <li>Re-verify every ~180 days to maintain your claim eligibility</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Everyone who verifies gets the same daily distribution — no exceptions. G$ operates on Celo and can be 
            used for payments or supporting others.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Circles Social Money</h2>
          <p className="text-sm text-muted-foreground">
            Circles is community-powered social money on Gnosis Chain. Every registered human can claim the same amount 
            of CRC over time — it's not a cryptocurrency, it's social money designed to support people and local communities.
          </p>
          <p className="text-sm text-muted-foreground font-medium">
            How it works:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
            <li>Register your avatar (one per human)</li>
            <li>Claim 1 CRC per hour, up to 24/day</li>
            <li>Trust friends to expand your network and let CRC flow</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            CRC has a ~7% yearly demurrage (decay) to keep it circulating fairly. The trust network determines whose 
            CRC you can accept — creating a web of mutual support.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Earn Mode</h2>
          <p className="text-sm text-muted-foreground">
            Earn Mode lets you deposit your USDC into Aave V3 to earn interest automatically. Instead of your money sitting idle, 
            it works for you by being supplied to a decentralized lending protocol.
          </p>
          <p className="text-sm text-muted-foreground font-medium">
            How it works:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
            <li>Enable Earn Mode in Settings or go to the Earn page</li>
            <li>Choose how much USDC to deposit</li>
            <li>Sign the authorization (no gas tokens needed - our relayer submits it)</li>
            <li>Your USDC is deposited to Aave, and you receive aUSDC tokens</li>
            <li>See your estimated balance grow based on current APY</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Withdrawing:</span> You can withdraw your USDC back to your wallet anytime. 
            There are no lock-up periods. Just sign the withdrawal authorization and our relayer will process it.
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">About aUSDC:</span> When you deposit, you receive aUSDC tokens that represent your 
            deposit plus accrued interest. The aUSDC balance increases as interest accrues in the Aave protocol. When you withdraw, 
            your aUSDC is converted back to USDC at the current value.
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Note:</span> Deposits and withdrawals depend on our relayer service being available. 
            If a transaction fails, you can retry. Your funds remain safe in your wallet or in Aave.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Aave Protocol</h2>
          <p className="text-sm text-muted-foreground">
            Aave is one of the largest and most trusted decentralized finance (DeFi) protocols. It operates as a 
            non-custodial lending pool where users can supply assets to earn interest, or borrow against their deposits.
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li><span className="font-medium">Battle-tested:</span> Aave has been running since 2020 with billions in total value locked</li>
            <li><span className="font-medium">Audited:</span> The protocol has been audited by multiple security firms</li>
            <li><span className="font-medium">Non-custodial:</span> Your funds are held by smart contracts, not a company</li>
            <li><span className="font-medium">Variable rates:</span> APY changes based on supply and demand in the lending pool</li>
          </ul>
          <p className="text-sm text-muted-foreground font-medium mt-2">
            Important: While Aave is well-established, DeFi protocols carry smart contract risk. Only deposit what you can afford 
            to have exposed to this risk.
          </p>
        </section>
        </div>
      </main>
    </div>
  );
}
