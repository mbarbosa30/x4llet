import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Loader2, 
  ArrowUpToLine, 
  ArrowDownToLine, 
  Info,
  Shield,
  Zap,
  ChevronRight,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { ComposedChart, AreaChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
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

function formatSmartPrecision(value: number, prefix: string = ''): string {
  if (value === 0) return `${prefix}0.00`;
  const absValue = Math.abs(value);
  
  if (absValue >= 1) {
    return `${prefix}${value.toFixed(2)}`;
  } else if (absValue >= 0.01) {
    return `${prefix}${value.toFixed(4)}`;
  } else if (absValue >= 0.0001) {
    return `${prefix}${value.toFixed(6)}`;
  } else {
    const formatted = value.toExponential(2);
    return `${prefix}${formatted}`;
  }
}

function formatSmartPercent(value: number): string {
  if (value === 0) return '+0.00%';
  const absValue = Math.abs(value);
  
  if (absValue >= 0.1) {
    return `+${value.toFixed(2)}%`;
  } else if (absValue >= 0.01) {
    return `+${value.toFixed(3)}%`;
  } else if (absValue >= 0.001) {
    return `+${value.toFixed(4)}%`;
  } else {
    return `+${value.toFixed(5)}%`;
  }
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

  // Use BigInt for precise micro-USDC arithmetic
  const baseAaveBalanceMicro = aaveBalanceBase?.aUsdcBalance ? BigInt(aaveBalanceBase.aUsdcBalance) : 0n;
  const celoAaveBalanceMicro = aaveBalanceCelo?.aUsdcBalance ? BigInt(aaveBalanceCelo.aUsdcBalance) : 0n;
  const totalAaveBalanceMicro = String(baseAaveBalanceMicro + celoAaveBalanceMicro);

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

  // Fetch balance history for the combined chart
  interface BalanceHistoryPoint {
    timestamp: string;
    balance: string;
  }
  
  const { data: balanceHistoryBase } = useQuery<BalanceHistoryPoint[]>({
    queryKey: ['/api/balance-history', address, 8453],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/balance-history/${address}?chainId=8453&days=30`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: balanceHistoryCelo } = useQuery<BalanceHistoryPoint[]>({
    queryKey: ['/api/balance-history', address, 42220],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`/api/balance-history/${address}?chainId=42220&days=30`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  // Combined chart data: Historical balance + Projected principal/interest separation BY CHAIN
  // For historical data: We only have total balance (can't reliably separate principal/interest without deposit tracking)
  // For projections: Principal = current balance (stays flat), Interest = projected growth per chain
  const combinedChartData = useMemo(() => {
    const microBalance = BigInt(totalAaveBalanceMicro || '0');
    const currentBalance = Number(microBalance) / 1_000_000;
    
    const baseBalance = Number(baseAaveBalanceMicro) / 1_000_000;
    const celoBalance = Number(celoAaveBalanceMicro) / 1_000_000;
    const baseApy = aaveBalanceBase?.apy || aaveApyBase?.apy || 0;
    const celoApy = aaveBalanceCelo?.apy || aaveApyCelo?.apy || 0;
    
    const data: Array<{
      label: string;
      date?: Date;
      isProjected: boolean;
      isNow?: boolean;
      isHistorical?: boolean;
      // Per-chain breakdown for stacked areas
      basePrincipal: number;       // Base deposit (flat)
      baseInterest: number;        // Base yield growth
      celoPrincipal: number;       // Celo deposit (flat)
      celoInterest: number;        // Celo yield growth
      // Totals for calculations
      principal: number;           // Total principal
      interest: number;            // Total interest
      total: number;               // principal + interest
      historicalBalance?: number | null;  // Historical line (null for projections)
      // Per-chain percentages
      baseInterestPercent?: number;
      celoInterestPercent?: number;
    }> = [];
    
    // Historical data (past 30 days, sample weekly)
    const historyBase = balanceHistoryBase || [];
    const historyCelo = balanceHistoryCelo || [];
    
    // Create a map of timestamps to balances
    const historyMap = new Map<string, { base: number; celo: number }>();
    
    // Process Base history
    historyBase.forEach(point => {
      const dateKey = new Date(point.timestamp).toISOString().split('T')[0];
      const existing = historyMap.get(dateKey) || { base: 0, celo: 0 };
      existing.base = Number(point.balance) / 1_000_000;
      historyMap.set(dateKey, existing);
    });
    
    // Process Celo history
    historyCelo.forEach(point => {
      const dateKey = new Date(point.timestamp).toISOString().split('T')[0];
      const existing = historyMap.get(dateKey) || { base: 0, celo: 0 };
      existing.celo = Number(point.balance) / 1_000_000;
      historyMap.set(dateKey, existing);
    });
    
    // Convert to array and sort by date
    const sortedHistory = Array.from(historyMap.entries())
      .map(([dateKey, balances]) => ({
        date: new Date(dateKey),
        ...balances,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Sample up to 6 historical points (weekly-ish)
    const historyPoints = sortedHistory.length > 0 
      ? sortedHistory.filter((_, i) => i === 0 || i === sortedHistory.length - 1 || i % Math.ceil(sortedHistory.length / 4) === 0).slice(-5)
      : [];
    
    // Add historical points - show as "historicalBalance" line only
    historyPoints.forEach((point) => {
      const weeksAgo = Math.round((Date.now() - point.date.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const pointTotal = point.base + point.celo;
      
      data.push({
        label: weeksAgo === 0 ? 'This week' : `-${weeksAgo}w`,
        date: point.date,
        isProjected: false,
        isHistorical: true,
        basePrincipal: 0,
        baseInterest: 0,
        celoPrincipal: 0,
        celoInterest: 0,
        principal: 0,
        interest: 0,
        total: pointTotal,
        historicalBalance: pointTotal,
      });
    });
    
    // Add "Now" point - current balance becomes principal baseline for projections
    data.push({
      label: 'Now',
      date: new Date(),
      isProjected: false,
      isNow: true,
      basePrincipal: baseBalance,
      baseInterest: 0,
      celoPrincipal: celoBalance,
      celoInterest: 0,
      principal: currentBalance,
      interest: 0,
      total: currentBalance,
      historicalBalance: null,
      baseInterestPercent: 0,
      celoInterestPercent: 0,
    });
    
    // Add projected points - principal stays flat, interest grows per chain
    if (currentBalance > 0) {
      const monthlyRateBase = baseApy / 100 / 12;
      const monthlyRateCelo = celoApy / 100 / 12;
      
      // Short-term projections (weeks) to show sub-cent interest
      const shortTermPoints = [
        { months: 1/52 * 12, label: '+1w' },   // 1 week
        { months: 2/52 * 12, label: '+2w' },   // 2 weeks
        { months: 1, label: '+1mo' },          // 1 month
        { months: 2, label: '+2mo' },          // 2 months
      ];
      
      for (const point of shortTermPoints) {
        const baseInterestEarned = baseBalance * (Math.pow(1 + monthlyRateBase, point.months) - 1);
        const celoInterestEarned = celoBalance * (Math.pow(1 + monthlyRateCelo, point.months) - 1);
        const totalInterest = baseInterestEarned + celoInterestEarned;
        
        data.push({
          label: point.label,
          isProjected: true,
          basePrincipal: baseBalance,
          baseInterest: baseInterestEarned,
          celoPrincipal: celoBalance,
          celoInterest: celoInterestEarned,
          principal: currentBalance,
          interest: totalInterest,
          total: currentBalance + totalInterest,
          historicalBalance: null,
          baseInterestPercent: baseBalance > 0 ? (baseInterestEarned / baseBalance) * 100 : 0,
          celoInterestPercent: celoBalance > 0 ? (celoInterestEarned / celoBalance) * 100 : 0,
        });
      }
      
      // Quarterly projections (existing)
      for (let month = 3; month <= 12; month += 3) {
        const baseInterestEarned = baseBalance * (Math.pow(1 + monthlyRateBase, month) - 1);
        const celoInterestEarned = celoBalance * (Math.pow(1 + monthlyRateCelo, month) - 1);
        const totalInterest = baseInterestEarned + celoInterestEarned;
        
        data.push({
          label: `+${month}mo`,
          isProjected: true,
          basePrincipal: baseBalance,
          baseInterest: baseInterestEarned,
          celoPrincipal: celoBalance,
          celoInterest: celoInterestEarned,
          principal: currentBalance,
          interest: totalInterest,
          total: currentBalance + totalInterest,
          historicalBalance: null,
          baseInterestPercent: baseBalance > 0 ? (baseInterestEarned / baseBalance) * 100 : 0,
          celoInterestPercent: celoBalance > 0 ? (celoInterestEarned / celoBalance) * 100 : 0,
        });
      }
    }
    
    return data;
  }, [totalAaveBalanceMicro, baseAaveBalanceMicro, celoAaveBalanceMicro, weightedApy, aaveBalanceBase?.apy, aaveBalanceCelo?.apy, aaveApyBase?.apy, aaveApyCelo?.apy, balanceHistoryBase, balanceHistoryCelo]);

  const projectedEarningsData = useMemo(() => {
    const microBalance = BigInt(totalAaveBalanceMicro || '0');
    if (microBalance <= 0n || weightedApy <= 0) return [];
    
    const currentBalance = Number(microBalance) / 1_000_000;
    const monthlyRate = weightedApy / 100 / 12;
    const data = [];
    for (let month = 0; month <= 12; month++) {
      const projectedBalance = currentBalance * Math.pow(1 + monthlyRate, month);
      data.push({
        month: month === 0 ? 'Now' : `${month}mo`,
        value: projectedBalance,
        earnings: projectedBalance - currentBalance,
      });
    }
    return data;
  }, [totalAaveBalanceMicro, weightedApy]);

  const yearlyEarnings = useMemo(() => {
    const microBalance = BigInt(totalAaveBalanceMicro || '0');
    if (microBalance <= 0n || weightedApy <= 0) return 0;
    const currentBalance = Number(microBalance) / 1_000_000;
    return currentBalance * (weightedApy / 100);
  }, [totalAaveBalanceMicro, weightedApy]);

  // Chart data with both $ values and % growth for dual-axis display
  const displayChartData = useMemo(() => {
    const nowPoint = combinedChartData.find(p => p.isNow);
    const principal = nowPoint?.principal || 0;
    
    // Add total percentage growth relative to starting principal
    return combinedChartData.map(d => ({
      ...d,
      // Total interest as percentage of principal (for the % line overlay)
      totalInterestPercent: principal > 0 ? (d.interest / principal) * 100 : 0,
    }));
  }, [combinedChartData]);
  
  // Check if we have any projected data to show
  const hasProjectedData = useMemo(() => {
    return combinedChartData.some(p => p.isProjected);
  }, [combinedChartData]);

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
        console.log('[Earn Deposit] Requesting gas drip...');
        
        const dripResult = await requestGasDrip(selectedChain);
        console.log('[Earn Deposit] Gas drip result:', dripResult);
        setGasDripPending(false);
        
        if (!dripResult.success) {
          console.error('[Earn Deposit] Gas drip failed:', dripResult.error);
          throw new Error(dripResult.error || 'Failed to get gas');
        }
        
        toast({
          title: "Gas Sent",
          description: "A small amount of gas has been sent to your wallet.",
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      setAaveOperationStep('signing');
      console.log('[Earn Deposit] Getting private key...');
      
      const pk = await getPrivateKey();
      if (!pk) {
        console.error('[Earn Deposit] No private key available');
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
      console.log('[Earn Deposit] Calling supplyToAave...');
      
      toast({
        title: "Depositing to Aave",
        description: "Please wait while we deposit your USDC...",
      });
      
      const result = await supplyToAave(pk, selectedChain, amountInMicroUsdc, address);
      console.log('[Earn Deposit] Deposit result:', result);
      
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
    
    console.log('[Earn] Starting withdrawal:', {
      address,
      withdrawAmount,
      amountInMicroUsdc: amountInMicroUsdc.toString(),
      selectedChain,
    });
    
    try {
      setAaveOperationStep('gas_check');
      console.log('[Earn] Checking gas balance...');
      
      const gasCheck = await checkGasBalance(selectedChain);
      console.log('[Earn] Gas check result:', gasCheck);
      
      if (!gasCheck.hasEnoughGas) {
        setAaveOperationStep('gas_drip');
        setGasDripPending(true);
        console.log('[Earn] Requesting gas drip...');
        
        const dripResult = await requestGasDrip(selectedChain);
        console.log('[Earn] Gas drip result:', dripResult);
        setGasDripPending(false);
        
        if (!dripResult.success) {
          console.error('[Earn] Gas drip failed:', dripResult.error);
          throw new Error(dripResult.error || 'Failed to get gas');
        }
        
        toast({
          title: "Gas Sent",
          description: "A small amount of gas has been sent to your wallet.",
        });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      setAaveOperationStep('signing');
      console.log('[Earn] Getting private key...');
      
      const pk = await getPrivateKey();
      if (!pk) {
        console.error('[Earn] No private key available');
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
      console.log('[Earn] Calling withdrawFromAave...');
      
      toast({
        title: "Withdrawing from Aave",
        description: "Please wait while we withdraw your USDC...",
      });
      
      const result = await withdrawFromAave(pk, selectedChain, amountInMicroUsdc, address);
      console.log('[Earn] Withdrawal result:', result);
      
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

  const hasAaveBalance = baseAaveBalanceMicro > 0n || celoAaveBalanceMicro > 0n;
  // Convert BigInt micro-USDC to number for display (safe for amounts up to ~9 trillion USDC)
  const baseBalanceNum = Number(baseAaveBalanceMicro) / 1e6;
  const celoBalanceNum = Number(celoAaveBalanceMicro) / 1e6;

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-6">
        {!hasAaveBalance && aaveBalanceBase !== undefined && aaveBalanceCelo !== undefined && (
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold" data-testid="text-earn-title">Earn</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Put your USDC to work and earn interest automatically
            </p>
          </div>
        )}

        <Card className="p-5 space-y-4" data-testid="card-earning-balance">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Total Earning</div>
            <Badge variant="outline" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              {weightedApy > 0 ? `${weightedApy.toFixed(2)}%` : '—'} APY
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
                  <span className="inline-flex items-baseline">
                    <span>{Math.floor(totalEarningAnimation.animatedValue)}</span>
                    <span className="opacity-90">.{totalEarningAnimation.mainDecimals}</span>
                    {totalEarningAnimation.extraDecimals && (
                      <span className="text-[0.28em] font-light text-success opacity-70 relative ml-0.5" style={{ top: '-0.65em' }}>
                        {totalEarningAnimation.extraDecimals}
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">USDC earning interest</div>
              </div>
            ) : (
              <div className="space-y-3">
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

        {/* Earnings Preview for users with no deposits */}
        {!hasAaveBalance && aaveBalanceBase !== undefined && aaveBalanceCelo !== undefined && (
          <Card className="p-4 space-y-4 border-dashed" data-testid="card-earnings-preview">
            <div className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              What You Could Earn
            </div>
            
            {weightedApy > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="text-sm text-muted-foreground">If you deposit</div>
                  <div className="text-lg font-semibold">$100</div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-success/10 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">1 month</div>
                    <div className="text-sm font-medium text-success">
                      +${(100 * (weightedApy / 100 / 12)).toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2 bg-success/10 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">6 months</div>
                    <div className="text-sm font-medium text-success">
                      +${(100 * (Math.pow(1 + weightedApy / 100 / 12, 6) - 1)).toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2 bg-success/10 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">1 year</div>
                    <div className="text-sm font-medium text-success">
                      +${(100 * (Math.pow(1 + weightedApy / 100 / 12, 12) - 1)).toFixed(2)}
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground text-center">
                  Based on current {weightedApy.toFixed(1)}% APY • Compounded monthly
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading rates...</span>
                </div>
              </div>
            )}
            
            <Button 
              className="w-full" 
              onClick={() => {
                resetAaveDialog();
                setShowAaveDeposit(true);
              }}
              disabled={weightedApy <= 0}
              data-testid="button-start-earning"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Start Earning Now
            </Button>
          </Card>
        )}

        {hasAaveBalance && baseBalanceNum > 0 && celoBalanceNum > 0 && (
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
                  <div className="text-lg font-medium tabular-nums inline-flex items-baseline justify-end">
                    <span className="text-sm opacity-50 mr-0.5">$</span>
                    <span>{Math.floor(baseEarningAnimation.animatedValue)}</span>
                    <span className="opacity-90">.{baseEarningAnimation.mainDecimals}</span>
                    {baseEarningAnimation.extraDecimals && (
                      <span className="text-[0.45em] font-light text-success opacity-70 relative ml-0.5" style={{ top: '-0.5em' }}>
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
                  <div className="text-lg font-medium tabular-nums inline-flex items-baseline justify-end">
                    <span className="text-sm opacity-50 mr-0.5">$</span>
                    <span>{Math.floor(celoEarningAnimation.animatedValue)}</span>
                    <span className="opacity-90">.{celoEarningAnimation.mainDecimals}</span>
                    {celoEarningAnimation.extraDecimals && (
                      <span className="text-[0.45em] font-light text-success opacity-70 relative ml-0.5" style={{ top: '-0.5em' }}>
                        {celoEarningAnimation.extraDecimals}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {hasAaveBalance && combinedChartData.length > 0 && (
          <Card className="p-4 space-y-3" data-testid="card-projected-earnings">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Projected Growth</div>
                {yearlyEarnings > 0 && (
                  <div className="text-xs">
                    <span className="text-success font-medium">{formatSmartPrecision(yearlyEarnings, '+$')}</span>
                    <span className="text-muted-foreground">/yr</span>
                    <span className="text-muted-foreground mx-1">•</span>
                    <span className="text-success font-medium">+{weightedApy.toFixed(2)}%</span>
                    <span className="text-muted-foreground"> APY</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={displayChartData} 
                  margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                >
                  <defs>
                    {/* Base chain colors - blue */}
                    <linearGradient id="basePrincipalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.25}/>
                      <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="baseInterestGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(217, 91%, 70%)" stopOpacity={0.7}/>
                      <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3}/>
                    </linearGradient>
                    {/* Celo chain colors - yellow/gold */}
                    <linearGradient id="celoPrincipalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.25}/>
                      <stop offset="100%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="celoInterestGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(45, 93%, 58%)" stopOpacity={0.7}/>
                      <stop offset="100%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.3}/>
                    </linearGradient>
                    {/* Earnings mode gradient */}
                    <linearGradient id="earningsPercentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.5}/>
                      <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="label" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  {/* Left Y-axis for $ balance */}
                  <YAxis 
                    yAxisId="balance"
                    orientation="left"
                    width={35}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(val) => `$${val.toFixed(0)}`}
                    domain={['dataMin', 'auto']}
                  />
                  {/* Right Y-axis for % growth */}
                  <YAxis 
                    yAxisId="percent"
                    orientation="right"
                    width={35}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 8, fill: 'hsl(142, 71%, 45%)' }}
                    tickFormatter={(val) => `+${val.toFixed(1)}%`}
                    domain={[0, 'auto']}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-md px-2.5 py-1.5 shadow-md min-w-[160px]">
                            <div className="text-xs font-medium mb-1.5">
                              {data.isProjected ? 'Projected' : data.isNow ? 'Now' : 'Historical'}
                            </div>
                            {data.isHistorical ? (
                              <div className="text-xs">
                                Balance: {formatSmartPrecision(data.total, '$')}
                              </div>
                            ) : (
                              <>
                                {/* Per-chain breakdown with $ */}
                                {data.basePrincipal > 0 && (
                                  <div className="flex items-center justify-between gap-3 text-xs mb-0.5">
                                    <span className="text-blue-400">Base:</span>
                                    <span>
                                      {formatSmartPrecision(data.basePrincipal + (data.baseInterest || 0), '$')}
                                      {data.baseInterest > 0 && (
                                        <span className="text-success ml-1">
                                          (+{formatSmartPercent(data.baseInterestPercent || 0)})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                )}
                                {data.celoPrincipal > 0 && (
                                  <div className="flex items-center justify-between gap-3 text-xs mb-1">
                                    <span className="text-yellow-400">Celo:</span>
                                    <span>
                                      {formatSmartPrecision(data.celoPrincipal + (data.celoInterest || 0), '$')}
                                      {data.celoInterest > 0 && (
                                        <span className="text-success ml-1">
                                          (+{formatSmartPercent(data.celoInterestPercent || 0)})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                )}
                                {/* Total with both $ and % */}
                                <div className="text-xs font-medium border-t border-border pt-1 mt-1 flex justify-between">
                                  <span>Total:</span>
                                  <span>
                                    {formatSmartPrecision(data.total, '$')}
                                    {data.totalInterestPercent > 0 && (
                                      <span className="text-success ml-1">
                                        (+{formatSmartPercent(data.totalInterestPercent)})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* "Now" reference line */}
                  <ReferenceLine 
                    x="Now" 
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    yAxisId="balance"
                    label={{ value: '▼', position: 'top', fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  {/* Historical balance line (only renders where historicalBalance is set) */}
                  <Line 
                    type="monotone" 
                    dataKey="historicalBalance"
                    yAxisId="balance"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  {/* Stacked by chain: Base principal + interest (bottom) */}
                  <Area 
                    type="monotone" 
                    dataKey="basePrincipal"
                    yAxisId="balance"
                    stackId="savings"
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={0}
                    fill="url(#basePrincipalGradient)"
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="baseInterest"
                    yAxisId="balance"
                    stackId="savings"
                    stroke="hsl(217, 91%, 70%)"
                    strokeWidth={1}
                    fill="url(#baseInterestGradient)"
                    isAnimationActive={false}
                  />
                  {/* Celo principal + interest (stacks on Base) */}
                  <Area 
                    type="monotone" 
                    dataKey="celoPrincipal"
                    yAxisId="balance"
                    stackId="savings"
                    stroke="hsl(45, 93%, 47%)"
                    strokeWidth={0}
                    fill="url(#celoPrincipalGradient)"
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="celoInterest"
                    yAxisId="balance"
                    stackId="savings"
                    stroke="hsl(45, 93%, 58%)"
                    strokeWidth={1}
                    fill="url(#celoInterestGradient)"
                    isAnimationActive={false}
                  />
                  {/* Overlay line for % growth (right Y-axis) */}
                  <Line 
                    type="monotone" 
                    dataKey="totalInterestPercent"
                    yAxisId="percent"
                    stroke="hsl(142, 71%, 45%)"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={true}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            {/* Legend with per-chain breakdown */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm" style={{ background: 'hsl(var(--primary))' }}></div>
                  <span className="text-muted-foreground">History</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm" style={{ background: 'hsl(217, 91%, 60%)' }}></div>
                  <span className="text-blue-400">Base $</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 rounded-sm" style={{ background: 'hsl(45, 93%, 47%)' }}></div>
                  <span className="text-yellow-400">Celo $</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-sm" style={{ background: 'hsl(142, 71%, 45%)', borderTop: '2px dashed hsl(142, 71%, 45%)' }}></div>
                  <span className="text-success">% Growth</span>
                </div>
              </div>
              
              {/* Per-chain interest earned summary */}
              {combinedChartData.length > 0 && (
                <div className="flex items-center justify-center gap-4 text-xs">
                  {(() => {
                    const yearlyPoint = combinedChartData.find(p => p.label === '+12mo');
                    if (!yearlyPoint) return null;
                    return (
                      <>
                        {yearlyPoint.baseInterest > 0 && (
                          <span className="text-blue-400">
                            Base: {formatSmartPrecision(yearlyPoint.baseInterest, '+$')}/yr
                          </span>
                        )}
                        {yearlyPoint.celoInterest > 0 && (
                          <span className="text-yellow-400">
                            Celo: {formatSmartPrecision(yearlyPoint.celoInterest, '+$')}/yr
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              Your savings + projected {weightedApy > 0 ? `${weightedApy.toFixed(1)}%` : ''} APY growth
            </p>
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

        <Card className="p-4 space-y-3" data-testid="card-how-it-works">
          <div className="text-sm font-medium">How it works</div>
          
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2">
              <ArrowUpToLine className="h-5 w-5 mx-auto mb-1.5 text-primary" />
              <div className="text-xs font-medium">Deposit</div>
              <div className="text-xs text-muted-foreground">One tap</div>
            </div>
            <div className="p-2">
              <TrendingUp className="h-5 w-5 mx-auto mb-1.5 text-success" />
              <div className="text-xs font-medium">Earn</div>
              <div className="text-xs text-muted-foreground">Automatically</div>
            </div>
            <div className="p-2">
              <ArrowDownToLine className="h-5 w-5 mx-auto mb-1.5 text-primary" />
              <div className="text-xs font-medium">Withdraw</div>
              <div className="text-xs text-muted-foreground">Anytime</div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-success" />
              Secured by Aave
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Gasless
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              No lock-up
            </span>
          </div>
        </Card>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="faq" className="border-none">
            <AccordionTrigger className="text-sm py-2">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                Learn more
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="text-sm">
                <div className="font-medium mb-1">What is Aave?</div>
                <p className="text-muted-foreground text-xs">
                  A trusted lending protocol with billions in deposits. Your USDC earns interest from borrowers.
                </p>
              </div>
              <div className="text-sm">
                <div className="font-medium mb-1">How does interest work?</div>
                <p className="text-muted-foreground text-xs">
                  Interest accrues every second based on market rates. You receive aUSDC tokens that grow in value automatically.
                </p>
              </div>
              <div className="text-sm">
                <div className="font-medium mb-1">Is it safe?</div>
                <p className="text-muted-foreground text-xs">
                  Aave is battle-tested and audited. As with all DeFi, only deposit what you're comfortable with.
                </p>
              </div>
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
