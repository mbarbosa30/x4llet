import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function HowItWorks() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center justify-between px-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setLocation('/home')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">How It Works</h1>
        <div className="w-10"></div>
      </header>

      <main className="max-w-md mx-auto p-4 pb-20">
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
          <h2 className="text-xl font-semibold">Networks</h2>
          <p className="text-sm text-muted-foreground">
            The wallet supports two networks:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li><span className="font-medium">Celo</span> - Lower gas fees, good for everyday transactions</li>
            <li><span className="font-medium">Base</span> - Ethereum Layer 2, wider DeFi ecosystem</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            You can switch networks in Settings. Your wallet address is the same on both networks.
          </p>
        </section>
      </main>
    </div>
  );
}
