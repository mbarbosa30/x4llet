import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Shield, RefreshCw, QrCode, ScanLine } from 'lucide-react';
import { getWallet } from '@/lib/wallet';
import { getMaxFlowScore } from '@/lib/maxflow';
import { queryClient } from '@/lib/queryClient';

interface AppHeaderProps {
  onScanClick: () => void;
}

export default function AppHeader({ onScanClick }: AppHeaderProps) {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const { data: maxflowScore } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-background border-b flex items-center justify-between px-4 z-50">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">offPay</h1>
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
    </header>
  );
}
