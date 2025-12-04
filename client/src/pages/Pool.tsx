import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getWallet, getPrivateKey } from "@/lib/wallet";
import { privateKeyToAccount } from 'viem/accounts';
import { 
  Trophy, 
  Ticket, 
  Clock, 
  Users, 
  Share2, 
  Gift, 
  TrendingUp, 
  Copy, 
  Check, 
  ChevronRight, 
  Sparkles,
  Coins,
  Target,
  History,
  Info,
  BarChart3,
  AlertCircle,
  Loader2,
  Zap,
  ArrowRight,
  PiggyBank,
  Shield,
  UserPlus
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface PoolStatus {
  draw: {
    id: string;
    weekNumber: number;
    year: number;
    status: string;
    totalPool: string;
    totalPoolFormatted: string;
    totalTickets: string;
    participantCount: number;
  };
  user: {
    optInPercent: number;
    yieldContributed: string;
    yieldContributedFormatted: string;
    referralBonusTickets: string;
    totalTickets: string;
    odds: string;
    totalContributedAllTime: string;
    totalContributedAllTimeFormatted: string;
    aUsdcBalance: string;
    aUsdcBalanceFormatted: string;
    hasSnapshot: boolean;
  };
  referral: {
    code: string;
    activeReferrals: number;
    referralsList: { address: string; createdAt: string }[];
  };
  countdown: {
    hoursUntilDraw: number;
    minutesUntilDraw: number;
    drawTime: string;
  };
}

interface DrawHistory {
  draws: {
    id: string;
    weekNumber: number;
    year: number;
    totalPool: string;
    totalPoolFormatted: string;
    participantCount: number;
    winnerAddress: string | null;
    status: string;
    drawnAt: string | null;
  }[];
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCountdown(hours: number, minutes: number): string {
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

// Smart formatting for micro-USDC amounts - shows more decimals for tiny amounts
function formatMicroUsdc(microUsdc: string | number): string {
  const amount = Number(microUsdc) / 1_000_000;
  if (amount === 0) return '0.00';
  if (amount < 0.0001) return amount.toFixed(6);
  if (amount < 0.01) return amount.toFixed(4);
  if (amount < 1) return amount.toFixed(3);
  return amount.toFixed(2);
}

// Format ticket counts (same logic, no $ prefix)
function formatTickets(microAmount: string | number): string {
  const amount = Number(microAmount) / 1_000_000;
  if (amount === 0) return '0';
  if (amount < 0.0001) return amount.toFixed(6);
  if (amount < 0.01) return amount.toFixed(4);
  if (amount < 1) return amount.toFixed(3);
  return amount.toFixed(2);
}

export default function Pool() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [optInPercent, setOptInPercent] = useState<number>(50); // Default to 50% for intro
  const [hasInitializedOptIn, setHasInitializedOptIn] = useState(false);
  const [isSavingOptIn, setIsSavingOptIn] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [showContributionDialog, setShowContributionDialog] = useState(false);
  const [pendingOptInPercent, setPendingOptInPercent] = useState<number | null>(null);
  const [prepareData, setPrepareData] = useState<{
    success: boolean;
    requiresSignature?: boolean;
    noYieldToContribute?: boolean;
    isFirstTime?: boolean;
    yieldAmount?: string;
    yieldAmountFormatted?: string;
    contributionAmount?: string;
    contributionAmountFormatted?: string;
    currentBalance?: string;
    optInPercent?: number;
    permitTypedData?: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      message: Record<string, string>;
    };
    deadline?: number;
    nonce?: string;
    message?: string;
  } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    const loadAddress = async () => {
      const wallet = await getWallet();
      if (wallet?.address) {
        setAddress(wallet.address);
      }
    };
    loadAddress();
  }, []);

  // Check for referral code in URL
  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref");
    if (ref && address) {
      setReferralInput(ref);
      setShowReferralDialog(true);
    }
  }, [search, address]);

  const { data: poolStatus, isLoading: isLoadingStatus } = useQuery<PoolStatus>({
    queryKey: ["/api/pool/status", address],
    enabled: !!address,
  });

  const { data: historyData, isLoading: isLoadingHistory } = useQuery<DrawHistory>({
    queryKey: ["/api/pool/history"],
    enabled: !!address,
  });

  // Fetch Celo APY for yield estimates
  const { data: celoApyData } = useQuery<{ apy: number }>({
    queryKey: ["/api/aave/apy", 42220],
    enabled: !!address,
  });

  // Sync opt-in from server
  useEffect(() => {
    if (poolStatus?.user?.optInPercent !== undefined && !hasInitializedOptIn) {
      // Distinguish between new users and returning opted-out users:
      // - New users (no snapshot): keep 50% default for intro UX
      // - Returning users (has snapshot): sync their saved value, even if 0
      if (poolStatus.user.hasSnapshot || poolStatus.user.optInPercent > 0) {
        setOptInPercent(poolStatus.user.optInPercent);
      }
      // New users without snapshot keep the default 50%
      setHasInitializedOptIn(true);
    }
  }, [poolStatus, hasInitializedOptIn]);

  // New on-chain contribution mutation with permit signing
  const contributionMutation = useMutation({
    mutationFn: async (percent: number) => {
      // Step 1: Prepare contribution - get yield amount and permit params
      const prepareResult = await apiRequest("POST", "/api/pool/prepare-contribution", { 
        address, 
        optInPercent: percent 
      });
      const prepareData = await prepareResult.json();
      
      if (!prepareData.success) {
        throw new Error(prepareData.error || 'Failed to prepare contribution');
      }
      
      // If no yield to contribute, just return success (no signature needed)
      // Note: isFirstTime users WITH balance will have requiresSignature=true
      if (prepareData.noYieldToContribute) {
        return prepareData;
      }
      
      // Step 2: If requires signature, sign the permit
      if (prepareData.requiresSignature) {
        const privateKey = await getPrivateKey();
        if (!privateKey) throw new Error('No private key found');
        
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        
        // Sign the EIP-712 permit
        const signature = await account.signTypedData({
          domain: prepareData.permitTypedData.domain,
          types: prepareData.permitTypedData.types,
          primaryType: 'Permit',
          message: {
            owner: prepareData.permitTypedData.message.owner,
            spender: prepareData.permitTypedData.message.spender,
            value: BigInt(prepareData.permitTypedData.message.value),
            nonce: BigInt(prepareData.permitTypedData.message.nonce),
            deadline: BigInt(prepareData.permitTypedData.message.deadline),
          },
        });
        
        // Step 3: Submit signed contribution
        const submitResult = await apiRequest("POST", "/api/pool/submit-contribution", {
          address,
          optInPercent: percent,
          contributionAmount: prepareData.contributionAmount,
          deadline: prepareData.deadline,
          signature,
        });
        const submitData = await submitResult.json();
        
        if (!submitData.success) {
          throw new Error(submitData.error || 'Failed to submit contribution');
        }
        
        return {
          ...submitData,
          onChain: true,
        };
      }
      
      return prepareData;
    },
    onSuccess: (data: { 
      optInPercent?: number; 
      contributionAmount?: string;
      contributionAmountFormatted?: string;
      transferTxHash?: string;
      isFirstTime?: boolean;
      noYieldToContribute?: boolean;
      message?: string;
      onChain?: boolean;
    }) => {
      // Sync local state to confirmed server value
      if (data?.optInPercent !== undefined) {
        setOptInPercent(data.optInPercent);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/pool/status", address] });
      
      // Show appropriate message
      if (data.onChain && data.transferTxHash) {
        toast({
          title: "Yield contributed on-chain!",
          description: `$${data.contributionAmountFormatted} transferred to the prize pool`,
        });
      } else if (data.isFirstTime) {
        toast({
          title: "Joined the pool!",
          description: data.message || "Your yield will be collected weekly",
        });
      } else if (data.noYieldToContribute) {
        toast({
          title: "Settings saved",
          description: data.message || "No yield to contribute yet",
        });
      } else if ((data.optInPercent ?? 0) > 0) {
        toast({
          title: "Saved",
          description: `Contributing ${data.optInPercent}% of your Celo yield to the pool`,
        });
      } else {
        toast({
          title: "Saved",
          description: "Pool contribution disabled",
        });
      }
    },
    onError: (error: Error) => {
      console.error('[Pool] Contribution error:', error);
      toast({
        title: "Failed to contribute",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const applyReferralMutation = useMutation({
    mutationFn: async (code: string) => {
      return apiRequest("POST", "/api/pool/apply-referral", { address, referralCode: code });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pool/status", address] });
      setShowReferralDialog(false);
      toast({
        title: "Referral applied",
        description: "You'll earn bonus tickets from your referrer's contributions",
      });
    },
    onError: (error: Error) => {
      let message = "Invalid or already used";
      try {
        const parsed = JSON.parse(error.message.split(": ").slice(1).join(": "));
        message = parsed.error || message;
      } catch {
        if (error.message.includes("already been referred")) {
          message = "You have already been referred by someone";
        } else if (error.message.includes("Cannot refer yourself")) {
          message = "You cannot use your own referral code";
        }
      }
      toast({
        title: "Failed to apply referral",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleOptInChange = (value: number[]) => {
    setOptInPercent(value[0]);
  };

  const confirmOptInChange = () => {
    if (pendingOptInPercent !== null) {
      contributionMutation.mutate(pendingOptInPercent);
      setShowContributionDialog(false);
      setPendingOptInPercent(null);
    }
  };

  const cancelOptInChange = () => {
    if (poolStatus?.user?.optInPercent !== undefined) {
      setOptInPercent(poolStatus.user.optInPercent);
    }
    setShowContributionDialog(false);
    setPendingOptInPercent(null);
    setPrepareData(null);
  };

  // Open modal and fetch prepare data to show amounts
  const openContributionModal = async (percent: number) => {
    setPendingOptInPercent(percent);
    setShowContributionDialog(true);
    setPrepareData(null);
    setIsPreparing(true);
    
    try {
      const prepareResult = await apiRequest("POST", "/api/pool/prepare-contribution", { 
        address, 
        optInPercent: percent 
      });
      const data = await prepareResult.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to prepare contribution');
      }
      
      setPrepareData(data);
    } catch (error) {
      console.error('[Pool] Error preparing contribution:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load contribution details",
        variant: "destructive",
      });
      setShowContributionDialog(false);
      setPendingOptInPercent(null);
    } finally {
      setIsPreparing(false);
    }
  };

  const copyReferralCode = async () => {
    if (poolStatus?.referral?.code) {
      const link = `${window.location.origin}/pool?ref=${poolStatus.referral.code}`;
      await navigator.clipboard.writeText(link);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      toast({
        title: "Copied",
        description: "Referral link copied to clipboard",
      });
    }
  };

  if (!address) {
    return (
      <div 
        className="min-h-screen bg-background flex items-center justify-center"
        style={{ 
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' 
        }}
      >
        <Card className="max-w-md w-full mx-4 p-6 space-y-6">
          <div className="text-center space-y-2">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Prize Pool</h2>
            <p className="text-sm text-muted-foreground">
              Connect your wallet to participate
            </p>
          </div>
          <Button className="w-full" onClick={() => setLocation("/unlock")} data-testid="button-connect-wallet">
            Connect Wallet
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold">Prize Pool</h1>
          <p className="text-xs text-muted-foreground">Win weekly prizes from your savings yield</p>
        </div>

        {isLoadingStatus ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : poolStatus && (poolStatus.user.optInPercent ?? 0) === 0 ? (
          /* Simplified Onboarding Intro */
          <div className="space-y-4">
            {/* Hero Prize Display */}
            <div className="p-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                <Trophy className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">This week's prize</p>
                {(() => {
                  const formatted = formatMicroUsdc(poolStatus.draw.totalPool);
                  const [intPart = '0', decPart = '00'] = formatted.split('.');
                  return (
                    <div className="text-5xl font-bold tabular-nums flex items-center justify-center" data-testid="text-intro-prize">
                      <span className="text-3xl font-normal opacity-50 mr-1">$</span>
                      <span>{intPart}</span>
                      <span className="opacity-80">.{decPart}</span>
                    </div>
                  );
                })()}
              </div>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Contribute some of your Aave savings yield for a chance to win the weekly prize
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {poolStatus.draw.participantCount} players
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatCountdown(poolStatus.countdown.hoursUntilDraw, poolStatus.countdown.minutesUntilDraw)}
                </span>
              </div>
            </div>

            {/* Simple Join Card */}
            <Card className="p-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Yield to contribute</span>
                  <Badge variant="outline" className="font-bold px-2" data-testid="text-intro-opt-in">
                    {optInPercent}%
                  </Badge>
                </div>
                <Slider
                  value={[optInPercent]}
                  onValueChange={handleOptInChange}
                  max={100}
                  step={5}
                  className="w-full"
                  data-testid="slider-intro-opt-in"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Keep all yield</span>
                  <span>Max tickets</span>
                </div>
              </div>
              
              {Number(poolStatus.user.aUsdcBalance) === 0 ? (
                <div className="space-y-3 pt-2">
                  <p className="text-sm text-center text-muted-foreground">
                    Add savings to Aave on Celo to participate
                  </p>
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => setLocation('/earn')}
                    data-testid="button-go-earn"
                  >
                    <PiggyBank className="h-4 w-4 mr-2" />
                    Go to Earn
                  </Button>
                </div>
              ) : (
                <Button 
                  className="w-full" 
                  size="lg"
                  disabled={optInPercent === 0}
                  onClick={() => openContributionModal(optInPercent)}
                  data-testid="button-activate"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {optInPercent === 0 ? "Choose contribution %" : "Join Pool"}
                </Button>
              )}
              
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                <Shield className="h-3 w-3" />
                Only yield is used, never your savings
              </p>
            </Card>
          </div>
        ) : poolStatus ? (
          <Tabs defaultValue="pool" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pool" className="flex items-center gap-1.5 text-xs" data-testid="tab-pool">
                <Trophy className="h-3.5 w-3.5" />
                Pool
              </TabsTrigger>
              <TabsTrigger value="tickets" className="flex items-center gap-1.5 text-xs" data-testid="tab-tickets">
                <Ticket className="h-3.5 w-3.5" />
                Tickets
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs" data-testid="tab-history">
                <History className="h-3.5 w-3.5" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Pool Tab */}
            <TabsContent value="pool" className="mt-4 space-y-4">
              {/* This Week's Prize */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" />
                    This Week's Prize
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    Week {poolStatus.draw.weekNumber}
                  </Badge>
                </div>
                <div className="text-center py-4">
                  {(() => {
                    const formatted = formatMicroUsdc(poolStatus.draw.totalPool);
                    const [intPart = '0', decPart = '00'] = formatted.split('.');
                    return (
                      <div className="text-5xl font-medium tabular-nums flex items-center justify-center" data-testid="text-prize-amount">
                        <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
                        <span className="inline-flex items-baseline">
                          <span>{intPart}</span>
                          <span className="opacity-90">.{decPart}</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span data-testid="text-participant-count">
                      {poolStatus.draw.participantCount} players
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span data-testid="text-countdown">
                      {formatCountdown(
                        poolStatus.countdown.hoursUntilDraw,
                        poolStatus.countdown.minutesUntilDraw
                      )}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Your Position */}
              <Card className="p-4 space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Your Position
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold" data-testid="text-your-tickets">
                      {formatTickets(poolStatus.user.totalTickets)}
                    </p>
                    <p className="text-xs text-muted-foreground">Tickets</p>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-primary" data-testid="text-your-odds">
                      {poolStatus.user.odds}%
                    </p>
                    <p className="text-xs text-muted-foreground">Win Chance</p>
                  </div>
                </div>
              </Card>

              {/* Risk/Return Analysis */}
              {(() => {
                const prizePool = Number(poolStatus.draw.totalPool) / 1_000_000;
                const aUsdcBalance = Number(poolStatus.user.aUsdcBalance) / 1_000_000;
                // Use actual ticket count (includes referral bonuses), not just prize pool dollars
                const totalPoolTickets = Number(poolStatus.draw.totalTickets || poolStatus.draw.totalPool) / 1_000_000;
                const apy = celoApyData?.apy;
                const hasApyData = apy !== undefined && apy > 0;
                
                // Calculate weekly yield cost based on current slider (what you'd be "risking")
                const weeklyYield = hasApyData ? aUsdcBalance * (apy / 100) / 52 : 0;
                const weeklyCost = weeklyYield * (optInPercent / 100);
                
                // Estimate user's projected tickets at current slider opt-in
                // Projected contribution = weeklyCost (yield × opt-in%)
                const projectedTickets = weeklyCost;
                
                // Projected odds = (my projected tickets / (pool total + my new tickets)) × 100
                // For simplicity, approximate as my tickets / pool total (assumes pool >> individual)
                const projectedOdds = totalPoolTickets > 0 && projectedTickets > 0 
                  ? (projectedTickets / (totalPoolTickets + projectedTickets)) * 100 
                  : 0;
                
                // ROI multiple: prize / weekly cost (how many times your cost could you win?)
                const roiMultiple = weeklyCost > 0 ? prizePool / weeklyCost : 0;
                
                // Expected Value: (prize × projected odds) - cost (all using same opt-in assumption)
                const expectedValue = hasApyData && projectedOdds > 0 
                  ? (prizePool * projectedOdds / 100) - weeklyCost 
                  : 0;
                
                // No-brainer rating based on ROI multiple and EV
                let rating: 'no-brainer' | 'high-upside' | 'fair' | 'not-participating' | 'estimate-unavailable' = 'not-participating';
                let ratingColor = 'text-muted-foreground';
                let ratingBg = 'bg-muted/50';
                
                if (optInPercent === 0) {
                  rating = 'not-participating';
                  ratingColor = 'text-muted-foreground';
                  ratingBg = 'bg-muted/50';
                } else if (!hasApyData || aUsdcBalance === 0) {
                  rating = 'estimate-unavailable';
                  ratingColor = 'text-muted-foreground';
                  ratingBg = 'bg-muted/50';
                } else if (expectedValue >= 0 && roiMultiple >= 100) {
                  rating = 'no-brainer';
                  ratingColor = 'text-green-600 dark:text-green-400';
                  ratingBg = 'bg-green-100 dark:bg-green-900/30';
                } else if (roiMultiple >= 50) {
                  rating = 'high-upside';
                  ratingColor = 'text-amber-600 dark:text-amber-400';
                  ratingBg = 'bg-amber-100 dark:bg-amber-900/30';
                } else if (roiMultiple > 0) {
                  rating = 'fair';
                  ratingColor = 'text-blue-600 dark:text-blue-400';
                  ratingBg = 'bg-blue-100 dark:bg-blue-900/30';
                }
                
                // Cost bar width as percentage of prize (capped for visual, use log scale for tiny costs)
                const costRatio = prizePool > 0 && weeklyCost > 0 ? weeklyCost / prizePool : 0;
                // Use log scale: tiny costs still visible but proportionally small
                const costBarWidth = costRatio > 0 ? Math.max(Math.min(Math.log10(1 + costRatio * 1000) * 15, 40), 3) : 0;
                
                return (
                  <Card className="p-4 space-y-3">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Risk / Return Analysis
                    </div>
                    
                    {/* No-brainer meter */}
                    <div className={`rounded-lg p-3 ${ratingBg}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${ratingColor}`} data-testid="text-rating">
                          {rating === 'no-brainer' && 'No-brainer'}
                          {rating === 'high-upside' && 'High upside'}
                          {rating === 'fair' && 'Fair odds'}
                          {rating === 'not-participating' && 'Not participating'}
                          {rating === 'estimate-unavailable' && 'Add Celo savings to see analysis'}
                        </span>
                        {roiMultiple > 0 && (
                          <span className="text-lg font-bold" data-testid="text-roi-multiple">
                            {roiMultiple >= 1000 ? `${(roiMultiple/1000).toFixed(0)}k` : roiMultiple.toFixed(0)}x
                          </span>
                        )}
                      </div>
                      {roiMultiple > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Prize is {roiMultiple >= 1000 ? `${(roiMultiple/1000).toFixed(0)}k` : roiMultiple.toFixed(0)}x your weekly yield cost
                        </p>
                      )}
                    </div>
                    
                    {/* Cost vs Prize visual */}
                    {hasApyData && optInPercent > 0 && weeklyCost > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Your weekly cost</span>
                          <span>Potential prize</span>
                        </div>
                        <div className="relative h-6 bg-muted/50 rounded-full overflow-hidden">
                          {/* Cost portion (tiny) */}
                          <div 
                            className="absolute left-0 top-0 h-full bg-orange-400/70 dark:bg-orange-500/50 rounded-l-full"
                            style={{ width: `${costBarWidth}%` }}
                          />
                          {/* Prize portion (rest) */}
                          <div 
                            className="absolute right-0 top-0 h-full bg-primary/70 rounded-r-full"
                            style={{ width: `${100 - costBarWidth}%` }}
                          />
                          {/* Labels */}
                          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-medium">
                            <span className="text-orange-800 dark:text-orange-200">
                              ${weeklyCost < 0.01 ? weeklyCost.toFixed(4) : weeklyCost.toFixed(2)}
                            </span>
                            <span className="text-primary-foreground">
                              ${formatMicroUsdc(poolStatus.draw.totalPool)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Expected Value & Odds */}
                    {hasApyData && optInPercent > 0 && projectedOdds > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Projected odds</span>
                          <span className="font-medium" data-testid="text-projected-odds">
                            {projectedOdds < 0.01 ? projectedOdds.toFixed(4) : projectedOdds.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Expected value</span>
                          <span className={`font-medium ${expectedValue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} data-testid="text-expected-value">
                            {expectedValue >= 0 ? '+' : ''}${Math.abs(expectedValue) < 0.01 ? expectedValue.toFixed(4) : expectedValue.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Key insight */}
                    <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                      You never risk principal—only a slice of weekly yield. Worst case: you keep your savings.
                    </p>
                  </Card>
                );
              })()}

              {/* Contribution */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    Yield Contribution
                  </div>
                  <Badge variant="outline" className="font-bold px-2" data-testid="text-opt-in-percent">
                    {optInPercent}%
                  </Badge>
                </div>
                <Slider
                  value={[optInPercent]}
                  onValueChange={handleOptInChange}
                  max={100}
                  step={5}
                  className="w-full"
                  data-testid="slider-opt-in"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Keep all yield</span>
                  <span>Max tickets</span>
                </div>
                
                {/* Yield Stats */}
                <div className="space-y-2 pt-2 border-t">
                  {poolStatus.user.hasSnapshot && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total (all-time)</span>
                      <span className="font-medium" data-testid="text-total-contributed">
                        ${poolStatus.user.totalContributedAllTimeFormatted}
                      </span>
                    </div>
                  )}
                  {celoApyData?.apy && Number(poolStatus.user.aUsdcBalance) > 0 && optInPercent > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Est. weekly</span>
                        <span className="font-medium text-primary" data-testid="text-weekly-estimate">
                          ~${((Number(poolStatus.user.aUsdcBalance) / 1_000_000) * (celoApyData.apy / 100) / 52 * (optInPercent / 100)).toFixed(4)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Est. daily</span>
                        <span className="font-medium" data-testid="text-daily-estimate">
                          ~${((Number(poolStatus.user.aUsdcBalance) / 1_000_000) * (celoApyData.apy / 100) / 365 * (optInPercent / 100)).toFixed(4)}
                        </span>
                      </div>
                    </>
                  ) : optInPercent > 0 && (!poolStatus.user.hasSnapshot || Number(poolStatus.user.aUsdcBalance) === 0) ? (
                    <div className="text-xs text-muted-foreground text-center">
                      Add savings to Celo Aave to see yield estimates
                    </div>
                  ) : null}
                </div>
                
                {/* Save button - always visible, disabled when no change */}
                <Button 
                  className="w-full" 
                  disabled={optInPercent === (poolStatus.user.optInPercent ?? 0)}
                  onClick={() => openContributionModal(optInPercent)}
                  data-testid="button-save-contribution"
                >
                  Save
                </Button>
                
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Info className="h-3 w-3" />
                  Higher contribution = more tickets = better odds
                </p>
              </Card>

              {/* Collection Timing Info */}
              <Card className="p-3 border-dashed space-y-1">
                <p className="text-xs text-muted-foreground text-center">
                  Celo aUSDC yield only - your principal stays safe in Aave
                </p>
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Yield collected weekly on Sunday at midnight UTC
                </p>
              </Card>
            </TabsContent>

            {/* Tickets Tab */}
            <TabsContent value="tickets" className="mt-4 space-y-4">
              {/* Ticket Breakdown */}
              <Card className="p-4 space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-primary" />
                  Ticket Breakdown
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Your yield</span>
                    </div>
                    <span className="font-medium" data-testid="text-yield-tickets">
                      {formatTickets(poolStatus.user.yieldContributed)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Referral bonus</span>
                    </div>
                    <span className="font-medium" data-testid="text-referral-tickets">
                      +{formatTickets(poolStatus.user.referralBonusTickets)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="font-medium">Total</span>
                  <span className="text-xl font-bold text-primary" data-testid="text-total-tickets">
                    {formatTickets(poolStatus.user.totalTickets)}
                  </span>
                </div>
              </Card>

              {/* Referral System */}
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Share & Earn</span>
                  <Badge variant="secondary" className="ml-auto" data-testid="badge-referral-count">
                    {poolStatus.referral.activeReferrals} referred
                  </Badge>
                </div>
                
                <div className="flex gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm text-center">
                    {poolStatus.referral.code}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyReferralCode}
                    data-testid="button-copy-referral"
                  >
                    {copiedCode ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Info className="h-3 w-3" />
                  Earn 10% bonus tickets from each friend's contribution
                </p>
              </Card>

              {/* Info Card */}
              <Card className="p-3 border-dashed">
                <p className="text-xs text-muted-foreground text-center">
                  More tickets = better odds of winning the weekly prize
                </p>
              </Card>

              <Dialog open={showReferralDialog} onOpenChange={setShowReferralDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" className="w-full text-muted-foreground" data-testid="button-enter-referral">
                    Have a code? Enter it here
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Enter Referral Code</DialogTitle>
                    <DialogDescription>
                      8-character code from a friend
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input
                      placeholder="A1B2C3D4"
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                      className="font-mono text-center text-lg"
                      maxLength={8}
                      data-testid="input-referral-code"
                    />
                    <Button
                      className="w-full"
                      onClick={() => applyReferralMutation.mutate(referralInput)}
                      disabled={!referralInput || referralInput.length !== 8 || applyReferralMutation.isPending}
                      data-testid="button-apply-referral"
                    >
                      {applyReferralMutation.isPending ? "Applying..." : "Apply Code"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-4 space-y-4">
              {/* Prize Trend Chart */}
              {historyData?.draws && historyData.draws.length > 1 ? (
                <Card className="p-4 space-y-3">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Prize Trend
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...historyData.draws].reverse().slice(-8).map(draw => ({
                          week: `W${draw.weekNumber}`,
                          amount: Number(draw.totalPool) / 1_000_000
                        }))}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <XAxis 
                          dataKey="week" 
                          axisLine={false} 
                          tickLine={false}
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis 
                          hide 
                          domain={[0, 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                          formatter={(value: number) => [`$${formatMicroUsdc(String(value * 1_000_000))}`, 'Prize']}
                        />
                        <Bar 
                          dataKey="amount" 
                          radius={[4, 4, 0, 0]}
                          fill="hsl(var(--primary))"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : (
                <Card className="p-4 space-y-3 border-dashed">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Prize Trend
                  </div>
                  <div className="h-24 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground text-center">
                      Chart will appear after 2+ completed draws
                    </p>
                  </div>
                </Card>
              )}

              {/* Past Draws */}
              <Card className="p-4 space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Past Draws
                </div>
                {isLoadingHistory ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : historyData?.draws && historyData.draws.length > 0 ? (
                  <div className="space-y-2">
                    {historyData.draws.map((draw) => (
                      <div
                        key={draw.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        data-testid={`row-draw-${draw.id}`}
                      >
                        <div>
                          <p className="text-sm font-medium">
                            Week {draw.weekNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {draw.participantCount} players
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">
                            ${formatMicroUsdc(draw.totalPool)}
                          </p>
                          {draw.winnerAddress && (
                            <p className="text-xs font-mono text-muted-foreground">
                              {formatAddress(draw.winnerAddress)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">First draw coming soon!</p>
                  </div>
                )}
              </Card>

              {/* How It Works */}
              <Card className="p-4 space-y-3">
                <div className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  How It Works
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold mx-auto">1</div>
                    <p className="text-xs text-muted-foreground">Save in Aave</p>
                  </div>
                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold mx-auto">2</div>
                    <p className="text-xs text-muted-foreground">Contribute yield</p>
                  </div>
                  <div className="space-y-1">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold mx-auto">3</div>
                    <p className="text-xs text-muted-foreground">Win weekly!</p>
                  </div>
                </div>
              </Card>

              {/* Info Card */}
              <Card className="p-3 border-dashed">
                <p className="text-xs text-muted-foreground text-center">
                  Draws happen every Sunday using verifiable on-chain randomness
                </p>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">
            <p>Failed to load pool data</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </Card>
        )}
      </main>

      {/* Contribution Confirmation Dialog */}
      <Dialog open={showContributionDialog} onOpenChange={(open) => {
        if (!open) cancelOptInChange();
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm contribution</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 py-2">
              <span className="text-lg font-medium">{poolStatus?.user?.optInPercent ?? 0}%</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold text-primary">{pendingOptInPercent ?? 0}%</span>
            </div>
            
            <p className="text-sm text-center">
              {pendingOptInPercent === 0 
                ? "You'll keep 100% of your Celo aUSDC yield" 
                : `${pendingOptInPercent}% of your Celo aUSDC yield goes to the weekly prize pool`}
            </p>
            
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>Collected weekly on Sunday at 00:00 UTC</p>
              <p>Your principal stays safe in Aave</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={cancelOptInChange}
              data-testid="button-cancel-contribution"
            >
              Cancel
            </Button>
            <Button 
              className="flex-1"
              onClick={confirmOptInChange}
              disabled={contributionMutation.isPending}
              data-testid="button-confirm-contribution"
            >
              {contributionMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing & submitting...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
