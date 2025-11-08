import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Shield, RefreshCw, QrCode, ScanLine, Share2 } from 'lucide-react';
import { getWallet, getPreferences } from '@/lib/wallet';
import { getMaxFlowScore } from '@/lib/maxflow';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AppHeaderProps {
  onScanClick: () => void;
}

export default function AppHeader({ onScanClick }: AppHeaderProps) {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (wallet) {
          setAddress(wallet.address);
        }
        // Default to Celo network
        setChainId(42220);
      } catch (error) {
        // Wallet not loaded, ignore
      }
    };
    loadWallet();
  }, []);

  const { data: maxflowScore } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    if (!address || !chainId) return;
    
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/balance', address, chainId] }),
        queryClient.invalidateQueries({ queryKey: ['/api/balance-history', address, chainId] }),
        queryClient.invalidateQueries({ queryKey: ['/api/transactions', address, chainId] }),
        queryClient.invalidateQueries({ queryKey: ['/maxflow/score', address] }),
      ]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleShare = async () => {
    if (!address) return;

    const baseUrl = window.location.origin;
    const referralLink = `${baseUrl}/?ref=${address}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join nanoPay',
          text: 'Join me on nanoPay - a lightweight crypto wallet',
          url: referralLink,
        });
      } else {
        await navigator.clipboard.writeText(referralLink);
        toast({
          title: "Link Copied!",
          description: "Referral link copied to clipboard",
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
        {maxflowScore && (
          <button
            onClick={() => setLocation('/signal')}
            className="flex items-center gap-1.5 hover-elevate active-elevate-2 px-2 py-1 rounded-md border text-xs font-medium"
            data-testid="badge-maxflow-score"
            title="Network Signal"
            aria-label={`Network Signal: ${Math.round(maxflowScore.localHealth)}`}
          >
            <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span aria-hidden="true">{Math.round(maxflowScore.localHealth)}</span>
          </button>
        )}
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
          onClick={handleRefresh}
          disabled={isRefreshing}
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          onClick={onScanClick}
          data-testid="button-scan"
          title="Scan QR Code"
        >
          <ScanLine className="h-5 w-5" />
        </Button>
      </div>
      </div>
    </header>
  );
}
