import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, Settings, QrCode } from 'lucide-react';
import BalanceCard from '@/components/BalanceCard';
import TransactionList from '@/components/TransactionList';
import AddressDisplay from '@/components/AddressDisplay';
import { getWallet, getPreferences } from '@/lib/wallet';
import type { BalanceResponse } from '@shared/schema';

export default function Home() {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');

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
    queryKey: ['/api/balance', address],
    enabled: !!address,
    refetchInterval: 10000,
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
            onClick={() => console.log('Scan QR - TODO')}
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
    </div>
  );
}
