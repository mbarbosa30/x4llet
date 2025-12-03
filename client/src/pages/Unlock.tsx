import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { getWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function Unlock() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Unlock Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Enter your password to unlock your wallet
          </p>
        </div>

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
            data-testid="button-unlock"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock'}
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
