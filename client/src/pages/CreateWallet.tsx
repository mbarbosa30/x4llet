import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Download, Printer } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { createWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function CreateWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<'intro' | 'recovery'>('intro');
  const [cloudBackup, setCloudBackup] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateWallet = async () => {
    try {
      setIsCreating(true);
      const { wallet, recoveryCode: code } = await createWallet();
      setRecoveryCode(code);
      setStep('recovery');
      console.log('Wallet created:', wallet.address);
    } catch (error) {
      console.error('Failed to create wallet:', error);
      toast({
        title: "Error",
        description: "Failed to create wallet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 600, 200);
      ctx.fillStyle = '#000000';
      ctx.font = '24px monospace';
      ctx.fillText('Recovery Code:', 20, 50);
      ctx.font = 'bold 32px monospace';
      ctx.fillText(recoveryCode, 20, 100);
      ctx.font = '14px sans-serif';
      ctx.fillText('Store this code safely. You will need it to restore your wallet.', 20, 150);
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'recovery-code.png';
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Wallet Recovery Code</title>
            <style>
              body { font-family: monospace; padding: 40px; }
              h1 { font-size: 24px; }
              .code { font-size: 32px; font-weight: bold; margin: 20px 0; }
              .warning { font-size: 14px; color: #666; }
            </style>
          </head>
          <body>
            <h1>Wallet Recovery Code</h1>
            <div class="code">${recoveryCode}</div>
            <p class="warning">Store this code safely. You will need it to restore your wallet.</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleContinue = () => {
    if (cloudBackup) {
      console.log('TODO: Implement cloud backup');
    }
    toast({
      title: "Wallet Created!",
      description: "Your wallet is ready to use.",
    });
    setLocation('/home');
  };

  if (step === 'recovery') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h1 className="text-2xl font-semibold mb-2">Save Your Recovery Code</h1>
            <p className="text-sm text-muted-foreground">
              Write this down and store it safely. You'll need it to restore your wallet.
            </p>
          </div>

          <Card className="p-8">
            <div className="text-center">
              <code className="text-xl font-mono font-medium tracking-wider" data-testid="text-recovery-code">
                {recoveryCode}
              </code>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleSaveImage}
              data-testid="button-save-image"
            >
              <Download className="h-4 w-4 mr-2" />
              Save Image
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handlePrint}
              data-testid="button-print"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <Label htmlFor="cloud-backup" className="text-sm">
              Back up to cloud (encrypted)
            </Label>
            <Switch
              id="cloud-backup"
              checked={cloudBackup}
              onCheckedChange={setCloudBackup}
              data-testid="switch-cloud-backup"
            />
          </div>

          <Button 
            onClick={handleContinue} 
            className="w-full" 
            size="lg"
            data-testid="button-continue"
          >
            I've Saved My Code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Shield className="h-16 w-16 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Create Your Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Get started in seconds with a secure, self-custodial wallet
          </p>
        </div>

        <Card className="p-6">
          <ul className="space-y-4">
            <li className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                1
              </div>
              <div className="text-sm">
                <strong>Your keys stay on your device</strong> — you're in complete control
              </div>
            </li>
            <li className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                2
              </div>
              <div className="text-sm">
                <strong>Write down your recovery code</strong> — it's the only way to restore access
              </div>
            </li>
          </ul>
        </Card>

        <Button 
          onClick={handleCreateWallet}
          disabled={isCreating}
          className="w-full" 
          size="lg"
          data-testid="button-create-wallet"
        >
          {isCreating ? 'Creating...' : 'Create Wallet'}
        </Button>

        <div className="text-center">
          <button 
            onClick={() => setLocation('/restore')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Already have a wallet? Restore
          </button>
        </div>
      </div>
    </div>
  );
}
