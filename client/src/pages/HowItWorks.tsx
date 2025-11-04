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
          <h2 className="text-xl font-semibold">Your Wallet</h2>
          <p className="text-sm text-muted-foreground">
            This is a lightweight cryptocurrency wallet that lets you send and receive USDC on Base and Celo networks. 
            Your private keys are encrypted and stored locally on your device - you have complete control over your funds.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">Offline Payments</h2>
          <p className="text-sm text-muted-foreground">
            The wallet supports offline payments using EIP-3009 authorization. This means you can send money without an internet connection:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground ml-2">
            <li>Receiver creates a Payment Request QR code (can be offline)</li>
            <li>Payer scans the QR and signs the authorization locally (works offline)</li>
            <li>Payer shows the Authorization QR to receiver</li>
            <li>Receiver scans and submits it when they have internet</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            The actual blockchain transaction happens when the receiver submits the authorization. Gas fees are paid by our facilitator service.
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold">Gasless Transfers</h2>
          <p className="text-sm text-muted-foreground">
            You don't need to hold native tokens (CELO or ETH) to send USDC. When you sign a transfer authorization, 
            our facilitator service pays the gas fees and submits the transaction on your behalf. This makes sending 
            USDC as simple as signing a message.
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
