import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { restoreWallet, importFromPrivateKey, validateRecoveryCode, formatRecoveryCode } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function RestoreWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [recoveryCode, setRecoveryCode] = useState('');
  const [encryptedBackup, setEncryptedBackup] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  
  const [privateKey, setPrivateKey] = useState('');
  const [newRecoveryCode, setNewRecoveryCode] = useState('');
  const [recoveryCodeError, setRecoveryCodeError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

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

  const handleRecoveryCodeChange = (value: string) => {
    const formatted = formatRecoveryCode(value);
    setNewRecoveryCode(formatted);
    
    if (formatted.length > 0) {
      const validation = validateRecoveryCode(formatted);
      setRecoveryCodeError(validation.valid ? '' : validation.error || '');
    } else {
      setRecoveryCodeError('');
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const wallet = await importFromPrivateKey(privateKey, newRecoveryCode);
      
      toast({
        title: "Wallet Imported!",
        description: `Successfully imported wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
      });
      
      setLocation('/home');
    } catch (error: any) {
      console.error('Failed to import wallet:', error);
      toast({
        title: "Import Failed",
        description: error.message || "Invalid private key. Please check and try again.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Restore Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Import your wallet using encrypted backup or private key
          </p>
        </div>

        <Tabs defaultValue="backup" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="backup" data-testid="tab-backup">From Backup</TabsTrigger>
            <TabsTrigger value="privatekey" data-testid="tab-privatekey">From Private Key</TabsTrigger>
          </TabsList>

          <TabsContent value="backup" className="space-y-4">
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
                <p className="text-xs text-muted-foreground">
                  The recovery code used when creating this backup
                </p>
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
                <p className="text-xs text-muted-foreground">
                  The encrypted backup string from your wallet export
                </p>
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
          </TabsContent>

          <TabsContent value="privatekey" className="space-y-4">
            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="private-key">Private Key</Label>
                <Textarea
                  id="private-key"
                  placeholder="0x..."
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                  data-testid="input-private-key"
                />
                <p className="text-xs text-muted-foreground">
                  Your raw private key (with or without 0x prefix)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-recovery-code">New Recovery Code</Label>
                <Input
                  id="new-recovery-code"
                  type="text"
                  placeholder="XXXX-XXXX-XXXX"
                  value={newRecoveryCode}
                  onChange={(e) => handleRecoveryCodeChange(e.target.value)}
                  className="font-mono"
                  data-testid="input-new-recovery-code"
                />
                {recoveryCodeError && (
                  <p className="text-xs text-destructive">{recoveryCodeError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Must be 12 characters using A-Z and 2-9 (XXXX-XXXX-XXXX format)
                </p>
              </div>

              <Button 
                onClick={handleImport}
                disabled={!privateKey || !newRecoveryCode || !!recoveryCodeError || isImporting}
                className="w-full"
                size="lg"
                data-testid="button-import"
              >
                {isImporting ? 'Importing...' : 'Import Wallet'}
              </Button>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center">
          <button 
            onClick={() => setLocation('/')}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-back"
          >
            Back to Start
          </button>
        </div>
      </div>
    </div>
  );
}
