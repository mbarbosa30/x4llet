import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Scan, Shield, Loader2, Sparkles, Clock, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getWallet, getPrivateKey } from '@/lib/wallet';
import { getMaxFlowScore, getVouchNonce, submitVouch, type MaxFlowScore } from '@/lib/maxflow';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import QRScanner from '@/components/QRScanner';
import { apiRequest } from '@/lib/queryClient';

interface XpData {
  totalXp: number;
  claimCount: number;
  lastClaimTime: string | null;
  canClaim: boolean;
  nextClaimTime: string | null;
  timeUntilNextClaim: number | null;
}

function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function MaxFlow() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [address, setAddress] = useState<string | null>(null);
  const [showVouchInput, setShowVouchInput] = useState(false);
  const [vouchAddress, setVouchAddress] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const wallet = await getWallet();
        if (!wallet) {
          setLocation('/');
          return;
        }
        setAddress(wallet.address);
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

  const { data: scoreData, isLoading: isLoadingMaxFlow } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours - score rarely changes
  });

  const { data: xpData, isLoading: isLoadingXp } = useQuery<XpData>({
    queryKey: ['/api/xp', address],
    enabled: !!address,
  });

  useEffect(() => {
    if (xpData?.timeUntilNextClaim && xpData.timeUntilNextClaim > 0) {
      setTimeRemaining(xpData.timeUntilNextClaim);
      const interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 1000) {
            clearInterval(interval);
            queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
            return 0;
          }
          return prev - 1000;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(null);
    }
  }, [xpData?.timeUntilNextClaim, address, queryClient]);

  const claimXpMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/xp/claim', { address });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: "XP Claimed!",
        description: `You earned ${data.xpEarned} XP from your MaxFlow signal`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
    },
    onError: (error) => {
      toast({
        title: "Claim Failed",
        description: error instanceof Error ? error.message : "Failed to claim XP",
        variant: "destructive",
      });
    },
  });

  const vouchMutation = useMutation({
    mutationFn: async (endorsedAddress: string) => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      const validatedEndorser = getAddress(address);
      const validatedEndorsed = getAddress(endorsedAddress);
      
      // Get epoch and nonce (combined endpoint in v1 API)
      const { epoch, nonce } = await getVouchNonce(validatedEndorser.toLowerCase());
      
      const chainId = 42220;
      
      const domain = {
        name: 'MaxFlow',
        version: '1',
        chainId: chainId,
      };

      const types = {
        Endorsement: [
          { name: 'endorser', type: 'address' },
          { name: 'endorsee', type: 'address' },
          { name: 'epoch', type: 'uint64' },
          { name: 'nonce', type: 'uint64' },
        ],
      };

      const message = {
        endorser: validatedEndorser.toLowerCase(),
        endorsee: validatedEndorsed.toLowerCase(),
        epoch: BigInt(epoch),
        nonce: BigInt(nonce),
      };

      const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'Endorsement',
        message,
      });

      // Submit vouch with flat structure (v1 API)
      return submitVouch({
        endorser: message.endorser,
        endorsee: message.endorsee,
        epoch: epoch.toString(),
        nonce: nonce.toString(),
        sig: signature,
        chainId: chainId,
      });
    },
    onSuccess: () => {
      toast({ 
        title: "Vouch submitted",
        description: `You vouched for ${vouchAddress.slice(0, 6)}...${vouchAddress.slice(-4)}`,
      });
      setVouchAddress('');
      setShowVouchInput(false);
      queryClient.invalidateQueries({ queryKey: ['/maxflow/score', address] });
    },
    onError: (error) => {
      toast({
        title: "Vouch Failed",
        description: error instanceof Error ? error.message : "Failed to submit vouch",
        variant: "destructive",
      });
    },
  });

  const handleVouch = () => {
    if (!vouchAddress) return;
    vouchMutation.mutate(vouchAddress);
  };

  const handleScan = (data: string) => {
    if (/^0x[a-fA-F0-9]{40}$/.test(data.trim())) {
      const scannedAddress = data.trim();
      setShowScanner(false);
      setVouchAddress(scannedAddress);
      setShowVouchInput(true);
    } else {
      toast({
        title: "Invalid QR Code",
        description: "Please scan a valid wallet address",
        variant: "destructive",
      });
    }
  };

  const score = scoreData?.local_health ?? 0;
  const vouchCount = scoreData?.vouch_counts?.incoming_active ?? 0;

  if (!address) {
    return (
      <div 
        className="min-h-screen bg-background flex items-center justify-center"
        style={{ 
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
        }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      <main className="max-w-md mx-auto p-4 space-y-4">
        {!isLoadingMaxFlow && score > 0 && (
          <Card className="p-6 space-y-6 border-foreground">
            <div className="flex items-center gap-3">
              <Sparkles className="h-10 w-10 text-amber-500 shrink-0" />
              <div>
                <h2 className="text-xl text-section">Experience</h2>
                <span className="font-label text-muted-foreground">// XP_REWARDS</span>
              </div>
            </div>

            <div className="text-center py-2">
              {isLoadingXp ? (
                <p className="font-mono text-5xl font-bold">--</p>
              ) : (
                <p className="font-mono text-5xl font-bold tabular-nums" data-testid="text-xp-balance">
                  {(xpData?.totalXp ?? 0).toFixed(2)}
                </p>
              )}
              <span className="text-sm text-muted-foreground">total XP earned</span>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Claim daily XP based on your trust signal. More signal = exponentially more XP.
            </p>

            {!isLoadingXp && xpData && (
              <div className="space-y-3">
                {xpData.canClaim ? (
                  <Button
                    onClick={() => claimXpMutation.mutate()}
                    disabled={claimXpMutation.isPending}
                    className="w-full"
                    data-testid="button-claim-xp"
                  >
                    {claimXpMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        CLAIMING...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        CLAIM {((score * score) / 100).toFixed(2)} XP
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted border border-foreground/10">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm text-muted-foreground" data-testid="text-xp-cooldown">
                      {timeRemaining !== null ? formatTimeRemaining(timeRemaining) : '--'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        <Card className="p-6 space-y-6 border-foreground">
          {!isLoadingMaxFlow && score === 0 ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Shield className="h-10 w-10 text-[#0055FF] shrink-0" />
                <div>
                  <h2 className="text-xl text-section">Trust Graph</h2>
                  <span className="font-label text-muted-foreground">// MAXFLOW</span>
                </div>
              </div>

              <div className="text-center py-4">
                <p className="font-mono text-5xl font-bold">0</p>
                <span className="text-sm text-muted-foreground">network signal</span>
              </div>

              <div className="space-y-2 text-center">
                <p className="text-sm text-muted-foreground">
                  MaxFlow measures your trust network health through a sybil-resistant graph signal.
                </p>
                <p className="text-sm text-muted-foreground">
                  Build your signal by getting vouched to unlock XP claiming based on your score.
                </p>
                <p className="text-xs text-muted-foreground/70 italic">
                  More details on XP utility and benefits coming soon.
                </p>
              </div>

              <p className="text-sm text-muted-foreground text-center" data-testid="text-user-address">
                Share <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span> to get vouched
              </p>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div>
                <h2 className="text-sm text-muted-foreground mb-2">Your MaxFlow Signal</h2>
                {isLoadingMaxFlow ? (
                  <div className="text-4xl font-bold text-foreground tracking-tight">--</div>
                ) : (
                  <div className="text-5xl font-bold tabular-nums text-foreground tracking-tight" data-testid="text-score">
                    {Math.round(score)}
                  </div>
                )}
              </div>
              
              <div className="flex justify-center gap-2">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 w-2 rounded-full ${
                      i < Math.round(score / 10) ? 'bg-[#0055FF]' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>

              {!isLoadingMaxFlow && (scoreData?.algorithm_breakdown || scoreData?.vouch_counts) && (
                <Collapsible className="pt-4 border-t">
                  <CollapsibleTrigger className="flex items-center justify-center gap-2 w-full text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors" data-testid="button-toggle-metrics">
                    <span>Network Details</span>
                    <ChevronDown className="h-3 w-3" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-3">
                    {scoreData?.algorithm_breakdown && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-2 text-sm">
                          <div className="flex justify-between items-center" data-testid="metric-flow">
                            <span className="text-muted-foreground">Flow Component</span>
                            <span className="font-mono font-medium">{(scoreData.algorithm_breakdown.flow_component ?? 0).toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between items-center" data-testid="metric-redundancy">
                            <span className="text-muted-foreground">Redundancy Component</span>
                            <span className="font-mono font-medium">{(scoreData.algorithm_breakdown.redundancy_component ?? 0).toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between items-center" data-testid="metric-paths">
                            <span className="text-muted-foreground">Disjoint Paths</span>
                            <span className="font-mono font-medium">{scoreData.algorithm_breakdown.vertex_disjoint_paths}</span>
                          </div>
                          <div className="flex justify-between items-center" data-testid="metric-network-size">
                            <span className="text-muted-foreground">Network Size</span>
                            <span className="font-mono font-medium">{scoreData.algorithm_breakdown.ego_network_size}</span>
                          </div>
                          <div className="flex justify-between items-center" data-testid="metric-effective-redundancy">
                            <span className="text-muted-foreground">Effective Redundancy</span>
                            <span className="font-mono font-medium">{(scoreData.algorithm_breakdown.effective_redundancy ?? 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center" data-testid="metric-edge-density">
                            <span className="text-muted-foreground">Edge Density</span>
                            <span className="font-mono font-medium">{(scoreData.algorithm_breakdown.edge_density ?? 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {scoreData?.vouch_counts && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="text-center">
                            <div className="font-mono font-medium" data-testid="text-vouches-received">{scoreData.vouch_counts.incoming_active}</div>
                            <div className="text-xs text-muted-foreground">Active Vouches</div>
                          </div>
                          <div className="text-center">
                            <div className="font-mono font-medium" data-testid="text-vouches-given">{scoreData.vouch_counts.outgoing_total}</div>
                            <div className="text-xs text-muted-foreground">Vouches Given</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {!showVouchInput && (
            <Button
              onClick={() => setShowVouchInput(true)}
              className="w-full"
              size="lg"
              data-testid="button-vouch"
            >
              Vouch for Someone
            </Button>
          )}

          {showVouchInput && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vouch-address">Address to Vouch</Label>
                <div className="flex gap-2">
                  <Input
                    id="vouch-address"
                    placeholder="0x..."
                    value={vouchAddress}
                    onChange={(e) => setVouchAddress(e.target.value)}
                    className="font-mono text-sm flex-1"
                    data-testid="input-vouch-address"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowScanner(true)}
                    data-testid="button-scan-vouch"
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowVouchInput(false);
                    setVouchAddress('');
                  }}
                  className="flex-1"
                  data-testid="button-cancel-vouch"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleVouch}
                  disabled={!vouchAddress || vouchMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-vouch"
                >
                  {vouchMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : 'Submit Vouch'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {!isLoadingMaxFlow && score === 0 && (
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <span className="font-medium">XP Balance</span>
              </div>
              <div className="text-right">
                {isLoadingXp ? (
                  <span className="text-2xl font-bold tabular-nums">--</span>
                ) : (
                  <span className="text-2xl font-bold tabular-nums" data-testid="text-xp-balance">
                    {xpData?.totalXp ?? 0}
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Claim Experience Points to access new features and benefit from special opportunities.
            </p>

            {!isLoadingXp && xpData && (
              <>
                <p className="text-sm text-muted-foreground text-center" data-testid="text-xp-no-signal">
                  Get vouched to earn XP from your signal
                </p>
                
                {xpData.claimCount > 0 && (
                  <p className="text-xs text-muted-foreground text-center" data-testid="text-xp-claim-count">
                    {xpData.claimCount} claim{xpData.claimCount !== 1 ? 's' : ''} total
                  </p>
                )}
              </>
            )}
          </Card>
        )}

        <div className="pt-6 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <a 
              href="https://maxflow.one" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#0055FF] hover:underline"
            >
              MaxFlow.one
            </a>{' '}
            is a neutral reputation infrastructure that converts public binary endorsements ("vouches") into verifiable graph signals using max-flow/min-cut algorithms and recursive trust weighting. It computes mathematical signals that applications interpret according to their own policies—for creditworthiness, governance weight, access control, or grant allocation.
          </p>
          <a 
            href="https://maxflow.one/whitepaper" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block text-xs text-[#0055FF] hover:underline font-medium"
            data-testid="link-whitepaper"
          >
            Read the Whitepaper →
          </a>
        </div>
      </main>
    </div>
  );
}
