import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Scan, Shield, CircleDot, Loader2, ExternalLink, UserPlus, Coins, Heart, HeartOff, Send, RefreshCw } from 'lucide-react';
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

  useEffect(() => {
    if (activeTab === null && !isLoadingMaxFlow && !isLoadingCircles) {
      const hasMaxFlow = scoreData && scoreData.localHealth > 0;
      const hasCircles = circlesAvatar?.isRegistered;
      
      if (hasCircles) {
        setActiveTab('circles');
      } else if (hasMaxFlow) {
        setActiveTab('maxflow');
      } else {
        setActiveTab('maxflow');
      }
    }
  }, [activeTab, isLoadingMaxFlow, isLoadingCircles, scoreData, circlesAvatar]);

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
      toast({ title: "CRC minted" });
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
    },
    onError: (error) => {
      toast({
        title: "Mint Failed",
        description: error instanceof Error ? error.message : "Failed to mint CRC",
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="maxflow" className="flex items-center gap-1.5" data-testid="tab-maxflow">
              <Shield className="h-3.5 w-3.5" />
              MaxFlow
            </TabsTrigger>
            <TabsTrigger value="circles" className="flex items-center gap-1.5" data-testid="tab-circles">
              <CircleDot className="h-3.5 w-3.5" />
              Circles
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
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <CircleDot className="h-12 w-12 mx-auto text-primary" />
                    <div>
                      <h2 className="text-sm text-muted-foreground mb-2">Your CRC Balance</h2>
                      <div className="text-5xl font-bold text-foreground" data-testid="text-crc-balance">
                        {circlesBalance?.formattedCrc || '0.00'}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">CRC</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Avatar Type</span>
                      <span className="font-medium">
                        {circlesAvatar.isHuman ? 'Human' : circlesAvatar.isOrganization ? 'Organization' : circlesAvatar.isGroup ? 'Group' : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-medium">Gnosis Chain</span>
                    </div>
                  </div>

                  {!showTrustInput && !showSendInput && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => mintMutation.mutate()}
                        disabled={mintMutation.isPending}
                        data-testid="button-mint-crc"
                      >
                        {mintMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Coins className="h-4 w-4 mr-2" />
                        )}
                        Mint CRC
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => refetchBalance()}
                        data-testid="button-refresh-balance"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowTrustInput(true)}
                        data-testid="button-trust"
                      >
                        <Heart className="h-4 w-4 mr-2" />
                        Trust
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowSendInput(true)}
                        data-testid="button-send-crc"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Send CRC
                      </Button>
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
                    Circles is a decentralized universal basic income (UBI) system where each person mints 1 CRC per hour.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <CircleDot className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <h2 className="text-lg font-semibold mb-2">Join Circles</h2>
                      <p className="text-sm text-muted-foreground">
                        You don't have a Circles avatar yet. Register to start receiving 1 CRC per hour.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 text-left">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">What is Circles?</h3>
                      <p className="text-sm text-muted-foreground">
                        Circles is a decentralized UBI system on Gnosis Chain. Every registered human receives 1 CRC per hour, automatically minted.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">How It Works</h3>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Register as a human avatar</li>
                        <li>Build trust connections with others</li>
                        <li>Your CRC can flow through trust paths</li>
                        <li>7% yearly demurrage prevents hoarding</li>
                      </ul>
                    </div>

                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">
                        Your address: <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                      </p>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
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
                    Gas fees are covered by nanoPay's facilitator service.
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
