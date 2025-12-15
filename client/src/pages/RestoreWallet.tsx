import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Key, FileText, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { importFromPrivateKey, restoreFromMnemonic, detectCurrencyFromLocale, savePreferences, getPreferences, validatePrivateKey, validateMnemonic, hasWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { vouchFor } from '@/lib/maxflow';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type RestoreMode = 'phrase' | 'privateKey';

export default function RestoreWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [referrerAddress, setReferrerAddress] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>('phrase');
  
  const [mnemonic, setMnemonic] = useState('');
  const [mnemonicValidation, setMnemonicValidation] = useState<{ valid: boolean; error?: string }>({ valid: false });
  const [privateKey, setPrivateKey] = useState('');
  const [privateKeyValidation, setPrivateKeyValidation] = useState<{ valid: boolean; error?: string; hint?: string }>({ valid: false });
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [existingWalletDetected, setExistingWalletDetected] = useState(false);

  useEffect(() => {
    const checkExistingWallet = async () => {
      const exists = await hasWallet();
      setExistingWalletDetected(exists);
    };
    checkExistingWallet();
  }, []);
  
  const handleMnemonicChange = (value: string) => {
    setMnemonic(value);
    if (value.trim()) {
      setMnemonicValidation(validateMnemonic(value));
    } else {
      setMnemonicValidation({ valid: false });
    }
  };
  
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

  const handleImportClick = async () => {
    const validation = validatePassword(newPassword);
    if (validation) {
      setPasswordError(validation);
      return;
    }

    if (existingWalletDetected) {
      setShowOverwriteConfirm(true);
      return;
    }

    await performImport();
  };

  const performImport = async () => {
    setShowOverwriteConfirm(false);
    
    try {
      setIsImporting(true);
      
      let wallet;
      if (mode === 'phrase') {
        wallet = await restoreFromMnemonic(mnemonic, newPassword);
      } else {
        wallet = await importFromPrivateKey(privateKey, newPassword);
      }
      
      try {
        const detectedCurrency = await detectCurrencyFromLocale();
        const currentPrefs = await getPreferences();
        await savePreferences({ ...currentPrefs, currency: detectedCurrency });
        console.log(`Auto-detected currency: ${detectedCurrency}`);
      } catch (error) {
        console.error('Failed to save currency preference:', error);
      }
      
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
        description: error.message || (mode === 'phrase' ? "Invalid recovery phrase. Please check and try again." : "Invalid private key. Please check and try again."),
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const isValid = mode === 'phrase' ? mnemonicValidation.valid : privateKeyValidation.valid;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl text-section mb-2">Recover Wallet</h1>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Use your backup to recover access
          </p>
        </div>

        <a 
          href="/stellar/restore"
          className="flex items-center justify-center gap-2 p-3 bg-muted/50 border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          data-testid="link-stellar-network"
        >
          <span>Want Stellar network?</span>
          <span className="font-semibold">Switch</span>
        </a>

        <div className="p-4 bg-muted/50 border border-foreground/10">
          <p className="text-xs font-mono uppercase tracking-wide text-foreground">
            <span className="font-bold">Lost your password?</span> Enter the backup you saved when creating your wallet.
          </p>
        </div>

        <div className="flex border divide-x">
          <button
            onClick={() => setMode('phrase')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 text-sm transition-colors ${
              mode === 'phrase' 
                ? 'bg-foreground text-background font-semibold' 
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
            data-testid="button-mode-phrase"
          >
            <FileText className="h-4 w-4" />
            <span>Recovery Phrase</span>
          </button>
          <button
            onClick={() => setMode('privateKey')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 text-sm transition-colors ${
              mode === 'privateKey' 
                ? 'bg-foreground text-background font-semibold' 
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
            data-testid="button-mode-private-key"
          >
            <Key className="h-4 w-4" />
            <span>Private Key</span>
          </button>
        </div>

        <Card className="p-6 space-y-4">
          {mode === 'phrase' ? (
            <div className="space-y-2">
              <Label htmlFor="mnemonic" className="font-label text-muted-foreground">Recovery Phrase</Label>
              <Textarea
                id="mnemonic"
                placeholder="Enter your 12-word recovery phrase separated by spaces"
                value={mnemonic}
                onChange={(e) => handleMnemonicChange(e.target.value)}
                className={`font-mono text-xs min-h-[100px] ${mnemonicValidation.error ? 'border-destructive' : mnemonicValidation.valid ? 'border-green-500' : ''}`}
                data-testid="input-mnemonic"
              />
              {mnemonicValidation.error && (
                <p className="text-xs font-mono uppercase tracking-wide text-destructive">{mnemonicValidation.error}</p>
              )}
              {mnemonicValidation.valid && (
                <p className="text-xs font-mono uppercase tracking-wide text-green-600">Valid recovery phrase</p>
              )}
              {!mnemonic && (
                <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  12 words separated by spaces
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="private-key" className="font-label text-muted-foreground">Private Key</Label>
              <Textarea
                id="private-key"
                placeholder="0x..."
                value={privateKey}
                onChange={(e) => handlePrivateKeyChange(e.target.value)}
                className={`font-mono text-xs min-h-[100px] ${privateKeyValidation.error ? 'border-destructive' : privateKeyValidation.valid ? 'border-green-500' : ''}`}
                data-testid="input-private-key"
              />
              {privateKeyValidation.error && (
                <p className="text-xs font-mono uppercase tracking-wide text-destructive">{privateKeyValidation.error}</p>
              )}
              {privateKeyValidation.hint && !privateKeyValidation.error && (
                <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">{privateKeyValidation.hint}</p>
              )}
              {privateKeyValidation.valid && (
                <p className="text-xs font-mono uppercase tracking-wide text-green-600">Valid private key format</p>
              )}
              {!privateKey && (
                <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  66 characters starting with 0x
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password" className="font-label text-muted-foreground">New Password</Label>
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
              <p className="text-xs font-mono uppercase tracking-wide text-destructive">{passwordError}</p>
            )}
            <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
              6+ characters for this device
            </p>
          </div>

          <Button 
            onClick={handleImportClick}
            disabled={!isValid || !newPassword || !!passwordError || isImporting}
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
            className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
            data-testid="link-back"
          >
            Back to Start
          </button>
        </div>
      </div>

      <Dialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Replace Existing Wallet?
            </DialogTitle>
            <DialogDescription>
              You already have a wallet on this device. Recovering a new wallet will replace it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="text-sm text-destructive/90 bg-destructive/10 p-3 border border-destructive/20">
              <p className="font-medium mb-1">Make sure you have a backup!</p>
              <p className="text-xs">If you don't have the recovery phrase or private key for your current wallet, you will lose access to it forever.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowOverwriteConfirm(false)} data-testid="button-cancel-overwrite">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={performImport}
              disabled={isImporting}
              data-testid="button-confirm-overwrite"
            >
              {isImporting ? 'Recovering...' : 'Replace Wallet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
