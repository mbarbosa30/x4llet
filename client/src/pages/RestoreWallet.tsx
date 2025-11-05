import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { restoreWallet, importFromPrivateKey } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function RestoreWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [password, setPassword] = useState('');
  const [encryptedBackup, setEncryptedBackup] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [privateKey, setPrivateKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const validatePassword = (pwd: string): string => {
    if (pwd.length < 8) return 'Password must be at least 8 characters';
    if (!/[a-z]/.test(pwd)) return 'Must include lowercase letter';
    if (!/[A-Z]/.test(pwd)) return 'Must include uppercase letter';
    if (!/[0-9]/.test(pwd)) return 'Must include number';
    return '';
  };

  const handlePasswordChange = (value: string) => {
    setNewPassword(value);
    if (value.length > 0) {
      setPasswordError(validatePassword(value));
    } else {
      setPasswordError('');
    }
  };

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      const wallet = await restoreWallet(encryptedBackup, password);
      
      toast({
        title: "Wallet Restored!",
        description: `Successfully restored wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
      });
      
      setLocation('/home');
    } catch (error) {
      console.error('Failed to restore wallet:', error);
      toast({
        title: "Restore Failed",
        description: "Invalid password or backup data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleImport = async () => {
    const validation = validatePassword(newPassword);
    if (validation) {
      setPasswordError(validation);
      return;
    }

    try {
      setIsImporting(true);
      const wallet = await importFromPrivateKey(privateKey, newPassword);
      
      toast({
        title: "Wallet Recovered!",
        description: `Successfully recovered wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
      });
      
      setLocation('/home');
    } catch (error: any) {
      console.error('Failed to import wallet:', error);
      toast({
        title: "Recovery Failed",
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
            Restore from encrypted backup or recover using your private key
          </p>
        </div>

        <Tabs defaultValue="backup" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="backup" data-testid="tab-backup">From Backup</TabsTrigger>
            <TabsTrigger value="privatekey" data-testid="tab-privatekey">Recover with Private Key</TabsTrigger>
          </TabsList>

          <TabsContent value="backup" className="space-y-4">
            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The password you used when creating this wallet
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
                disabled={!password || !encryptedBackup || isRestoring}
                className="w-full"
                size="lg"
                data-testid="button-restore"
              >
                {isRestoring ? 'Restoring...' : 'Restore Wallet'}
              </Button>
            </Card>
          </TabsContent>

          <TabsContent value="privatekey" className="space-y-4">
            <div className="mb-4 p-3 bg-muted/50 rounded-lg border">
              <p className="text-sm text-foreground">
                <strong>Lost your password?</strong> Use your private key backup to recover access and set a new password for this device.
              </p>
            </div>

            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="private-key">Private Key Backup</Label>
                <Textarea
                  id="private-key"
                  placeholder="0x..."
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="font-mono text-xs min-h-[100px]"
                  data-testid="input-private-key"
                />
                <p className="text-xs text-muted-foreground">
                  The private key you saved when creating your wallet
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Choose a new password"
                    value={newPassword}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    data-testid="input-new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-new-password"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs text-destructive">{passwordError}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Create a new password to secure this wallet on this device (8+ chars, uppercase, lowercase, number)
                </p>
              </div>

              <Button 
                onClick={handleImport}
                disabled={!privateKey || !newPassword || !!passwordError || isImporting}
                className="w-full"
                size="lg"
                data-testid="button-import"
              >
                {isImporting ? 'Recovering...' : 'Recover Wallet'}
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
