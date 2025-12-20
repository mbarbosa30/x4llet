import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, ExternalLink, Copy, Check, Loader2, Shield, Users, Clock, Share2, Waypoints, CheckCircle2, Circle, ChevronRight, HelpCircle, Camera } from 'lucide-react';
import { SiTelegram } from 'react-icons/si';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import QRCodeDisplay from '@/components/QRCodeDisplay';
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
import { TrustStatusCard } from '@/components/TrustStatusCard';
import { useWallet } from '@/hooks/useWallet';
import { useDashboard } from '@/hooks/useDashboard';
import { useAaveBalance } from '@/hooks/useAaveBalance';
import { formatAmount } from '@/lib/formatAmount';
import { vouchFor } from '@/lib/maxflow';
import { getIdentityStatus, getClaimStatus, type IdentityStatus, type ClaimStatus } from '@/lib/gooddollar';
import { useToast } from '@/hooks/use-toast';
import type { Transaction as SchemaTransaction } from '@shared/schema';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { formatTimeRemaining } from '@/lib/formatTime';
import { useTick } from '@/hooks/useCountdown';
import { getFingerprint } from '@/lib/fingerprint';

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { address, currency, earnMode, isLoading: isLoadingWallet } = useWallet({ loadPreferences: true });
  const [selectedTransaction, setSelectedTransaction] = useState<SchemaTransaction | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [pendingReferral, setPendingReferral] = useState<string | null>(null);
  const [showVouchConfirmation, setShowVouchConfirmation] = useState(false);
  
  // Force re-render every second for countdown displays
  useTick();

  useEffect(() => {
    if (!isLoadingWallet && address) {
      const storedReferral = sessionStorage.getItem('pending_referral');
      if (storedReferral && storedReferral.toLowerCase() !== address.toLowerCase()) {
        setPendingReferral(storedReferral);
        setShowVouchConfirmation(true);
      }
    }
  }, [isLoadingWallet, address]);

  // Submit browser fingerprint for sybil detection (once per session)
  useEffect(() => {
    if (!address) return;
    const fingerprintKey = `fingerprint_sent_${address.toLowerCase()}`;
    if (sessionStorage.getItem(fingerprintKey)) return;
    
    (async () => {
      try {
        const fingerprint = await getFingerprint();
        await fetch('/api/sybil/fingerprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address, fingerprint }),
        });
        sessionStorage.setItem(fingerprintKey, 'true');
      } catch (error) {
        // Silent fail - fingerprint submission should not break main functionality
      }
    })();
  }, [address]);

  // Fetch dashboard data (balance, transactions, XP) in a single request
  const { data: dashboardData, isLoading, isFetching: isRefreshingBalance, refetch: refetchDashboard } = useDashboard(address);

  const handleRefreshBalance = async () => {
    await refetchDashboard();
  };

  // Extract data from dashboard response (includes MaxFlow from cache)
  const balanceData = dashboardData?.balance;
  const allTransactions = dashboardData?.transactions;
  const xpData = dashboardData?.xp;
  const maxflowScore = dashboardData?.maxflow;

  const { data: exchangeRate } = useExchangeRate(currency, { skipUsd: false });

  // Fetch Aave balance once - used for both earn mode display and onboarding check
  // Single query reduces API calls and page load time
  const { data: aaveBalance, isLoading: isLoadingAaveBalance } = useAaveBalance(address, true);

  // Fetch GoodDollar identity status
  const { data: gdIdentity } = useQuery<IdentityStatus>({
    queryKey: ['/gooddollar/identity', address],
    queryFn: () => getIdentityStatus(address! as `0x${string}`),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch GoodDollar claim status (only if verified)
  const { data: gdClaimStatus } = useQuery<ClaimStatus>({
    queryKey: ['/gooddollar/claim', address],
    queryFn: () => getClaimStatus(address! as `0x${string}`),
    enabled: !!address && gdIdentity?.isWhitelisted,
    staleTime: 60 * 1000,
  });

  // Fetch face verification status to hide option if already completed
  const { data: faceVerificationStatus, isLoading: isLoadingFaceVerification } = useQuery<{ verified: boolean; verifiedAt?: string }>({
    queryKey: ['/api/face-verification', address],
    queryFn: async () => {
      const res = await fetch(`/api/face-verification/${address}`);
      if (!res.ok) return { verified: false };
      return res.json();
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  // User is GoodDollar verified if they're whitelisted OR connected to a whitelisted root
  const isGdVerified = gdIdentity?.isWhitelisted || 
    (gdIdentity?.whitelistedRoot && gdIdentity.whitelistedRoot !== '0x0000000000000000000000000000000000000000');

  // Face Check is encouraged but NOT mandatory - users can skip and use wallet
  // We show a prompt on the Home page instead of forcing a redirect

  // Derive MaxFlow tile CTA
  const mfScore = maxflowScore?.local_health ?? 0;
  const getMaxflowCta = (): string => {
    if (mfScore === 0 || !xpData) return 'Vouch';
    if (xpData.nextClaimTime) {
      const nextTime = new Date(xpData.nextClaimTime);
      const now = new Date();
      const diff = nextTime.getTime() - now.getTime();
      if (diff > 0) return formatTimeRemaining(diff);
    }
    if (xpData.canClaim) return 'Claim XP';
    return 'Vouch';
  };

  // Derive GoodDollar tile CTA
  const getGoodDollarCta = (): string => {
    if (!gdIdentity?.isWhitelisted) return 'Verify';
    if (gdClaimStatus?.nextClaimTime) {
      const nextTime = typeof gdClaimStatus.nextClaimTime === 'string' 
        ? new Date(gdClaimStatus.nextClaimTime) 
        : gdClaimStatus.nextClaimTime;
      const now = new Date();
      const diff = nextTime.getTime() - now.getTime();
      if (diff > 0) return formatTimeRemaining(diff);
    }
    if (gdClaimStatus?.canClaim) return 'Claim G$';
    return 'Claim G$';
  };

  const balance = balanceData?.balance || '0.00';
  const balanceMicro = balanceData?.balanceMicro;
  const chains = balanceData?.chains;
  const fiatValue = exchangeRate 
    ? (parseFloat(balance) * exchangeRate.rate).toFixed(2)
    : balance;

  const transactions = allTransactions || [];

  // Determine if user has any funds (USDC or Aave savings)
  const hasFunds = parseFloat(balance || '0') > 0 || parseFloat(aaveBalance?.totalAUsdcBalance ?? '0') > 0;
  const hasTransactions = transactions.length > 0;
  const isFaceChecked = faceVerificationStatus?.verified || false;
  
  // Data ready and onboarding checks
  const isDataReady = !isLoadingWallet && !isLoading && !isLoadingFaceVerification && !isLoadingAaveBalance;
  const showOnboarding = isDataReady && !hasFunds;
  
  const getExplorerUrl = (txHash: string, txChainId?: number) => {
    // Use transaction's chainId to determine explorer
    const effectiveChainId = txChainId || 42220; // Default to Celo if not specified
    if (effectiveChainId === 42220) {
      return `https://celoscan.io/tx/${txHash}`;
    } else if (effectiveChainId === 100) {
      return `https://gnosisscan.io/tx/${txHash}`;
    } else if (effectiveChainId === 42161) {
      return `https://arbiscan.io/tx/${txHash}`;
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
    <div className="animate-pulse rounded-none border bg-card p-8 text-center space-y-3">
      <div className="h-3 w-16 bg-muted mx-auto"></div>
      <div className="h-12 w-40 bg-muted mx-auto"></div>
      <div className="h-4 w-24 bg-muted mx-auto"></div>
    </div>
  );

  // Transaction list skeleton - matches 3 transaction items
  const TransactionListSkeleton = () => (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-none border">
          <div className="w-10 h-10 bg-muted"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted"></div>
            <div className="h-3 w-16 bg-muted"></div>
          </div>
          <div className="h-4 w-16 bg-muted"></div>
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
        {/* Loading state - show spinner until we know what to display */}
        {!isDataReady ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading your wallet...</p>
          </div>
        ) : showOnboarding ? (
          <>
            {/* QR Code focused empty state */}
            <div className="border border-foreground/10 p-6 text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-background p-3 border border-foreground/10">
                  {address && <QRCodeDisplay value={address} size={180} />}
                </div>
              </div>
              <div className="space-y-3">
                <AddressDisplay address={address!} />
                <Button
                  size="lg"
                  className="w-full"
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: 'My nanoPay Address',
                          text: `Send USDC to: ${address}`,
                          url: `https://nanopay.me/${address}`
                        });
                      } catch (err) {
                        // User cancelled or share failed silently
                      }
                    } else {
                      navigator.clipboard.writeText(address!);
                      toast({ title: 'Address copied', description: 'Share it to receive USDC' });
                    }
                  }}
                  data-testid="button-share-address"
                >
                  <Share2 className="h-4 w-4" />
                  Share Address
                </Button>
              </div>
            </div>

            {/* How to Earn XP */}
            <div className="border border-foreground/10 p-4 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">How to Earn XP</span>
              
              <div className="space-y-3">
                {/* Option 1: Get Vouched */}
                <button
                  onClick={() => setLocation('/maxflow')}
                  className="flex items-start gap-3 p-3 w-full text-left bg-muted/30 border border-foreground/10 hover-elevate"
                  data-testid="button-earn-vouch"
                >
                  <Users className="h-5 w-5 text-cta flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Get vouched by existing users</div>
                    <div className="text-xs text-muted-foreground">Share your address, ask them to vouch for you</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                </button>

                {/* Option 2: Face Check - only show if not already verified (or GD verified) */}
                {!faceVerificationStatus?.verified && !isGdVerified && (
                  <button
                    onClick={() => setLocation('/maxflow?tab=maxflow')}
                    className="flex items-start gap-3 p-3 w-full text-left bg-muted/30 border border-foreground/10 hover-elevate"
                    data-testid="button-earn-facecheck"
                  >
                    <Camera className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">Complete Face Check</div>
                      <div className="text-xs text-muted-foreground">Prove you're human → earn 120 XP instantly</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  </button>
                )}

                {/* Option 3: GoodDollar */}
                <button
                  onClick={() => setLocation('/maxflow?tab=gooddollar')}
                  className="flex items-start gap-3 p-3 w-full text-left bg-muted/30 border border-foreground/10 hover-elevate"
                  data-testid="button-earn-gooddollar"
                >
                  <Shield className="h-5 w-5 text-cta flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Verify with GoodDollar</div>
                    <div className="text-xs text-muted-foreground">Claim G$ daily → convert G$ to XP</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                </button>
              </div>
            </div>

            {/* What XP Unlocks */}
            <div className="border border-foreground/10 p-4 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">What XP Unlocks</span>
              
              <Accordion type="single" collapsible className="w-full space-y-2">
                <AccordionItem value="usdc" className="border border-foreground/10 bg-muted/30">
                  <AccordionTrigger className="px-3 py-3 hover:no-underline" data-testid="accordion-unlock-usdc">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-cta/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-cta">$</span>
                      </div>
                      <span className="text-sm font-medium">Get USDC</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <p className="text-sm text-muted-foreground">
                      Redeem 100 XP for 1 USDC, deposited directly to your Aave savings on Celo. Starts earning yield immediately.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="senador" className="border border-foreground/10 bg-muted/30">
                  <AccordionTrigger className="px-3 py-3 hover:no-underline" data-testid="accordion-unlock-senador">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-cta/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-cta">S</span>
                      </div>
                      <span className="text-sm font-medium">Get SENADOR tokens</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <p className="text-sm text-muted-foreground">
                      Exchange XP for SENADOR at 1:1 ratio (1 XP = 1 SENADOR). Experimental token on Celo. High-risk, not investment advice.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="ai" className="border border-foreground/10 bg-muted/30">
                  <AccordionTrigger className="px-3 py-3 hover:no-underline" data-testid="accordion-unlock-ai">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-cta/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-cta">AI</span>
                      </div>
                      <span className="text-sm font-medium">AI Chat Assistant</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3">
                    <p className="text-sm text-muted-foreground">
                      Ask questions about crypto, DeFi, and finances. Costs 1 XP per message.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* XP Status if they have any */}
              {xpData && xpData.totalXp > 0 && (
                <div className="flex items-center justify-between p-3 bg-cta/10 border border-cta/30">
                  <span className="text-sm font-medium">Your XP Balance</span>
                  <span className="text-sm font-bold text-cta">{xpData.totalXp} XP</span>
                </div>
              )}

              {/* FAQ Link */}
              <button
                onClick={() => setLocation('/faqs')}
                className="flex items-center gap-3 p-3 w-full text-left bg-muted/30 border border-foreground/10 hover-elevate"
                data-testid="button-faq"
              >
                <HelpCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Have questions? Check the FAQs</span>
              </button>

              {/* Telegram Link */}
              <a
                href="https://t.me/+zWefAe1jX9FhODU0"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 w-full text-left bg-muted/30 border border-foreground/10 hover-elevate"
                data-testid="link-telegram-home"
              >
                <SiTelegram className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Join our Telegram community</span>
              </a>
            </div>
          </>
        ) : (
          <>
            {isLoadingWallet ? (
              <div className="h-10 bg-muted animate-pulse"></div>
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
                onRefresh={handleRefreshBalance}
                isRefreshing={isRefreshingBalance && !isLoading}
              />
            )}

            {!isFaceChecked && !isGdVerified && (
              <TrustStatusCard 
                address={address} 
                onFaceVerify={() => setLocation('/maxflow?tab=maxflow')}
                compact
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button 
                size="lg"
                className="w-full"
                onClick={() => setLocation('/send')}
                data-testid="button-send"
              >
                <ArrowUpRight className="h-4 w-4" />
                Send
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => setLocation('/receive')}
                data-testid="button-receive"
              >
                <ArrowDownLeft className="h-4 w-4" />
                Receive
              </Button>
            </div>

            {/* Trust Health section */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                Trust Hub
              </h2>
              <div className="grid grid-cols-2 bg-card border border-foreground/10 divide-x divide-foreground/10">
                <button 
                  onClick={() => setLocation('/maxflow')}
                  className="flex items-center gap-3 px-4 py-3 hover-elevate"
                  data-testid="button-trust-maxflow"
                >
                  <span className="text-[#30A99C] dark:text-[#40C4B5]">
                    <Waypoints className="h-5 w-5" />
                  </span>
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide">MaxFlow</div>
                    <div className="text-sm font-bold font-mono tabular-nums" data-testid="text-maxflow-cta">{getMaxflowCta()}</div>
                  </div>
                </button>
                <button 
                  onClick={() => setLocation('/maxflow?tab=gooddollar')}
                  className="flex items-center gap-3 px-4 py-3 hover-elevate"
                  data-testid="button-trust-gooddollar"
                >
                  <span className="text-[#03B2CB]">
                    <Shield className="h-5 w-5" />
                  </span>
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide">GoodDollar</div>
                    <div className="text-sm font-bold font-mono tabular-nums" data-testid="text-gooddollar-cta">{getGoodDollarCta()}</div>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        {(isLoadingWallet || transactions.length > 0) && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              Recent Activity
            </h2>
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
        )}
      </main>

      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent>
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
                  <ExternalLink className="h-4 w-4" />
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
