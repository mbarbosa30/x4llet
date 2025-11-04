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
        <h1 className="text-lg font-semibold">FAQs</h1>
        <div className="w-10"></div>
      </header>

      <main className="max-w-md mx-auto p-4 pb-20">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="x402">
            <AccordionTrigger data-testid="faq-x402">
              What is x402?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-2">
                x402 is the protocol that powers this wallet, enabling offline gasless USDC payments. It solves two major problems with traditional crypto:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><span className="font-medium">No internet required:</span> Sign transactions offline and submit them later</li>
                <li><span className="font-medium">No gas tokens needed:</span> Send USDC without holding ETH or CELO</li>
                <li><span className="font-medium">Non-custodial:</span> Your keys stay on your device, you stay in control</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                x402 uses EIP-3009 authorization and a facilitator service to make crypto accessible in low-bandwidth environments and remove the complexity of managing multiple tokens.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="why-x402">
            <AccordionTrigger data-testid="faq-why-x402">
              Why use x402 instead of regular crypto transfers?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-2">
                x402 removes the biggest barriers to crypto adoption:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><span className="font-medium">Works offline:</span> Perfect for areas with poor connectivity or unstable internet</li>
                <li><span className="font-medium">No gas fees to manage:</span> You don't need to buy, hold, or spend native tokens for transactions</li>
                <li><span className="font-medium">Simpler user experience:</span> Just hold USDC and sign messages - no complex token management</li>
                <li><span className="font-medium">Gasless for users:</span> The facilitator covers transaction costs, making payments frictionless</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Regular crypto transfers require you to be online, hold native tokens for gas, and manage multiple assets. x402 makes crypto as simple as cash.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="password">
            <AccordionTrigger data-testid="faq-password">
              What if I forget my password?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                There is no password recovery. Your password is used to encrypt your private key locally - we don't store it anywhere. 
                If you lose your password, you'll need to restore your wallet using the private key backup you saved when creating the wallet.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="backup">
            <AccordionTrigger data-testid="faq-backup">
              How do I back up my wallet?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                When you create a wallet, you must save your private key. Go to Settings and export your private key to create a new backup. 
                Store it securely - anyone with your private key can access your funds.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="networks">
            <AccordionTrigger data-testid="faq-networks">
              What's the difference between Celo and Base?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-2">
                Both are blockchain networks where you can use USDC:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li><span className="font-medium">Celo</span> - Mobile-first blockchain with low fees and fast transactions</li>
                <li><span className="font-medium">Base</span> - Ethereum Layer 2 built by Coinbase with access to DeFi apps</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Your wallet address is the same on both networks. You can switch networks in Settings.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="gas">
            <AccordionTrigger data-testid="faq-gas">
              Do I need to pay gas fees?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                No. The x402 protocol eliminates gas fees for users. When you send USDC, you sign an authorization and the x402 
                facilitator service pays the gas fees on your behalf. You only need USDC - no need to hold CELO or ETH for gas.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="offline">
            <AccordionTrigger data-testid="faq-offline">
              How do offline payments work?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-2">
                The x402 protocol enables offline payments using pre-signed authorizations:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
                <li>Receiver creates a Payment Request (works offline)</li>
                <li>Payer scans it and signs locally (works offline)</li>
                <li>Payer shows Authorization QR to receiver</li>
                <li>Receiver submits it to x402 facilitator when they have internet</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-2">
                The blockchain transaction happens when the receiver submits the authorization online. Both parties can complete 
                their part without requiring internet connectivity - that's the power of x402.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="private-key">
            <AccordionTrigger data-testid="faq-private-key">
              Where is my private key stored?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Your private key is encrypted with your password and stored locally in your browser's IndexedDB. 
                It never leaves your device and is never sent to any server. You have complete control over your funds.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="usdc">
            <AccordionTrigger data-testid="faq-usdc">
              What is USDC?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                USDC is a stablecoin - a cryptocurrency designed to maintain a value of $1.00 USD. It's issued by Circle and backed 
                by US dollars held in reserve. This wallet supports native Circle USDC on both Celo and Base networks.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="balance">
            <AccordionTrigger data-testid="faq-balance">
              Why doesn't my balance update immediately?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Balances are fetched from the blockchain in real-time and refresh every 10 seconds. If you just received funds, 
                wait a few seconds for the blockchain to confirm the transaction. You can also pull down on the home screen to refresh manually.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="security">
            <AccordionTrigger data-testid="faq-security">
              Is this wallet safe to use?
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Your private key is encrypted with strong cryptography (AES-GCM with PBKDF2) and stored only on your device. 
                All transactions are signed locally. However, this is a non-custodial wallet - you are responsible for keeping your 
                password and private key backup safe. Never share your private key with anyone.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>
    </div>
  );
}
