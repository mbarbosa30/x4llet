import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Info, 
  Copy, 
  Check, 
  ChevronRight, 
  Sparkles,
  Coins,
  Target,
  History
} from "lucide-react";

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
      return apiRequest("POST", "/api/pool/opt-in", { address, optInPercent: percent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pool/status", address] });
      toast({
        title: "Saved",
        description: `Contributing ${optInPercent}% of yield to the pool`,
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
    setIsSavingOptIn(true);
  };

  const handleOptInCommit = () => {
    if (isSavingOptIn) {
      optInMutation.mutate(optInPercent);
      setIsSavingOptIn(false);
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
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Prize Pool
            </CardTitle>
            <CardDescription>
              Connect your wallet to participate in the weekly prize pool
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setLocation("/unlock")} data-testid="button-connect-wallet">
              Connect Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 space-y-4 max-w-md mx-auto">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Prize Pool</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Contribute yield for a chance to win the weekly prize
          </p>
        </div>

        {isLoadingStatus ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : poolStatus ? (
          <Tabs defaultValue="pool" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pool" data-testid="tab-pool">
                <Trophy className="h-4 w-4 mr-1" />
                Pool
              </TabsTrigger>
              <TabsTrigger value="tickets" data-testid="tab-tickets">
                <Ticket className="h-4 w-4 mr-1" />
                Tickets
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                <History className="h-4 w-4 mr-1" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Pool Tab */}
            <TabsContent value="pool" className="space-y-4">
              {/* Prize Pool Card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">This Week's Prize</p>
                      <p className="text-4xl font-bold text-primary" data-testid="text-prize-amount">
                        ${poolStatus.draw.totalPoolFormatted}
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span data-testid="text-participant-count">
                          {poolStatus.draw.participantCount} players
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span data-testid="text-countdown">
                          {formatCountdown(
                            poolStatus.countdown.hoursUntilDraw,
                            poolStatus.countdown.minutesUntilDraw
                          )}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Week {poolStatus.draw.weekNumber}, {poolStatus.draw.year}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Your Position */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Your Position
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold" data-testid="text-your-tickets">
                        {(Number(poolStatus.user.totalTickets) / 1_000_000).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">Your Tickets</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold text-primary" data-testid="text-your-odds">
                        {poolStatus.user.odds}%
                      </p>
                      <p className="text-xs text-muted-foreground">Win Chance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Opt-In Settings */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    Yield Contribution
                  </CardTitle>
                  <CardDescription>
                    Choose how much of your Aave savings yield to contribute
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Contribution</span>
                      <span className="text-lg font-bold" data-testid="text-opt-in-percent">
                        {optInPercent}%
                      </span>
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
                      <span>0% (Keep all yield)</span>
                      <span>100% (Max tickets)</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      The yield you contribute becomes tickets. More tickets = higher odds of winning.
                      You keep {100 - optInPercent}% of your savings yield.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tickets Tab */}
            <TabsContent value="tickets" className="space-y-4">
              {/* Ticket Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Ticket className="h-4 w-4" />
                    Ticket Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm">From your yield</span>
                      </div>
                      <span className="font-medium" data-testid="text-yield-tickets">
                        {poolStatus.user.yieldContributedFormatted}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-purple-500" />
                        <span className="text-sm">Referral bonus</span>
                      </div>
                      <span className="font-medium" data-testid="text-referral-tickets">
                        {(Number(poolStatus.user.referralBonusTickets) / 1_000_000).toFixed(4)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between font-medium">
                    <span>Total Tickets</span>
                    <span className="text-lg text-primary" data-testid="text-total-tickets">
                      {(Number(poolStatus.user.totalTickets) / 1_000_000).toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Referral System */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Invite Friends
                  </CardTitle>
                  <CardDescription>
                    Earn 10% bonus tickets from your referrals' contributions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm">
                      {poolStatus.referral.code}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyReferralCode}
                      data-testid="button-copy-referral"
                    >
                      {copiedCode ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Active Referrals</span>
                    <Badge variant="secondary" data-testid="badge-referral-count">
                      {poolStatus.referral.activeReferrals}
                    </Badge>
                  </div>

                  {poolStatus.referral.referralsList.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Your referrals</Label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {poolStatus.referral.referralsList.map((ref) => (
                          <div
                            key={ref.address}
                            className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded"
                          >
                            <span className="font-mono">{formatAddress(ref.address)}</span>
                            <span className="text-muted-foreground">
                              {new Date(ref.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Have a referral code? */}
              <Card>
                <CardContent className="pt-4">
                  <Dialog open={showReferralDialog} onOpenChange={setShowReferralDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full" data-testid="button-enter-referral">
                        Have a referral code?
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Enter Referral Code</DialogTitle>
                        <DialogDescription>
                          Enter a friend's referral code to give them bonus tickets
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <Input
                          placeholder="Enter code (e.g., A1B2C3D4)"
                          value={referralInput}
                          onChange={(e) => setReferralInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                          className="font-mono text-center text-lg"
                          maxLength={8}
                          data-testid="input-referral-code"
                        />
                        {referralInput && referralInput.length < 8 && (
                          <p className="text-xs text-muted-foreground text-center">
                            Code should be 8 characters
                          </p>
                        )}
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Past Winners
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingHistory ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-full" />
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
                              Week {draw.weekNumber}, {draw.year}
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
                              <p className="text-xs text-muted-foreground">
                                {formatAddress(draw.winnerAddress)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No completed draws yet</p>
                      <p className="text-xs mt-1">The first draw happens at the end of this week</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* How it works */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    How It Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                      1
                    </div>
                    <div>
                      <p className="text-sm font-medium">Deposit to Aave</p>
                      <p className="text-xs text-muted-foreground">
                        Your USDC earns yield in Aave savings
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                      2
                    </div>
                    <div>
                      <p className="text-sm font-medium">Choose your contribution</p>
                      <p className="text-xs text-muted-foreground">
                        Opt-in 0-100% of yield to the prize pool
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                      3
                    </div>
                    <div>
                      <p className="text-sm font-medium">Win the weekly draw</p>
                      <p className="text-xs text-muted-foreground">
                        More tickets = higher odds. Winner takes all!
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>Failed to load pool data</p>
              <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
