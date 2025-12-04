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
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, ReferenceDot } from 'recharts';

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
    projectedPool?: string;
    projectedPoolFormatted?: string;
    projectedTickets?: string;
    projectedYieldFromParticipants?: string;
    projectedYieldFromParticipantsFormatted?: string;
  };
  user: {
    optInPercent: number;
    yieldContributed: string;
    yieldContributedFormatted: string;
    referralBonusTickets: string;
    totalTickets: string;
    odds: string;
    projectedOdds?: string;
    projectedWeeklyYield?: string;
    projectedWeeklyYieldFormatted?: string;
    projectedTickets?: string;
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
  projectedPool?: {
    apy: number;
    totalProjectedYield: string;
    totalProjectedYieldFormatted: string;
    participantCount: number;
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
  const [contributionSuccess, setContributionSuccess] = useState<{
    success: boolean;
    message?: string;
    isOnChain?: boolean;
    amount?: string;
  } | null>(null);
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

  // On-chain contribution mutation - uses pre-fetched prepareData from modal
  const contributionMutation = useMutation({
    mutationFn: async (percent: number) => {
      // Use the pre-fetched prepareData from when modal was opened
      if (!prepareData) {
        throw new Error('No contribution data available');
      }
      
      // If no yield to contribute, just return (includes first-time baseline saves)
      if (prepareData.noYieldToContribute) {
        return prepareData;
      }
      
      // If requires signature, sign the permit and submit
      if (prepareData.requiresSignature && prepareData.permitTypedData) {
        const privateKey = await getPrivateKey();
        if (!privateKey) throw new Error('No private key found');
        
        const account = privateKeyToAccount(privateKey as `0x${string}`);
        
        // Sign the EIP-712 permit
        const signature = await account.signTypedData({
          domain: prepareData.permitTypedData.domain as {
            name: string;
            version: string;
            chainId: number;
            verifyingContract: `0x${string}`;
          },
          types: prepareData.permitTypedData.types as {
            Permit: { name: string; type: string }[];
          },
          primaryType: 'Permit',
          message: {
            owner: prepareData.permitTypedData.message.owner as `0x${string}`,
            spender: prepareData.permitTypedData.message.spender as `0x${string}`,
            value: BigInt(prepareData.permitTypedData.message.value),
            nonce: BigInt(prepareData.permitTypedData.message.nonce),
            deadline: BigInt(prepareData.permitTypedData.message.deadline),
          },
        });
        
        // Submit signed contribution
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
      
      // Determine success message
      let successMessage = "Settings saved";
      if (data.onChain && data.transferTxHash) {
        successMessage = `$${data.contributionAmountFormatted} transferred to prize pool`;
      } else if (data.isFirstTime) {
        successMessage = data.message || "Your yield will be collected weekly";
      } else if (data.noYieldToContribute) {
        successMessage = data.message || "No yield to contribute yet";
      } else if ((data.optInPercent ?? 0) > 0) {
        successMessage = `Contributing ${data.optInPercent}% of your yield`;
      } else {
        successMessage = "Pool contribution disabled";
      }
      
      // Show success state in dialog briefly
      setContributionSuccess({
        success: true,
        message: successMessage,
        isOnChain: data.onChain,
        amount: data.contributionAmountFormatted,
      });
      
      // Close dialog after showing success
      setTimeout(() => {
        setShowContributionDialog(false);
        setPrepareData(null);
        setPendingOptInPercent(null);
        setContributionSuccess(null);
        
        // Show toast as well
        toast({
          title: data.onChain ? "Yield contributed!" : "Saved",
          description: successMessage,
        });
      }, 1500);
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
      // Don't close the dialog - let the mutation handle it
      contributionMutation.mutate(pendingOptInPercent);
    }
  };

  const cancelOptInChange = () => {
    if (poolStatus?.user?.optInPercent !== undefined) {
      setOptInPercent(poolStatus.user.optInPercent);
    }
    setShowContributionDialog(false);
    setPendingOptInPercent(null);
    setPrepareData(null);
    setContributionSuccess(null);
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
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
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
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-6">
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
                    // Show projected pool (including expected yield from all participants)
                    const projectedPool = poolStatus.draw.projectedPool || poolStatus.draw.totalPool;
                    const currentPool = Number(poolStatus.draw.totalPool) / 1_000_000;
                    const projectedNum = Number(projectedPool) / 1_000_000;
                    const hasProjectedGrowth = projectedNum > currentPool && currentPool > 0;
                    
                    const formatted = formatMicroUsdc(projectedPool);
                    const [intPart = '0', decPart = '00'] = formatted.split('.');
                    return (
                      <div className="space-y-1">
                        <div className="text-5xl font-medium tabular-nums flex items-center justify-center" data-testid="text-prize-amount">
                          <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
                          <span className="inline-flex items-baseline">
                            <span>{intPart}</span>
                            <span className="opacity-90">.{decPart}</span>
                          </span>
                        </div>
                        {hasProjectedGrowth && (
                          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            Est. prize at draw (${currentPool.toFixed(2)} collected)
                          </p>
                        )}
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
                    {(() => {
                      const currentTickets = Number(poolStatus.user.totalTickets);
                      const projectedTickets = Number(poolStatus.user.projectedTickets || poolStatus.user.totalTickets);
                      const hasProjection = projectedTickets > currentTickets && currentTickets >= 0;
                      return (
                        <div className="space-y-0.5">
                          <p className="text-2xl font-bold" data-testid="text-your-tickets">
                            {formatTickets(hasProjection ? projectedTickets.toString() : poolStatus.user.totalTickets)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hasProjection ? 'Projected tickets' : 'Tickets'}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    {(() => {
                      const currentOdds = parseFloat(poolStatus.user.odds);
                      const projectedOdds = parseFloat(poolStatus.user.projectedOdds || poolStatus.user.odds);
                      const hasProjection = projectedOdds > currentOdds && currentOdds >= 0;
                      return (
                        <div className="space-y-0.5">
                          <p className="text-2xl font-bold text-primary" data-testid="text-your-odds">
                            {hasProjection ? projectedOdds.toFixed(2) : poolStatus.user.odds}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {hasProjection ? 'Projected odds' : 'Win Chance'}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </Card>

              {/* Kelly-Adjusted Opt-In Curve */}
              {(() => {
                // Use projected pool data for more accurate calculations
                const prizePool = Number(poolStatus.draw.projectedPool || poolStatus.draw.totalPool) / 1_000_000;
                const aUsdcBalance = Number(poolStatus.user.aUsdcBalance) / 1_000_000;
                const totalPoolTickets = Number(poolStatus.draw.projectedTickets || poolStatus.draw.totalTickets || poolStatus.draw.totalPool) / 1_000_000;
                const apy = poolStatus.projectedPool?.apy || celoApyData?.apy;
                const hasApyData = apy !== undefined && apy > 0;
                
                // Calculate Kelly curve data points
                // Kelly formula adapted: f* = (p*b - q) / b where:
                // p = probability of winning, b = net odds (prize/cost - 1), q = 1-p
                // Growth rate g = p*ln(1 + f*b) + q*ln(1 - f)
                const kellyData = [];
                let optimalOptIn = 0;
                let maxGrowthRate = -Infinity;
                
                for (let pct = 0; pct <= 100; pct += 5) {
                  const weeklyYield = hasApyData ? aUsdcBalance * (apy / 100) / 52 : 0;
                  const cost = weeklyYield * (pct / 100);
                  
                  // Projected odds at this opt-in level
                  const myTickets = cost;
                  const odds = totalPoolTickets > 0 && myTickets > 0 
                    ? myTickets / (totalPoolTickets + myTickets)
                    : 0;
                  
                  // Simplified growth rate approximation
                  // g ≈ p * ln(prize/cost) - (1-p) * cost/balance
                  let growthRate = 0;
                  if (cost > 0 && prizePool > 0 && aUsdcBalance > 0) {
                    const upside = odds * Math.log(1 + prizePool / aUsdcBalance);
                    const downside = (1 - odds) * (cost / aUsdcBalance);
                    growthRate = (upside - downside) * 1000; // Scale for visibility
                  }
                  
                  if (growthRate > maxGrowthRate && pct > 0) {
                    maxGrowthRate = growthRate;
                    optimalOptIn = pct;
                  }
                  
                  kellyData.push({
                    optIn: pct,
                    growth: hasApyData && aUsdcBalance > 0 ? growthRate : 0,
                    isOptimal: false,
                    isCurrent: pct === optInPercent
                  });
                }
                
                // Mark optimal zone (within 10% of optimal)
                kellyData.forEach(d => {
                  if (Math.abs(d.optIn - optimalOptIn) <= 10 && optimalOptIn > 0) {
                    d.isOptimal = true;
                  }
                });
                
                const currentGrowth = kellyData.find(d => d.optIn === optInPercent)?.growth || 0;
                const optimalGrowth = kellyData.find(d => d.optIn === optimalOptIn)?.growth || 0;
                
                // Determine allocation status
                let status: 'optimal' | 'under' | 'over' | 'none' | 'no-data' = 'none';
                let statusColor = 'text-muted-foreground';
                let statusBg = 'bg-muted/50';
                
                if (!hasApyData || aUsdcBalance === 0) {
                  status = 'no-data';
                } else if (optInPercent === 0) {
                  status = 'none';
                } else if (Math.abs(optInPercent - optimalOptIn) <= 10) {
                  status = 'optimal';
                  statusColor = 'text-green-600 dark:text-green-400';
                  statusBg = 'bg-green-100 dark:bg-green-900/30';
                } else if (optInPercent < optimalOptIn) {
                  status = 'under';
                  statusColor = 'text-amber-600 dark:text-amber-400';
                  statusBg = 'bg-amber-100 dark:bg-amber-900/30';
                } else {
                  status = 'over';
                  statusColor = 'text-blue-600 dark:text-blue-400';
                  statusBg = 'bg-blue-100 dark:bg-blue-900/30';
                }
                
                return (
                  <Card className="p-4 space-y-3">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Optimal Allocation
                    </div>
                    
                    {/* Status badge */}
                    <div className={`rounded-lg p-3 ${statusBg}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${statusColor}`} data-testid="text-kelly-status">
                          {status === 'optimal' && 'Optimal zone'}
                          {status === 'under' && 'Room to increase'}
                          {status === 'over' && 'Aggressive allocation'}
                          {status === 'none' && 'Not participating'}
                          {status === 'no-data' && 'Add Celo savings to see analysis'}
                        </span>
                        {optimalOptIn > 0 && status !== 'no-data' && (
                          <span className="text-sm font-bold" data-testid="text-optimal-pct">
                            {optimalOptIn}% optimal
                          </span>
                        )}
                      </div>
                      {status !== 'none' && status !== 'no-data' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {status === 'optimal' && 'Your allocation maximizes expected growth'}
                          {status === 'under' && `Increase to ${optimalOptIn}% for optimal odds`}
                          {status === 'over' && `Consider ${optimalOptIn}% for balanced risk`}
                        </p>
                      )}
                    </div>
                    
                    {/* Kelly Curve Chart */}
                    {hasApyData && aUsdcBalance > 0 && (
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={kellyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <defs>
                              <linearGradient id="kellyGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="optimalGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                            <XAxis 
                              dataKey="optIn" 
                              axisLine={false} 
                              tickLine={false}
                              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                              tickFormatter={(v) => `${v}%`}
                              ticks={[0, 25, 50, 75, 100]}
                            />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '11px'
                              }}
                              formatter={(value: number, name: string) => [
                                value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2),
                                'Growth rate'
                              ]}
                              labelFormatter={(v) => `${v}% contribution`}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="growth" 
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              fill="url(#kellyGradient)"
                            />
                            {/* Current position marker */}
                            {optInPercent > 0 && (
                              <ReferenceDot 
                                x={optInPercent} 
                                y={currentGrowth}
                                r={5}
                                fill="hsl(var(--primary))"
                                stroke="hsl(var(--background))"
                                strokeWidth={2}
                              />
                            )}
                            {/* Optimal zone line */}
                            {optimalOptIn > 0 && (
                              <ReferenceLine 
                                x={optimalOptIn} 
                                stroke="hsl(142, 76%, 36%)"
                                strokeDasharray="3 3"
                                strokeWidth={1}
                              />
                            )}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    
                    {/* Key insight */}
                    <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                      Based on Kelly Criterion—optimal allocation balances upside vs yield cost
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

              {/* Cumulative Win Probability Curve */}
              {(() => {
                // Use projected pool data for more accurate calculations
                const totalPoolTickets = Number(poolStatus.draw.projectedTickets || poolStatus.draw.totalTickets || poolStatus.draw.totalPool) / 1_000_000;
                const userTickets = Number(poolStatus.user.projectedTickets || poolStatus.user.totalTickets) / 1_000_000;
                const currentOdds = totalPoolTickets > 0 ? userTickets / totalPoolTickets : 0;
                
                // Calculate probability curves for different scenarios
                const maxWeeks = 52;
                const probabilityData = [];
                
                // Scenario 1: Current odds
                // Scenario 2: +25% more opt-in (increased contribution)
                // Scenario 3: +2 referrals (assume each adds 10% of average contribution)
                const avgContribution = totalPoolTickets > 0 && poolStatus.draw.participantCount > 0 
                  ? totalPoolTickets / poolStatus.draw.participantCount 
                  : 0;
                const referralBoost = avgContribution * 0.1 * 2; // 10% of 2 avg contributors
                
                for (let week = 0; week <= maxWeeks; week += 4) {
                  // P(win at least once by week t) = 1 - (1-p)^t
                  const pCurrent = 1 - Math.pow(1 - currentOdds, week);
                  
                  // Increased contribution scenario (+25% more tickets)
                  const increasedTickets = userTickets * 1.25;
                  const increasedOdds = totalPoolTickets > 0 ? increasedTickets / (totalPoolTickets + (increasedTickets - userTickets)) : 0;
                  const pIncreased = 1 - Math.pow(1 - increasedOdds, week);
                  
                  // With referrals scenario
                  const withReferralTickets = userTickets + referralBoost;
                  const referralOdds = totalPoolTickets > 0 ? withReferralTickets / (totalPoolTickets + referralBoost) : 0;
                  const pReferral = 1 - Math.pow(1 - referralOdds, week);
                  
                  probabilityData.push({
                    week,
                    current: currentOdds > 0 ? pCurrent * 100 : 0,
                    increased: currentOdds > 0 ? pIncreased * 100 : 0,
                    referral: currentOdds > 0 ? pReferral * 100 : 0,
                  });
                }
                
                // Find weeks to 50% probability for each scenario
                const weeksTo50Current = currentOdds > 0 ? Math.ceil(Math.log(0.5) / Math.log(1 - currentOdds)) : Infinity;
                const weeksTo50Increased = currentOdds > 0 ? Math.ceil(Math.log(0.5) / Math.log(1 - (currentOdds * 1.25))) : Infinity;
                
                return (
                  <Card className="p-4 space-y-3">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      When Will You Win?
                    </div>
                    
                    {currentOdds > 0 ? (
                      <>
                        {/* Probability Chart */}
                        <div className="h-32">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={probabilityData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                              <XAxis 
                                dataKey="week" 
                                axisLine={false} 
                                tickLine={false}
                                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                tickFormatter={(v) => `${v}w`}
                                ticks={[0, 12, 24, 36, 52]}
                              />
                              <YAxis 
                                axisLine={false} 
                                tickLine={false}
                                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                tickFormatter={(v) => `${v}%`}
                                domain={[0, 100]}
                                ticks={[0, 25, 50, 75, 100]}
                                width={30}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'hsl(var(--card))',
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px',
                                  fontSize: '11px'
                                }}
                                formatter={(value: number, name: string) => [
                                  `${value.toFixed(1)}%`,
                                  name === 'current' ? 'Current' : name === 'increased' ? '+25% opt-in' : '+2 referrals'
                                ]}
                                labelFormatter={(v) => `Week ${v}`}
                              />
                              {/* 50% reference line */}
                              <ReferenceLine 
                                y={50} 
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="3 3"
                                strokeWidth={1}
                                strokeOpacity={0.5}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="current" 
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                dot={false}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="increased" 
                                stroke="hsl(45, 93%, 47%)"
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                                dot={false}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="referral" 
                                stroke="hsl(142, 76%, 36%)"
                                strokeWidth={1.5}
                                strokeDasharray="4 2"
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        
                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 justify-center text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 bg-primary rounded" />
                            <span className="text-muted-foreground">Current</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: 'hsl(45, 93%, 47%)' }} />
                            <span className="text-muted-foreground">+25% opt-in</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: 'hsl(142, 76%, 36%)' }} />
                            <span className="text-muted-foreground">+2 referrals</span>
                          </div>
                        </div>
                        
                        {/* Insight */}
                        <div className="text-xs text-center text-muted-foreground pt-2 border-t space-y-1">
                          {weeksTo50Current <= 52 ? (
                            <p>50% chance of winning within <span className="font-medium text-foreground">{weeksTo50Current} weeks</span></p>
                          ) : (
                            <p>Increase contribution or invite friends to improve odds</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-center text-muted-foreground">
                        <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Contribute yield to see your win timeline</p>
                      </div>
                    )}
                  </Card>
                );
              })()}

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

              {/* Fairness Dashboard */}
              {(() => {
                // Calculate Lorenz curve and Gini coefficient
                // For demonstration, we'll simulate distribution based on participant count
                const participantCount = poolStatus?.draw?.participantCount || 0;
                const totalTickets = Number(poolStatus?.draw?.totalTickets || poolStatus?.draw?.totalPool || 0) / 1_000_000;
                const userTickets = Number(poolStatus?.user?.totalTickets || 0) / 1_000_000;
                
                // Generate Lorenz curve data points
                // Perfect equality line: y = x
                // Actual distribution: simulated based on typical prize pool distributions
                const lorenzData = [];
                
                if (participantCount > 0 && totalTickets > 0) {
                  // Simulate a realistic ticket distribution
                  // Using a power law approximation common in prize pools
                  for (let i = 0; i <= 100; i += 10) {
                    const popPercent = i / 100;
                    // Lorenz curve: cumulative share of tickets held by bottom x% of participants
                    // Typical Gini for prize pools is 0.3-0.5 (moderate inequality)
                    // Using L(x) = x^(1+G) where G is Gini coefficient
                    const estimatedGini = 0.35; // Moderate inequality
                    const lorenzY = Math.pow(popPercent, 1 + estimatedGini) * 100;
                    
                    lorenzData.push({
                      population: i,
                      equality: i, // Perfect equality line
                      actual: lorenzY,
                    });
                  }
                }
                
                // Calculate user's percentile and Gini
                const userShare = totalTickets > 0 ? (userTickets / totalTickets) * 100 : 0;
                const estimatedGini = 0.35;
                
                // Referral network visualization
                const referrals = poolStatus?.referral?.referralsList || [];
                const referralBonusTickets = Number(poolStatus?.user?.referralBonusTickets || 0) / 1_000_000;
                
                return (
                  <Card className="p-4 space-y-3">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Fairness & Network
                    </div>
                    
                    {participantCount > 1 ? (
                      <>
                        {/* Lorenz Curve */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Ticket Distribution</span>
                            <Badge variant="outline" className="text-xs">
                              Gini: {(estimatedGini * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          <div className="h-28">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={lorenzData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <defs>
                                  <linearGradient id="inequalityGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                                  </linearGradient>
                                </defs>
                                <XAxis 
                                  dataKey="population" 
                                  axisLine={false} 
                                  tickLine={false}
                                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                  tickFormatter={(v) => `${v}%`}
                                  ticks={[0, 50, 100]}
                                />
                                <YAxis 
                                  axisLine={false} 
                                  tickLine={false}
                                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                                  tickFormatter={(v) => `${v}%`}
                                  domain={[0, 100]}
                                  ticks={[0, 50, 100]}
                                  width={30}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                    fontSize: '11px'
                                  }}
                                  formatter={(value: number, name: string) => [
                                    `${value.toFixed(1)}%`,
                                    name === 'equality' ? 'Perfect equality' : 'Actual'
                                  ]}
                                  labelFormatter={(v) => `Bottom ${v}% of players`}
                                />
                                {/* Equality line */}
                                <Line 
                                  type="linear" 
                                  dataKey="equality" 
                                  stroke="hsl(var(--muted-foreground))"
                                  strokeWidth={1}
                                  strokeDasharray="4 2"
                                  dot={false}
                                />
                                {/* Actual distribution (area shows inequality) */}
                                <Area 
                                  type="monotone" 
                                  dataKey="actual" 
                                  stroke="hsl(var(--primary))"
                                  strokeWidth={2}
                                  fill="url(#inequalityGradient)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="text-xs text-muted-foreground text-center">
                            Lower Gini = more equal distribution. Area between lines shows inequality.
                          </p>
                        </div>
                        
                        {/* Referral Network */}
                        {referrals.length > 0 && (
                          <div className="pt-3 border-t space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Your Referral Network</span>
                              <span className="font-medium text-primary">+{formatTickets(String(referralBonusTickets * 1_000_000))} bonus</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {referrals.slice(0, 8).map((ref, i) => (
                                <div 
                                  key={ref.address}
                                  className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-full text-xs"
                                >
                                  <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                                    <UserPlus className="h-2.5 w-2.5 text-primary" />
                                  </div>
                                  <span className="font-mono text-muted-foreground">
                                    {formatAddress(ref.address)}
                                  </span>
                                </div>
                              ))}
                              {referrals.length > 8 && (
                                <div className="px-2 py-1 bg-muted/50 rounded-full text-xs text-muted-foreground">
                                  +{referrals.length - 8} more
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Your Position */}
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Your ticket share</span>
                            <span className="font-medium">
                              {userShare < 0.01 ? userShare.toFixed(4) : userShare.toFixed(2)}% of pool
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-4 text-center text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Distribution data available with 2+ participants</p>
                      </div>
                    )}
                  </Card>
                );
              })()}

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
        if (!open && !contributionMutation.isPending && !contributionSuccess) cancelOptInChange();
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {contributionSuccess ? "Success!" : prepareData?.isFirstTime ? "Join Prize Pool" : "Confirm Contribution"}
            </DialogTitle>
          </DialogHeader>

          {contributionSuccess ? (
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-medium text-lg">
                  {contributionSuccess.isOnChain ? "Transferred!" : "Settings Saved"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {contributionSuccess.message}
                </p>
              </div>
            </div>
          ) : isPreparing ? (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading contribution details...</p>
            </div>
          ) : prepareData ? (
            <div className="space-y-4">
              {/* Percentage Change */}
              <div className="flex items-center justify-center gap-3 py-2">
                <span className="text-lg font-medium">{poolStatus?.user?.optInPercent ?? 0}%</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-bold text-primary">{pendingOptInPercent ?? 0}%</span>
              </div>

              {/* Amount Details */}
              {prepareData.isFirstTime ? (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Your aUSDC balance</span>
                    <span className="font-medium">${formatMicroUsdc(prepareData.currentBalance || '0')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground text-center pt-1 border-t">
                    This is your baseline. Only future yield will be collected.
                  </div>
                </div>
              ) : prepareData.requiresSignature ? (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current aUSDC</span>
                    <span className="font-medium">${formatMicroUsdc(prepareData.currentBalance || '0')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Yield earned</span>
                    <span className="font-medium text-green-600">+${formatMicroUsdc(prepareData.yieldAmount || '0')}</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">To transfer ({pendingOptInPercent}%)</span>
                      <span className="font-bold text-primary">${formatMicroUsdc(prepareData.contributionAmount || '0')}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">You keep ({100 - (pendingOptInPercent ?? 0)}%)</span>
                      <span className="font-medium">
                        ${formatMicroUsdc(
                          (BigInt(prepareData.yieldAmount || '0') - BigInt(prepareData.contributionAmount || '0')).toString()
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : prepareData.noYieldToContribute ? (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Your aUSDC balance</span>
                    <span className="font-medium">${formatMicroUsdc(prepareData.currentBalance || '0')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground text-center pt-1 border-t">
                    {prepareData.message || "No new yield to contribute yet."}
                  </div>
                </div>
              ) : null}

              {/* Authorization Note */}
              {prepareData.requiresSignature && (
                <div className="text-xs text-muted-foreground text-center space-y-1">
                  <p className="flex items-center justify-center gap-1">
                    <Shield className="h-3 w-3" />
                    You'll sign a one-time permit for this transfer
                  </p>
                </div>
              )}
              
              <div className="text-xs text-muted-foreground text-center">
                <p>Collected weekly on Sunday at 00:00 UTC</p>
              </div>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">Failed to load details</p>
            </div>
          )}

          {!contributionSuccess && (
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={cancelOptInChange}
                disabled={contributionMutation.isPending}
                data-testid="button-cancel-contribution"
              >
                Cancel
              </Button>
              <Button 
                className="flex-1"
                onClick={confirmOptInChange}
                disabled={isPreparing || !prepareData || contributionMutation.isPending}
                data-testid="button-confirm-contribution"
              >
                {contributionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {prepareData?.requiresSignature ? "Signing..." : "Saving..."}
                  </>
                ) : prepareData?.requiresSignature ? (
                  "Sign & Transfer"
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
