import { useState, useEffect } from 'react';
import { Share2, Copy, Check, Loader2 } from 'lucide-react';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/hooks/use-toast';

export default function Receive() {
  const { toast } = useToast();
  const { address, isLoading: isLoadingWallet } = useWallet();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

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
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading Wallet</p>
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
        <div className="space-y-6">
          <div className="border border-foreground/10 p-6 bg-background" data-testid="qr-wallet-address">
            <div className="flex justify-center">
              <QRCodeDisplay value={address} size={240} />
            </div>
          </div>

          <div className="border border-foreground/10 p-4 bg-muted">
            <p 
              className="font-mono text-xs break-all select-all text-center"
              data-testid="text-wallet-address"
            >
              {address}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={handleCopy}
            className="h-12 border border-foreground/10 bg-background hover:bg-muted active:bg-muted/80 font-mono text-sm uppercase tracking-widest flex items-center justify-center gap-2"
            data-testid="button-copy"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <button 
            onClick={handleShare}
            className="h-12 border border-foreground/10 bg-[#0055FF] text-white hover:bg-[#0044CC] active:bg-[#0033AA] font-mono text-sm uppercase tracking-widest flex items-center justify-center gap-2"
            data-testid="button-share"
          >
            <Share2 className="h-4 w-4" />
            SHARE
          </button>
        </div>
      </main>
    </div>
  );
}
