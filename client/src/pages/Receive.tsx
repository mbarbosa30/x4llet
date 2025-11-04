import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Share2, Link as LinkIcon } from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import AddressDisplay from '@/components/AddressDisplay';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function Receive() {
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [linkAmount, setLinkAmount] = useState('');
  const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'; // TODO: remove mock functionality

  const handleShare = () => {
    console.log('Share address');
  };

  const handleCreatePaymentLink = () => {
    console.log('Create payment link with amount:', linkAmount);
    setShowPaymentLink(false);
    setLinkAmount('');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center px-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => console.log('Navigate back')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold ml-2">Receive USDC</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <QRCodeDisplay value={address} size={256} />
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Your Address</div>
            <AddressDisplay address={address} truncate={false} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            onClick={handleShare}
            className="w-full"
            data-testid="button-share"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button 
            variant="outline"
            onClick={() => setShowPaymentLink(true)}
            className="w-full"
            data-testid="button-payment-link"
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            Payment Link
          </Button>
        </div>

        {showPaymentLink && (
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Pre-fill Amount (Optional)</Label>
              <Input 
                id="amount"
                type="number"
                placeholder="0.00"
                value={linkAmount}
                onChange={(e) => setLinkAmount(e.target.value)}
                data-testid="input-link-amount"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleCreatePaymentLink}
                className="flex-1"
                data-testid="button-create-link"
              >
                Create Link
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setShowPaymentLink(false);
                  setLinkAmount('');
                }}
                data-testid="button-cancel-link"
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
