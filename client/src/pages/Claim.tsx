import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Scan, CircleDot, Loader2, ExternalLink, UserPlus, Coins, Heart, HeartOff, Send, RefreshCw, Gift, Sparkles, CheckCircle, Clock, AlertCircle, ChevronDown, MessageCircle, Users, Share2 } from 'lucide-react';
import { getWallet, getPrivateKey } from '@/lib/wallet';
import { 
  getCirclesAvatar, 
  getCirclesBalance, 
  getCirclesExplorerUrl, 
  registerHuman,
  validateCustomInviter,
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
  exchangeGdForXp,
  type IdentityStatus,
  type ClaimStatus,
  type GoodDollarBalance,
  type GoodDollarPrice,
  type ClaimResult,
} from '@/lib/gooddollar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createWalletClient, http } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { useToast } from '@/hooks/use-toast';

// Lazy load QR scanner to reduce initial bundle size
const QRScanner = lazy(() => import('@/components/QRScanner'));

// Cache key for tab state persistence
const CLAIM_TAB_KEY = 'claim_active_tab';

// Helper function to retry API calls with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`[Retry] Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

function getCachedTab(): string {
  try {
    return localStorage.getItem(CLAIM_TAB_KEY) || 'gooddollar';
  } catch {
    return 'gooddollar';
  }
}

function setCachedTab(tab: string) {
  try {
    localStorage.setItem(CLAIM_TAB_KEY, tab);
  } catch {}
}

export default function Claim() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [address, setAddress] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => getCachedTab());
  
  const [showTrustInput, setShowTrustInput] = useState(false);
  const [trusteeAddress, setTrusteeAddress] = useState('');
  const [showSendInput, setShowSendInput] = useState(false);
  const [sendRecipient, setSendRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [scanContext, setScanContext] = useState<'trust' | 'send' | 'inviter'>('trust');
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [showCustomInviter, setShowCustomInviter] = useState(false);
  const [customInviterAddress, setCustomInviterAddress] = useState('');
  const [inviterValidation, setInviterValidation] = useState<{ valid?: boolean; error?: string; checking?: boolean } | null>(null);
  const [showWaitingTips, setShowWaitingTips] = useState(false);
  const [pendingFvResult, setPendingFvResult] = useState<{ isVerified: boolean; reason?: string } | null>(null);
  const [isRefreshingIdentity, setIsRefreshingIdentity] = useState(false);
  const [showGdExchangeDialog, setShowGdExchangeDialog] = useState(false);
  const [gdExchangeAmount, setGdExchangeAmount] = useState('10');

  // Parse FV callback immediately on mount (before address loads)
  useEffect(() => {
    const fvResult = parseFVCallback();
    if (fvResult) {
      setPendingFvResult(fvResult);
      // Clear URL immediately to prevent re-processing
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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

  interface InviterStatus {
    inviterAddress: string;
    isHuman: boolean;
    crcBalance: string;
    crcBalanceFormatted: string;
    crcRequired: string;
    isReady: boolean;
    userTrusted: boolean;
    hoursUntilReady?: number;
    message: string;
  }

  const { data: inviterStatus, isLoading: isLoadingInviter } = useQuery<InviterStatus>({
    queryKey: ['/api/circles/inviter-status', address],
    queryFn: async () => {
      const res = await fetch(`/api/circles/inviter-status?userAddress=${address}`);
      if (!res.ok) throw new Error('Failed to fetch inviter status');
      return res.json();
    },
    enabled: !!address && !circlesAvatar?.isRegistered,
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

  // Process pending FV result once address is available
  useEffect(() => {
    if (!pendingFvResult || !address) return;

    const processFvResult = async () => {
      if (pendingFvResult.isVerified) {
        setIsRefreshingIdentity(true);
        toast({
          title: "Face Verified",
          description: "Refreshing your identity status...",
        });
        
        try {
          // Invalidate and refetch identity status
          await queryClient.invalidateQueries({ queryKey: ['/gooddollar/identity', address] });
          await queryClient.invalidateQueries({ queryKey: ['/gooddollar/claim', address] });
          
          // Force refetch to get fresh data - identity first, then claim
          await queryClient.refetchQueries({ queryKey: ['/gooddollar/identity', address] });
          await queryClient.refetchQueries({ queryKey: ['/gooddollar/claim', address] });
          
          // Sync identity status to backend for analytics
          const freshIdentity = await getIdentityStatus(address as `0x${string}`);
          if (freshIdentity) {
            try {
              await apiRequest('POST', '/api/gooddollar/sync-identity', {
                walletAddress: address,
                isWhitelisted: freshIdentity.isWhitelisted,
                whitelistedRoot: freshIdentity.whitelistedRoot,
                lastAuthenticated: freshIdentity.lastAuthenticated?.toISOString(),
                authenticationPeriod: freshIdentity.authenticationPeriod,
                expiresAt: freshIdentity.expiresAt?.toISOString(),
                isExpired: freshIdentity.isExpired,
                daysUntilExpiry: freshIdentity.daysUntilExpiry,
              });
              console.log('[GoodDollar] Identity synced to backend');
            } catch (syncError) {
              console.error('[GoodDollar] Failed to sync identity to backend:', syncError);
            }
          }
          
          toast({
            title: "Ready to Claim",
            description: "Your identity is verified. You can now claim G$ daily.",
          });
        } catch (error) {
          console.error('Error refreshing identity status:', error);
          toast({
            title: "Verification Complete",
            description: "Your identity is verified. Please refresh if claim status doesn't update.",
          });
        } finally {
          setIsRefreshingIdentity(false);
        }
      } else {
        toast({
          title: "Verification Failed",
          description: pendingFvResult.reason || "Face verification was not successful. Please try again.",
          variant: "destructive",
        });
      }
      setPendingFvResult(null);
    };

    processFvResult();
  }, [pendingFvResult, address, queryClient, toast]);

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

  // Validate custom inviter when it changes
  useEffect(() => {
    if (!customInviterAddress || !address) {
      setInviterValidation(null);
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(customInviterAddress)) {
      setInviterValidation({ valid: false, error: 'Invalid address format' });
      return;
    }

    // Debounce validation
    const timer = setTimeout(async () => {
      setInviterValidation({ checking: true });
      try {
        const result = await validateCustomInviter(customInviterAddress, address);
        setInviterValidation({
          valid: result.valid,
          error: result.error,
        });
      } catch (error) {
        setInviterValidation({
          valid: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [customInviterAddress, address]);

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
    mutationFn: async (customInviter?: string) => {
      if (!address) throw new Error('No wallet found');
      return registerHuman(address, customInviter);
    },
    onSuccess: (txHash) => {
      toast({ title: "Registration successful", description: "You are now a Circles human!" });
      queryClient.invalidateQueries({ queryKey: ['/circles/avatar', address] });
      queryClient.invalidateQueries({ queryKey: ['/circles/balance', address] });
      setShowCustomInviter(false);
      setCustomInviterAddress('');
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
      toast({ 
        title: "CRC claimed",
        description: "Your daily CRC tokens have been claimed",
      });
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
    onSuccess: (_data, trustee) => {
      toast({ 
        title: "Trust established",
        description: `Now trusting ${trustee.slice(0, 6)}...${trustee.slice(-4)}`,
      });
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
    onSuccess: (_data, trustee) => {
      toast({ 
        title: "Trust removed",
        description: `Stopped trusting ${trustee.slice(0, 6)}...${trustee.slice(-4)}`,
      });
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
    onSuccess: (_data, variables) => {
      toast({ 
        title: "CRC sent",
        description: `${variables.amount} CRC sent to ${variables.recipient.slice(0, 6)}...${variables.recipient.slice(-4)}`,
      });
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
    onSuccess: async (result) => {
      if (result.success) {
        toast({ 
          title: "G$ Claimed!", 
          description: `Successfully claimed ${result.amountClaimed} G$` 
        });
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/claim', address] });
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/balance', address] });
        
        // Record claim to backend for analytics with retry logic
        // Note: txHash is optional, but amountClaimed and currentDay are required for meaningful analytics
        if (result.amountClaimed && gdClaimStatus?.currentDay) {
          try {
            await retryWithBackoff(
              () => apiRequest('POST', '/api/gooddollar/record-claim', {
                walletAddress: address,
                txHash: result.txHash || null,
                amount: result.amountClaimed,
                amountFormatted: result.amountClaimed,
                claimedDay: gdClaimStatus.currentDay,
                gasDripTxHash: result.gasDripTxHash,
              }),
              3,
              1000
            );
            console.log('[GoodDollar] Claim recorded to backend');
          } catch (recordError) {
            console.error('[GoodDollar] Failed to record claim to backend after retries:', recordError);
            toast({
              title: "Claim recorded on blockchain",
              description: "Your G$ claim succeeded but couldn't be saved to our records. An admin can sync it later.",
              variant: "default",
            });
          }
        }
        
        // Force refresh claim status to get new nextClaimTime for countdown
        await refetchGdClaim();
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

  const exchangeGdMutation = useMutation({
    mutationFn: async (amount: string) => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      return exchangeGdForXp(address as `0x${string}`, privateKey as `0x${string}`, amount);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: "Exchange Complete!",
          description: `Exchanged ${result.gdExchanged} G$ for ${result.xpReceived} XP`,
        });
        setShowGdExchangeDialog(false);
        setGdExchangeAmount('10');
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/balance', address] });
        queryClient.invalidateQueries({ queryKey: ['/api/xp/balance', address] });
      } else {
        toast({
          title: "Exchange Failed",
          description: result.error || "Failed to exchange G$ for XP",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Exchange Failed",
        description: error instanceof Error ? error.message : "Failed to exchange G$ for XP",
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
      } else if (scanContext === 'inviter') {
        setCustomInviterAddress(scannedAddress);
      }
    } else {
      toast({
        title: "Invalid QR Code",
        description: "Please scan a valid wallet address",
        variant: "destructive",
      });
    }
  };

  const openScanner = (context: 'trust' | 'send' | 'inviter') => {
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
        <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); setCachedTab(tab); }} className="w-full">
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
                    <div className="text-5xl font-bold tabular-nums text-foreground tracking-tight" data-testid="text-crc-balance">
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Coins className="h-4 w-4" />
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
                          <Send className="h-4 w-4" />
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
                          <Heart className="h-4 w-4" />
                          Trust
                        </Button>
                        <Button
                          variant="ghost"
                          className="flex-1"
                          onClick={() => refetchBalance()}
                          data-testid="button-refresh-balance"
                        >
                          <RefreshCw className="h-4 w-4" />
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Heart className="h-4 w-4" />
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <HeartOff className="h-4 w-4" />
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {sendCrcMutation.isPending ? 'Sending...' : 'Send CRC'}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t space-y-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Circles Network</h3>
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
                    <ExternalLink className="h-4 w-4" />
                    View on Circles Garden
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    CRC is social money on Gnosis, separate from your USDC.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <CircleDot className="h-10 w-10 text-[#03B2CB] shrink-0" />
                    <div>
                      <h2 className="text-xl text-section">Social Money</h2>
                      <span className="font-label text-muted-foreground">// GNOSIS</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center py-2">
                    <div>
                      <p className="font-mono text-2xl font-bold">24</p>
                      <span className="text-xs text-muted-foreground">CRC daily</span>
                    </div>
                    <div>
                      <p className="font-mono text-2xl font-bold">96</p>
                      <span className="text-xs text-muted-foreground">CRC to invite</span>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground text-center">
                    Circles is a community-driven basic income on Gnosis Chain. Register to mint your own personal currency and build a web of trust with others.
                  </p>

                  {!showCustomInviter ? (
                    <div className="space-y-4">
                      {isLoadingInviter ? (
                        <div className="text-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                          <p className="text-xs text-muted-foreground mt-2">Checking inviter status...</p>
                        </div>
                      ) : inviterStatus ? (
                        <div className="border rounded-none p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground/80">Community Inviter</span>
                            {inviterStatus.isReady ? (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle className="h-3 w-3" />
                                Ready
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                Accumulating
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span>{inviterStatus.crcBalanceFormatted} / 96 CRC</span>
                            </div>
                            <div className="w-full bg-muted h-2">
                              <div 
                                className={`h-2 transition-all ${inviterStatus.isReady ? 'bg-green-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(100, (parseFloat(inviterStatus.crcBalanceFormatted) / 96) * 100)}%` }}
                              />
                            </div>
                          </div>

                          {!inviterStatus.isReady && inviterStatus.hoursUntilReady && (
                            <p className="text-xs text-muted-foreground">
                              ~{inviterStatus.hoursUntilReady} hours until ready (1 CRC/hour)
                            </p>
                          )}
                        </div>
                      ) : null}

                      {/* While you wait - tips to speed up registration */}
                      {inviterStatus && !inviterStatus.isReady && (
                        <Collapsible open={showWaitingTips} onOpenChange={setShowWaitingTips}>
                          <CollapsibleTrigger asChild>
                            <Button 
                              variant="outline"
                              className="w-full justify-between"
                              data-testid="button-waiting-tips"
                            >
                              <span>While you wait...</span>
                              <ChevronDown className={`h-4 w-4 transition-transform ${showWaitingTips ? 'rotate-180' : ''}`} />
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-3 space-y-4">
                            {/* Why you need an inviter */}
                            <div className="border rounded-none p-4 space-y-2">
                              <h4 className="text-xs font-semibold text-foreground/80 flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                Why do I need an inviter?
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Circles uses a "web of trust" to prevent spam. When someone invites you, they vouch for your humanity by burning 96 CRC. This ensures only real people join.
                              </p>
                            </div>

                            {/* Ways to speed up */}
                            <div className="border rounded-none p-4 space-y-3">
                              <h4 className="text-xs font-semibold text-foreground/80">Speed up your registration</h4>
                              
                              <div className="space-y-3">
                                <a 
                                  href="https://t.me/about_circles" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-2 hover-elevate transition-colors"
                                  data-testid="link-circles-telegram"
                                >
                                  <div className="h-8 w-8 bg-blue-500/10 flex items-center justify-center">
                                    <MessageCircle className="h-4 w-4 text-blue-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground/80">Join Circles Telegram</p>
                                    <p className="text-xs text-muted-foreground truncate">Ask the community to trust you</p>
                                  </div>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>

                                <a 
                                  href="https://discord.com/invite/aboutcircles" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-2 hover-elevate transition-colors"
                                  data-testid="link-circles-discord"
                                >
                                  <div className="h-8 w-8 bg-indigo-500/10 flex items-center justify-center">
                                    <MessageCircle className="h-4 w-4 text-indigo-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground/80">Join Circles Discord</p>
                                    <p className="text-xs text-muted-foreground truncate">Connect with Circles members</p>
                                  </div>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>

                                <a 
                                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Looking to join @aboutcircles! If you're already on Circles, I'd appreciate a trust 🙏\n\nMy address: ${address}\n\n#CirclesUBI #BasicIncome`)}`}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-2 hover-elevate transition-colors"
                                  data-testid="link-share-x"
                                >
                                  <div className="h-8 w-8 bg-foreground/10 flex items-center justify-center">
                                    <Share2 className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground/80">Share on X</p>
                                    <p className="text-xs text-muted-foreground truncate">Ask your network for a trust</p>
                                  </div>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </a>

                                <button
                                  type="button"
                                  onClick={() => setShowCustomInviter(true)}
                                  className="flex items-center gap-3 p-2 hover-elevate transition-colors w-full text-left"
                                  data-testid="link-ask-friend"
                                >
                                  <div className="h-8 w-8 bg-green-500/10 flex items-center justify-center">
                                    <UserPlus className="h-4 w-4 text-green-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground/80">Ask a friend on Circles</p>
                                    <p className="text-xs text-muted-foreground truncate">Have them trust you, then register with their address</p>
                                  </div>
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-muted-foreground text-center">
                              Once someone trusts you, use "Have a Circles friend?" below
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      <Button
                        className="w-full"
                        size="lg"
                        onClick={() => registerMutation.mutate(undefined)}
                        disabled={registerMutation.isPending || !inviterStatus?.isReady}
                        data-testid="button-register-circles"
                      >
                        {registerMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Registering...
                          </>
                        ) : inviterStatus?.isReady ? (
                          <>
                            <UserPlus className="h-4 w-4" />
                            Register as Human
                          </>
                        ) : (
                          'Inviter Not Ready'
                        )}
                      </Button>

                      <div className="text-center">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                          onClick={() => setShowCustomInviter(true)}
                          data-testid="button-use-own-inviter"
                        >
                          Have a Circles friend? Use your own inviter
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="border rounded-none p-4 space-y-3">
                        <h3 className="text-xs font-semibold text-foreground/80">Use Your Own Inviter</h3>
                        <p className="text-xs text-muted-foreground">
                          If a Circles Human friend has already trusted your address, enter their address below to register.
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="custom-inviter">Inviter Address</Label>
                          <div className="flex gap-2">
                            <Input
                              id="custom-inviter"
                              placeholder="0x..."
                              value={customInviterAddress}
                              onChange={(e) => setCustomInviterAddress(e.target.value)}
                              className="font-mono text-sm flex-1"
                              data-testid="input-custom-inviter"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openScanner('inviter')}
                              data-testid="button-scan-inviter"
                            >
                              <Scan className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          {inviterValidation && (
                            <div className={`flex items-center gap-2 text-xs ${inviterValidation.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {inviterValidation.checking ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>Checking inviter...</span>
                                </>
                              ) : inviterValidation.valid ? (
                                <>
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Valid inviter - they trust you!</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="h-3 w-3" />
                                  <span>{inviterValidation.error}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowCustomInviter(false);
                            setCustomInviterAddress('');
                            setInviterValidation(null);
                          }}
                          className="flex-1"
                          data-testid="button-cancel-custom-inviter"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => registerMutation.mutate(customInviterAddress)}
                          disabled={!inviterValidation?.valid || registerMutation.isPending}
                          className="flex-1"
                          data-testid="button-register-custom"
                        >
                          {registerMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Registering...
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4" />
                              Register
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    nanoPay covers gas fees for all Circles transactions
                  </p>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="gooddollar" className="mt-4">
            <Card className="p-6 space-y-6">
              {isLoadingGdIdentity || isRefreshingIdentity ? (
                <div className="text-center space-y-4">
                  <Gift className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {isRefreshingIdentity ? "Verifying your identity..." : "Checking GoodDollar status..."}
                    </p>
                  </div>
                </div>
              ) : gdIdentity?.isWhitelisted ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Gift className="h-10 w-10 text-[#03B2CB] shrink-0" />
                    <div>
                      <h2 className="text-xl text-section">Daily UBI</h2>
                      <span className="font-label text-muted-foreground">// CELO</span>
                    </div>
                  </div>

                  <div className="text-center py-2">
                    <h3 className="text-sm text-muted-foreground mb-2">Your G$ Balance</h3>
                    <div className="text-5xl font-bold tabular-nums text-foreground tracking-tight" data-testid="text-gd-balance">
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
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Claiming...
                          </>
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            Claim G$
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="pt-2">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Next claim in</p>
                        <p className="text-2xl font-mono font-bold" data-testid="text-gd-countdown">
                          {countdown || '--:--:--'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Buy XP with G$ button for verified users */}
                  {parseFloat((gdBalance?.balanceFormatted || '0').replace(/,/g, '')) >= 10 && (
                    <div className="pt-3">
                      <Button
                        size="lg"
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => setShowGdExchangeDialog(true)}
                        data-testid="button-buy-xp-gd"
                      >
                        <Sparkles className="h-4 w-4" />
                        BUY XP WITH G$
                      </Button>
                    </div>
                  )}

                  <div className="pt-4 border-t space-y-2">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">UBI Stats</h3>
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
                      <div className="pt-3 border-t">
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
                  <div className="flex items-center gap-3">
                    <Gift className="h-10 w-10 text-[#03B2CB] shrink-0" />
                    <div>
                      <h2 className="text-xl text-section">Daily UBI</h2>
                      <span className="font-label text-muted-foreground">// CELO</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center py-2">
                    <div>
                      <p className="font-mono text-2xl font-bold">{gdClaimStatus?.dailyUbiFormatted || '~0.5'}</p>
                      <span className="text-xs text-muted-foreground">G$ daily</span>
                    </div>
                    <div>
                      <p className="font-mono text-2xl font-bold">{gdIdentity?.authenticationPeriod || 180}</p>
                      <span className="text-xs text-muted-foreground">day validity</span>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground text-center">
                    GoodDollar is a free universal basic income token on Celo. Verify your identity once with a quick face scan to claim G$ tokens daily.
                  </p>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleFaceVerification}
                    disabled={isVerifyingFace}
                    data-testid="button-verify-face"
                  >
                    {isVerifyingFace ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing...
                      </>
                    ) : 'Verify Face to Start'}
                  </Button>

                  {/* Buy XP with G$ button for non-verified users with G$ balance */}
                  {parseFloat((gdBalance?.balanceFormatted || '0').replace(/,/g, '')) >= 10 && (
                    <div className="pt-3 border-t mt-4">
                      <Button
                        size="lg"
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => setShowGdExchangeDialog(true)}
                        data-testid="button-buy-xp-gd-unverified"
                      >
                        <Sparkles className="h-4 w-4" />
                        BUY XP WITH G$
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {gdIdentity?.isWhitelisted && (
              <Card className="p-4 mt-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-foreground/80">About GoodDollar</h3>
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
                    <ExternalLink className="h-3.5 w-3.5" />
                    Learn more at gooddollar.org
                  </Button>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {showScanner && (
        <Suspense fallback={<div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
          <QRScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      {/* G$ to XP Exchange Dialog */}
      <Dialog open={showGdExchangeDialog} onOpenChange={setShowGdExchangeDialog}>
        <DialogContent className="max-w-[320px] p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">Buy XP with G$</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            <div>
              <div className="relative">
                <Input
                  id="gd-amount"
                  type="number"
                  inputMode="decimal"
                  min="10"
                  step="10"
                  value={gdExchangeAmount}
                  onChange={(e) => setGdExchangeAmount(e.target.value)}
                  placeholder="Amount"
                  className="text-lg pr-10"
                  data-testid="input-gd-exchange-amount"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">G$</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Balance: {gdBalance?.balanceFormatted || '0'} G$
              </p>
            </div>

            <div className="flex items-center justify-between p-2 border rounded bg-muted/30">
              <span className="text-sm text-muted-foreground">You get:</span>
              <span className="font-mono font-bold" data-testid="text-xp-preview">
                {Math.floor(parseFloat(gdExchangeAmount || '0') / 10)} XP
              </span>
            </div>

            {parseFloat(gdExchangeAmount || '0') > parseFloat(gdBalance?.balanceFormatted?.replace(/,/g, '') || '0') && (
              <p className="text-xs text-destructive">Insufficient balance</p>
            )}

            {parseFloat(gdExchangeAmount || '0') < 10 && parseFloat(gdExchangeAmount || '0') > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Min: 10 G$</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowGdExchangeDialog(false);
                setGdExchangeAmount('10');
              }}
              disabled={exchangeGdMutation.isPending}
            >
              Close
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => exchangeGdMutation.mutate(gdExchangeAmount)}
              disabled={
                exchangeGdMutation.isPending ||
                parseFloat(gdExchangeAmount || '0') < 10 ||
                parseFloat(gdExchangeAmount || '0') > parseFloat(gdBalance?.balanceFormatted?.replace(/,/g, '') || '0')
              }
              data-testid="button-confirm-exchange"
            >
              {exchangeGdMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Buy'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
