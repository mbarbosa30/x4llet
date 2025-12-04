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

  // Skeleton that matches BalanceCard height (p-8 = 2rem padding, content ~140px)
  const BalanceCardSkeleton = () => (
    <div className="animate-pulse rounded-lg border bg-card p-8 text-center space-y-3">
      <div className="h-3 w-16 bg-muted rounded mx-auto"></div>
      <div className="h-12 w-40 bg-muted rounded mx-auto"></div>
      <div className="h-4 w-24 bg-muted rounded mx-auto"></div>
    </div>
  );

  // Transaction list skeleton - matches 3 transaction items
  const TransactionListSkeleton = () => (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
          <div className="w-10 h-10 bg-muted rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted rounded"></div>
            <div className="h-3 w-16 bg-muted rounded"></div>
          </div>
          <div className="h-4 w-16 bg-muted rounded"></div>
        </div>
      ))}
    </div>
  );

  // Always render the same layout structure - just show skeletons when loading
  if (!address && !isLoadingWallet) {
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
      <main className="max-w-md mx-auto p-4 space-y-4">
        {isLoadingWallet ? (
          <div className="flex items-center gap-2 animate-pulse">
            <div className="h-9 bg-muted rounded-md flex-1"></div>
            <div className="h-9 w-9 bg-muted rounded-md"></div>
          </div>
        ) : (
          <AddressDisplay address={address!} />
        )}
        
        {isLoadingWallet || isLoading ? (
          <BalanceCardSkeleton />
        ) : (
          <BalanceCard 
            balance={balance}
            currency="USDC"
            balanceMicro={balanceMicro}
            exchangeRate={exchangeRate?.rate}
            fiatCurrency={currency}
            address={address!}
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
          {isLoadingWallet ? (
            <TransactionListSkeleton />
          ) : (
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
          )}
        </div>
      </main>

      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="text-center">
            <DialogTitle className="text-2xl font-bold">
              {selectedTransaction?.type === 'send' ? '-' : '+'}{formatAmount(selectedTransaction?.amount || '0')} USDC
            </DialogTitle>
            {exchangeRate && selectedTransaction && (
              <DialogDescription>
                ≈ {(parseFloat(selectedTransaction.amount) / 1e6 * exchangeRate.rate).toFixed(2)} {currency}
              </DialogDescription>
            )}
          </DialogHeader>

          {selectedTransaction && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedTransaction.type === 'send' ? 'To' : 'From'}
                </span>
                <span className="font-mono">
                  {(selectedTransaction.type === 'send' ? selectedTransaction.to : selectedTransaction.from).slice(0, 6)}...{(selectedTransaction.type === 'send' ? selectedTransaction.to : selectedTransaction.from).slice(-4)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">When</span>
                <span>{new Date(selectedTransaction.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>

              {selectedTransaction.txHash && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(getExplorerUrl(selectedTransaction.txHash!, (selectedTransaction as any).chainId), '_blank', 'noopener,noreferrer')}
                  data-testid="button-view-explorer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View details
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
