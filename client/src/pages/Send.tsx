import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, QrCode } from 'lucide-react';
import NumericKeypad from '@/components/NumericKeypad';
import { Card } from '@/components/ui/card';

export default function Send() {
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  const handleNumberClick = (num: string) => {
    setAmount(prev => prev + num);
  };

  const handleBackspace = () => {
    setAmount(prev => prev.slice(0, -1));
  };

  const handleDecimal = () => {
    if (!amount.includes('.')) {
      setAmount(prev => prev + '.');
    }
  };

  const handleNext = () => {
    if (recipient && amount) {
      console.log('Proceeding to confirmation');
      setStep('confirm');
    }
  };

  const handleConfirm = () => {
    console.log('Sending transaction:', { recipient, amount });
  };

  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-16 border-b flex items-center px-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setStep('input')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold ml-2">Confirm Transaction</h1>
        </header>

        <main className="max-w-md mx-auto p-4 space-y-6">
          <Card className="p-6 space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">To</div>
              <div className="font-mono text-sm break-all" data-testid="text-confirm-recipient">
                {recipient}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="text-sm text-muted-foreground mb-1">Amount</div>
              <div className="text-3xl font-medium tabular-nums" data-testid="text-confirm-amount">
                {amount} USDC
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Network fee</span>
                <span className="font-medium text-primary">Free (Gasless)</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-medium tabular-nums">{amount} USDC</span>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            <Button 
              onClick={handleConfirm} 
              className="w-full" 
              size="lg"
              data-testid="button-confirm-send"
            >
              Confirm Send
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setStep('input')}
              className="w-full"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        </main>
      </div>
    );
  }

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
        <h1 className="text-lg font-semibold ml-2">Send USDC</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-8">
        <div className="space-y-2">
          <label className="text-sm font-medium">Recipient</label>
          <div className="flex gap-2">
            <Input 
              placeholder="Address or @handle"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="flex-1 font-mono text-sm"
              data-testid="input-recipient"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => console.log('Scan QR code')}
              data-testid="button-scan-qr"
            >
              <QrCode className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="text-center py-8">
          <div className="text-sm text-muted-foreground mb-2">Amount</div>
          <div className="text-4xl font-medium tabular-nums min-h-[3rem]" data-testid="text-amount-display">
            {amount || '0'} <span className="text-2xl text-muted-foreground">USDC</span>
          </div>
        </div>

        <NumericKeypad 
          onNumberClick={handleNumberClick}
          onBackspace={handleBackspace}
          onDecimal={handleDecimal}
          disabled={!recipient}
        />

        <Button 
          onClick={handleNext}
          disabled={!recipient || !amount || amount === '0'}
          className="w-full"
          size="lg"
          data-testid="button-next"
        >
          Next
        </Button>
      </main>
    </div>
  );
}
