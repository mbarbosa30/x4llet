import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { restoreWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function RestoreWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [recoveryCode, setRecoveryCode] = useState('');
  const [encryptedBackup, setEncryptedBackup] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      const wallet = await restoreWallet(encryptedBackup, recoveryCode);
      
      toast({
        title: "Wallet Restored!",
        description: `Successfully restored wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
      });
      
      setLocation('/home');
    } catch (error) {
      console.error('Failed to restore wallet:', error);
      toast({
        title: "Restore Failed",
        description: "Invalid recovery code or backup data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Restore Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Import your encrypted backup to restore your wallet
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recovery-code">Recovery Code</Label>
            <Input
              id="recovery-code"
              type="text"
              placeholder="XXXX-XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              className="font-mono"
              data-testid="input-recovery-code"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="backup-data">Encrypted Backup</Label>
            <Textarea
              id="backup-data"
              placeholder="Paste your encrypted backup data here..."
              value={encryptedBackup}
              onChange={(e) => setEncryptedBackup(e.target.value)}
              className="font-mono text-xs min-h-[120px]"
              data-testid="textarea-backup-data"
            />
          </div>

          <Button 
            onClick={handleRestore}
            disabled={!recoveryCode || !encryptedBackup || isRestoring}
            className="w-full"
            size="lg"
            data-testid="button-restore"
          >
            {isRestoring ? 'Restoring...' : 'Restore Wallet'}
          </Button>
        </Card>

        <div className="text-center">
          <button 
            onClick={() => setLocation('/')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to Start
          </button>
        </div>
      </div>
    </div>
  );
}
