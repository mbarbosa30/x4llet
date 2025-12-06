import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { importFromPrivateKey, detectCurrencyFromLocale, savePreferences, getPreferences, validatePrivateKey } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { vouchFor } from '@/lib/maxflow';

export default function RestoreWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [referrerAddress, setReferrerAddress] = useState<string | null>(null);
  
  const [privateKey, setPrivateKey] = useState('');
  const [privateKeyValidation, setPrivateKeyValidation] = useState<{ valid: boolean; error?: string; hint?: string }>({ valid: false });
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const handlePrivateKeyChange = (value: string) => {
    setPrivateKey(value);
    if (value.trim()) {
      setPrivateKeyValidation(validatePrivateKey(value));
    } else {
      setPrivateKeyValidation({ valid: false });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      setReferrerAddress(ref);
    }
  }, []);

  const validatePassword = (pwd: string): string => {
    if (pwd.length < 6) return 'Password must be at least 6 characters';
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
      
      // Auto-detect and save currency preference based on browser locale
      try {
        const detectedCurrency = detectCurrencyFromLocale();
        const currentPrefs = await getPreferences();
        await savePreferences({ ...currentPrefs, currency: detectedCurrency });
        console.log(`Auto-detected currency: ${detectedCurrency}`);
      } catch (error) {
        console.error('Failed to save currency preference:', error);
        // Continue anyway with default USD
      }
      
      // If there's a referrer, create a vouch automatically
      if (referrerAddress) {
        try {
          await vouchFor(referrerAddress);
          toast({
            title: "Wallet Recovered!",
            description: "You're now vouching for the person who referred you.",
          });
        } catch (error) {
          console.error('Failed to vouch for referrer:', error);
          toast({
            title: "Wallet Recovered!",
            description: "Your wallet is restored, but the referral vouch failed. You can vouch manually from the Signal page.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Wallet Recovered!",
          description: `Successfully recovered wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
        });
      }
      
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
          <h1 className="text-2xl font-bold mb-2 font-heading tracking-tight">Recover Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Use your private key to recover access and set a new password
          </p>
        </div>

        <div className="p-4 bg-muted/50 border">
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
              onChange={(e) => handlePrivateKeyChange(e.target.value)}
              className={`font-mono text-xs min-h-[100px] ${privateKeyValidation.error ? 'border-destructive' : privateKeyValidation.valid ? 'border-green-500' : ''}`}
              data-testid="input-private-key"
            />
            {privateKeyValidation.error && (
              <p className="text-xs text-destructive">{privateKeyValidation.error}</p>
            )}
            {privateKeyValidation.hint && !privateKeyValidation.error && (
              <p className="text-xs text-muted-foreground">{privateKeyValidation.hint}</p>
            )}
            {privateKeyValidation.valid && (
              <p className="text-xs text-green-600">Valid private key format</p>
            )}
            {!privateKey && (
              <p className="text-xs text-muted-foreground">
                The private key you saved when creating your wallet (66 characters starting with 0x)
              </p>
            )}
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
            disabled={!privateKeyValidation.valid || !newPassword || !!passwordError || isImporting}
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
