import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Scan, CircleDot, Loader2, ExternalLink, UserPlus, Coins, Heart, HeartOff, Send, RefreshCw, Gift, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { getWallet, getPrivateKey } from '@/lib/wallet';
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
  getGoodDollarPrice,
  generateFVLink,
  parseFVCallback,
  claimGoodDollarWithWallet,
  type IdentityStatus,
  type ClaimStatus,
  type GoodDollarBalance,
  type GoodDollarPrice,
  type ClaimResult,
} from '@/lib/gooddollar';
import { createWalletClient, http } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';
import QRScanner from '@/components/QRScanner';

export default function Claim() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [address, setAddress] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('gooddollar');
  
  const [showTrustInput, setShowTrustInput] = useState(false);
  const [trusteeAddress, setTrusteeAddress] = useState('');
  const [showSendInput, setShowSendInput] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [scanContext, setScanContext] = useState<'trust' | 'send'>('trust');
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

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

  const { data: gdPrice } = useQuery<GoodDollarPrice>({
    queryKey: ['/gooddollar/price'],
    queryFn: () => getGoodDollarPrice(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const fvResult = parseFVCallback();
    if (fvResult) {
      if (fvResult.isVerified) {
        toast({
          title: "Face Verified",
          description: "Your identity has been verified. You can now claim G$ daily.",
        });
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/identity', address] });
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/claim', address] });
      } else {
        toast({
          title: "Verification Failed",
          description: fvResult.reason || "Face verification was not successful. Please try again.",
          variant: "destructive",
        });
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [address, queryClient, toast]);

  // Countdown timer for next claim
  useEffect(() => {
    if (!gdClaimStatus?.nextClaimTime || gdClaimStatus?.canClaim) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const target = gdClaimStatus.nextClaimTime!;
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown('Ready!');
        refetchGdClaim();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [gdClaimStatus?.nextClaimTime, gdClaimStatus?.canClaim, refetchGdClaim]);

  const handleFaceVerification = async () => {
    if (!address) return;
    
    setIsVerifyingFace(true);
    try {
      const privateKey = await getPrivateKey();
      if (!privateKey) {
        throw new Error('Failed to get wallet key');
      }
      
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: celo,
        transport: http(),
      });

      const signMessage = async (message: string): Promise<string> => {
        return walletClient.signMessage({ message });
      };

      const callbackUrl = `${window.location.origin}/claim`;
      const fvLink = await generateFVLink({
        address: address as `0x${string}`,
        signMessage,
        callbackUrl,
        popupMode: false,
        chainId: 42220,
      });

      window.location.href = fvLink;
    } catch (error) {
      console.error('Face verification error:', error);
      toast({
        title: "Verification Error",
        description: error instanceof Error ? error.message : "Failed to start face verification",
        variant: "destructive",
      });
      setIsVerifyingFace(false);
    }
  };

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

  const claimGdMutation = useMutation<ClaimResult, Error>({
    mutationFn: async () => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      return claimGoodDollarWithWallet(address as `0x${string}`, privateKey as `0x${string}`);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({ 
          title: "G$ Claimed!", 
          description: `Successfully claimed ${result.amountClaimed} G$` 
        });
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/claim', address] });
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/balance', address] });
      } else {
        toast({
          title: "Claim Failed",
          description: result.error || "Failed to claim G$",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim G$",
        variant: "destructive",
      });
    },
  });

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
      
      if (scanContext === 'trust') {
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

  const openScanner = (context: 'trust' | 'send') => {
    setScanContext(context);
    setShowScanner(true);
  };

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
          <h1 className="text-lg font-semibold">Claim Tokens</h1>
          <p className="text-xs text-muted-foreground">Claim GoodDollar UBI and Circles CRC</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="gooddollar" className="flex items-center gap-1.5 text-xs" data-testid="tab-gooddollar">
              <Gift className="h-3.5 w-3.5" />
              GoodDollar
            </TabsTrigger>
            <TabsTrigger value="circles" className="flex items-center gap-1.5 text-xs" data-testid="tab-circles">
              <CircleDot className="h-3.5 w-3.5" />
              Circles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="circles" className="mt-4">
            <Card className="p-6 space-y-6">
              {isLoadingCircles ? (
                <div className="text-center space-y-4">
                  <CircleDot className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">Checking Circles status...</p>
                  </div>
                </div>
              ) : circlesAvatar?.isRegistered ? (
                <div className="text-center space-y-4">
                  <CircleDot className="h-12 w-12 mx-auto text-primary" />
                  <div>
                    <h2 className="text-sm text-muted-foreground mb-2">Your CRC Balance</h2>
                    <div className="text-5xl font-bold text-foreground" data-testid="text-crc-balance">
                      {circlesBalance?.formattedCrc || '0.00'}
                    </div>
                  </div>
                  
                  <div className="flex justify-center gap-2">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 w-2 rounded-full ${
                          i < Math.min(10, Math.floor(parseFloat(circlesBalance?.formattedCrc || '0') / 10)) ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Claim 1 CRC per hour, up to 24/day
                  </p>

                  {!showTrustInput && !showSendInput && (
                    <div className="space-y-3 pt-2">
                      <div className="flex gap-2">
                        <Button
                          size="lg"
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
                          size="lg"
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
                          className="flex-1"
                          onClick={() => setShowTrustInput(true)}
                          data-testid="button-trust"
                        >
                          <Heart className="h-4 w-4 mr-2" />
                          Trust
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1"
                          onClick={() => refetchBalance()}
                          data-testid="button-refresh-balance"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                      </div>
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

                  <div className="pt-4 border-t space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3">Circles Network</h3>
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Claim Rate</span>
                        <span className="font-mono font-medium">1 CRC/hour</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Yearly Demurrage</span>
                        <span className="font-mono font-medium">~7%</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => window.open(getCirclesExplorerUrl(address!), '_blank', 'noopener,noreferrer')}
                    data-testid="button-circles-profile"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View on Circles Garden
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    CRC is social money on Gnosis, separate from your USDC.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <CircleDot className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <h2 className="text-lg font-semibold mb-2">Join Circles</h2>
                      <p className="text-sm text-muted-foreground">
                        Circles is community-powered social money on Gnosis Chain.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 text-left">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">What is Circles?</h3>
                      <p className="text-sm text-muted-foreground">
                        Every human can claim the same amount of CRC over time. It's not a cryptocurrency — it's social money designed to support people and local communities.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">How it Works</h3>
                      <p className="text-sm text-muted-foreground">
                        You earn 1 CRC per hour (up to 24/day). Trust others to let your CRC flow through their network. A ~7% yearly decay keeps CRC circulating fairly.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Get Started</h3>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Register your avatar (one per human)</li>
                        <li>Claim your CRC each day</li>
                        <li>Trust friends to expand your network</li>
                      </ol>
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
                    ) : 'Register as Human'}
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="gooddollar" className="mt-4">
            <Card className="p-6 space-y-6">
              {isLoadingGdIdentity ? (
                <div className="text-center space-y-4">
                  <Gift className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">Checking GoodDollar status...</p>
                  </div>
                </div>
              ) : gdIdentity?.isWhitelisted ? (
                <div className="text-center space-y-4">
                  <Gift className="h-12 w-12 mx-auto text-primary" />
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">Face Verified</span>
                    </div>
                    <h2 className="text-sm text-muted-foreground mb-2">Your G$ Balance</h2>
                    <div className="text-5xl font-bold text-foreground" data-testid="text-gd-balance">
                      {gdBalance?.balanceFormatted || '0.00'}
                    </div>
                  </div>
                  
                  <div className="flex justify-center gap-2">
                    {[...Array(10)].map((_, i) => (
                      <div
                        key={i}
                        className={`h-2 w-2 rounded-full ${
                          i < Math.min(10, Math.floor(parseFloat(gdBalance?.balanceFormatted || '0') / 100)) ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>

                  {gdIdentity.daysUntilExpiry !== null && gdIdentity.daysUntilExpiry <= 30 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Verification expires in {gdIdentity.daysUntilExpiry} days
                    </p>
                  )}

                  {gdClaimStatus?.canClaim ? (
                    <div className="space-y-3 pt-2">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">{gdClaimStatus.entitlementFormatted} G$</span> available to claim
                      </p>
                      <Button
                        size="lg"
                        className="w-full"
                        onClick={() => claimGdMutation.mutate()}
                        disabled={claimGdMutation.isPending}
                        data-testid="button-claim-gd"
                      >
                        {claimGdMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Claiming...
                          </>
                        ) : (
                          <>
                            <Coins className="h-4 w-4 mr-2" />
                            Claim G$
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Next claim in</p>
                        <p className="text-2xl font-mono font-bold" data-testid="text-gd-countdown">
                          {countdown || '--:--:--'}
                        </p>
                      </div>
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          refetchGdClaim();
                          refetchGdBalance();
                        }}
                        data-testid="button-refresh-gd"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                    </div>
                  )}

                  <div className="pt-4 border-t space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3">UBI Stats</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Your Share</span>
                        <p className="font-mono font-medium" data-testid="text-gd-daily-ubi">{gdClaimStatus?.dailyUbiFormatted || '0.00'} G$</p>
                      </div>
                      {gdPrice?.priceUSD ? (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">G$ Price</span>
                          <p className="font-mono font-medium" data-testid="text-gd-price">
                            ${gdPrice.priceUSD.toFixed(6)}
                          </p>
                        </div>
                      ) : null}
                      {gdIdentity?.daysUntilExpiry !== null && gdIdentity?.daysUntilExpiry !== undefined && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Identity Expires</span>
                          <p className={`font-mono font-medium ${gdIdentity.daysUntilExpiry <= 14 ? 'text-amber-500' : ''}`} data-testid="text-gd-expiry">
                            {gdIdentity.daysUntilExpiry} days
                          </p>
                        </div>
                      )}
                      {gdClaimStatus?.hasActiveStreak && (
                        <div className="space-y-1">
                          <span className="text-xs text-muted-foreground">Streak</span>
                          <p className="font-mono font-medium text-green-500" data-testid="text-gd-streak">Active</p>
                        </div>
                      )}
                    </div>
                    {gdBalance && gdPrice?.priceUSD ? (
                      <div className="pt-2 mt-2 border-t">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Your G$ Value</span>
                          <span className="font-mono font-medium" data-testid="text-gd-usd-value">
                            ${(parseFloat(gdBalance.balanceFormatted.replace(/,/g, '')) * gdPrice.priceUSD).toFixed(2)} USD
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-4">
                    <Gift className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <h2 className="text-lg font-semibold mb-2">Claim Daily UBI</h2>
                      <p className="text-sm text-muted-foreground">
                        GoodDollar distributes free G$ tokens daily to verified humans.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 text-left">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">What is GoodDollar?</h3>
                      <p className="text-sm text-muted-foreground">
                        GoodDollar is a universal basic income protocol on Celo. Everyone who verifies their identity gets the same daily G$ distribution — no exceptions.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">How it Works</h3>
                      <p className="text-sm text-muted-foreground">
                        Verify your face once (it's privacy-preserving — only a hash is stored). Then claim your G$ every day. Re-verify every {gdIdentity?.authenticationPeriod || 180} days.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Get Started</h3>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Verify your face (takes ~1 minute)</li>
                        <li>Claim G$ daily right here in nanoPay</li>
                        <li>Use G$ for payments or support others</li>
                      </ol>
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
                    onClick={handleFaceVerification}
                    disabled={isVerifyingFace}
                    data-testid="button-verify-face"
                  >
                    {isVerifyingFace ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Signing...
                      </>
                    ) : 'Verify Face'}
                  </Button>
                </div>
              )}
            </Card>

            {gdIdentity?.isWhitelisted && (
              <Card className="p-5 mt-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">About GoodDollar</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    GoodDollar is a non-profit protocol creating free money for everyone. 
                    It distributes G$ tokens daily to verified humans around the world — 
                    funded by interest from DeFi and donations.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Built on Celo</span>
                    <span>500k+ members</span>
                    <span>$2M+ distributed</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open('https://gooddollar.org', '_blank', 'noopener,noreferrer')}
                    data-testid="button-gd-learn-more"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Learn more at gooddollar.org
                  </Button>
                </div>
              </Card>
            )}
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
