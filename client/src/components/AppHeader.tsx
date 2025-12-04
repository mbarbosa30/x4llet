import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { QrCode, Share2, Shield, Settings } from 'lucide-react';
import { getWallet } from '@/lib/wallet';
import { getMaxFlowScore } from '@/lib/maxflow';
import { useToast } from '@/hooks/use-toast';

interface PoolStatus {
  referral?: {
    code: string;
  };
}

export default function AppHeader() {
  const [location, setLocation] = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (wallet) {
          setAddress(wallet.address);
        }
      } catch (error) {
        // Wallet not loaded, ignore
      }
    };
    loadWallet();
  }, []);

  const { data: scoreData } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch pool referral code if user has one
  const { data: poolStatus } = useQuery<PoolStatus>({
    queryKey: ['/api/pool/status', address],
    enabled: !!address,
    staleTime: 60 * 1000,
  });

  const score = scoreData?.localHealth ?? 0;
  const referralCode = poolStatus?.referral?.code;


  const handleShare = async () => {
    if (!address) return;

    const baseUrl = window.location.origin;
    // Include pool referral code if user has one
    const referralLink = referralCode 
      ? `${baseUrl}/pool?ref=${referralCode}`
      : `${baseUrl}/?ref=${address}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join nanoPay',
          text: referralCode 
            ? 'Join the nanoPay prize pool - save and win weekly!'
            : 'Join me on nanoPay - a lightweight crypto wallet',
          url: referralLink,
        });
      } else {
        await navigator.clipboard.writeText(referralLink);
        toast({
          title: "Link copied",
        });
      }
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  return (
    <header 
      className="fixed top-0 left-0 right-0 bg-background border-b"
      style={{ 
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(4rem + env(safe-area-inset-top))',
        position: 'fixed',
        zIndex: 9999
      }}
    >
      <div className="flex items-center justify-between px-4 h-16">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">nanoPay</h1>
        <button
          onClick={() => setLocation('/maxflow')}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
            location === '/maxflow' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
          data-testid="button-maxflow-chip"
          title="Your MaxFlow trust score"
        >
          <Shield className="h-3 w-3" />
          <span className="font-mono">{Math.round(score)}</span>
        </button>
      </div>
      <div className="flex gap-2">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleShare}
          data-testid="button-share"
          title="Share nanoPay"
        >
          <Share2 className="h-5 w-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setLocation('/receive')}
          data-testid="button-qr"
          title="Show QR Code"
        >
          <QrCode className="h-5 w-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => setLocation('/settings')}
          data-testid="button-settings"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
      </div>
    </header>
  );
}
