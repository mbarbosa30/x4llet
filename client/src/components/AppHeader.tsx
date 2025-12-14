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

  const { data: scoreData, isLoading: isScoreLoading } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours - score rarely changes
  });

  // Fetch pool referral code if user has one
  const { data: poolStatus } = useQuery<PoolStatus>({
    queryKey: ['/api/pool/status', address],
    enabled: !!address,
    staleTime: 60 * 1000,
  });

  const score = scoreData?.local_health ?? 0;
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
          title: "Referral link copied",
          description: "Share this link to invite friends to nanoPay",
        });
      }
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  return (
    <header 
      className="fixed top-0 left-0 right-0 bg-background border-b border-foreground"
      style={{ 
        paddingTop: 'env(safe-area-inset-top)',
        height: 'calc(4rem + env(safe-area-inset-top))',
        position: 'fixed',
        zIndex: 9999
      }}
    >
      <div className="flex items-center justify-between px-4 h-16">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#0055FF]" aria-hidden="true" />
          <h1 className="text-base font-extrabold uppercase tracking-tight">nanoPay</h1>
        </div>
        <button
          onClick={() => setLocation('/maxflow')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
            location === '/maxflow' 
              ? 'bg-[#0055FF] text-white' 
              : 'bg-foreground/[0.02] text-foreground hover:bg-foreground/5'
          }`}
          data-testid="button-maxflow-chip"
          title="Your MaxFlow trust score"
        >
          <Shield className="h-3 w-3" />
          <span className="font-mono">
            {isScoreLoading ? (
              <span className="inline-block w-4 h-3 bg-foreground/20 animate-pulse" />
            ) : (
              Math.round(score)
            )}
          </span>
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
