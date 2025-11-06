import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, ArrowDownLeft, Settings, QrCode, RefreshCw, Shield } from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import TransactionList from '@/components/TransactionList';
import AddressDisplay from '@/components/AddressDisplay';
import QRScanner from '@/components/QRScanner';
import Footer from '@/components/Footer';
import { getWallet, getPreferences } from '@/lib/wallet';
import { getMaxFlowScore } from '@/lib/maxflow';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import type { BalanceResponse, PaymentRequest } from '@shared/schema';

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [chainId, setChainId] = useState(42220); // Default to Celo
  const [showScanner, setShowScanner] = useState(false);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (!wallet) {
          setLocation('/');
          return;
        }
        setAddress(wallet.address);
        
        const prefs = await getPreferences();
        setCurrency(prefs.currency);
        setChainId(prefs.network === 'celo' ? 42220 : 8453);
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

  const { data: balanceData, isLoading } = useQuery<BalanceResponse>({
    queryKey: ['/api/balance', address, chainId],
    enabled: !!address,
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}?chainId=${chainId}`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
  });

  const { data: exchangeRate } = useQuery<{ currency: string; rate: number }>({
    queryKey: ['/api/exchange-rate', currency],
    enabled: !!currency,
  });

  const { data: maxflowScore } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const balance = balanceData?.balance || '0.00';
  const fiatValue = exchangeRate 
    ? (parseFloat(balance) * exchangeRate.rate).toFixed(2)
    : balance;

  const transactions = balanceData?.transactions || [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['/api/balance', address, chainId] });
      await queryClient.invalidateQueries({ queryKey: ['/api/exchange-rate', currency] });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleScanPaymentRequest = (data: string) => {
    try {
      const paymentRequest: PaymentRequest = JSON.parse(data);
      
      if (!paymentRequest.v || !paymentRequest.to || !paymentRequest.amount) {
        throw new Error('Invalid payment request');
      }
      
      setShowScanner(false);
      
      sessionStorage.setItem('payment_request', JSON.stringify(paymentRequest));
      setLocation('/send');
      
    } catch (error) {
      toast({
        title: "Invalid QR Code",
        description: "This doesn't appear to be a valid payment request",
        variant: "destructive",
      });
    }
  };

  if (isLoadingWallet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading wallet...</p>
        </div>
      </div>
    );
  }

  if (!address) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center justify-between px-4">
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
            onClick={() => setShowScanner(true)}
            data-testid="button-scan"
          >
            <QrCode className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation('/settings')}
            data-testid="button-settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <AddressDisplay address={address} />
        
        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        ) : (
          <BalanceCard 
            balance={balance}
            currency="USDC"
            fiatValue={fiatValue}
            fiatCurrency={currency}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button 
            size="lg" 
            className="w-full"
            onClick={() => setLocation('/send')}
            data-testid="button-send"
          >
            <ArrowUpRight className="h-5 w-5 mr-2" />
            Send
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            className="w-full"
            onClick={() => setLocation('/receive')}
            data-testid="button-receive"
          >
            <ArrowDownLeft className="h-5 w-5 mr-2" />
            Receive
          </Button>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-4">Recent Activity</h2>
          <TransactionList 
            transactions={transactions.map(tx => {
              const fiatAmount = exchangeRate 
                ? (parseFloat(tx.amount) * exchangeRate.rate).toFixed(2)
                : null;
              
              return {
                ...tx,
                address: tx.type === 'send' ? tx.to : tx.from,
                fiatAmount: fiatAmount || undefined,
                fiatCurrency: currency !== 'USD' ? currency : undefined,
              };
            })}
            onTransactionClick={(tx) => console.log('Transaction clicked:', tx)}
          />
        </div>
      </main>

      <Footer />

      {showScanner && (
        <QRScanner
          onScan={handleScanPaymentRequest}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
