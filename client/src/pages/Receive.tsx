import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, Loader2 } from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { getWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';

export default function Receive() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (!wallet) {
          setLocation('/');
          return;
        }
        setAddress(wallet.address);
      } catch (error: any) {
        if (error.message === 'RECOVERY_CODE_REQUIRED') {
          setLocation('/unlock');
        } else {
          setLocation('/');
        }
      } finally {
        setIsLoadingWallet(false);
      }
    };
    loadWallet();
  }, [setLocation]);

  const handleCopy = async () => {
    if (!address) return;
    
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!address) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Wallet Address',
          text: `Send USDC to: ${address}`,
        });
      } catch (err) {
        console.log('Share cancelled or failed:', err);
      }
    } else {
      handleCopy();
    }
  };

  if (isLoadingWallet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return null;
  }

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-6">
        <div className="text-center space-y-6">
          <div className="flex justify-center" data-testid="qr-wallet-address">
            <QRCodeDisplay value={address} size={240} />
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Your wallet address</p>
            <div className="bg-muted p-3">
              <p 
                className="font-mono text-xs break-all select-all"
                data-testid="text-wallet-address"
              >
                {address}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Works on Base, Celo, and Gnosis
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button 
            variant="outline" 
            onClick={handleCopy}
            data-testid="button-copy"
          >
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleShare}
            data-testid="button-share"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </main>
    </div>
  );
}
