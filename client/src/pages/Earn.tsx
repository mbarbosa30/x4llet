import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Percent, 
  Loader2, 
  ArrowUpToLine, 
  ArrowDownToLine, 
  Info,
  Shield,
  Zap,
  DollarSign,
  ChevronRight,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getWallet, getPreferences, savePreferences, getPrivateKey } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { NETWORKS, getNetworkByChainId } from '@shared/networks';
import { supplyToAave, withdrawFromAave, parseAmountToMicroUsdc } from '@/lib/aave';
import { formatPrecisionBalance } from '@/components/PrecisionBalance';
import { useEarningAnimation } from '@/hooks/use-earning-animation';
import { apiRequest } from '@/lib/queryClient';

interface AaveApyData {
  chainId: number;
  apy: number;
  apyFormatted: string;
  aTokenAddress: string;
}

export default function Earn() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [earnMode, setEarnMode] = useState(false);
  const [earnModeLoading, setEarnModeLoading] = useState(false);
  const [showAaveDeposit, setShowAaveDeposit] = useState(false);
  const [showAaveWithdraw, setShowAaveWithdraw] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedChain, setSelectedChain] = useState<number>(42220);
  const [aaveOperationStep, setAaveOperationStep] = useState<'input' | 'gas_check' | 'gas_drip' | 'signing' | 'submitting' | 'complete'>('input');
  const [gasDripPending, setGasDripPending] = useState(false);
  const [isOperating, setIsOperating] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const wallet = await getWallet();
        if (wallet) {
          setAddress(wallet.address);
        }
        
        const prefs = await getPreferences();
        setEarnMode(prefs.earnMode || false);
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    setDepositAmount('');
  }, [selectedChain]);

  const handleEarnModeChange = async (enabled: boolean) => {
    setEarnModeLoading(true);
    try {
      const prefs = await getPreferences();
      setEarnMode(enabled);
      await savePreferences({ ...prefs, earnMode: enabled });
      toast({
        title: enabled ? "Earn Mode enabled" : "Earn Mode disabled",
        description: enabled 
          ? "Your idle USDC can now earn interest" 
          : "Auto-deposit has been turned off",
      });
    } catch (error) {
      console.error('Failed to update earn mode:', error);
      setEarnMode(!enabled);
      toast({
        title: "Failed to update",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setEarnModeLoading(false);
    }
  };

  const { data: aaveApyBase, isLoading: isApyBaseLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 8453],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/8453');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  const { data: aaveApyCelo, isLoading: isApyCeloLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42220],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42220');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  const { data: aaveBalanceBase, isLoading: isAaveBalanceBaseLoading } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 8453],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=8453`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: aaveBalanceCelo, isLoading: isAaveBalanceCeloLoading } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 42220],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=42220`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const totalAaveBalanceMicro = String(
    (aaveBalanceBase?.aUsdcBalance ? parseFloat(aaveBalanceBase.aUsdcBalance) : 0) +
    (aaveBalanceCelo?.aUsdcBalance ? parseFloat(aaveBalanceCelo.aUsdcBalance) : 0)
  );

  const calculateWeightedApy = () => {
    const baseBalance = aaveBalanceBase?.aUsdcBalance ? parseFloat(aaveBalanceBase.aUsdcBalance) : 0;
    const celoBalance = aaveBalanceCelo?.aUsdcBalance ? parseFloat(aaveBalanceCelo.aUsdcBalance) : 0;
    const totalBalance = baseBalance + celoBalance;
    if (totalBalance === 0) {
      const baseApy = aaveApyBase?.apy || 0;
      const celoApy = aaveApyCelo?.apy || 0;
      return Math.max(baseApy, celoApy);
    }
    const baseApy = aaveBalanceBase?.apy || 0;
    const celoApy = aaveBalanceCelo?.apy || 0;
    return ((baseApy * baseBalance) + (celoApy * celoBalance)) / totalBalance;
  };

  const weightedApy = calculateWeightedApy();

  const totalEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: totalAaveBalanceMicro,
    apyRate: weightedApy / 100,
    enabled: parseFloat(totalAaveBalanceMicro) > 0,
    minPrecision: 5,
  });

  const baseEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: aaveBalanceBase?.aUsdcBalance || '0',
    apyRate: (aaveBalanceBase?.apy || 0) / 100,
    enabled: parseFloat(aaveBalanceBase?.aUsdcBalance || '0') > 0,
    minPrecision: 5,
  });

  const celoEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: aaveBalanceCelo?.aUsdcBalance || '0',
    apyRate: (aaveBalanceCelo?.apy || 0) / 100,
    enabled: parseFloat(aaveBalanceCelo?.aUsdcBalance || '0') > 0,
    minPrecision: 5,
  });

  const { data: liquidBalanceBase } = useQuery<{ balance: string; balanceMicro: string }>({
    queryKey: ['/api/balance', address, 8453],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}?chainId=8453`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: liquidBalanceCelo } = useQuery<{ balance: string; balanceMicro: string }>({
    queryKey: ['/api/balance', address, 42220],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}?chainId=42220`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const checkGasBalance = async (chainId: number): Promise<{ hasEnoughGas: boolean; balance: string; required: string }> => {
    if (!address) throw new Error('No wallet address');
    const res = await fetch(`/api/gas-balance/${address}?chainId=${chainId}`);
    if (!res.ok) throw new Error('Failed to check gas balance');
    return res.json();
  };

  const requestGasDrip = async (chainId: number): Promise<{ success: boolean; txHash?: string; error?: string; nextDripAvailable?: string }> => {
    if (!address) throw new Error('No wallet address');
    const res = await apiRequest('POST', '/api/gas-drip', { address, chainId });
    const data = await res.json();
    
    if (!res.ok) {
      if (res.status === 429) {
        const nextDrip = data.nextDripAvailable ? new Date(data.nextDripAvailable) : null;
        const hoursRemaining = nextDrip ? Math.ceil((nextDrip.getTime() - Date.now()) / (1000 * 60 * 60)) : 24;
        return { 
          success: false, 
          error: `Rate limited. You can request gas again in ${hoursRemaining} hours.`,
          nextDripAvailable: data.nextDripAvailable,
        };
      }
      return { success: false, error: data.error || 'Failed to request gas' };
    }
    
    return { success: true, ...data };
  };

  const handleAaveDeposit = async () => {
    if (!address || !depositAmount || isOperating) return;
    
    setIsOperating(true);
    const amountInMicroUsdc = parseAmountToMicroUsdc(depositAmount);
    
    try {
      setAaveOperationStep('gas_check');
      
      const gasCheck = await checkGasBalance(selectedChain);
      
      if (!gasCheck.hasEnoughGas) {
        setAaveOperationStep('gas_drip');
        setGasDripPending(true);
        
        const dripResult = await requestGasDrip(selectedChain);
        
        if (dripResult.success) {
          toast({
            title: "Gas Sent",
            description: "A small amount of gas has been sent to your wallet.",
          });
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        setGasDripPending(false);
      }
      
      setAaveOperationStep('signing');
      
      const pk = await getPrivateKey();
      if (!pk) {
        toast({
          title: "Wallet Locked",
          description: "Please unlock your wallet to continue.",
          variant: "destructive",
        });
        setAaveOperationStep('input');
        setIsOperating(false);
        return;
      }
      
      setAaveOperationStep('submitting');
      
      toast({
        title: "Depositing to Aave",
        description: "Please wait while we deposit your USDC...",
      });
      
      const result = await supplyToAave(pk, selectedChain, amountInMicroUsdc, address);
      
      if (!result.success) {
        throw new Error(result.error || 'Deposit failed');
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/aave/balance'] });
      
      toast({
        title: "Deposit Complete",
        description: `Successfully deposited ${depositAmount} USDC to Aave!`,
      });
      
      setAaveOperationStep('complete');
      setTimeout(() => {
        setShowAaveDeposit(false);
        setDepositAmount('');
        setAaveOperationStep('input');
        setIsOperating(false);
      }, 2000);
      
    } catch (error) {
      console.error('Aave deposit failed:', error);
      toast({
        title: "Deposit Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      setAaveOperationStep('input');
      setGasDripPending(false);
      setIsOperating(false);
    }
  };

  const handleAaveWithdraw = async () => {
    if (!address || !withdrawAmount || isOperating) return;
    
    setIsOperating(true);
    const amountInMicroUsdc = parseAmountToMicroUsdc(withdrawAmount);
    
    try {
      setAaveOperationStep('gas_check');
      
      const gasCheck = await checkGasBalance(selectedChain);
      
      if (!gasCheck.hasEnoughGas) {
        setAaveOperationStep('gas_drip');
        setGasDripPending(true);
        
        const dripResult = await requestGasDrip(selectedChain);
        
        if (dripResult.success) {
          toast({
            title: "Gas Sent",
            description: "A small amount of gas has been sent to your wallet.",
          });
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        setGasDripPending(false);
      }
      
      setAaveOperationStep('signing');
      
      const pk = await getPrivateKey();
      if (!pk) {
        toast({
          title: "Wallet Locked",
          description: "Please unlock your wallet to continue.",
          variant: "destructive",
        });
        setAaveOperationStep('input');
        setIsOperating(false);
        return;
      }
      
      setAaveOperationStep('submitting');
      
      toast({
        title: "Withdrawing from Aave",
        description: "Please wait while we withdraw your USDC...",
      });
      
      const result = await withdrawFromAave(pk, selectedChain, amountInMicroUsdc, address);
      
      if (!result.success) {
        throw new Error(result.error || 'Withdrawal failed');
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/aave/balance'] });
      
      toast({
        title: "Withdrawal Complete",
        description: `Successfully withdrew ${withdrawAmount} USDC from Aave!`,
      });
      
      setAaveOperationStep('complete');
      setTimeout(() => {
        setShowAaveWithdraw(false);
        setWithdrawAmount('');
        setAaveOperationStep('input');
        setIsOperating(false);
      }, 2000);
      
    } catch (error) {
      console.error('Aave withdraw failed:', error);
      toast({
        title: "Withdrawal Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      setAaveOperationStep('input');
      setGasDripPending(false);
      setIsOperating(false);
    }
  };

  const getMaxDepositAmount = (): string => {
    const balance = selectedChain === 8453 ? liquidBalanceBase : liquidBalanceCelo;
    if (!balance?.balanceMicro) return '0.00';
    const balanceNum = parseFloat(balance.balanceMicro) / 1000000;
    return balanceNum.toFixed(2);
  };

  const getMaxWithdrawAmount = (): string => {
    const balance = selectedChain === 8453 ? aaveBalanceBase : aaveBalanceCelo;
    if (!balance?.aUsdcBalance) return '0.00';
    const { full } = formatPrecisionBalance(balance.aUsdcBalance);
    return full;
  };

  const getTotalAaveBalance = (): number => {
    const baseBalance = aaveBalanceBase?.aUsdcBalance ? parseFloat(aaveBalanceBase.aUsdcBalance) : 0;
    const celoBalance = aaveBalanceCelo?.aUsdcBalance ? parseFloat(aaveBalanceCelo.aUsdcBalance) : 0;
    return (baseBalance + celoBalance) / 1000000;
  };

  const resetAaveDialog = () => {
    setDepositAmount('');
    setWithdrawAmount('');
    setAaveOperationStep('input');
    setGasDripPending(false);
    setIsOperating(false);
  };

  const hasAaveBalance = getTotalAaveBalance() > 0;
  const baseBalanceNum = aaveBalanceBase?.aUsdcBalance ? parseFloat(aaveBalanceBase.aUsdcBalance) / 1e6 : 0;
  const celoBalanceNum = aaveBalanceCelo?.aUsdcBalance ? parseFloat(aaveBalanceCelo.aUsdcBalance) / 1e6 : 0;

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold" data-testid="text-earn-title">Earn</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Put your USDC to work and earn interest automatically
          </p>
        </div>

        <Card className="p-5 space-y-4" data-testid="card-earning-balance">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Total Earning</div>
            <Badge variant="outline" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              {weightedApy.toFixed(2)}% APY
            </Badge>
          </div>
          
          <div className="text-center py-4">
            {isAaveBalanceBaseLoading || isAaveBalanceCeloLoading ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : hasAaveBalance ? (
              <div className="space-y-1">
                <div className="text-5xl font-medium tabular-nums flex items-center justify-center" data-testid="text-earning-amount">
                  <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
                  <span className="flex items-baseline">
                    <span>{Math.floor(totalEarningAnimation.animatedValue)}</span>
                    <span className="opacity-90">.{totalEarningAnimation.mainDecimals}</span>
                    {totalEarningAnimation.extraDecimals && (
                      <span className="text-2xl opacity-50 text-green-500 dark:text-green-400">
                        {totalEarningAnimation.extraDecimals}
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">USDC earning interest</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-5xl font-medium tabular-nums flex items-center justify-center">
                  <span className="text-3xl font-normal opacity-50 mr-1.5">$</span>
                  <span>0.00</span>
                </div>
                <div className="text-xs text-muted-foreground">No deposits yet</div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button 
              className="flex-1" 
              onClick={() => {
                resetAaveDialog();
                setShowAaveDeposit(true);
              }}
              data-testid="button-earn-deposit"
            >
              <ArrowUpToLine className="h-4 w-4 mr-2" />
              Deposit
            </Button>
            <Button 
              variant="outline"
              className="flex-1" 
              onClick={() => {
                resetAaveDialog();
                setShowAaveWithdraw(true);
              }}
              disabled={!hasAaveBalance}
              data-testid="button-earn-withdraw"
            >
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Withdraw
            </Button>
          </div>
        </Card>

        {hasAaveBalance && (
          <Card className="p-4 space-y-3" data-testid="card-chain-breakdown">
            <div className="text-sm font-medium">Balance by Network</div>
            
            {baseBalanceNum > 0 && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-600">B</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Base</div>
                    <div className="text-xs text-muted-foreground">{aaveApyBase?.apyFormatted || '—'} APY</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-medium tabular-nums flex items-baseline justify-end">
                    <span className="text-sm opacity-50 mr-0.5">$</span>
                    <span>{Math.floor(baseEarningAnimation.animatedValue)}</span>
                    <span className="opacity-90">.{baseEarningAnimation.mainDecimals}</span>
                    {baseEarningAnimation.extraDecimals && (
                      <span className="text-xs opacity-50 text-green-500 dark:text-green-400">
                        {baseEarningAnimation.extraDecimals}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {celoBalanceNum > 0 && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-yellow-600">C</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Celo</div>
                    <div className="text-xs text-muted-foreground">{aaveApyCelo?.apyFormatted || '—'} APY</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-medium tabular-nums flex items-baseline justify-end">
                    <span className="text-sm opacity-50 mr-0.5">$</span>
                    <span>{Math.floor(celoEarningAnimation.animatedValue)}</span>
                    <span className="opacity-90">.{celoEarningAnimation.mainDecimals}</span>
                    {celoEarningAnimation.extraDecimals && (
                      <span className="text-xs opacity-50 text-green-500 dark:text-green-400">
                        {celoEarningAnimation.extraDecimals}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        <Card className="p-4 space-y-3" data-testid="card-apy-rates">
          <div className="text-sm font-medium">Current APY Rates</div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">Base</div>
              {isApyBaseLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                <div className="text-lg font-bold text-primary" data-testid="text-base-apy">
                  {aaveApyBase?.apyFormatted || '—'}
                </div>
              )}
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <div className="text-xs text-muted-foreground mb-1">Celo</div>
              {isApyCeloLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                <div className="text-lg font-bold text-primary" data-testid="text-celo-apy">
                  {aaveApyCelo?.apyFormatted || '—'}
                </div>
              )}
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            Rates update automatically based on market conditions
          </p>
        </Card>

        <Card className="p-4 space-y-4" data-testid="card-how-it-works">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            <div className="text-sm font-medium">How Earning Works</div>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div>
                <div className="text-sm font-medium">Deposit USDC</div>
                <div className="text-xs text-muted-foreground">
                  Move your USDC into Aave's lending pool
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <div className="text-sm font-medium">Earn Interest</div>
                <div className="text-xs text-muted-foreground">
                  Your balance grows every second from lending interest
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">3</span>
              </div>
              <div>
                <div className="text-sm font-medium">Withdraw Anytime</div>
                <div className="text-xs text-muted-foreground">
                  Get your USDC back plus earned interest whenever you need it
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-3" data-testid="card-features">
          <div className="text-sm font-medium">Why Earn with nanoPay?</div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2">
              <Shield className="h-5 w-5 text-green-600" />
              <div className="text-sm">
                <span className="font-medium">Secure</span>
                <span className="text-muted-foreground"> — Powered by Aave, DeFi's leading protocol</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <div className="text-sm">
                <span className="font-medium">Gasless Deposits</span>
                <span className="text-muted-foreground"> — We cover gas fees for you</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div className="text-sm">
                <span className="font-medium">Real-time</span>
                <span className="text-muted-foreground"> — Watch your balance grow live</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-2">
              <DollarSign className="h-5 w-5 text-purple-600" />
              <div className="text-sm">
                <span className="font-medium">No Minimums</span>
                <span className="text-muted-foreground"> — Start earning with any amount</span>
              </div>
            </div>
          </div>
        </Card>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="faq-1">
            <AccordionTrigger className="text-sm">What is Aave?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Aave is a decentralized lending protocol where users can deposit assets to earn interest, 
              or borrow against their deposits. It's one of the largest and most trusted DeFi protocols 
              with billions of dollars in assets.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-2">
            <AccordionTrigger className="text-sm">How is interest calculated?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Interest accrues continuously (every second) based on the current APY rate. The rate is 
              variable and changes based on supply and demand in the lending market. You receive aUSDC 
              tokens which automatically increase in value as interest accrues.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-3">
            <AccordionTrigger className="text-sm">Is my deposit safe?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Aave is battle-tested with billions in deposits and has been audited by multiple security 
              firms. However, as with all DeFi protocols, there are smart contract risks. Only deposit 
              what you're comfortable with.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="faq-4">
            <AccordionTrigger className="text-sm">Why are there two networks?</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              nanoPay supports both Base and Celo networks. Each network has its own Aave deployment 
              with different APY rates. You can deposit on either network based on where your USDC is 
              and which rate is more attractive.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>

      <Dialog open={showAaveDeposit} onOpenChange={(open) => {
        if (!open) resetAaveDialog();
        setShowAaveDeposit(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit to Earn</DialogTitle>
            <DialogDescription>
              Deposit USDC to start earning interest via Aave
            </DialogDescription>
          </DialogHeader>
          
          {aaveOperationStep === 'input' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Network</Label>
                <Select 
                  value={selectedChain.toString()} 
                  onValueChange={(v) => setSelectedChain(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-deposit-chain">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8453">Base ({aaveApyBase?.apyFormatted || '—'} APY)</SelectItem>
                    <SelectItem value="42220">Celo ({aaveApyCelo?.apyFormatted || '—'} APY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Amount (USDC)</Label>
                  <button 
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setDepositAmount(getMaxDepositAmount())}
                    data-testid="button-deposit-max"
                  >
                    Max: ${getMaxDepositAmount()}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="input-deposit-amount"
                />
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'gas_check' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Checking gas balance...</div>
            </div>
          )}
          
          {aaveOperationStep === 'gas_drip' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Sending gas to your wallet...</div>
              <div className="text-xs text-muted-foreground">This may take a few seconds</div>
            </div>
          )}
          
          {aaveOperationStep === 'signing' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Preparing transaction...</div>
            </div>
          )}
          
          {aaveOperationStep === 'submitting' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Depositing to Aave...</div>
              <div className="text-xs text-muted-foreground">Please wait for confirmation</div>
            </div>
          )}
          
          {aaveOperationStep === 'complete' && (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <div className="text-sm font-medium">Deposit Complete!</div>
              <div className="text-xs text-muted-foreground">Your USDC is now earning interest</div>
            </div>
          )}
          
          <DialogFooter>
            {aaveOperationStep === 'input' && (
              <>
                <Button variant="outline" onClick={() => setShowAaveDeposit(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAaveDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0 || parseFloat(depositAmount) > parseFloat(getMaxDepositAmount())}
                  data-testid="button-confirm-deposit"
                >
                  Deposit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAaveWithdraw} onOpenChange={(open) => {
        if (!open) resetAaveDialog();
        setShowAaveWithdraw(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw from Aave</DialogTitle>
            <DialogDescription>
              Withdraw your USDC plus earned interest
            </DialogDescription>
          </DialogHeader>
          
          {aaveOperationStep === 'input' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Network</Label>
                <Select 
                  value={selectedChain.toString()} 
                  onValueChange={(v) => setSelectedChain(parseInt(v))}
                >
                  <SelectTrigger data-testid="select-withdraw-chain">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8453" disabled={baseBalanceNum === 0}>
                      Base (${baseBalanceNum.toFixed(2)} available)
                    </SelectItem>
                    <SelectItem value="42220" disabled={celoBalanceNum === 0}>
                      Celo (${celoBalanceNum.toFixed(2)} available)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Amount (USDC)</Label>
                  <button 
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setWithdrawAmount(getMaxWithdrawAmount())}
                    data-testid="button-withdraw-max"
                  >
                    Max: ${getMaxWithdrawAmount()}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="input-withdraw-amount"
                />
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'gas_check' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Checking gas balance...</div>
            </div>
          )}
          
          {aaveOperationStep === 'gas_drip' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Sending gas to your wallet...</div>
              <div className="text-xs text-muted-foreground">This may take a few seconds</div>
            </div>
          )}
          
          {aaveOperationStep === 'signing' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Preparing transaction...</div>
            </div>
          )}
          
          {aaveOperationStep === 'submitting' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="text-sm">Withdrawing from Aave...</div>
              <div className="text-xs text-muted-foreground">Please wait for confirmation</div>
            </div>
          )}
          
          {aaveOperationStep === 'complete' && (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <div className="text-sm font-medium">Withdrawal Complete!</div>
              <div className="text-xs text-muted-foreground">USDC has been returned to your wallet</div>
            </div>
          )}
          
          <DialogFooter>
            {aaveOperationStep === 'input' && (
              <>
                <Button variant="outline" onClick={() => setShowAaveWithdraw(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAaveWithdraw}
                  disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > parseFloat(getMaxWithdrawAmount())}
                  data-testid="button-confirm-withdraw"
                >
                  Withdraw
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
