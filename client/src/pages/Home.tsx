import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import TransactionList from '@/components/TransactionList';
import AddressDisplay from '@/components/AddressDisplay';
import { getWallet, getPreferences } from '@/lib/wallet';
import type { BalanceResponse } from '@shared/schema';

export default function Home() {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [chainId, setChainId] = useState(42220); // Default to Celo
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);

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

  const balance = balanceData?.balance || '0.00';
  const fiatValue = exchangeRate 
    ? (parseFloat(balance) * exchangeRate.rate).toFixed(2)
    : balance;

  const transactions = balanceData?.transactions || [];

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
    <div 
      className="min-h-screen bg-background pt-16"
      style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
    >
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
    </div>
  );
}
