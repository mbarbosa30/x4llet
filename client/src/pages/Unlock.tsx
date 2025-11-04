import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Shield } from 'lucide-react';
import { getWallet, hasWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function Unlock() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    const checkWallet = async () => {
      const exists = await hasWallet();
      if (!exists) {
        setLocation('/');
      }
    };
    checkWallet();
  }, [setLocation]);

  const handleUnlock = async () => {
    try {
      setIsUnlocking(true);
      const wallet = await getWallet(recoveryCode);
      
      if (wallet) {
        toast({
          title: "Wallet Unlocked!",
          description: "Welcome back",
        });
        setLocation('/home');
      }
    } catch (error: any) {
      toast({
        title: "Failed to Unlock",
        description: error.message === 'INVALID_RECOVERY_CODE' 
          ? "Invalid recovery code. Please try again." 
          : "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-2xl font-semibold mb-2">Unlock Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Enter your recovery code to unlock your wallet
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="recovery-code" className="text-sm font-medium">
              Recovery Code
            </label>
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

          <Button 
            onClick={handleUnlock}
            disabled={!recoveryCode || isUnlocking}
            className="w-full"
            size="lg"
            data-testid="button-unlock"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock'}
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
