import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield, Eye, EyeOff, Copy, Check, AlertTriangle } from 'lucide-react';
import { createWallet, hasWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import Footer from '@/components/Footer';

export default function CreateWallet() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState<'password' | 'backup'>('password');
  const [privateKey, setPrivateKey] = useState('');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletExists, setWalletExists] = useState(false);

  useEffect(() => {
    const checkWallet = async () => {
      const exists = await hasWallet();
      setWalletExists(exists);
    };
    checkWallet();
  }, []);

  const validatePassword = () => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  const getPasswordStrength = () => {
    if (password.length === 0) return null;
    if (password.length < 8) return 'weak';
    
    let strength = 0;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    if (strength <= 2) return 'weak';
    if (strength <= 3) return 'medium';
    return 'strong';
  };

  const handleCreateWallet = async () => {
    const error = validatePassword();
    if (error) {
      toast({
        title: "Invalid Password",
        description: error,
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreating(true);
      const { wallet, privateKey: pk } = await createWallet(password);
      console.log('Wallet created:', wallet.address);
      
      setPrivateKey(pk);
      setStep('backup');
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

  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Private key copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleContinue = () => {
    if (!backupConfirmed) {
      toast({
        title: "Backup Required",
        description: "Please confirm you've saved your private key",
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Wallet Created!",
      description: "Your wallet is ready to use.",
    });
    setLocation('/home');
  };

  const strength = getPasswordStrength();
  const strengthColors = {
    weak: 'bg-red-500',
    medium: 'bg-yellow-500',
    strong: 'bg-green-500',
  };

  const isPasswordValid = validatePassword() === null;

  if (step === 'backup') {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center p-4 pb-24">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center">
              <Shield className="h-16 w-16 mx-auto mb-4 text-primary" />
              <h1 className="text-2xl font-semibold mb-2">Backup Your Wallet</h1>
              <p className="text-sm text-muted-foreground">
                Save your private key to recover your wallet if needed
              </p>
            </div>

            <Card className="p-6 space-y-4 border-destructive/50">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-destructive">Critical: Save This Key</h3>
                  <p className="text-sm text-muted-foreground">
                    This is your master backup key. If you lose your password, you can use this private key to recover your wallet and set a new password. 
                    Without it, lost passwords cannot be recovered.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Your Private Key</Label>
                <div className="space-y-2">
                  <div className="font-mono text-xs break-all bg-muted p-3 rounded-md border" data-testid="text-private-key">
                    {privateKey}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopyPrivateKey}
                    data-testid="button-copy-private-key"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Private Key
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="pt-2 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium">How to save your private key:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Write it down on paper and store it securely</li>
                  <li>Save it in a password manager</li>
                  <li>Never share it with anyone</li>
                  <li>Keep it separate from your password</li>
                </ul>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="backup-confirmed"
                  checked={backupConfirmed}
                  onCheckedChange={(checked) => setBackupConfirmed(checked === true)}
                  data-testid="checkbox-backup-confirmed"
                />
                <label
                  htmlFor="backup-confirmed"
                  className="text-sm cursor-pointer"
                >
                  I understand this private key is my master backup. Without it, I cannot recover my wallet if I lose my password. I have saved it in a secure location.
                </label>
              </div>
            </Card>

            <Button
              onClick={handleContinue}
              disabled={!backupConfirmed}
              className="w-full"
              size="lg"
              data-testid="button-continue"
            >
              Continue to Wallet
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center p-4 pb-24">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Shield className="h-16 w-16 mx-auto mb-4 text-primary" />
            <h1 className="text-2xl font-semibold mb-2">Create Your Wallet</h1>
            <p className="text-sm text-muted-foreground">
              Choose a strong password to secure your wallet
            </p>
          </div>

          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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
              {strength && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    <div className={`h-1 flex-1 rounded ${strength === 'weak' ? strengthColors.weak : 'bg-muted'}`} />
                    <div className={`h-1 flex-1 rounded ${strength === 'medium' || strength === 'strong' ? strengthColors.medium : 'bg-muted'}`} />
                    <div className={`h-1 flex-1 rounded ${strength === 'strong' ? strengthColors.strong : 'bg-muted'}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Password strength: <span className="capitalize">{strength}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  data-testid="input-confirm-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-confirm-password"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-2 text-xs text-muted-foreground">
              <p className="font-medium">Password requirements:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>At least 8 characters</li>
                <li>One uppercase letter (A-Z)</li>
                <li>One lowercase letter (a-z)</li>
                <li>One number (0-9)</li>
              </ul>
            </div>
          </Card>

          <Card className="p-4 bg-muted/50 border-primary/20">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">How security works:</strong> Your password encrypts your wallet locally on this device. 
              You'll see your private key backup next - that's your master recovery key if you lose your password or switch devices.
            </p>
          </Card>

          <Button 
            onClick={handleCreateWallet}
            disabled={isCreating || !isPasswordValid}
            className="w-full" 
            size="lg"
            data-testid="button-create-wallet"
          >
            {isCreating ? 'Creating...' : 'Create Wallet'}
          </Button>

          {walletExists && (
            <div className="text-center">
              <button 
                onClick={() => setLocation('/unlock')}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="link-unlock"
              >
                Already have a wallet? Unlock
              </button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
