import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Fingerprint, Loader2 } from 'lucide-react';
import { getWallet, unlockWithPasskey, canUsePasskey } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function Unlock() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [isCheckingPasskey, setIsCheckingPasskey] = useState(true);

  useEffect(() => {
    const checkPasskey = async () => {
      try {
        const available = await canUsePasskey();
        setPasskeyAvailable(available);
        
        if (available) {
          const wallet = await unlockWithPasskey();
          if (wallet) {
            toast({
              title: "Wallet unlocked",
            });
            setLocation('/home');
            return;
          }
        }
      } catch (error) {
        console.log('[Unlock] Passkey check failed:', error);
      } finally {
        setIsCheckingPasskey(false);
      }
    };
    
    checkPasskey();
  }, [setLocation, toast]);

  const handlePasskeyUnlock = async () => {
    try {
      setIsUnlocking(true);
      const wallet = await unlockWithPasskey();
      if (wallet) {
        toast({
          title: "Wallet unlocked",
        });
        setLocation('/home');
      } else {
        toast({
          title: "Passkey unlock failed",
          description: "Please try again or use your password",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Passkey unlock failed",
        description: "Please try again or use your password",
        variant: "destructive",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter your password.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsUnlocking(true);
      console.log('[Unlock] Attempting unlock with password length:', password.length);
      
      const wallet = await getWallet(password);
      console.log('[Unlock] getWallet result:', wallet ? 'wallet found' : 'null');
      
      if (wallet) {
        toast({
          title: "Wallet unlocked",
        });
        setLocation('/home');
      } else {
        console.log('[Unlock] Wallet is null - no encrypted data found');
        toast({
          title: "No wallet found",
          description: "Please create a new wallet or restore from your private key.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('[Unlock] Error:', error.message);
      toast({
        title: "Failed to Unlock",
        description: error.message === 'INVALID_RECOVERY_CODE' 
          ? "Incorrect password. Please try again." 
          : error.message === 'RECOVERY_CODE_REQUIRED'
            ? "Password is required."
            : "An error occurred: " + error.message,
        variant: "destructive",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && password && !isUnlocking) {
      handleUnlock();
    }
  };

  if (isCheckingPasskey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 mx-auto mb-4 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Checking for passkey...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-bold mb-2 font-heading tracking-tight">Unlock Wallet</h1>
          <p className="text-sm text-muted-foreground">
            {passkeyAvailable 
              ? "Use Face ID, fingerprint, or your password" 
              : "Enter your password to unlock your wallet"}
          </p>
        </div>

        {passkeyAvailable && (
          <Button
            onClick={handlePasskeyUnlock}
            disabled={isUnlocking}
            className="w-full"
            size="lg"
            data-testid="button-passkey-unlock"
          >
            {isUnlocking ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Unlocking...
              </>
            ) : (
              <>
                <Fingerprint className="h-5 w-5 mr-2" />
                Unlock with Passkey
              </>
            )}
          </Button>
        )}

        {passkeyAvailable && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or use password
              </span>
            </div>
          </div>
        )}

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
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
          </div>

          <Button 
            onClick={handleUnlock}
            disabled={!password || isUnlocking}
            className="w-full"
            size="lg"
            variant={passkeyAvailable ? "outline" : "default"}
            data-testid="button-unlock"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock with Password'}
          </Button>
        </Card>

        <div className="text-center space-y-3">
          <button 
            onClick={() => setLocation('/restore')}
            className="text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-forgot-password"
          >
            Forgot your password? <span className="text-foreground font-medium">Recover with private key</span>
          </button>
          
          <div>
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
    </div>
  );
}
