import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, ExternalLink, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import BalanceCard from '@/components/BalanceCard';
import TransactionList from '@/components/TransactionList';
import AddressDisplay from '@/components/AddressDisplay';
import { getWallet, getPreferences } from '@/lib/wallet';
import { formatAmount } from '@/lib/formatAmount';
import type { BalanceResponse, Transaction as SchemaTransaction } from '@shared/schema';

export default function Home() {
  const [, setLocation] = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [chainId, setChainId] = useState(42220); // Default to Celo
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<SchemaTransaction | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

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
  
  const getExplorerUrl = (txHash: string) => {
    const network = chainId === 42220 ? 'celo' : 'base';
    if (network === 'celo') {
      return `https://celoscan.io/tx/${txHash}`;
    } else {
      return `https://basescan.org/tx/${txHash}`;
    }
  };
  
  const handleCopyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    } catch (error) {
      console.error('Failed to copy hash:', error);
    }
  };
  
  const handleTransactionClick = (txData: any) => {
    const fullTransaction = transactions.find(tx => tx.id === txData.id);
    if (fullTransaction) {
      setSelectedTransaction(fullTransaction);
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
            onTransactionClick={handleTransactionClick}
          />
        </div>
      </main>

      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              {selectedTransaction?.type === 'send' ? 'Sent' : 'Received'} {formatAmount(selectedTransaction?.amount || '0')} USDC
            </DialogDescription>
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">From</div>
                  <div className="font-mono text-sm break-all bg-muted p-2 rounded-md">
                    {selectedTransaction.from}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">To</div>
                  <div className="font-mono text-sm break-all bg-muted p-2 rounded-md">
                    {selectedTransaction.to}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Amount</div>
                  <div className="text-sm font-medium">
                    {formatAmount(selectedTransaction.amount)} USDC
                    {exchangeRate && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ≈ {(parseFloat(selectedTransaction.amount) * exchangeRate.rate).toFixed(2)} {currency}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Timestamp</div>
                  <div className="text-sm">
                    {new Date(selectedTransaction.timestamp).toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <div className="text-sm capitalize">{selectedTransaction.status}</div>
                </div>

                {selectedTransaction.txHash && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Transaction Hash</div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-xs break-all bg-muted p-2 rounded-md flex-1">
                        {selectedTransaction.txHash}
                      </div>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleCopyHash(selectedTransaction.txHash!)}
                        data-testid="button-copy-tx-hash"
                      >
                        {copiedHash ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {selectedTransaction.txHash && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(getExplorerUrl(selectedTransaction.txHash!), '_blank', 'noopener,noreferrer')}
                  data-testid="button-view-explorer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on {chainId === 42220 ? 'Celoscan' : 'Basescan'}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
