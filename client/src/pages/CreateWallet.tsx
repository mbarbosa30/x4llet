import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Download, Printer } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function CreateWallet() {
  const [step, setStep] = useState<'intro' | 'recovery'>('intro');
  const [cloudBackup, setCloudBackup] = useState(false);
  const [recoveryCode] = useState('ABCD-EFGH-IJKL'); // TODO: remove mock functionality

  const handleCreateWallet = () => {
    console.log('Creating wallet...');
    setStep('recovery');
  };

  const handleContinue = () => {
    console.log('Wallet created, navigating to home...');
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
            <Button variant="outline" className="w-full" data-testid="button-save-image">
              <Download className="h-4 w-4 mr-2" />
              Save Image
            </Button>
            <Button variant="outline" className="w-full" data-testid="button-print">
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
          className="w-full" 
          size="lg"
          data-testid="button-create-wallet"
        >
          Create Wallet
        </Button>
      </div>
    </div>
  );
}
