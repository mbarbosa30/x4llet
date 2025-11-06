import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { importFromPrivateKey } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function RestoreWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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
          <h1 className="text-2xl font-semibold mb-2">Recover Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Use your private key to recover access and set a new password
          </p>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm text-foreground">
            <strong>Lost your password?</strong> Enter the private key you saved when creating your wallet to regain access.
          </p>
        </div>

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
              Create a new password for this device (8+ chars, uppercase, lowercase, number)
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
