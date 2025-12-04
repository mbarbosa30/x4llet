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
import { getWallet } from "@/lib/wallet";
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
  Loader2
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

export default function Pool() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [optInPercent, setOptInPercent] = useState<number>(0);
  const [isSavingOptIn, setIsSavingOptIn] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [showReferralDialog, setShowReferralDialog] = useState(false);
  const [showContributionDialog, setShowContributionDialog] = useState(false);
  const [pendingOptInPercent, setPendingOptInPercent] = useState<number | null>(null);

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

  // Set initial opt-in from server
  useEffect(() => {
    if (poolStatus?.user?.optInPercent !== undefined) {
      setOptInPercent(poolStatus.user.optInPercent);
    }
  }, [poolStatus]);

  const optInMutation = useMutation({
    mutationFn: async (percent: number) => {
      const result = await apiRequest("POST", "/api/pool/opt-in", { address, optInPercent: percent });
      if (percent > 0) {
        await apiRequest("POST", "/api/pool/init-snapshot", { address });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pool/status", address] });
      toast({
        title: "Saved",
        description: optInPercent > 0 
          ? `Contributing ${optInPercent}% of your Celo yield to the pool`
          : "Pool contribution disabled",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save",
        description: "Please try again",
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

  const handleOptInCommit = () => {
    const currentOptIn = poolStatus?.user?.optInPercent ?? 0;
    if (optInPercent !== currentOptIn) {
      setPendingOptInPercent(optInPercent);
      setShowContributionDialog(true);
    }
  };

  const confirmOptInChange = () => {
    if (pendingOptInPercent !== null) {
      optInMutation.mutate(pendingOptInPercent);
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
                <div className="text-center py-2">
                  <p className="text-4xl font-bold text-primary" data-testid="text-prize-amount">
                    ${poolStatus.draw.totalPoolFormatted}
                  </p>
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
                      {(Number(poolStatus.user.totalTickets) / 1_000_000).toFixed(2)}
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
                  onValueCommit={handleOptInCommit}
                  max={100}
                  step={5}
                  className="w-full"
                  data-testid="slider-opt-in"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Keep all yield</span>
                  <span>Max tickets</span>
                </div>
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Info className="h-3 w-3" />
                  Higher contribution = more tickets = better odds
                </p>
              </Card>

              {/* Info Card */}
              <Card className="p-3 border-dashed">
                <p className="text-xs text-muted-foreground text-center">
                  Celo aUSDC yield only - your principal stays safe in Aave
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
                      {poolStatus.user.yieldContributedFormatted}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Referral bonus</span>
                    </div>
                    <span className="font-medium" data-testid="text-referral-tickets">
                      +{(Number(poolStatus.user.referralBonusTickets) / 1_000_000).toFixed(4)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="font-medium">Total</span>
                  <span className="text-xl font-bold text-primary" data-testid="text-total-tickets">
                    {(Number(poolStatus.user.totalTickets) / 1_000_000).toFixed(2)}
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
              {historyData?.draws && historyData.draws.length > 1 && (
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
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Prize']}
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
                            ${draw.totalPoolFormatted}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Confirm Contribution
            </DialogTitle>
            <DialogDescription>
              You're changing your yield contribution on Celo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Current</p>
                <p className="text-lg font-bold">{poolStatus?.user?.optInPercent ?? 0}%</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-1 text-right">
                <p className="text-sm text-muted-foreground">New</p>
                <p className="text-lg font-bold text-primary">{pendingOptInPercent ?? 0}%</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <Coins className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  {pendingOptInPercent === 0 
                    ? "You'll keep 100% of your Celo aUSDC yield" 
                    : `${pendingOptInPercent}% of your Celo aUSDC yield will enter the weekly prize pool`}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>Your principal savings in Aave remain untouched</p>
              </div>
            </div>

            <Badge variant="secondary" className="w-full justify-center py-2">
              Celo Chain Only
            </Badge>
          </div>

          <div className="flex gap-3">
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
              disabled={optInMutation.isPending}
              data-testid="button-confirm-contribution"
            >
              {optInMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
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
