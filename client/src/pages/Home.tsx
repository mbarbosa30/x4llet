import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, Settings, QrCode } from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import TransactionList from '@/components/TransactionList';
import AddressDisplay from '@/components/AddressDisplay';
import QRScanner from '@/components/QRScanner';
import { getWallet, getPreferences } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import type { BalanceResponse, PaymentRequest } from '@shared/schema';

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [chainId, setChainId] = useState(42220); // Default to Celo
  const [showScanner, setShowScanner] = useState(false);

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
      }
    };
    loadWallet();
  }, [setLocation]);

  const { data: balanceData, isLoading } = useQuery<BalanceResponse>({
    queryKey: ['/api/balance', address, chainId],
    enabled: !!address,
    refetchInterval: 10000,
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

  const balance = balanceData?.balance || '0.00';
  const fiatValue = exchangeRate 
    ? (parseFloat(balance) * exchangeRate.rate).toFixed(2)
    : balance;

  const transactions = balanceData?.transactions || [];

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

  if (!address) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 border-b flex items-center justify-between px-4">
        <h1 className="text-lg font-semibold">Wallet</h1>
        <div className="flex gap-2">
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
            transactions={transactions.map(tx => ({
              ...tx,
              address: tx.type === 'send' ? tx.to : tx.from,
            }))}
            onTransactionClick={(tx) => console.log('Transaction clicked:', tx)}
          />
        </div>
      </main>

      {showScanner && (
        <QRScanner
          onScan={handleScanPaymentRequest}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
