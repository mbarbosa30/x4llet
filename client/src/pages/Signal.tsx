import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Scan, Shield, CircleDot, Loader2, ExternalLink, UserPlus, Coins, Heart, HeartOff, Send, RefreshCw, Gift, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { getWallet, getPrivateKey } from '@/lib/wallet';
import { getMaxFlowScore, getCurrentEpoch, getNextNonce, submitVouch } from '@/lib/maxflow';
import { 
  getCirclesAvatar, 
  getCirclesBalance, 
  getCirclesExplorerUrl, 
  registerHuman,
  mintPersonalCRC,
  trustAddress,
  untrustAddress,
  sendCRC,
  checkTrust,
  type CirclesAvatar, 
  type CirclesBalance 
} from '@/lib/circles';
import {
  getIdentityStatus,
  getClaimStatus,
  getGoodDollarBalance,
  generateFaceVerificationLink,
  type IdentityStatus,
  type ClaimStatus,
  type GoodDollarBalance,
} from '@/lib/gooddollar';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import QRScanner from '@/components/QRScanner';

export default function Signal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [address, setAddress] = useState<string | null>(null);
  const [showVouchInput, setShowVouchInput] = useState(false);
  const [vouchAddress, setVouchAddress] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  
  const [showTrustInput, setShowTrustInput] = useState(false);
  const [trusteeAddress, setTrusteeAddress] = useState('');
  const [showSendInput, setShowSendInput] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [scanContext, setScanContext] = useState<'vouch' | 'trust' | 'send'>('vouch');

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
    staleTime: 5 * 60 * 1000,
  });

  const { data: circlesAvatar, isLoading: isLoadingCircles } = useQuery<CirclesAvatar>({
    queryKey: ['/circles/avatar', address],
    queryFn: () => getCirclesAvatar(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const { data: circlesBalance, refetch: refetchBalance } = useQuery<CirclesBalance>({
    queryKey: ['/circles/balance', address],
    queryFn: () => getCirclesBalance(address!),
    enabled: !!address && circlesAvatar?.isRegistered,
    staleTime: 60 * 1000,
  });

  const { data: gdIdentity, isLoading: isLoadingGdIdentity } = useQuery<IdentityStatus>({
    queryKey: ['/gooddollar/identity', address],
    queryFn: () => getIdentityStatus(address! as `0x${string}`),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const { data: gdClaimStatus, isLoading: isLoadingGdClaim, refetch: refetchGdClaim } = useQuery<ClaimStatus>({
    queryKey: ['/gooddollar/claim', address],
    queryFn: () => getClaimStatus(address! as `0x${string}`),
    enabled: !!address && gdIdentity?.isWhitelisted,
    staleTime: 60 * 1000,
  });

  const { data: gdBalance, refetch: refetchGdBalance } = useQuery<GoodDollarBalance>({
    queryKey: ['/gooddollar/balance', address],
    queryFn: () => getGoodDollarBalance(address! as `0x${string}`),
    enabled: !!address,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (activeTab === null && !isLoadingMaxFlow && !isLoadingCircles && !isLoadingGdIdentity) {
      const hasMaxFlow = scoreData && scoreData.localHealth > 0;
      const hasCircles = circlesAvatar?.isRegistered;
      const hasGoodDollar = gdIdentity?.isWhitelisted;
      
      if (hasCircles) {
        setActiveTab('circles');
      } else if (hasGoodDollar) {
        setActiveTab('gooddollar');
      } else if (hasMaxFlow) {
        setActiveTab('maxflow');
      } else {
        setActiveTab('maxflow');
      }
    }
  }, [activeTab, isLoadingMaxFlow, isLoadingCircles, isLoadingGdIdentity, scoreData, circlesAvatar, gdIdentity]);

  const vouchMutation = useMutation({
    mutationFn: async (endorsedAddress: string) => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      const validatedEndorser = getAddress(address);
      const validatedEndorsed = getAddress(endorsedAddress);
      
      const epoch = await getCurrentEpoch();
      const nonce = await getNextNonce(validatedEndorser.toLowerCase(), epoch.epochId);
      
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
        epoch: BigInt(epoch.epochId),
        nonce: BigInt(nonce),
      };

      const signature = await account.signTypedData({
        domain,
        types,
        primaryType: 'Endorsement',
        message,
      });

      return submitVouch({
        endorsement: {
          endorser: message.endorser,
          endorsee: message.endorsee,
          epoch: message.epoch.toString(),
          nonce: message.nonce.toString(),
          sig: signature,
          chainId: chainId,
        },
      });
    },
    onSuccess: () => {
      toast({ title: "Vouch submitted" });
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

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('No wallet found');
      return registerHuman(address);
    },
    onSuccess: (txHash) => {
      toast({ title: "Registration successful", description: "You are now a Circles human!" });
      queryClient.invalidateQueries({ queryKey: ['/circles/avatar', address] });
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
    },
    onError: (error) => {
      toast({
        title: "Registration Failed",
        description: error instanceof Error ? error.message : "Failed to register",
        variant: "destructive",
      });
    },
  });

  const mintMutation = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('No wallet found');
      return mintPersonalCRC(address);
    },
    onSuccess: () => {
      toast({ title: "CRC claimed" });
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
    },
    onError: (error) => {
      toast({
        title: "Claim Failed",
        description: error instanceof Error ? error.message : "Failed to claim CRC",
        variant: "destructive",
      });
    },
  });

  const trustMutation = useMutation({
    mutationFn: async (trustee: string) => {
      if (!address) throw new Error('No wallet found');
      return trustAddress(address, trustee);
    },
    onSuccess: () => {
      toast({ title: "Trust established" });
      setTrusteeAddress('');
      setShowTrustInput(false);
      queryClient.invalidateQueries({ queryKey: ['/circles/avatar', address] });
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
    },
    onError: (error) => {
      toast({
        title: "Trust Failed",
        description: error instanceof Error ? error.message : "Failed to establish trust",
        variant: "destructive",
      });
    },
  });

  const untrustMutation = useMutation({
    mutationFn: async (trustee: string) => {
      if (!address) throw new Error('No wallet found');
      return untrustAddress(address, trustee);
    },
    onSuccess: () => {
      toast({ title: "Trust removed" });
      setTrusteeAddress('');
      setShowTrustInput(false);
      queryClient.invalidateQueries({ queryKey: ['/circles/avatar', address] });
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
    },
    onError: (error) => {
      toast({
        title: "Untrust Failed",
        description: error instanceof Error ? error.message : "Failed to remove trust",
        variant: "destructive",
      });
    },
  });

  const sendCrcMutation = useMutation({
    mutationFn: async ({ recipient, amount }: { recipient: string; amount: string }) => {
      if (!address) throw new Error('No wallet found');
      return sendCRC(address, recipient, amount);
    },
    onSuccess: () => {
      toast({ title: "CRC sent" });
      setSendRecipient('');
      setSendAmount('');
      setShowSendInput(false);
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
    },
    onError: (error) => {
      toast({
        title: "Send Failed",
        description: error instanceof Error ? error.message : "Failed to send CRC",
        variant: "destructive",
      });
    },
  });

  const handleVouch = () => {
    if (!vouchAddress) return;
    vouchMutation.mutate(vouchAddress);
  };

  const handleTrust = () => {
    if (!trusteeAddress) return;
    trustMutation.mutate(trusteeAddress);
  };

  const handleUntrust = () => {
    if (!trusteeAddress) return;
    untrustMutation.mutate(trusteeAddress);
  };

  const handleSendCrc = () => {
    if (!sendRecipient || !sendAmount) return;
    sendCrcMutation.mutate({ recipient: sendRecipient, amount: sendAmount });
  };

  const handleScan = (data: string) => {
    if (/^0x[a-fA-F0-9]{40}$/.test(data.trim())) {
      const scannedAddress = data.trim();
      setShowScanner(false);
      
      if (scanContext === 'vouch') {
        setVouchAddress(scannedAddress);
        setShowVouchInput(true);
      } else if (scanContext === 'trust') {
        setTrusteeAddress(scannedAddress);
        setShowTrustInput(true);
      } else if (scanContext === 'send') {
        setSendRecipient(scannedAddress);
        setShowSendInput(true);
      }
    } else {
      toast({
        title: "Invalid QR Code",
        description: "Please scan a valid wallet address",
        variant: "destructive",
      });
    }
  };

  const openScanner = (context: 'vouch' | 'trust' | 'send') => {
    setScanContext(context);
    setShowScanner(true);
  };

  const score = scoreData?.localHealth ?? 0;
  const vouchCount = scoreData?.metrics?.acceptedUsers ?? 0;

  if (!activeTab) {
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
      <main className="max-w-md mx-auto p-4 space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold">Trust Hub</h1>
          <p className="text-xs text-muted-foreground">Your identity and trust signals</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="maxflow" className="flex items-center gap-1.5 text-xs" data-testid="tab-maxflow">
              <Shield className="h-3.5 w-3.5" />
              MaxFlow
            </TabsTrigger>
            <TabsTrigger value="circles" className="flex items-center gap-1.5 text-xs" data-testid="tab-circles">
              <CircleDot className="h-3.5 w-3.5" />
              Circles
            </TabsTrigger>
            <TabsTrigger value="gooddollar" className="flex items-center gap-1.5 text-xs" data-testid="tab-gooddollar">
              <Gift className="h-3.5 w-3.5" />
              G$
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maxflow" className="mt-4">
            <Card className="p-6 space-y-6">
              {!isLoadingMaxFlow && score === 0 ? (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <h2 className="text-lg font-semibold mb-2">Build Your Network Signal</h2>
                      <p className="text-sm text-muted-foreground">
                        Your network signal is currently at zero. Here's how to get started.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 text-left">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">What is Network Signal?</h3>
                      <p className="text-sm text-muted-foreground">
                        Network signal measures your trust network health through max flow computation. It's not a reputation score — it's based on how well you're connected through authentic vouches.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">How Vouching Works</h3>
                      <p className="text-sm text-muted-foreground">
                        When someone vouches for you, they add you to their trust network. But here's the key: <strong>who you vouch for affects your own score</strong>. Vouching indiscriminately dilutes your network quality, so vouch thoughtfully.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Get Started</h3>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Share your address with people you trust</li>
                        <li>Ask them to vouch for you on nanoPay</li>
                        <li>Vouch for others carefully — it impacts your score</li>
                      </ol>
                    </div>

                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">
                        Your address: <span className="font-mono" data-testid="text-user-address">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <Shield className="h-12 w-12 mx-auto text-primary" />
                  <div>
                    <h2 className="text-sm text-muted-foreground mb-2">Your MaxFlow Score</h2>
                    {isLoadingMaxFlow ? (
                      <div className="text-4xl font-bold text-foreground">--</div>
                    ) : (
                      <div className="text-5xl font-bold text-foreground" data-testid="text-score">
                        {Math.round(score)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-center gap-2">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 w-2 rounded-full ${
                          i < Math.round(score / 10) ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>

                  {!isLoadingMaxFlow && (
                    <p className="text-sm text-muted-foreground" data-testid="text-vouch-count">
                      Vouched by {vouchCount} {vouchCount === 1 ? 'person' : 'people'}
                    </p>
                  )}

                  {!isLoadingMaxFlow && scoreData?.metrics && (
                    <div className="pt-4 border-t space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground mb-3">Your Network Metrics</h3>
                      <div className="grid grid-cols-1 gap-2 text-sm">
                        <div className="flex justify-between items-center" data-testid="metric-redundancy">
                          <span className="text-muted-foreground">Path Redundancy</span>
                          <span className="font-mono font-medium">{scoreData.metrics.medianMinCut.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between items-center" data-testid="metric-maxflow">
                          <span className="text-muted-foreground">Maximum Flow</span>
                          <span className="font-mono font-medium">{scoreData.metrics.maxPossibleFlow.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between items-center" data-testid="metric-residual">
                          <span className="text-muted-foreground">Average Residual</span>
                          <span className="font-mono font-medium">{scoreData.metrics.avgResidualFlow.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    This score is a neutral signal of your trust-network health — computed via max-flow/min-cut.
                  </p>
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
                        onClick={() => openScanner('vouch')}
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
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : 'Submit Vouch'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="circles" className="mt-4">
            <Card className="p-6 space-y-6">
              {isLoadingCircles ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Checking Circles status...</p>
                </div>
              ) : circlesAvatar?.isRegistered ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">CRC Balance</p>
                    <div className="text-4xl font-bold text-foreground" data-testid="text-crc-balance">
                      {circlesBalance?.formattedCrc || '0.00'}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Claim 1 CRC per hour, up to 24/day
                    </p>
                  </div>

                  {!showTrustInput && !showSendInput && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => mintMutation.mutate()}
                          disabled={mintMutation.isPending}
                          data-testid="button-mint-crc"
                        >
                          {mintMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Coins className="h-4 w-4 mr-2" />
                          )}
                          Claim
                        </Button>
                        <Button
                          className="flex-1"
                          variant="outline"
                          onClick={() => setShowSendInput(true)}
                          data-testid="button-send-crc"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Send
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowTrustInput(true)}
                          data-testid="button-trust"
                        >
                          <Heart className="h-4 w-4 mr-2" />
                          Trust
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1"
                          onClick={() => refetchBalance()}
                          data-testid="button-refresh-balance"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Trust others to let your CRC flow through their network. A ~7% yearly decay keeps CRC circulating.
                      </p>
                    </div>
                  )}

                  {showTrustInput && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="trust-address">Address to Trust</Label>
                        <div className="flex gap-2">
                          <Input
                            id="trust-address"
                            placeholder="0x..."
                            value={trusteeAddress}
                            onChange={(e) => setTrusteeAddress(e.target.value)}
                            className="font-mono text-sm flex-1"
                            data-testid="input-trust-address"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openScanner('trust')}
                            data-testid="button-scan-trust"
                          >
                            <Scan className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowTrustInput(false);
                            setTrusteeAddress('');
                          }}
                          className="flex-1"
                          data-testid="button-cancel-trust"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleTrust}
                          disabled={!trusteeAddress || trustMutation.isPending}
                          className="flex-1"
                          data-testid="button-submit-trust"
                        >
                          {trustMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Heart className="h-4 w-4 mr-2" />
                          )}
                          {trustMutation.isPending ? 'Trusting...' : 'Trust'}
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleUntrust}
                          disabled={!trusteeAddress || untrustMutation.isPending}
                          className="flex-1"
                          data-testid="button-submit-untrust"
                        >
                          {untrustMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <HeartOff className="h-4 w-4 mr-2" />
                          )}
                          {untrustMutation.isPending ? 'Untrusting...' : 'Untrust'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {showSendInput && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="send-address">Recipient Address</Label>
                        <div className="flex gap-2">
                          <Input
                            id="send-address"
                            placeholder="0x..."
                            value={sendRecipient}
                            onChange={(e) => setSendRecipient(e.target.value)}
                            className="font-mono text-sm flex-1"
                            data-testid="input-send-address"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openScanner('send')}
                            data-testid="button-scan-send"
                          >
                            <Scan className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="send-amount">Amount (CRC)</Label>
                        <Input
                          id="send-amount"
                          type="number"
                          placeholder="0.00"
                          value={sendAmount}
                          onChange={(e) => setSendAmount(e.target.value)}
                          className="font-mono"
                          data-testid="input-send-amount"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowSendInput(false);
                            setSendRecipient('');
                            setSendAmount('');
                          }}
                          className="flex-1"
                          data-testid="button-cancel-send"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSendCrc}
                          disabled={!sendRecipient || !sendAmount || sendCrcMutation.isPending}
                          className="flex-1"
                          data-testid="button-submit-send"
                        >
                          {sendCrcMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          {sendCrcMutation.isPending ? 'Sending...' : 'Send CRC'}
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => window.open(getCirclesExplorerUrl(address!), '_blank', 'noopener,noreferrer')}
                    data-testid="button-circles-profile"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Circles Garden
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    CRC is social money, separate from your USDC.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <CircleDot className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <h2 className="text-lg font-semibold">Join Circles</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Circles is community-powered social money on Gnosis Chain. Every human can claim the same amount of CRC over time and use it to support people and local groups.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">How it works</h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Register your avatar (one per human)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Claim 1 CRC per hour, up to 24/day</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Send CRC to friends and groups you want to support</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Trust others so your CRC can flow through the network</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>~7% yearly decay keeps CRC circulating</span>
                      </li>
                    </ul>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => registerMutation.mutate()}
                    disabled={registerMutation.isPending}
                    data-testid="button-register-circles"
                  >
                    {registerMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Register as Human
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    CRC is social money, separate from your USDC balance. Gas fees are covered.
                  </p>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="gooddollar" className="mt-4">
            <Card className="p-6 space-y-6">
              {isLoadingGdIdentity ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Checking GoodDollar status...</p>
                </div>
              ) : gdIdentity?.isWhitelisted ? (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400 font-medium">Face Verified</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">G$ Balance</p>
                    <div className="text-4xl font-bold text-foreground" data-testid="text-gd-balance">
                      {gdBalance?.balanceFormatted || '0.00'}
                    </div>
                    {gdIdentity.daysUntilExpiry !== null && gdIdentity.daysUntilExpiry <= 30 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center justify-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Verification expires in {gdIdentity.daysUntilExpiry} days
                      </p>
                    )}
                  </div>

                  {gdClaimStatus?.canClaim ? (
                    <div className="space-y-3">
                      <div className="bg-primary/10 rounded-lg p-4 text-center">
                        <p className="text-sm text-muted-foreground">Available to claim</p>
                        <p className="text-2xl font-bold text-primary" data-testid="text-gd-entitlement">
                          {gdClaimStatus.entitlementFormatted} G$
                        </p>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => {
                          window.open('https://wallet.gooddollar.org', '_blank', 'noopener,noreferrer');
                        }}
                        data-testid="button-claim-gd"
                      >
                        <Coins className="h-4 w-4 mr-2" />
                        Claim in GoodWallet
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Claiming requires gas on Celo. Use GoodWallet for free claims.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-muted rounded-lg p-4 text-center">
                        <Clock className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Next claim available</p>
                        {gdClaimStatus?.nextClaimTime && (
                          <p className="text-lg font-semibold" data-testid="text-gd-next-claim">
                            {gdClaimStatus.nextClaimTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          refetchGdClaim();
                          refetchGdBalance();
                        }}
                        data-testid="button-refresh-gd"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Status
                      </Button>
                    </div>
                  )}

                  <div className="pt-4 border-t space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3">Daily UBI Stats</h3>
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Daily UBI</span>
                        <span className="font-mono font-medium" data-testid="text-gd-daily-ubi">{gdClaimStatus?.dailyUbiFormatted || '0.00'} G$</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Active Claimers</span>
                        <span className="font-mono font-medium" data-testid="text-gd-active-users">{gdClaimStatus?.activeUsers?.toLocaleString() || '0'}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => window.open('https://wallet.gooddollar.org', '_blank', 'noopener,noreferrer')}
                    data-testid="button-gd-wallet"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open GoodWallet
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    G$ is universal basic income on Celo, separate from your USDC.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <Gift className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <h2 className="text-lg font-semibold">Claim Daily UBI</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      GoodDollar distributes free G$ tokens daily to verified humans. Prove you're unique with face verification to start claiming.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">How it works</h3>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Verify your face once (privacy-preserving)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Claim free G$ tokens every day</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Use G$ for payments or support others</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Re-verify every {gdIdentity?.authenticationPeriod || 180} days</span>
                      </li>
                    </ul>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => {
                      const callbackUrl = window.location.origin + '/signal';
                      const link = generateFaceVerificationLink(address! as `0x${string}`, callbackUrl, false);
                      window.open(link, '_blank', 'noopener,noreferrer');
                    }}
                    data-testid="button-verify-face"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Verify Face
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Your face data is not stored. Only a unique hash is kept to prevent duplicates.
                  </p>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {showScanner && (
        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
