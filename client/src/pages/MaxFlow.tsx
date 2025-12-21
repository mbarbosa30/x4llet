import { useState, useEffect, lazy, Suspense, useCallback, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Scan, Shield, Loader2, Sparkles, Clock, ChevronDown, Coins, Info, Camera, Check, Users, Gift, AlertTriangle, ExternalLink, AlertCircle, CheckCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getPrivateKey } from '@/lib/wallet';
import { getMaxFlowScore, getVouchNonce, submitVouch, type MaxFlowScore } from '@/lib/maxflow';
import { 
  getSenadorBalance, 
  getIdentityStatus, 
  getClaimStatus,
  getGoodDollarBalance,
  getGoodDollarPrice,
  generateFVLink,
  parseFVCallback,
  claimGoodDollarWithWallet,
  exchangeGdForXp,
  type SenadorBalance, 
  type IdentityStatus,
  type ClaimStatus,
  type GoodDollarBalance,
  type GoodDollarPrice,
  type ClaimResult,
} from '@/lib/gooddollar';
import { createWalletClient, http } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, type Address } from 'viem';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/useWallet';
import { useXp } from '@/hooks/useXp';
import { formatTimeRemaining } from '@/lib/formatTime';
import { useCountdown } from '@/hooks/useCountdown';
import { apiRequest } from '@/lib/queryClient';

const QRScanner = lazy(() => import('@/components/QRScanner'));
const FaceVerification = lazy(() => import('@/components/FaceVerification'));

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
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

export default function MaxFlow() {
  const [currentPath, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { address } = useWallet();
  
  const [showVouchInput, setShowVouchInput] = useState(false);
  const [vouchAddress, setVouchAddress] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showRedeemConfirm, setShowRedeemConfirm] = useState(false);
  const [showSenadorConfirm, setShowSenadorConfirm] = useState(false);
  const [senadorAmount, setSenadorAmount] = useState('');
  const [activeTab, setActiveTab] = useState('maxflow');
  const [faceVerificationKey, setFaceVerificationKey] = useState(0);
  const [autoFaceCheck, setAutoFaceCheck] = useState(false);
  
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [showGdExchangeDialog, setShowGdExchangeDialog] = useState(false);
  const [gdExchangeAmount, setGdExchangeAmount] = useState('10');
  const [isRefreshingIdentity, setIsRefreshingIdentity] = useState(false);
  const [pendingFvResult, setPendingFvResult] = useState<{ isVerified: boolean; reason?: string } | null>(null);
  
  const optimisticClaimDayRef = useRef<number | null>(null);

  useEffect(() => {
    const fvResult = parseFVCallback();
    if (fvResult) {
      setPendingFvResult(fvResult);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const faceCheckParam = params.get('faceCheck');
      
      if (faceCheckParam === '1') {
        setAutoFaceCheck(true);
        const newUrl = tabParam ? `/maxflow?tab=${tabParam}` : '/maxflow';
        window.history.replaceState(null, '', newUrl);
      }
      
      if (tabParam === 'maxflow' || tabParam === 'gooddollar') {
        setActiveTab(tabParam);
        return;
      }
      const savedTab = localStorage.getItem('maxflow_tab');
      if (savedTab === 'maxflow' || savedTab === 'gooddollar') {
        setActiveTab(savedTab);
      }
    } catch {}
  }, [currentPath]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('maxflow_tab', tab);
    } catch {}
    const newUrl = `/maxflow${tab !== 'maxflow' ? `?tab=${tab}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  };

  const { data: faceVerificationData, isLoading: isLoadingFaceVerification } = useQuery<{
    verified: boolean;
    status: string | null;
    isDuplicate: boolean;
    duplicateOf: string | null;
    challengesPassed: string[];
    createdAt: string;
  }>({
    queryKey: ['/api/face-verification', address],
    queryFn: () => fetch(`/api/face-verification/${address}`).then(res => res.json()),
    enabled: !!address,
  });

  const { data: gdIdentity, isLoading: isLoadingGdIdentity } = useQuery<IdentityStatus>({
    queryKey: ['/api/gooddollar/identity', address],
    queryFn: () => getIdentityStatus(address as Address),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
  });

  const isGdVerified = gdIdentity?.isWhitelisted || 
    (gdIdentity?.whitelistedRoot && gdIdentity.whitelistedRoot !== '0x0000000000000000000000000000000000000000');

  const isGdEligible = Boolean(gdIdentity?.isWhitelisted) || 
    Boolean(gdIdentity?.whitelistedRoot && gdIdentity.whitelistedRoot !== '0x0000000000000000000000000000000000000000');

  const { data: gdClaimStatus, isLoading: isLoadingGdClaim, refetch: refetchGdClaim } = useQuery<ClaimStatus>({
    queryKey: ['/gooddollar/claim', address],
    queryFn: () => getClaimStatus(address! as `0x${string}`),
    enabled: !!address && isGdEligible,
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

  // G$ to XP exchange daily limit status
  const { data: gdDailyStatus, refetch: refetchGdDailyStatus } = useQuery<{
    faceVerified: boolean;
    gdVerified: boolean;
    eligible: boolean;
    dailyLimit: number;
    spent: number;
    remaining: number;
    date: string;
  }>({
    queryKey: ['/api/xp/gd-daily-status', address],
    queryFn: () => fetch(`/api/xp/gd-daily-status/${address}`).then(res => res.json()),
    enabled: !!address,
    staleTime: 30 * 1000, // Refresh every 30 seconds
  });

  // USDC redemption daily limit status (1 per day, requires face verification)
  const { data: usdcDailyStatus } = useQuery<{
    eligible: boolean;
    faceVerified: boolean;
    alreadyRedeemedToday: boolean;
    dailyLimit: number;
    remaining: number;
  }>({
    queryKey: ['/api/xp/usdc-daily-status', address],
    queryFn: () => fetch(`/api/xp/usdc-daily-status/${address}`).then(res => res.json()),
    enabled: !!address,
    staleTime: 30 * 1000, // Refresh every 30 seconds
  });

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
          await queryClient.invalidateQueries({ queryKey: ['/api/gooddollar/identity', address] });
          await queryClient.invalidateQueries({ queryKey: ['/gooddollar/claim', address] });
          await queryClient.refetchQueries({ queryKey: ['/api/gooddollar/identity', address] });
          await queryClient.refetchQueries({ queryKey: ['/gooddollar/claim', address] });
          
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

  const handleGdCountdownComplete = useCallback(() => {
    refetchGdClaim();
  }, [refetchGdClaim]);

  const { formatted: gdCountdown } = useCountdown(
    gdClaimStatus?.nextClaimTime,
    { 
      enabled: !gdClaimStatus?.canClaim && !!gdClaimStatus?.nextClaimTime,
      onComplete: handleGdCountdownComplete
    }
  );

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

      const callbackUrl = `${window.location.origin}/maxflow?tab=gooddollar`;
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
        
        const currentDay = gdClaimStatus?.currentDay ?? 0;
        optimisticClaimDayRef.current = currentDay;
        
        queryClient.setQueryData(['/gooddollar/claim', address], (oldData: ClaimStatus | undefined) => {
          if (!oldData) return oldData;
          const now = new Date();
          const nextClaimTime = new Date(now);
          nextClaimTime.setUTCHours(12, 0, 0, 0);
          if (nextClaimTime <= now) {
            nextClaimTime.setDate(nextClaimTime.getDate() + 1);
          }
          return {
            ...oldData,
            canClaim: false,
            entitlement: 0n,
            entitlementFormatted: '0',
            nextClaimTime,
            lastClaimedDay: oldData.currentDay,
            daysSinceLastClaim: 0,
          };
        });
        
        queryClient.invalidateQueries({ queryKey: ['/gooddollar/balance', address] });
        
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
          } catch (recordError) {
            console.error('[GoodDollar] Failed to record claim to backend after retries:', recordError);
            toast({
              title: "Claim recorded on blockchain",
              description: "Your G$ claim succeeded but couldn't be saved to our records. An admin can sync it later.",
              variant: "default",
            });
          }
        }
        
        const pollForFreshData = async (attempt = 0) => {
          if (attempt >= 3) {
            optimisticClaimDayRef.current = null;
            return;
          }
          const delay = 2000 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          const result = await refetchGdClaim();
          
          const claimDay = optimisticClaimDayRef.current;
          if (result.data && claimDay !== null) {
            if (result.data.lastClaimedDay >= claimDay) {
              optimisticClaimDayRef.current = null;
            } else if (result.data.canClaim) {
              queryClient.setQueryData(['/gooddollar/claim', address], (oldData: ClaimStatus | undefined) => {
                if (!oldData) return oldData;
                const now = new Date();
                const nextClaimTime = new Date(now);
                nextClaimTime.setUTCHours(12, 0, 0, 0);
                if (nextClaimTime <= now) {
                  nextClaimTime.setDate(nextClaimTime.getDate() + 1);
                }
                return {
                  ...oldData,
                  canClaim: false,
                  entitlement: 0n,
                  entitlementFormatted: '0',
                  nextClaimTime,
                  lastClaimedDay: claimDay,
                  daysSinceLastClaim: 0,
                };
              });
              pollForFreshData(attempt + 1);
            }
          }
        };
        pollForFreshData();
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
        queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
        queryClient.invalidateQueries({ queryKey: ['/api/xp/gd-daily-status', address] });
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

  const { data: scoreData, isLoading: isLoadingMaxFlow } = useQuery({
    queryKey: ['/maxflow/score', address],
    queryFn: () => getMaxFlowScore(address!),
    enabled: !!address,
    staleTime: 4 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const { data: xpData, isLoading: isLoadingXp, isFetching: isFetchingXp } = useXp(address);

  const handleXpCountdownComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
  }, [queryClient, address]);

  const { timeRemaining } = useCountdown(
    xpData?.nextClaimTime,
    { onComplete: handleXpCountdownComplete }
  );

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

  const redeemXpMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/xp/redeem', { address });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      setShowRedeemConfirm(false);
      toast({
        title: "XP Redeemed!",
        description: `1 USDC has been deposited to your savings on Celo.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/xp/usdc-daily-status', address] });
      await queryClient.refetchQueries({ queryKey: ['/api/aave/balance'] });
      setLocation('/earn');
    },
    onError: (error: any) => {
      setShowRedeemConfirm(false);
      let errorMessage = "Failed to redeem XP";
      try {
        if (error instanceof Error && error.message) {
          const match = error.message.match(/^\d+:\s*(.+)$/);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              // Prefer detailed 'message' field over generic 'error' field
              errorMessage = parsed.message || parsed.error || match[1];
            } catch {
              errorMessage = match[1];
            }
          } else {
            errorMessage = error.message;
          }
        }
      } catch {}
      toast({
        title: "Redemption Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const { data: senadorData, isLoading: isLoadingSenador } = useQuery({
    queryKey: ['/senador/balance', address],
    queryFn: () => getSenadorBalance(address as Address),
    enabled: !!address,
    staleTime: 60 * 1000,
  });

  // Fetch SENADOR price from Uniswap V4 pool
  const { data: senadorPrice, isLoading: isLoadingSenadorPrice } = useQuery<{
    price: number;
    priceFormatted: string;
    source: string;
  }>({
    queryKey: ['/api/senador/price'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  const redeemSenadorMutation = useMutation({
    mutationFn: async (xpAmount: number) => {
      return apiRequest('POST', '/api/xp/redeem-senador', { address, xpAmount });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      setShowSenadorConfirm(false);
      setSenadorAmount('');
      toast({
        title: "SENADOR Received!",
        description: `${data.senadorReceived} SENADOR has been sent to your wallet.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
      queryClient.invalidateQueries({ queryKey: ['/senador/balance', address] });
    },
    onError: (error: any) => {
      setShowSenadorConfirm(false);
      let errorMessage = "Failed to exchange XP for SENADOR";
      try {
        if (error instanceof Error && error.message) {
          const match = error.message.match(/^\d+:\s*(.+)$/);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              // Prefer detailed 'message' field over generic 'error' field
              errorMessage = parsed.message || parsed.error || match[1];
            } catch {
              errorMessage = match[1];
            }
          } else {
            errorMessage = error.message;
          }
        }
      } catch {}
      toast({
        title: "Exchange Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const isStellarAddress = (addr: string) => addr.startsWith('G') && addr.length === 56;

  const vouchMutation = useMutation({
    mutationFn: async (endorsedAddress: string) => {
      if (!address) throw new Error('No wallet found');
      
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error('No private key found');
      
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      const validatedEndorser = getAddress(address);
      
      const { epoch, nonce } = await getVouchNonce(validatedEndorser.toLowerCase());
      
      if (isStellarAddress(endorsedAddress)) {
        return submitVouch({
          endorser: validatedEndorser.toLowerCase(),
          endorsee: endorsedAddress,
          epoch: epoch.toString(),
          nonce: nonce.toString(),
          sig: 'externally_verified',
          chainNamespace: 'stellar',
          externallyVerified: true,
        });
      }
      
      const validatedEndorsed = getAddress(endorsedAddress);
      
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

      return submitVouch({
        endorser: message.endorser,
        endorsee: message.endorsee,
        epoch: epoch.toString(),
        nonce: nonce.toString(),
        sig: signature,
        chainId: chainId,
      });
    },
    onSuccess: (data) => {
      const pendingXpAwarded = data?.pendingXpAwarded || 0;
      
      if (pendingXpAwarded > 0) {
        toast({ 
          title: `+${pendingXpAwarded} XP unlocked!`,
          description: `Your face verification reward has been claimed. Keep building trust!`,
        });
      } else {
        toast({ 
          title: "Vouch submitted",
          description: `You vouched for ${vouchAddress.slice(0, 6)}...${vouchAddress.slice(-4)}`,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/maxflow/score', address] });
      queryClient.invalidateQueries({ queryKey: ['/maxflow/score', vouchAddress.toLowerCase()] });
      queryClient.invalidateQueries({ queryKey: ['/api/trust-profile', address] });
      queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
      setVouchAddress('');
      setShowVouchInput(false);
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
    const trimmed = data.trim();
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    const isStellar = trimmed.startsWith('G') && trimmed.length === 56;
    
    if (isEvm || isStellar) {
      setShowScanner(false);
      setVouchAddress(trimmed);
      setShowVouchInput(true);
    } else {
      toast({
        title: "Invalid QR Code",
        description: "Please scan a valid EVM (0x...) or Stellar (G...) address",
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
        <Suspense fallback={<div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
          <QRScanner
            onScan={handleScan}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      <main className="max-w-md mx-auto p-4 space-y-4">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="maxflow" className="flex items-center gap-2" data-testid="tab-maxflow">
              <Shield className="h-4 w-4" />
              MaxFlow
            </TabsTrigger>
            <TabsTrigger value="gooddollar" className="flex items-center gap-2" data-testid="tab-gooddollar">
              <Gift className="h-4 w-4" />
              GoodDollar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="maxflow" className="space-y-4 mt-4">
            {/* Face Check - First priority for new users */}
            {(isLoadingFaceVerification || isLoadingGdIdentity) ? (
              <Card className="p-4">
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              </Card>
            ) : (faceVerificationData?.isDuplicate && !isGdVerified) ? (
              <Card className="p-4 border-amber-500">
                <div className="text-center space-y-3 py-4">
                  <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mx-auto">
                    <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-amber-700 dark:text-amber-400">Duplicate Face Detected</h3>
                    <p className="text-sm text-muted-foreground">
                      This face was already verified with another wallet
                    </p>
                  </div>
                </div>
              </Card>
            ) : (!faceVerificationData?.verified) ? (
              <Card className="p-4">
                <Suspense fallback={
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }>
                  <FaceVerification
                    key={faceVerificationKey}
                    walletAddress={address || ''}
                    onComplete={(success, data) => {
                      if (success) {
                        queryClient.invalidateQueries({ queryKey: ['/api/face-verification', address] });
                        queryClient.invalidateQueries({ queryKey: ['/api/xp', address] });
                        setAutoFaceCheck(false);
                        if (data?.pendingXp && data.pendingXp > 0) {
                          toast({
                            title: "Face Verified!",
                            description: `${data.pendingXp} XP waiting - vouch for someone to claim it.`,
                          });
                        } else if (data?.xpAwarded && data.xpAwarded > 0) {
                          toast({
                            title: "Face Verification Complete",
                            description: `You've earned ${data.xpAwarded} XP!`,
                          });
                        } else {
                          toast({
                            title: "Face Verification Complete",
                            description: "Verification successful!",
                          });
                        }
                      }
                    }}
                    onReset={() => {
                      setFaceVerificationKey(prev => prev + 1);
                    }}
                  />
                </Suspense>
              </Card>
            ) : null}

            {/* Pending XP Banner - Shows when user is face verified but has pending XP (hasn't vouched yet) */}
            {faceVerificationData?.verified && xpData?.pendingFaceXp && xpData.pendingFaceXp > 0 && (
              <Card className="p-4 border-2 border-primary bg-primary/5" data-testid="card-pending-xp">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground" data-testid="text-pending-xp-amount">
                      {xpData.pendingFaceXp} XP waiting!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Vouch for a friend or whoever invited you to unlock your reward.
                    </p>
                  </div>
                  <Button 
                    size="sm"
                    onClick={() => setShowVouchInput(true)}
                    data-testid="button-pending-xp-vouch"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Vouch
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-6 space-y-6">
              {!isLoadingMaxFlow && score === 0 ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-[#30A99C] dark:text-[#40C4B5]" />
                      <span className="font-label text-muted-foreground text-xs">// MAXFLOW</span>
                    </div>
                    <Link href="/faqs#maxflow">
                      <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-maxflow-info">
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </Link>
                  </div>

                  <div className="text-center space-y-1">
                    <p className="font-mono text-5xl font-bold">0</p>
                    <span className="text-sm text-muted-foreground">Trust Signal</span>
                  </div>

                  <p className="text-sm text-muted-foreground text-center">
                    Get vouched to build your signal and unlock XP.
                  </p>

                  <div className="text-center py-2 px-3 bg-muted/50 border border-foreground/10" data-testid="text-user-address">
                    <span className="text-xs text-muted-foreground">Share: </span>
                    <span className="font-mono text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="flex justify-end -mt-2 -mr-2">
                    <Link href="/faqs#maxflow">
                      <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-maxflow-info">
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </Link>
                  </div>
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
                          i < Math.round(score / 10) ? 'bg-[#30A99C] dark:bg-[#40C4B5]' : 'bg-muted'
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
                                <span className="text-muted-foreground">Maximum Flow</span>
                                <span className="font-mono font-medium">{(scoreData.algorithm_breakdown.flow_component ?? 0).toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between items-center" data-testid="metric-min-cut">
                                <span className="text-muted-foreground">Minimum Cut</span>
                                <span className="font-mono font-medium">{(scoreData.algorithm_breakdown.actual_min_cut ?? 0).toFixed(1)}</span>
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
                  <div className="text-xs text-muted-foreground bg-muted/50 p-3 border border-foreground/10 flex gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Your Signal reflects the trust of those who vouch for you, balanced against the risk of those you vouch for. Be selective — vouch only for people you genuinely trust.</span>
                  </div>
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

            <Card className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  <span className="font-label text-muted-foreground text-xs">// XP_REWARDS</span>
                </div>
                <Link href="/faqs#experience-points">
                  <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-xp-info">
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </Link>
              </div>

              <div className="text-center space-y-1">
                {isLoadingXp ? (
                  <p className="font-mono text-5xl font-bold">--</p>
                ) : (
                  <p className="font-mono text-5xl font-bold tabular-nums" data-testid="text-xp-balance">
                    {(xpData?.totalXp ?? 0).toFixed(0)}
                  </p>
                )}
                <span className="text-sm text-muted-foreground">XP Balance</span>
              </div>

              {score > 0 ? (
                <>
                  {!isLoadingXp && xpData && (
                    <div className="space-y-3">
                      {xpData.canClaim ? (
                        <Button
                          onClick={() => claimXpMutation.mutate()}
                          disabled={claimXpMutation.isPending}
                          className="w-full"
                          size="lg"
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
                              CLAIM {(((score * score) / 100 + Math.sqrt(score)) / 2).toFixed(2)} XP
                            </>
                          )}
                        </Button>
                      ) : timeRemaining === 0 ? (
                        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted border border-foreground/10">
                          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                          <span className="font-mono text-sm text-muted-foreground">
                            {isFetchingXp ? 'Refreshing...' : 'Ready soon...'}
                          </span>
                        </div>
                      ) : timeRemaining !== null && timeRemaining > 0 ? (
                        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-muted border border-foreground/10">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm text-muted-foreground" data-testid="text-xp-cooldown">
                            {formatTimeRemaining(timeRemaining)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground" data-testid="text-xp-no-signal">
                    Get vouched to earn XP from your signal
                  </p>
                </div>
              )}
              
              <Button
                onClick={() => setShowRedeemConfirm(true)}
                disabled={(xpData?.totalXp ?? 0) < 100 || redeemXpMutation.isPending || !usdcDailyStatus?.eligible}
                variant={(xpData?.totalXp ?? 0) >= 100 && usdcDailyStatus?.eligible ? "default" : "outline"}
                className="w-full mt-3 disabled:bg-neutral-300 disabled:text-neutral-700 disabled:border-neutral-300"
                size="lg"
                data-testid="button-redeem-xp"
              >
                {redeemXpMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    REDEEMING...
                  </>
                ) : !usdcDailyStatus ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    CHECKING...
                  </>
                ) : usdcDailyStatus.alreadyRedeemedToday ? (
                  <>
                    <Clock className="h-4 w-4 mr-2" />
                    REDEEMED TODAY
                  </>
                ) : !usdcDailyStatus.faceVerified ? (
                  <>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    FACE CHECK REQUIRED
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4 mr-2" />
                    GET 1 USDC FOR 100 XP
                  </>
                )}
              </Button>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-white">S</span>
                  </div>
                  <span className="font-medium">SENADOR</span>
                </div>
                <div className="flex items-center gap-2">
                  {isLoadingSenador || isLoadingSenadorPrice ? (
                    <span className="font-mono font-bold">--</span>
                  ) : senadorData?.balance && senadorData.balance > 0n ? (
                    <div className="text-right">
                      <span className="font-mono font-bold" data-testid="text-senador-balance">
                        {senadorData.balanceFormatted}
                      </span>
                      {senadorPrice && senadorPrice.price > 0 && (
                        <div className="text-xs text-muted-foreground font-mono" data-testid="text-senador-value">
                          ${(Number(senadorData.balance) / 1e18 * senadorPrice.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  ) : senadorPrice && senadorPrice.price > 0 ? (
                    <span className="font-mono text-muted-foreground" data-testid="text-senador-price">
                      ${senadorPrice.priceFormatted}
                    </span>
                  ) : (
                    <span className="font-mono font-bold">0</span>
                  )}
                  <Link href="/faqs#senador-token">
                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-senador-info">
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </Link>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Experimental token on Celo. 1 XP = 1 SENADOR.
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Amount of XP"
                    value={senadorAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d+$/.test(val)) {
                        setSenadorAmount(val);
                      }
                    }}
                    min="1"
                    step="1"
                    max={xpData?.totalXp ?? 0}
                    className="flex-1"
                    data-testid="input-senador-amount"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSenadorAmount(String(Math.floor(xpData?.totalXp ?? 0)))}
                    disabled={!xpData || xpData.totalXp < 1}
                    data-testid="button-senador-max"
                  >
                    MAX
                  </Button>
                </div>
                
                <Button
                  onClick={() => setShowSenadorConfirm(true)}
                  disabled={
                    !senadorAmount || 
                    parseFloat(senadorAmount) < 1 || 
                    parseFloat(senadorAmount) > (xpData?.totalXp ?? 0) ||
                    redeemSenadorMutation.isPending
                  }
                  className="w-full"
                  size="lg"
                  data-testid="button-exchange-senador"
                >
                  {redeemSenadorMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      EXCHANGING...
                    </>
                  ) : (
                    <>
                      GET {senadorAmount || '0'} SENADOR FOR {senadorAmount || '0'} XP
                    </>
                  )}
                </Button>
              </div>
            </Card>

            <div className="flex justify-center gap-4 pt-2">
              <a 
                href="https://maxflow.one" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                maxflow.one
              </a>
              <a 
                href="https://maxflow.one/whitepaper" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
                data-testid="link-whitepaper"
              >
                whitepaper
              </a>
            </div>
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
              ) : isGdEligible ? (
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

                  {gdIdentity?.daysUntilExpiry !== null && gdIdentity?.daysUntilExpiry !== undefined && gdIdentity.daysUntilExpiry <= 30 && (
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
                          {gdCountdown || '--:--:--'}
                        </p>
                      </div>
                    </div>
                  )}

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

                  <div className="pt-3 border-t mt-4">
                    <Button
                      size="lg"
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white disabled:bg-neutral-300 disabled:text-neutral-700"
                      onClick={() => setShowGdExchangeDialog(true)}
                      disabled={parseFloat((gdBalance?.balanceFormatted || '0').replace(/,/g, '')) < 10}
                      data-testid="button-buy-xp-gd-unverified"
                    >
                      <Sparkles className="h-4 w-4" />
                      BUY XP WITH G$
                    </Button>
                    {parseFloat((gdBalance?.balanceFormatted || '0').replace(/,/g, '')) < 10 && (
                      <p className="text-xs text-muted-foreground text-center mt-2">
                        Need at least 10 G$ to exchange for XP
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {isGdEligible && (
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

      <AlertDialog open={showRedeemConfirm} onOpenChange={setShowRedeemConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem 100 XP for 1 USDC?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will deduct 100 XP from your balance and deposit 1 USDC to your savings on Celo.</p>
              <p className="text-sm font-medium">The USDC will appear in your Earn page and start earning yield immediately.</p>
              <div className="p-2 mt-2 border rounded bg-muted/30 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  {usdcDailyStatus?.faceVerified ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                  )}
                  <span>Face Check completed</span>
                </div>
                <div className="flex items-center gap-2">
                  {!usdcDailyStatus?.alreadyRedeemedToday ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                  )}
                  <span>Daily limit: 1 per day</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={redeemXpMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => redeemXpMutation.mutate()}
              disabled={redeemXpMutation.isPending || !usdcDailyStatus?.eligible}
              data-testid="button-confirm-redeem"
            >
              {redeemXpMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Confirm Redemption'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSenadorConfirm} onOpenChange={setShowSenadorConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exchange {senadorAmount} XP for SENADOR?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This will deduct {senadorAmount} XP from your balance and send you {senadorAmount} SENADOR tokens on Celo.</p>
              <p className="text-sm font-medium">The tokens will be transferred to your wallet address.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={redeemSenadorMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => redeemSenadorMutation.mutate(parseFloat(senadorAmount))}
              disabled={redeemSenadorMutation.isPending}
              data-testid="button-confirm-senador"
            >
              {redeemSenadorMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                'Confirm Exchange'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showGdExchangeDialog} onOpenChange={setShowGdExchangeDialog}>
        <DialogContent className="max-w-[320px] p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">Buy XP with G$</DialogTitle>
          </DialogHeader>
          
          {/* Eligibility Check */}
          {gdDailyStatus && !gdDailyStatus.eligible ? (
            <div className="space-y-3">
              <div className="p-3 border rounded bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Requirements to exchange G$ for XP:</p>
                <ul className="text-xs space-y-1 text-amber-700 dark:text-amber-300">
                  <li className="flex items-center gap-2">
                    {gdDailyStatus.faceVerified ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    )}
                    Face Check completed
                  </li>
                  <li className="flex items-center gap-2">
                    {gdDailyStatus.gdVerified ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-amber-500" />
                    )}
                    GoodDollar identity verified
                  </li>
                </ul>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowGdExchangeDialog(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Daily Limit Info */}
              {gdDailyStatus && (
                <div className="p-2 border rounded bg-muted/30 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Daily limit:</span>
                    <span className="font-mono">{gdDailyStatus.remaining.toFixed(0)} / {gdDailyStatus.dailyLimit} G$ left</span>
                  </div>
                </div>
              )}
              
              <div>
                <div className="relative">
                  <Input
                    id="gd-amount"
                    type="number"
                    inputMode="decimal"
                    min="10"
                    step="10"
                    max={gdDailyStatus?.remaining || 1000}
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

              {gdDailyStatus && parseFloat(gdExchangeAmount || '0') > gdDailyStatus.remaining && (
                <p className="text-xs text-destructive">Exceeds daily limit ({gdDailyStatus.remaining.toFixed(0)} G$ remaining)</p>
              )}

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
                    parseFloat(gdExchangeAmount || '0') > parseFloat(gdBalance?.balanceFormatted?.replace(/,/g, '') || '0') ||
                    (gdDailyStatus && parseFloat(gdExchangeAmount || '0') > gdDailyStatus.remaining)
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
