import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, ExternalLink, Copy, Check, Loader2 } from 'lucide-react';
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
import VouchConfirmation from '@/components/VouchConfirmation';
import { getWallet, getPreferences } from '@/lib/wallet';
import { formatAmount } from '@/lib/formatAmount';
import { vouchFor } from '@/lib/maxflow';
import { useToast } from '@/hooks/use-toast';
import type { BalanceResponse, Transaction as SchemaTransaction, UserPreferences } from '@shared/schema';

interface AaveBalanceResponse {
  totalAUsdcBalance: string;
  chains: {
    base: { chainId: number; aUsdcBalance: string; apy: number };
    celo: { chainId: number; aUsdcBalance: string; apy: number };
    gnosis: { chainId: number; aUsdcBalance: string; apy: number };
  };
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [earnMode, setEarnMode] = useState(false);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<SchemaTransaction | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [pendingReferral, setPendingReferral] = useState<string | null>(null);
  const [showVouchConfirmation, setShowVouchConfirmation] = useState(false);

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
        setEarnMode(prefs.earnMode || false);
        
        // Check for pending referral
        const storedReferral = sessionStorage.getItem('pending_referral');
        if (storedReferral && storedReferral.toLowerCase() !== wallet.address.toLowerCase()) {
          setPendingReferral(storedReferral);
          setShowVouchConfirmation(true);
        }
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

  // Fetch aggregated balance from all chains
  const { data: balanceData, isLoading } = useQuery<BalanceResponse & { chains?: any }>({
    queryKey: ['/api/balance', address],
    enabled: !!address,
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
  });

  // Fetch aggregated transactions from all chains
  const { data: allTransactions } = useQuery<(SchemaTransaction & { chainId?: number })[]>({
    queryKey: ['/api/transactions', address],
    enabled: !!address,
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${address}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const { data: exchangeRate } = useQuery<{ currency: string; rate: number }>({
    queryKey: ['/api/exchange-rate', currency],
    enabled: !!currency,
  });

  // Fetch Aave balance when earn mode is enabled
  const { data: aaveBalance } = useQuery<AaveBalanceResponse>({
    queryKey: ['/api/aave/balance', address],
    enabled: !!address && earnMode,
    refetchInterval: 60000, // Refresh every minute for aToken balance updates
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });

  const balance = balanceData?.balance || '0.00';
  const balanceMicro = balanceData?.balanceMicro;
  const chains = balanceData?.chains;
  const fiatValue = exchangeRate 
    ? (parseFloat(balance) * exchangeRate.rate).toFixed(2)
    : balance;

  const transactions = allTransactions || [];
  
  const getExplorerUrl = (txHash: string, txChainId?: number) => {
    // Use transaction's chainId to determine explorer
    const effectiveChainId = txChainId || 42220; // Default to Celo if not specified
    if (effectiveChainId === 42220) {
      return `https://celoscan.io/tx/${txHash}`;
    } else if (effectiveChainId === 100) {
      return `https://gnosisscan.io/tx/${txHash}`;
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

  const handleConfirmVouch = async () => {
    if (!pendingReferral) return;

    try {
      await vouchFor(pendingReferral);
      toast({
        title: "Vouch Submitted",
        description: "You're now vouching for this person in the trust network.",
      });
      // Only clear on success
      sessionStorage.removeItem('pending_referral');
      setPendingReferral(null);
      setShowVouchConfirmation(false);
    } catch (error) {
      console.error('Failed to vouch for referrer:', error);
      toast({
        title: "Vouch Failed",
        description: "Unable to submit vouch. Please try again or dismiss this request.",
        variant: "destructive",
      });
      // Keep dialog open so user can retry immediately
    }
  };

  const handleDismissVouch = () => {
    sessionStorage.removeItem('pending_referral');
    setPendingReferral(null);
    setShowVouchConfirmation(false);
  };

  if (isLoadingWallet) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
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
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
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
            balanceMicro={balanceMicro}
            exchangeRate={exchangeRate?.rate}
            fiatCurrency={currency}
            address={address}
            chains={chains}
            aaveBalance={aaveBalance}
            earnMode={earnMode}
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

        <div className="space-y-3">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Activity</h2>
          <TransactionList 
            transactions={transactions.map(tx => {
              const fiatAmount = exchangeRate 
                ? ((parseFloat(tx.amount) / 1e6) * exchangeRate.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
            <div className="space-y-2 py-2">
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">From</div>
                  <div className="font-mono text-xs break-all bg-muted p-1.5 rounded-md">
                    {selectedTransaction.from}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">To</div>
                  <div className="font-mono text-xs break-all bg-muted p-1.5 rounded-md">
                    {selectedTransaction.to}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Amount</div>
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
                  <div className="text-xs text-muted-foreground mb-0.5">Timestamp</div>
                  <div className="text-sm">
                    {new Date(selectedTransaction.timestamp).toLocaleString()}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Status</div>
                  <div className="text-sm capitalize">{selectedTransaction.status}</div>
                </div>

                {selectedTransaction.txHash && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Transaction Hash</div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-xs break-all bg-muted p-1.5 rounded-md flex-1">
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
                  onClick={() => window.open(getExplorerUrl(selectedTransaction.txHash!, (selectedTransaction as any).chainId), '_blank', 'noopener,noreferrer')}
                  data-testid="button-view-explorer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on {((selectedTransaction as any).chainId || 42220) === 42220 ? 'Celoscan' : ((selectedTransaction as any).chainId === 100 ? 'Gnosisscan' : 'Basescan')}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pendingReferral && (
        <VouchConfirmation
          referrerAddress={pendingReferral}
          onConfirm={handleConfirmVouch}
          onDismiss={handleDismissVouch}
          open={showVouchConfirmation}
        />
      )}
    </div>
  );
}
