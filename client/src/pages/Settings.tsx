import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { ChevronRight, Globe, DollarSign, Key, Copy, Check, Eye, EyeOff, Lock, Palette, BookOpen, HelpCircle, MessageCircleQuestion, TrendingDown, TrendingUp, Percent, Loader2, ArrowUpToLine, ArrowDownToLine, Fuel, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import InstallPrompt from '@/components/InstallPrompt';
import { getWallet, getPreferences, savePreferences, getPrivateKey, lockWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
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
import { NETWORKS, getNetworkByChainId } from '@shared/networks';
import { supplyToAave, withdrawFromAave, parseAmountToMicroUsdc } from '@/lib/aave';
import { formatPrecisionBalance } from '@/components/PrecisionBalance';
import { useEarningAnimation } from '@/hooks/use-earning-animation';

interface ExchangeRateData {
  currency: string;
  rate: number;
}

interface InflationData {
  currency: string;
  dailyRate: number;
  monthlyRate: number;
  annualRate: number;
}

interface AaveApyData {
  chainId: number;
  apy: number;
  apyFormatted: string;
  aTokenAddress: string;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [showExportPrivateKey, setShowExportPrivateKey] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [showTheme, setShowTheme] = useState(false);
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
        setCurrency(prefs.currency);
        setLanguage(prefs.language);
        setEarnMode(prefs.earnMode || false);
        
        // Load theme from localStorage
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
        const initialTheme = savedTheme || 'light';
        setTheme(initialTheme);
        
        // Apply theme to document
        if (initialTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    };
    loadPreferences();
  }, []);

  // Reset deposit amount when chain selection changes
  useEffect(() => {
    setDepositAmount('');
  }, [selectedChain]);

  const handleCurrencyChange = async (newCurrency: string) => {
    setCurrency(newCurrency);
    await savePreferences({ currency: newCurrency, language });
    toast({
      title: "Currency updated",
    });
    setShowCurrency(false);
  };

  const handleExportPrivateKey = async () => {
    if (!password || password.length < 6) {
      toast({
        title: "Invalid Password",
        description: "Please enter your password",
        variant: "destructive",
      });
      return;
    }

    try {
      const key = await getPrivateKey(password);
      if (!key) {
        toast({
          title: "Export Failed",
          description: "Invalid password",
          variant: "destructive",
        });
        return;
      }
      
      setPrivateKey(key);
      setPassword('');
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Export Failed",
        description: "Invalid password",
        variant: "destructive",
      });
    }
  };

  const handleCopyPrivateKey = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      toast({
        title: "Copied",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClosePrivateKeyDialog = () => {
    setShowExportPrivateKey(false);
    setPrivateKey('');
    setPassword('');
    setShowPassword(false);
    setShowPrivateKey(false);
    setCopied(false);
  };

  const handleLockWallet = () => {
    lockWallet();
    toast({
      title: "Wallet locked",
    });
    setLocation('/unlock');
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Apply theme to document
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    toast({
      title: "Theme updated",
    });
    setShowTheme(false);
  };

  const handleEarnModeChange = async (enabled: boolean) => {
    setEarnModeLoading(true);
    try {
      setEarnMode(enabled);
      await savePreferences({ currency, language, earnMode: enabled });
      toast({
        title: enabled ? "Earn Mode enabled" : "Earn Mode disabled",
        description: enabled 
          ? "Your idle USDC will now earn interest" 
          : "Auto-deposit to Aave has been turned off",
      });
    } catch (error) {
      console.error('Failed to update earn mode:', error);
      setEarnMode(!enabled); // Revert on error
      toast({
        title: "Failed to update",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setEarnModeLoading(false);
    }
  };

  // Fetch Aave APY for Base (default network for yield display)
  const { data: aaveApy, isLoading: isApyLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 8453],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/8453');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  // Fetch exchange rate for selected currency
  const { data: exchangeRate } = useQuery<ExchangeRateData>({
    queryKey: ['/api/exchange-rate', currency],
    enabled: currency !== 'USD',
    queryFn: async () => {
      const res = await fetch(`/api/exchange-rate/${currency}`);
      if (!res.ok) throw new Error('Failed to fetch exchange rate');
      return res.json();
    },
  });

  // Fetch inflation data for selected currency
  const { data: inflationData } = useQuery<InflationData>({
    queryKey: ['/api/inflation-rate', currency],
    enabled: currency !== 'USD',
    queryFn: async () => {
      const res = await fetch(`/api/inflation-rate/${currency}`);
      if (!res.ok) throw new Error('Failed to fetch inflation rate');
      return res.json();
    },
  });

  // Fetch Aave balances for both chains
  const { data: aaveBalanceBase, isLoading: isAaveBalanceBaseLoading } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 8453],
    enabled: !!address && earnMode,
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=8453`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: aaveBalanceCelo, isLoading: isAaveBalanceCeloLoading } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 42220],
    enabled: !!address && earnMode,
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
    if (totalBalance === 0) return 0;
    const baseApy = aaveBalanceBase?.apy || 0;
    const celoApy = aaveBalanceCelo?.apy || 0;
    return ((baseApy * baseBalance) + (celoApy * celoBalance)) / totalBalance;
  };
  
  const weightedApy = calculateWeightedApy();

  const totalEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: totalAaveBalanceMicro,
    apyRate: weightedApy / 100,
    enabled: earnMode && parseFloat(totalAaveBalanceMicro) > 0,
  });

  const baseEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: aaveBalanceBase?.aUsdcBalance || '0',
    apyRate: (aaveBalanceBase?.apy || 0) / 100,
    enabled: earnMode && parseFloat(aaveBalanceBase?.aUsdcBalance || '0') > 0,
  });

  const celoEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: aaveBalanceCelo?.aUsdcBalance || '0',
    apyRate: (aaveBalanceCelo?.apy || 0) / 100,
    enabled: earnMode && parseFloat(aaveBalanceCelo?.aUsdcBalance || '0') > 0,
  });

  // Fetch Celo APY (always fetch for display in Earn Mode card)
  const { data: aaveApyCelo, isLoading: isApyCeloLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42220],
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42220');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  // Fetch chain-specific liquid USDC balances for deposit limits
  const { data: liquidBalanceBase } = useQuery<{ balance: string; balanceMicro: string }>({
    queryKey: ['/api/balance', address, 8453],
    enabled: !!address && earnMode,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}?chainId=8453`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: liquidBalanceCelo } = useQuery<{ balance: string; balanceMicro: string }>({
    queryKey: ['/api/balance', address, 42220],
    enabled: !!address && earnMode,
    queryFn: async () => {
      const res = await fetch(`/api/balance/${address}?chainId=42220`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Check gas balance before Aave operations
  const checkGasBalance = async (chainId: number): Promise<{ hasEnoughGas: boolean; balance: string; required: string }> => {
    if (!address) throw new Error('No wallet address');
    const res = await fetch(`/api/gas-balance/${address}?chainId=${chainId}`);
    if (!res.ok) throw new Error('Failed to check gas balance');
    return res.json();
  };

  // Request gas drip
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

  // Handle Aave deposit with gas check
  const handleAaveDeposit = async () => {
    if (!address || !depositAmount || isOperating) return;
    
    setIsOperating(true);
    const amountInMicroUsdc = parseAmountToMicroUsdc(depositAmount);
    
    try {
      setAaveOperationStep('gas_check');
      
      // Check gas balance
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

  // Handle Aave withdraw with gas check
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
    // balanceMicro is the canonical micro-USDC integer, convert to human readable
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

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-8">
        <InstallPrompt />

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Security
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setShowExportPrivateKey(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-export-private-key"
            >
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Export Private Key</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={handleLockWallet}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-lock-wallet"
            >
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Lock Wallet</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Preferences
          </h2>
          <Card className="divide-y">
            <div className="w-full flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Percent className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Earn Mode</div>
                  <div className="text-xs text-muted-foreground">
                    {isApyLoading && isApyCeloLoading ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading APY...
                      </span>
                    ) : aaveApy || aaveApyCelo ? (
                      <span>
                        Earn via Aave: Base {isApyLoading ? '...' : (aaveApy?.apyFormatted || '—')} · Celo {isApyCeloLoading ? '...' : (aaveApyCelo?.apyFormatted || '—')}
                      </span>
                    ) : (
                      'Auto-deposit idle USDC to earn interest'
                    )}
                  </div>
                </div>
              </div>
              <Switch
                checked={earnMode}
                onCheckedChange={handleEarnModeChange}
                disabled={earnModeLoading}
                data-testid="switch-earn-mode"
              />
            </div>
            
            {earnMode && (
              <div className="p-4 space-y-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Earning Balance
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {isAaveBalanceBaseLoading || isAaveBalanceCeloLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : parseFloat(totalAaveBalanceMicro) > 0 ? (
                      <span className="flex items-baseline">
                        <span>${Math.floor(totalEarningAnimation.animatedValue)}</span>
                        <span className="opacity-90">.{totalEarningAnimation.mainDecimals}</span>
                        {totalEarningAnimation.extraDecimals && (
                          <span className="text-[0.7em] opacity-50 text-green-500 dark:text-green-400">
                            {totalEarningAnimation.extraDecimals}
                          </span>
                        )}
                        <span className="ml-1">USDC</span>
                      </span>
                    ) : (
                      <span>$0.00 USDC</span>
                    )}
                  </div>
                </div>
                
                {(aaveBalanceBase?.aUsdcBalance && parseFloat(aaveBalanceBase.aUsdcBalance) > 0) || 
                 (aaveBalanceCelo?.aUsdcBalance && parseFloat(aaveBalanceCelo.aUsdcBalance) > 0) ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {aaveBalanceBase?.aUsdcBalance && parseFloat(aaveBalanceBase.aUsdcBalance) > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Base ({aaveApy?.apyFormatted || '—'} APY)</span>
                        <span className="tabular-nums flex items-baseline">
                          <span>${Math.floor(baseEarningAnimation.animatedValue)}</span>
                          <span className="opacity-90">.{baseEarningAnimation.mainDecimals}</span>
                          {baseEarningAnimation.extraDecimals && (
                            <span className="text-[0.7em] opacity-50 text-green-500 dark:text-green-400">
                              {baseEarningAnimation.extraDecimals}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {aaveBalanceCelo?.aUsdcBalance && parseFloat(aaveBalanceCelo.aUsdcBalance) > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Celo ({aaveApyCelo?.apyFormatted || '—'} APY)</span>
                        <span className="tabular-nums flex items-baseline">
                          <span>${Math.floor(celoEarningAnimation.animatedValue)}</span>
                          <span className="opacity-90">.{celoEarningAnimation.mainDecimals}</span>
                          {celoEarningAnimation.extraDecimals && (
                            <span className="text-[0.7em] opacity-50 text-green-500 dark:text-green-400">
                              {celoEarningAnimation.extraDecimals}
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    size="sm"
                    onClick={() => {
                      resetAaveDialog();
                      setShowAaveDeposit(true);
                    }}
                    data-testid="button-aave-deposit"
                  >
                    <ArrowUpToLine className="h-4 w-4 mr-2" />
                    Deposit
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    size="sm"
                    onClick={() => {
                      resetAaveDialog();
                      setShowAaveWithdraw(true);
                    }}
                    disabled={getTotalAaveBalance() === 0}
                    data-testid="button-aave-withdraw"
                  >
                    <ArrowDownToLine className="h-4 w-4 mr-2" />
                    Withdraw
                  </Button>
                </div>
              </div>
            )}
            
            <button
              onClick={() => setShowTheme(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-theme"
            >
              <div className="flex items-center gap-3">
                <Palette className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Theme</div>
                  <div className="text-xs text-muted-foreground capitalize">{theme}</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setShowCurrency(true)}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-currency"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <div className="text-sm font-medium">Display Currency</div>
                  <div className="text-xs text-muted-foreground">{currency}</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>

          {currency !== 'USD' && (exchangeRate || inflationData) && (
            <Card className="p-4" data-testid="card-currency-info">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">{currency} vs USD</h3>
                </div>
                
                {exchangeRate && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Exchange Rate</div>
                    <div className="text-base font-medium tabular-nums">
                      1 USD = {exchangeRate.rate.toLocaleString(undefined, { 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6 
                      })} {currency}
                    </div>
                  </div>
                )}

                {inflationData && inflationData.monthlyRate !== 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Inflation Rate</div>
                    <div className="flex items-center gap-2">
                      {inflationData.monthlyRate > 0 ? (
                        <TrendingDown className="h-4 w-4 text-destructive" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      )}
                      <div className="text-base font-medium tabular-nums">
                        {inflationData.monthlyRate > 0 ? '+' : ''}{(inflationData.monthlyRate * 100).toFixed(2)}% /month
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {inflationData.annualRate > 0 ? '+' : ''}{(inflationData.annualRate * 100).toFixed(2)}% /year
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2">
            Help & Resources
          </h2>
          <Card className="divide-y">
            <button
              onClick={() => setLocation('/context')}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-context"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Context</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setLocation('/how-it-works')}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-how-it-works"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">How It Works</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setLocation('/faqs')}
              className="w-full flex items-center justify-between p-4 hover-elevate"
              data-testid="button-faqs"
            >
              <div className="flex items-center gap-3">
                <MessageCircleQuestion className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">FAQs</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="pt-4">
          <button
            onClick={() => {
              // Force hard refresh by adding timestamp to URL
              window.location.href = window.location.href.split('?')[0] + '?refresh=' + Date.now();
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Click to refresh and get latest version"
            data-testid="button-version-refresh"
          >
            Version 1.0.0
          </button>
          <p className="text-center text-xs text-muted-foreground/60 mt-1">
            Tap version to refresh
          </p>
        </div>
      </main>

      <Dialog open={showExportPrivateKey} onOpenChange={handleClosePrivateKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Private Key</DialogTitle>
            <DialogDescription>
              {!privateKey ? (
                "Enter your password to view your private key"
              ) : (
                "Your private key gives full access to your wallet. Never share it with anyone."
              )}
            </DialogDescription>
          </DialogHeader>
          
          {!privateKey ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="export-password">Password</Label>
                <div className="relative">
                  <Input
                    id="export-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExportPrivateKey()}
                    data-testid="input-export-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-export-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Your Private Key</Label>
                <div className="space-y-2">
                  <div className="relative">
                    <div className="font-mono text-xs break-all bg-muted p-3 rounded-md border" data-testid="text-exported-private-key">
                      {showPrivateKey ? privateKey : '•'.repeat(66)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-private-key-visibility"
                    >
                      {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopyPrivateKey}
                    data-testid="button-copy-exported-private-key"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Private Key
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="pt-2 space-y-2 text-xs text-muted-foreground bg-destructive/10 p-3 rounded-md border border-destructive/20">
                <p className="font-medium text-destructive">⚠️ Security Warning</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Anyone with this key can access your funds</li>
                  <li>Never share it with anyone</li>
                  <li>Store it in a secure location</li>
                </ul>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePrivateKeyDialog} data-testid="button-close-export">
              {privateKey ? 'Close' : 'Cancel'}
            </Button>
            {!privateKey && (
              <Button onClick={handleExportPrivateKey} data-testid="button-confirm-export">
                View Private Key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCurrency} onOpenChange={setShowCurrency}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Display Currency</DialogTitle>
            <DialogDescription>
              Choose your preferred currency for fiat values
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={currency} onValueChange={handleCurrencyChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                <SelectItem value="ARS">ARS - Argentine Peso</SelectItem>
                <SelectItem value="BRL">BRL - Brazilian Real</SelectItem>
                <SelectItem value="MXN">MXN - Mexican Peso</SelectItem>
                <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTheme} onOpenChange={setShowTheme}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Theme</DialogTitle>
            <DialogDescription>
              Choose your preferred appearance
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={theme} onValueChange={(v) => handleThemeChange(v as 'light' | 'dark')}>
              <SelectTrigger data-testid="select-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAaveDeposit} onOpenChange={(open) => {
        if (!open) resetAaveDialog();
        setShowAaveDeposit(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit to Aave</DialogTitle>
            <DialogDescription>
              Deposit USDC to start earning interest
            </DialogDescription>
          </DialogHeader>
          
          {aaveOperationStep === 'input' && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Network</Label>
                <Select value={String(selectedChain)} onValueChange={(v) => setSelectedChain(Number(v))}>
                  <SelectTrigger data-testid="select-deposit-network">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="42220">Celo ({aaveApyCelo?.apyFormatted || '—'} APY)</SelectItem>
                    <SelectItem value="8453">Base ({aaveApy?.apyFormatted || '—'} APY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
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
                  autoComplete="off"
                  data-testid="input-deposit-amount"
                />
              </div>
              
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                <div className="flex items-start gap-2">
                  <Fuel className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    If you don't have gas for the deposit, we'll send you a small amount automatically.
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {(aaveOperationStep === 'gas_check' || aaveOperationStep === 'gas_drip') && (
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">
                    {aaveOperationStep === 'gas_check' ? 'Checking gas balance...' : 'Sending gas...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {aaveOperationStep === 'gas_drip' && 'A small gas fee is being sent to your wallet'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'signing' && (
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">Processing deposit...</p>
                  <p className="text-sm text-muted-foreground">
                    Depositing {depositAmount} USDC to Aave
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'complete' && (
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Check className="h-8 w-8 text-green-600" />
                <div className="text-center">
                  <p className="font-medium">Deposit Complete</p>
                  <p className="text-sm text-muted-foreground">
                    Your USDC is now earning interest
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'input' && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAaveDeposit(false)} disabled={isOperating} data-testid="button-cancel-deposit">
                Cancel
              </Button>
              <Button 
                onClick={handleAaveDeposit}
                disabled={isOperating || !depositAmount || parseFloat(depositAmount) <= 0 || parseFloat(depositAmount) > parseFloat(getMaxDepositAmount())}
                data-testid="button-confirm-deposit"
              >
                <ArrowUpToLine className="h-4 w-4 mr-2" />
                Deposit
              </Button>
            </DialogFooter>
          )}
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
                <Select value={String(selectedChain)} onValueChange={(v) => setSelectedChain(Number(v))}>
                  <SelectTrigger data-testid="select-withdraw-network">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="42220" disabled={!aaveBalanceCelo?.aUsdcBalance || parseFloat(aaveBalanceCelo.aUsdcBalance) === 0}>
                      {(() => {
                        const { main, precision } = formatPrecisionBalance(aaveBalanceCelo?.aUsdcBalance || '0');
                        return (
                          <span>
                            Celo (${main}
                            {precision && <span className="text-[0.65em] align-super opacity-70">{precision}</span>}
                            {' '}available)
                          </span>
                        );
                      })()}
                    </SelectItem>
                    <SelectItem value="8453" disabled={!aaveBalanceBase?.aUsdcBalance || parseFloat(aaveBalanceBase.aUsdcBalance) === 0}>
                      {(() => {
                        const { main, precision } = formatPrecisionBalance(aaveBalanceBase?.aUsdcBalance || '0');
                        return (
                          <span>
                            Base (${main}
                            {precision && <span className="text-[0.65em] align-super opacity-70">{precision}</span>}
                            {' '}available)
                          </span>
                        );
                      })()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Amount (USDC)</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setWithdrawAmount(getMaxWithdrawAmount())}
                    data-testid="button-withdraw-max"
                  >
                    {(() => {
                      const balance = selectedChain === 8453 ? aaveBalanceBase : aaveBalanceCelo;
                      const { main, precision } = formatPrecisionBalance(balance?.aUsdcBalance || '0');
                      return (
                        <span>
                          Max: ${main}
                          {precision && <span className="text-[0.65em] align-super opacity-70">{precision}</span>}
                        </span>
                      );
                    })()}
                  </button>
                </div>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  autoComplete="off"
                  data-testid="input-withdraw-amount"
                />
              </div>
              
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
                <div className="flex items-start gap-2">
                  <Fuel className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    If you don't have gas for the withdrawal, we'll send you a small amount automatically.
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {(aaveOperationStep === 'gas_check' || aaveOperationStep === 'gas_drip') && (
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">
                    {aaveOperationStep === 'gas_check' ? 'Checking gas balance...' : 'Sending gas...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {aaveOperationStep === 'gas_drip' && 'A small gas fee is being sent to your wallet'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'signing' && (
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="font-medium">Processing withdrawal...</p>
                  <p className="text-sm text-muted-foreground">
                    Withdrawing {withdrawAmount} USDC from Aave
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'complete' && (
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-4">
                <Check className="h-8 w-8 text-green-600" />
                <div className="text-center">
                  <p className="font-medium">Withdrawal Complete</p>
                  <p className="text-sm text-muted-foreground">
                    Your USDC has been returned to your wallet
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {aaveOperationStep === 'input' && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAaveWithdraw(false)} disabled={isOperating} data-testid="button-cancel-withdraw">
                Cancel
              </Button>
              <Button 
                onClick={handleAaveWithdraw}
                disabled={isOperating || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > parseFloat(getMaxWithdrawAmount())}
                data-testid="button-confirm-withdraw"
              >
                <ArrowDownToLine className="h-4 w-4 mr-2" />
                Withdraw
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
