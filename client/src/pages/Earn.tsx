import { useEffect, useState, useMemo } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Sparkles,
  Trophy,
  Heart,
  Wallet,
  Bot,
  ArrowRightLeft,
  Lock,
  PiggyBank,
  Settings,
  Layers,
  ShoppingBag,
  RefreshCw
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { getPreferences, savePreferences, getPrivateKey } from '@/lib/wallet';
import { useWallet } from '@/hooks/useWallet';
import { useBalance } from '@/hooks/useBalance';
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

function formatSmartCurrencyTick(value: number): string {
  if (value === 0) return '$0';
  const absValue = Math.abs(value);
  
  if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  } else if (absValue >= 100) {
    return `$${value.toFixed(0)}`;
  } else if (absValue >= 10) {
    return `$${value.toFixed(1)}`;
  } else if (absValue >= 1) {
    return `$${value.toFixed(2)}`;
  } else if (absValue >= 0.1) {
    // $0.10 - $0.99: show 2 decimals
    return `$${value.toFixed(2)}`;
  } else if (absValue >= 0.01) {
    // $0.01 - $0.09: show 2 decimals
    return `$${value.toFixed(2)}`;
  } else if (absValue >= 0.001) {
    // $0.001 - $0.009: show 3 decimals
    return `$${value.toFixed(3)}`;
  } else if (absValue >= 0.0001) {
    // $0.0001 - $0.0009: show 4 decimals
    return `$${value.toFixed(4)}`;
  } else {
    // Very tiny values
    return `$${value.toFixed(5)}`;
  }
}

// Cache keys for view state persistence
const EARN_VIEW_STATE_KEY = 'earn_view_state';
const EARN_TAB_KEY = 'earn_active_tab';

function getCachedEarnViewState(): { hasAaveBalance: boolean } | null {
  try {
    const cached = localStorage.getItem(EARN_VIEW_STATE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

function setCachedEarnViewState(hasAaveBalance: boolean) {
  try {
    localStorage.setItem(EARN_VIEW_STATE_KEY, JSON.stringify({ hasAaveBalance }));
  } catch {}
}

function getCachedEarnTab(): string {
  try {
    return localStorage.getItem(EARN_TAB_KEY) || 'savings';
  } catch {
    return 'savings';
  }
}

function setCachedEarnTab(tab: string) {
  try {
    localStorage.setItem(EARN_TAB_KEY, tab);
  } catch {}
}

export default function Earn() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { address, earnMode: initialEarnMode, isLoading: isLoadingWallet } = useWallet({ redirectOnMissing: false, loadPreferences: true });
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
  const [activeTab, setActiveTab] = useState<string>(() => getCachedEarnTab());
  const [localOptInPercent, setLocalOptInPercent] = useState<number | null>(null);
  const [isSavingOptIn, setIsSavingOptIn] = useState(false);
  // Cached view state - prevents flash between different views on navigation
  const [cachedHasAaveBalance, setCachedHasAaveBalance] = useState<boolean | null>(() => {
    const cached = getCachedEarnViewState();
    return cached?.hasAaveBalance ?? null;
  });

  useEffect(() => {
    if (!isLoadingWallet) {
      setEarnMode(initialEarnMode);
    }
  }, [isLoadingWallet, initialEarnMode]);

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
    staleTime: 30 * 60 * 1000, // 30 minutes - APY changes slowly
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/8453');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  const { data: aaveApyCelo, isLoading: isApyCeloLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42220],
    staleTime: 30 * 60 * 1000, // 30 minutes - APY changes slowly
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42220');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  const { data: aaveApyGnosis, isLoading: isApyGnosisLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 100],
    staleTime: 30 * 60 * 1000, // 30 minutes - APY changes slowly
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/100');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  const { data: aaveApyArbitrum, isLoading: isApyArbitrumLoading } = useQuery<AaveApyData>({
    queryKey: ['/api/aave/apy', 42161],
    staleTime: 30 * 60 * 1000, // 30 minutes - APY changes slowly
    queryFn: async () => {
      const res = await fetch('/api/aave/apy/42161');
      if (!res.ok) throw new Error('Failed to fetch APY');
      return res.json();
    },
  });

  const { data: aaveBalanceBase, isLoading: isAaveBalanceBaseLoading, isFetching: isRefreshingBase, refetch: refetchBase } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 8453],
    enabled: !!address,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=8453`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });

  const { data: aaveBalanceCelo, isLoading: isAaveBalanceCeloLoading, isFetching: isRefreshingCelo, refetch: refetchCelo } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 42220],
    enabled: !!address,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=42220`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });

  const { data: aaveBalanceGnosis, isLoading: isAaveBalanceGnosisLoading, isFetching: isRefreshingGnosis, refetch: refetchGnosis } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 100],
    enabled: !!address,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=100`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });

  const { data: aaveBalanceArbitrum, isLoading: isAaveBalanceArbitrumLoading, isFetching: isRefreshingArbitrum, refetch: refetchArbitrum } = useQuery<{ aUsdcBalance: string; apy: number }>({
    queryKey: ['/api/aave/balance', address, 42161],
    enabled: !!address,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      const res = await fetch(`/api/aave/balance/${address}?chainId=42161`);
      if (!res.ok) throw new Error('Failed to fetch Aave balance');
      return res.json();
    },
  });

  const isRefreshingAave = (isRefreshingBase || isRefreshingCelo || isRefreshingGnosis || isRefreshingArbitrum) && !isAaveBalanceBaseLoading && !isAaveBalanceCeloLoading && !isAaveBalanceGnosisLoading && !isAaveBalanceArbitrumLoading;

  const handleRefreshAaveBalance = async () => {
    await Promise.all([refetchBase(), refetchCelo(), refetchGnosis(), refetchArbitrum()]);
  };

  interface InterestChainData {
    chainId: number;
    currentBalanceMicro: string;
    netPrincipalMicro: string;
    interestEarnedMicro: string;
    trackingStarted: string | null;
    hasTrackingData: boolean;
  }

  const { data: interestEarnedData } = useQuery<{ chains: InterestChainData[]; totalInterestEarnedMicro: string }>({
    queryKey: ['/api/aave/interest-earned', address],
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
    queryFn: async () => {
      const res = await fetch(`/api/aave/interest-earned/${address}`);
      if (!res.ok) throw new Error('Failed to fetch interest earned');
      return res.json();
    },
  });

  interface PoolStatusData {
    user: {
      optInPercent: number;
      aUsdcBalance: string;
      aUsdcBalanceFormatted: string;
      projectedWeeklyYield?: string;
      projectedWeeklyYieldFormatted?: string;
    };
    draw: {
      totalPool: string;
      totalPoolFormatted: string;
      participantCount: number;
    };
    countdown: {
      hoursUntilDraw: number;
      minutesUntilDraw: number;
    };
  }

  const { data: poolStatus, isLoading: isPoolLoading } = useQuery<PoolStatusData>({
    queryKey: ['/api/pool/status', address],
    queryFn: async () => {
      const res = await fetch(`/api/pool/status/${address}`);
      if (!res.ok) throw new Error('Failed to fetch pool status');
      return res.json();
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (poolStatus?.user?.optInPercent !== undefined && localOptInPercent === null) {
      setLocalOptInPercent(poolStatus.user.optInPercent);
    }
  }, [poolStatus?.user?.optInPercent, localOptInPercent]);

  const localQueryClient = useQueryClient();

  const saveOptInMutation = useMutation({
    mutationFn: async (percent: number) => {
      if (!address) throw new Error('No wallet found');
      const res = await apiRequest('POST', '/api/pool/opt-in', {
        address,
        optInPercent: percent,
      });
      return res;
    },
    onSuccess: (_data, percent) => {
      toast({ 
        title: "Pool allocation updated",
        description: `Contributing ${percent}% of your yield to the prize pool`,
      });
      localQueryClient.invalidateQueries({ queryKey: ['/api/pool/status', address] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update allocation",
        variant: "destructive",
      });
      if (poolStatus?.user?.optInPercent !== undefined) {
        setLocalOptInPercent(poolStatus.user.optInPercent);
      }
    },
  });

  const handleOptInChange = async (value: number[]) => {
    const newPercent = value[0];
    setLocalOptInPercent(newPercent);
  };

  const handleOptInCommit = async () => {
    if (localOptInPercent === null || localOptInPercent === poolStatus?.user?.optInPercent) return;
    setIsSavingOptIn(true);
    try {
      await saveOptInMutation.mutateAsync(localOptInPercent);
    } finally {
      setIsSavingOptIn(false);
    }
  };

  // Use BigInt for precise micro-USDC arithmetic
  const baseAaveBalanceMicro = aaveBalanceBase?.aUsdcBalance ? BigInt(aaveBalanceBase.aUsdcBalance) : 0n;
  const celoAaveBalanceMicro = aaveBalanceCelo?.aUsdcBalance ? BigInt(aaveBalanceCelo.aUsdcBalance) : 0n;
  const gnosisAaveBalanceMicro = aaveBalanceGnosis?.aUsdcBalance ? BigInt(aaveBalanceGnosis.aUsdcBalance) : 0n;
  const arbitrumAaveBalanceMicro = aaveBalanceArbitrum?.aUsdcBalance ? BigInt(aaveBalanceArbitrum.aUsdcBalance) : 0n;
  const totalAaveBalanceMicro = String(baseAaveBalanceMicro + celoAaveBalanceMicro + gnosisAaveBalanceMicro + arbitrumAaveBalanceMicro);

  const calculateWeightedApy = () => {
    const baseBalance = aaveBalanceBase?.aUsdcBalance ? parseFloat(aaveBalanceBase.aUsdcBalance) : 0;
    const celoBalance = aaveBalanceCelo?.aUsdcBalance ? parseFloat(aaveBalanceCelo.aUsdcBalance) : 0;
    const gnosisBalance = aaveBalanceGnosis?.aUsdcBalance ? parseFloat(aaveBalanceGnosis.aUsdcBalance) : 0;
    const arbitrumBalance = aaveBalanceArbitrum?.aUsdcBalance ? parseFloat(aaveBalanceArbitrum.aUsdcBalance) : 0;
    const totalBalance = baseBalance + celoBalance + gnosisBalance + arbitrumBalance;
    if (totalBalance === 0) {
      const baseApy = aaveApyBase?.apy || 0;
      const celoApy = aaveApyCelo?.apy || 0;
      const gnosisApy = aaveApyGnosis?.apy || 0;
      const arbitrumApy = aaveApyArbitrum?.apy || 0;
      return Math.max(baseApy, celoApy, gnosisApy, arbitrumApy);
    }
    const baseApy = aaveBalanceBase?.apy || 0;
    const celoApy = aaveBalanceCelo?.apy || 0;
    const gnosisApy = aaveBalanceGnosis?.apy || 0;
    const arbitrumApy = aaveBalanceArbitrum?.apy || 0;
    return ((baseApy * baseBalance) + (celoApy * celoBalance) + (gnosisApy * gnosisBalance) + (arbitrumApy * arbitrumBalance)) / totalBalance;
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

  const gnosisEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: aaveBalanceGnosis?.aUsdcBalance || '0',
    apyRate: (aaveBalanceGnosis?.apy || 0) / 100,
    enabled: parseFloat(aaveBalanceGnosis?.aUsdcBalance || '0') > 0,
    minPrecision: 5,
  });

  const arbitrumEarningAnimation = useEarningAnimation({
    usdcMicro: '0',
    aaveBalanceMicro: aaveBalanceArbitrum?.aUsdcBalance || '0',
    apyRate: (aaveBalanceArbitrum?.apy || 0) / 100,
    enabled: parseFloat(aaveBalanceArbitrum?.aUsdcBalance || '0') > 0,
    minPrecision: 5,
  });

  // Chart data: Projection-only view showing interest growth per chain
  // Principal = current balance (stays flat at 0 on chart), Interest = projected growth per chain
  const combinedChartData = useMemo(() => {
    const microBalance = BigInt(totalAaveBalanceMicro || '0');
    const currentBalance = Number(microBalance) / 1_000_000;
    
    const baseBalance = Number(baseAaveBalanceMicro) / 1_000_000;
    const celoBalance = Number(celoAaveBalanceMicro) / 1_000_000;
    const gnosisBalance = Number(gnosisAaveBalanceMicro) / 1_000_000;
    const arbitrumBalance = Number(arbitrumAaveBalanceMicro) / 1_000_000;
    const baseApy = aaveBalanceBase?.apy || aaveApyBase?.apy || 0;
    const celoApy = aaveBalanceCelo?.apy || aaveApyCelo?.apy || 0;
    const gnosisApy = aaveBalanceGnosis?.apy || aaveApyGnosis?.apy || 0;
    const arbitrumApy = aaveBalanceArbitrum?.apy || aaveApyArbitrum?.apy || 0;
    
    const data: Array<{
      label: string;
      isProjected: boolean;
      baseInterest: number;
      celoInterest: number;
      gnosisInterest: number;
      arbitrumInterest: number;
      principal: number;
      interest: number;
      total: number;
      baseInterestPercent?: number;
      celoInterestPercent?: number;
      gnosisInterestPercent?: number;
      arbitrumInterestPercent?: number;
    }> = [];
    
    // Add projected points - interest grows per chain (starting from +1m, no "Now" point)
    if (currentBalance > 0) {
      const monthlyRateBase = baseApy / 100 / 12;
      const monthlyRateCelo = celoApy / 100 / 12;
      const monthlyRateGnosis = gnosisApy / 100 / 12;
      const monthlyRateArbitrum = arbitrumApy / 100 / 12;
      
      // Key milestones: +1m, +3m, +6m, +1y, +18m, +2y, +3y (3-year projection for dramatic curve)
      const projectionPoints = [
        { months: 1, label: '+1m' },
        { months: 3, label: '+3m' },
        { months: 6, label: '+6m' },
        { months: 12, label: '+1y' },
        { months: 18, label: '+18m' },
        { months: 24, label: '+2y' },
        { months: 36, label: '+3y' },
      ];
      
      for (const point of projectionPoints) {
        const baseInterestEarned = baseBalance * (Math.pow(1 + monthlyRateBase, point.months) - 1);
        const celoInterestEarned = celoBalance * (Math.pow(1 + monthlyRateCelo, point.months) - 1);
        const gnosisInterestEarned = gnosisBalance * (Math.pow(1 + monthlyRateGnosis, point.months) - 1);
        const arbitrumInterestEarned = arbitrumBalance * (Math.pow(1 + monthlyRateArbitrum, point.months) - 1);
        const totalInterest = baseInterestEarned + celoInterestEarned + gnosisInterestEarned + arbitrumInterestEarned;
        
        data.push({
          label: point.label,
          isProjected: true,
          baseInterest: baseInterestEarned,
          celoInterest: celoInterestEarned,
          gnosisInterest: gnosisInterestEarned,
          arbitrumInterest: arbitrumInterestEarned,
          principal: currentBalance,
          interest: totalInterest,
          total: currentBalance + totalInterest,
          baseInterestPercent: baseBalance > 0 ? (baseInterestEarned / baseBalance) * 100 : 0,
          celoInterestPercent: celoBalance > 0 ? (celoInterestEarned / celoBalance) * 100 : 0,
          gnosisInterestPercent: gnosisBalance > 0 ? (gnosisInterestEarned / gnosisBalance) * 100 : 0,
          arbitrumInterestPercent: arbitrumBalance > 0 ? (arbitrumInterestEarned / arbitrumBalance) * 100 : 0,
        });
      }
    }
    
    return data;
  }, [totalAaveBalanceMicro, baseAaveBalanceMicro, celoAaveBalanceMicro, gnosisAaveBalanceMicro, arbitrumAaveBalanceMicro, weightedApy, aaveBalanceBase?.apy, aaveBalanceCelo?.apy, aaveBalanceGnosis?.apy, aaveBalanceArbitrum?.apy, aaveApyBase?.apy, aaveApyCelo?.apy, aaveApyGnosis?.apy, aaveApyArbitrum?.apy]);

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

  // Chart display data - simplified projection-only view
  const displayChartData = useMemo(() => {
    const principal = combinedChartData[0]?.principal || 0;
    
    return combinedChartData.map(point => ({
      label: point.label,
      isProjected: point.isProjected,
      baseInterest: point.baseInterest,
      celoInterest: point.celoInterest,
      gnosisInterest: point.gnosisInterest,
      arbitrumInterest: point.arbitrumInterest,
      totalInterestPercent: principal > 0 ? (point.interest / principal) * 100 : 0,
    }));
  }, [combinedChartData]);
  
  // Check if we have any projected data to show
  const hasProjectedData = useMemo(() => {
    return combinedChartData.some(p => p.isProjected);
  }, [combinedChartData]);

  // Fetch aggregated balance from all chains
  const { data: balanceData } = useBalance(address);
  
  // Extract per-chain liquid balances from aggregated data
  const liquidBalanceBase = balanceData?.chains?.base;
  const liquidBalanceCelo = balanceData?.chains?.celo;
  const liquidBalanceGnosis = balanceData?.chains?.gnosis;
  const liquidBalanceArbitrum = balanceData?.chains?.arbitrum;

  // Auto-select first chain with USDC balance when deposit dialog opens
  useEffect(() => {
    if (showAaveDeposit) {
      const hasBase = parseFloat(liquidBalanceBase?.balanceMicro || '0') > 0;
      const hasCelo = parseFloat(liquidBalanceCelo?.balanceMicro || '0') > 0;
      const hasGnosis = parseFloat(liquidBalanceGnosis?.balanceMicro || '0') > 0;
      const hasArbitrum = parseFloat(liquidBalanceArbitrum?.balanceMicro || '0') > 0;
      
      // Check if current selection is still valid
      const currentValid = (selectedChain === 8453 && hasBase) ||
                          (selectedChain === 42220 && hasCelo) ||
                          (selectedChain === 100 && hasGnosis) ||
                          (selectedChain === 42161 && hasArbitrum);
      
      if (!currentValid) {
        // Select first available chain
        if (hasBase) setSelectedChain(8453);
        else if (hasCelo) setSelectedChain(42220);
        else if (hasGnosis) setSelectedChain(100);
        else if (hasArbitrum) setSelectedChain(42161);
      }
    }
  }, [showAaveDeposit, liquidBalanceBase?.balanceMicro, liquidBalanceCelo?.balanceMicro, liquidBalanceGnosis?.balanceMicro, liquidBalanceArbitrum?.balanceMicro, selectedChain]);

  // Auto-select first chain with Aave balance when withdraw dialog opens  
  useEffect(() => {
    if (showAaveWithdraw) {
      const hasBase = (aaveBalanceBase?.aUsdcBalance && parseFloat(aaveBalanceBase.aUsdcBalance) > 0) || false;
      const hasCelo = (aaveBalanceCelo?.aUsdcBalance && parseFloat(aaveBalanceCelo.aUsdcBalance) > 0) || false;
      const hasGnosis = (aaveBalanceGnosis?.aUsdcBalance && parseFloat(aaveBalanceGnosis.aUsdcBalance) > 0) || false;
      const hasArbitrum = (aaveBalanceArbitrum?.aUsdcBalance && parseFloat(aaveBalanceArbitrum.aUsdcBalance) > 0) || false;
      
      // Check if current selection is still valid
      const currentValid = (selectedChain === 8453 && hasBase) ||
                          (selectedChain === 42220 && hasCelo) ||
                          (selectedChain === 100 && hasGnosis) ||
                          (selectedChain === 42161 && hasArbitrum);
      
      if (!currentValid) {
        // Select first available chain
        if (hasBase) setSelectedChain(8453);
        else if (hasCelo) setSelectedChain(42220);
        else if (hasGnosis) setSelectedChain(100);
        else if (hasArbitrum) setSelectedChain(42161);
      }
    }
  }, [showAaveWithdraw, aaveBalanceBase?.aUsdcBalance, aaveBalanceCelo?.aUsdcBalance, aaveBalanceGnosis?.aUsdcBalance, aaveBalanceArbitrum?.aUsdcBalance, selectedChain]);

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
      
      // Immediate invalidation to clear stale data
      queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/aave/balance'] });
      
      // Delayed refetch after 5 seconds to capture confirmed transaction
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/aave/balance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/aave/interest-earned', address] });
      }, 5000);
      
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
      
      // Record the withdrawal to the database for tracking
      if (result.txHash) {
        try {
          console.log('[Earn] Recording withdrawal to database...');
          await apiRequest('POST', '/api/aave/record-withdraw', {
            chainId: selectedChain,
            userAddress: address,
            amount: amountInMicroUsdc.toString(),
            txHash: result.txHash,
          });
          console.log('[Earn] Withdrawal recorded successfully');
        } catch (recordError) {
          console.error('[Earn] Failed to record withdrawal (non-blocking):', recordError);
        }
      }
      
      // Immediate invalidation to clear stale data
      queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/aave/balance'] });
      
      // Delayed refetch after 5 seconds to capture confirmed transaction
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/balance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/aave/balance'] });
        queryClient.invalidateQueries({ queryKey: ['/api/aave/interest-earned', address] });
      }, 5000);
      
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
    const balance = selectedChain === 8453 
      ? liquidBalanceBase 
      : selectedChain === 42220 
        ? liquidBalanceCelo 
        : selectedChain === 42161
          ? liquidBalanceArbitrum
          : liquidBalanceGnosis;
    if (!balance?.balanceMicro) return '0.00';
    const balanceNum = parseFloat(balance.balanceMicro) / 1000000;
    return balanceNum.toFixed(2);
  };

  const getMaxWithdrawAmount = (): string => {
    const balance = selectedChain === 8453 
      ? aaveBalanceBase 
      : selectedChain === 42220 
        ? aaveBalanceCelo 
        : selectedChain === 42161
          ? aaveBalanceArbitrum
          : aaveBalanceGnosis;
    if (!balance?.aUsdcBalance) return '0.00';
    const { full } = formatPrecisionBalance(balance.aUsdcBalance);
    return full;
  };

  const getTotalAaveBalance = (): number => {
    const baseBalance = aaveBalanceBase?.aUsdcBalance ? parseFloat(aaveBalanceBase.aUsdcBalance) : 0;
    const celoBalance = aaveBalanceCelo?.aUsdcBalance ? parseFloat(aaveBalanceCelo.aUsdcBalance) : 0;
    const gnosisBalance = aaveBalanceGnosis?.aUsdcBalance ? parseFloat(aaveBalanceGnosis.aUsdcBalance) : 0;
    const arbitrumBalance = aaveBalanceArbitrum?.aUsdcBalance ? parseFloat(aaveBalanceArbitrum.aUsdcBalance) : 0;
    return (baseBalance + celoBalance + gnosisBalance + arbitrumBalance) / 1000000;
  };

  const resetAaveDialog = () => {
    setDepositAmount('');
    setWithdrawAmount('');
    setAaveOperationStep('input');
    setGasDripPending(false);
    setIsOperating(false);
  };

  const hasAaveBalance = baseAaveBalanceMicro > 0n || celoAaveBalanceMicro > 0n || gnosisAaveBalanceMicro > 0n || arbitrumAaveBalanceMicro > 0n;
  // Convert BigInt micro-USDC to number for display (safe for amounts up to ~9 trillion USDC)
  const baseBalanceNum = Number(baseAaveBalanceMicro) / 1e6;
  const celoBalanceNum = Number(celoAaveBalanceMicro) / 1e6;
  const gnosisBalanceNum = Number(gnosisAaveBalanceMicro) / 1e6;
  const arbitrumBalanceNum = Number(arbitrumAaveBalanceMicro) / 1e6;
  
  // Cache view state when balance data loads to prevent flash on navigation
  useEffect(() => {
    if (aaveBalanceBase !== undefined && aaveBalanceCelo !== undefined && aaveBalanceGnosis !== undefined && aaveBalanceArbitrum !== undefined) {
      const newHasBalance = hasAaveBalance;
      setCachedHasAaveBalance(newHasBalance);
      setCachedEarnViewState(newHasBalance);
    }
  }, [aaveBalanceBase, aaveBalanceCelo, aaveBalanceGnosis, aaveBalanceArbitrum, hasAaveBalance]);
  
  // Use cached state during loading to prevent view flash
  const isBalanceLoading = isAaveBalanceBaseLoading || isAaveBalanceCeloLoading || isAaveBalanceGnosisLoading || isAaveBalanceArbitrumLoading;
  const effectiveHasAaveBalance = isBalanceLoading ? (cachedHasAaveBalance ?? false) : hasAaveBalance;

  return (
    <div 
      className="min-h-screen bg-background"
      style={{ 
        paddingTop: 'calc(4rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' 
      }}
    >
      <main className="max-w-md mx-auto p-4 space-y-4">
        <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); setCachedEarnTab(tab); }} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="savings" className="flex items-center gap-1.5 text-xs" data-testid="tab-savings">
              <PiggyBank className="h-3.5 w-3.5" />
              Savings
            </TabsTrigger>
            <TabsTrigger value="allocation" className="flex items-center gap-1.5 text-xs" data-testid="tab-allocation">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Allocation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="savings" className="mt-4 space-y-4">
            {!effectiveHasAaveBalance && aaveBalanceBase !== undefined && aaveBalanceCelo !== undefined && (
              <div className="space-y-4">
                <Card className="p-4 space-y-3" data-testid="card-how-it-works">
                  <div className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2 text-foreground/80">
                    <Info className="h-4 w-4 text-[#0055FF]" />
                    HOW IT WORKS
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2">
                      <ArrowUpToLine className="h-5 w-5 mx-auto mb-1.5 text-[#0055FF]" />
                      <div className="text-xs font-medium">Deposit</div>
                      <div className="text-xs text-muted-foreground">One tap</div>
                    </div>
                    <div className="p-2">
                      <TrendingUp className="h-5 w-5 mx-auto mb-1.5 text-success" />
                      <div className="text-xs font-medium">Earn</div>
                      <div className="text-xs text-muted-foreground">Automatically</div>
                    </div>
                    <div className="p-2">
                      <ArrowDownToLine className="h-5 w-5 mx-auto mb-1.5 text-[#0055FF]" />
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
              </div>
            )}

            <Card className="p-6 min-h-[200px] flex flex-col" data-testid="card-earning-balance">
              {/* Top row: icon top-left, title centered - fixed height */}
              <div className="relative h-5 flex items-center">
                <PiggyBank className="h-4 w-4 text-[#0055FF] absolute left-0" />
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground/80 text-center flex-1">
                  Total Earning
                </div>
              </div>
              
              {/* Center: Main balance display - vertically and horizontally centered */}
              <div className="flex-1 flex flex-col items-center justify-center">
                {isAaveBalanceBaseLoading || isAaveBalanceCeloLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : effectiveHasAaveBalance ? (
                  <>
                    <button
                      onClick={handleRefreshAaveBalance}
                      disabled={isRefreshingAave}
                      className="bg-transparent p-0 border-none text-5xl font-bold tabular-nums flex items-center justify-center tracking-tight cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all disabled:cursor-default disabled:hover:opacity-100 disabled:active:scale-100 focus-visible:outline-none"
                      data-testid="button-refresh-earning"
                    >
                      <span className={`text-3xl font-normal text-muted-foreground mr-1.5 transition-opacity duration-300 ${isRefreshingAave ? 'opacity-50' : ''}`}>$</span>
                      <span className={`inline-flex items-baseline transition-opacity duration-300 ${isRefreshingAave ? 'opacity-50 animate-pulse' : ''}`} data-testid="text-earning-amount">
                        <span>{Math.floor(totalEarningAnimation.animatedValue)}</span>
                        <span>.{totalEarningAnimation.mainDecimals}</span>
                        {totalEarningAnimation.extraDecimals && (
                          <span className="text-[0.28em] font-light text-muted-foreground relative ml-0.5" style={{ top: '-0.65em' }}>
                            {totalEarningAnimation.extraDecimals}
                          </span>
                        )}
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-5xl font-bold tabular-nums flex items-center justify-center tracking-tight">
                      <span className="text-3xl font-normal text-muted-foreground mr-1.5">$</span>
                      <span>0.00</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">No Deposits</div>
                  </>
                )}
              </div>
              
              {/* Bottom: APY badge - fixed height */}
              <div className="flex items-center justify-center h-6">
                <div className="bg-[#0055FF] text-white px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
                  {weightedApy > 0 ? `${weightedApy.toFixed(2)}%` : '—'} APY
                </div>
              </div>
              </Card>

            <div className="grid grid-cols-2 gap-2">
              <Button 
                size="lg"
                className="w-full" 
                onClick={() => {
                  resetAaveDialog();
                  setShowAaveDeposit(true);
                }}
                data-testid="button-earn-deposit"
              >
                <ArrowUpToLine className="h-4 w-4" />
                Deposit
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="w-full" 
                onClick={() => {
                  resetAaveDialog();
                  setShowAaveWithdraw(true);
                }}
                disabled={!hasAaveBalance}
                data-testid="button-earn-withdraw"
              >
                <ArrowDownToLine className="h-4 w-4" />
                Withdraw
              </Button>
            </div>

            {/* Earnings Preview for users with no deposits */}
            {!effectiveHasAaveBalance && aaveBalanceBase !== undefined && aaveBalanceCelo !== undefined && (
              <Card className="p-4 space-y-4 border-dashed" data-testid="card-earnings-preview">
                <div className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2 text-foreground/80">
                  <Sparkles className="h-4 w-4 text-[#0055FF]" />
                  WHAT YOU COULD EARN
                </div>
                
                {weightedApy > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-none">
                      <div className="text-sm text-muted-foreground">If you deposit</div>
                      <div className="text-lg font-semibold">$100</div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-success/10 rounded-none">
                        <div className="text-xs text-muted-foreground mb-1">1 month</div>
                        <div className="text-sm font-medium text-success">
                          +${(100 * (weightedApy / 100 / 12)).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 bg-success/10 rounded-none">
                        <div className="text-xs text-muted-foreground mb-1">6 months</div>
                        <div className="text-sm font-medium text-success">
                          +${(100 * (Math.pow(1 + weightedApy / 100 / 12, 6) - 1)).toFixed(2)}
                        </div>
                      </div>
                      <div className="p-2 bg-success/10 rounded-none">
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
                    <div className="flex items-center justify-center gap-2 p-4 bg-muted/30 rounded-none">
                      <Loader2 className="h-4 w-4 animate-spin" />
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
                  <Sparkles className="h-4 w-4" />
                  Start Earning Now
                </Button>
              </Card>
            )}

            {effectiveHasAaveBalance && (baseBalanceNum > 0 || celoBalanceNum > 0 || gnosisBalanceNum > 0 || arbitrumBalanceNum > 0) && [baseBalanceNum, celoBalanceNum, gnosisBalanceNum, arbitrumBalanceNum].filter(b => b > 0).length > 1 && (
              <Card className="p-4 space-y-3" data-testid="card-chain-breakdown">
                <div className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2 text-foreground/80">
                  <Layers className="h-4 w-4 text-[#0055FF]" />
                  USDC BALANCE & RATES / NETWORK
                </div>
                
                {baseBalanceNum > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-none">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/10 flex items-center justify-center">
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
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-none">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-yellow-500/10 flex items-center justify-center">
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

                {gnosisBalanceNum > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-none">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-500/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-600">G</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Gnosis</div>
                        <div className="text-xs text-muted-foreground">{aaveApyGnosis?.apyFormatted || '—'} APY</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-medium tabular-nums inline-flex items-baseline justify-end">
                        <span className="text-sm opacity-50 mr-0.5">$</span>
                        <span>{Math.floor(gnosisEarningAnimation.animatedValue)}</span>
                        <span className="opacity-90">.{gnosisEarningAnimation.mainDecimals}</span>
                        {gnosisEarningAnimation.extraDecimals && (
                          <span className="text-[0.45em] font-light text-success opacity-70 relative ml-0.5" style={{ top: '-0.5em' }}>
                            {gnosisEarningAnimation.extraDecimals}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {arbitrumBalanceNum > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-none">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-cyan-500/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-600">A</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Arbitrum</div>
                        <div className="text-xs text-muted-foreground">{aaveApyArbitrum?.apyFormatted || '—'} APY</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-medium tabular-nums inline-flex items-baseline justify-end">
                        <span className="text-sm opacity-50 mr-0.5">$</span>
                        <span>{Math.floor(arbitrumEarningAnimation.animatedValue)}</span>
                        <span className="opacity-90">.{arbitrumEarningAnimation.mainDecimals}</span>
                        {arbitrumEarningAnimation.extraDecimals && (
                          <span className="text-[0.45em] font-light text-success opacity-70 relative ml-0.5" style={{ top: '-0.5em' }}>
                            {arbitrumEarningAnimation.extraDecimals}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {effectiveHasAaveBalance && combinedChartData.length > 0 && (
              <Card className="p-4 space-y-3" data-testid="card-projected-earnings">
                <div className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2 text-foreground/80">
                  <TrendingUp className="h-4 w-4 text-[#0055FF]" />
                  PROJECTED EARNINGS
                </div>
                
                <div className="h-36 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart 
                      data={displayChartData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="baseInterestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(217, 91%, 70%)" stopOpacity={0.7}/>
                          <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3}/>
                        </linearGradient>
                        <linearGradient id="celoInterestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(45, 93%, 58%)" stopOpacity={0.7}/>
                          <stop offset="100%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.3}/>
                        </linearGradient>
                        <linearGradient id="gnosisInterestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(270, 70%, 60%)" stopOpacity={0.7}/>
                          <stop offset="100%" stopColor="hsl(270, 70%, 50%)" stopOpacity={0.3}/>
                        </linearGradient>
                        <linearGradient id="arbitrumInterestGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(187, 71%, 45%)" stopOpacity={0.7}/>
                          <stop offset="100%" stopColor="hsl(187, 71%, 35%)" stopOpacity={0.3}/>
                        </linearGradient>
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
                      <YAxis 
                        yAxisId="balance"
                        orientation="left"
                        width={40}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={formatSmartCurrencyTick}
                        domain={[0, 'auto']}
                        tickCount={5}
                      />
                      <YAxis 
                        yAxisId="percent"
                        orientation="right"
                        width={35}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 8, fill: 'hsl(142, 71%, 45%)' }}
                        tickFormatter={(val) => `+${val.toFixed(1)}%`}
                        domain={[0, (dataMax: number) => dataMax * 1.6]}
                        tickCount={4}
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const totalInterest = (data.baseInterest || 0) + (data.celoInterest || 0) + (data.gnosisInterest || 0) + (data.arbitrumInterest || 0);
                            
                            if (data.isNow) {
                              return (
                                <div className="bg-popover border border-foreground/10 px-2.5 py-1.5 shadow-md min-w-[100px]">
                                  <div className="text-xs font-medium">Starting Point</div>
                                </div>
                              );
                            }
                            
                            return (
                              <div className="bg-popover border border-foreground/10 px-2.5 py-1.5 shadow-md min-w-[140px]">
                                <div className="text-xs font-medium mb-1.5">
                                  Projected ({data.label})
                                </div>
                                {data.baseInterest > 0 && (
                                  <div className="flex items-center justify-between gap-3 text-xs mb-0.5">
                                    <span className="text-blue-400">Base:</span>
                                    <span className="text-success">
                                      +{formatSmartPrecision(data.baseInterest, '$')}
                                    </span>
                                  </div>
                                )}
                                {data.celoInterest > 0 && (
                                  <div className="flex items-center justify-between gap-3 text-xs mb-0.5">
                                    <span className="text-yellow-400">Celo:</span>
                                    <span className="text-success">
                                      +{formatSmartPrecision(data.celoInterest, '$')}
                                    </span>
                                  </div>
                                )}
                                {data.gnosisInterest > 0 && (
                                  <div className="flex items-center justify-between gap-3 text-xs mb-0.5">
                                    <span className="text-purple-400">Gnosis:</span>
                                    <span className="text-success">
                                      +{formatSmartPrecision(data.gnosisInterest, '$')}
                                    </span>
                                  </div>
                                )}
                                {data.arbitrumInterest > 0 && (
                                  <div className="flex items-center justify-between gap-3 text-xs mb-1">
                                    <span className="text-cyan-400">Arbitrum:</span>
                                    <span className="text-success">
                                      +{formatSmartPrecision(data.arbitrumInterest, '$')}
                                    </span>
                                  </div>
                                )}
                                <div className="text-xs font-medium border-t border-foreground/10 pt-1 mt-1 flex justify-between">
                                  <span>Total earned:</span>
                                  <span className="text-success">
                                    +{formatSmartPrecision(totalInterest, '$')}
                                    <span className="text-muted-foreground ml-1">
                                      ({formatSmartPercent(data.totalInterestPercent || 0)})
                                    </span>
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      {baseBalanceNum > 0 && (
                        <Area 
                          type="monotone" 
                          dataKey="baseInterest"
                          yAxisId="balance"
                          stackId="earnings"
                          stroke="hsl(217, 91%, 70%)"
                          strokeWidth={1.5}
                          fill="url(#baseInterestGradient)"
                          isAnimationActive={false}
                        />
                      )}
                      {celoBalanceNum > 0 && (
                        <Area 
                          type="monotone" 
                          dataKey="celoInterest"
                          yAxisId="balance"
                          stackId="earnings"
                          stroke="hsl(45, 93%, 58%)"
                          strokeWidth={1.5}
                          fill="url(#celoInterestGradient)"
                          isAnimationActive={false}
                        />
                      )}
                      {gnosisBalanceNum > 0 && (
                        <Area 
                          type="monotone" 
                          dataKey="gnosisInterest"
                          yAxisId="balance"
                          stackId="earnings"
                          stroke="hsl(270, 70%, 60%)"
                          strokeWidth={1.5}
                          fill="url(#gnosisInterestGradient)"
                          isAnimationActive={false}
                        />
                      )}
                      {arbitrumBalanceNum > 0 && (
                        <Area 
                          type="monotone" 
                          dataKey="arbitrumInterest"
                          yAxisId="balance"
                          stackId="earnings"
                          stroke="hsl(187, 71%, 45%)"
                          strokeWidth={1.5}
                          fill="url(#arbitrumInterestGradient)"
                          isAnimationActive={false}
                        />
                      )}
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
                
                <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
                  {baseBalanceNum > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 " style={{ background: 'hsl(217, 91%, 60%)' }}></div>
                      <span className="text-blue-400">Base</span>
                    </div>
                  )}
                  {celoBalanceNum > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 " style={{ background: 'hsl(45, 93%, 47%)' }}></div>
                      <span className="text-yellow-400">Celo</span>
                    </div>
                  )}
                  {gnosisBalanceNum > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 " style={{ background: 'hsl(270, 70%, 55%)' }}></div>
                      <span className="text-purple-400">Gnosis</span>
                    </div>
                  )}
                  {arbitrumBalanceNum > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-2 " style={{ background: 'hsl(187, 71%, 45%)' }}></div>
                      <span className="text-cyan-400">Arbitrum</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-0.5 " style={{ background: 'hsl(142, 71%, 45%)', borderTop: '2px dashed hsl(142, 71%, 45%)' }}></div>
                    <span className="text-success">% Growth</span>
                  </div>
                </div>
              </Card>
            )}


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

            <Card 
              className="p-4 hover-elevate cursor-pointer" 
              onClick={() => setLocation('/pool')}
              data-testid="card-pool-link"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#0055FF]/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-5 w-5 text-[#0055FF]" />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-foreground/80">Prize Pool</h3>
                    <p className="text-xs text-muted-foreground">
                      Win weekly prizes from savings yield
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="allocation" className="mt-4 space-y-4">
            <div className="text-center space-y-1 mb-2">
              <p className="text-sm text-muted-foreground">
                Choose where to direct your savings yield
              </p>
            </div>

            {/* Prize Pool */}
            <Card className="p-4" data-testid="card-allocation-pool">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-[#0055FF]/10 flex items-center justify-center flex-shrink-0">
                  <Trophy className="h-5 w-5 text-[#0055FF]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-medium text-foreground/80">Prize Pool</h3>
                    {(localOptInPercent ?? 0) > 0 && (
                      <Badge variant="outline" className="text-xs text-success border-success/30">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Chance to win weekly prizes
                  </p>
                </div>
              </div>

              {(localOptInPercent ?? 0) > 0 ? (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Yield contribution</span>
                    <span className="font-medium tabular-nums text-success">{localOptInPercent}%</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <Link href="/pool">
                    <Button className="w-full" data-testid="button-activate-pool">
                      <Trophy className="h-4 w-4" />
                      Activate Prize Pool
                    </Button>
                  </Link>
                </div>
              )}
            </Card>

            {/* Coming Soon Options */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Coming Soon</h3>
              
              {/* Support Causes */}
              <Card className="p-4 opacity-60" data-testid="card-allocation-causes">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center flex-shrink-0">
                    <Heart className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">Support Causes</h3>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Donate yield to communities
                    </p>
                  </div>
                </div>
              </Card>

              {/* Buy Now, Pay Later */}
              <Card className="p-4 opacity-60" data-testid="card-allocation-bnpl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">Buy Now, Pay Later</h3>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Nano-credit backed by future yield
                    </p>
                  </div>
                </div>
              </Card>

              {/* Token Buyback */}
              <Card className="p-4 opacity-60" data-testid="card-allocation-buyback">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center flex-shrink-0">
                    <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">Token Buyback</h3>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Auto-convert yield to other tokens
                    </p>
                  </div>
                </div>
              </Card>

              {/* AI Credits */}
              <Card className="p-4 opacity-60" data-testid="card-allocation-ai">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center flex-shrink-0">
                    <Bot className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">AI Credits</h3>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Earn access to AI tools & models
                    </p>
                  </div>
                </div>
              </Card>

              {/* Custom Address */}
              <Card className="p-4 opacity-60" data-testid="card-allocation-address">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted flex items-center justify-center flex-shrink-0">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-medium text-muted-foreground">Custom Address</h3>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Send yield to any wallet
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
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
              {/* Check if user has any liquid USDC balance */}
              {parseFloat(liquidBalanceBase?.balanceMicro || '0') === 0 &&
               parseFloat(liquidBalanceCelo?.balanceMicro || '0') === 0 &&
               parseFloat(liquidBalanceGnosis?.balanceMicro || '0') === 0 &&
               parseFloat(liquidBalanceArbitrum?.balanceMicro || '0') === 0 ? (
                <div className="py-6 text-center space-y-3">
                  <Wallet className="h-10 w-10 mx-auto text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No USDC balance</p>
                    <p className="text-xs text-muted-foreground">
                      You need USDC on Base, Celo, Gnosis, or Arbitrum to deposit
                    </p>
                  </div>
                </div>
              ) : (
                <>
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
                        {parseFloat(liquidBalanceBase?.balanceMicro || '0') > 0 && (
                          <SelectItem value="8453">Base ({aaveApyBase?.apyFormatted || '—'} APY)</SelectItem>
                        )}
                        {parseFloat(liquidBalanceCelo?.balanceMicro || '0') > 0 && (
                          <SelectItem value="42220">Celo ({aaveApyCelo?.apyFormatted || '—'} APY)</SelectItem>
                        )}
                        {parseFloat(liquidBalanceGnosis?.balanceMicro || '0') > 0 && (
                          <SelectItem value="100">Gnosis ({aaveApyGnosis?.apyFormatted || '—'} APY)</SelectItem>
                        )}
                        {parseFloat(liquidBalanceArbitrum?.balanceMicro || '0') > 0 && (
                          <SelectItem value="42161">Arbitrum ({aaveApyArbitrum?.apyFormatted || '—'} APY)</SelectItem>
                        )}
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
                </>
              )}
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
              parseFloat(liquidBalanceBase?.balanceMicro || '0') === 0 &&
              parseFloat(liquidBalanceCelo?.balanceMicro || '0') === 0 &&
              parseFloat(liquidBalanceGnosis?.balanceMicro || '0') === 0 &&
              parseFloat(liquidBalanceArbitrum?.balanceMicro || '0') === 0 ? (
                <Button variant="outline" onClick={() => setShowAaveDeposit(false)}>
                  Close
                </Button>
              ) : (
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
              )
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
                    {baseBalanceNum > 0 && (
                      <SelectItem value="8453">
                        Base (${baseBalanceNum.toFixed(2)} available)
                      </SelectItem>
                    )}
                    {celoBalanceNum > 0 && (
                      <SelectItem value="42220">
                        Celo (${celoBalanceNum.toFixed(2)} available)
                      </SelectItem>
                    )}
                    {gnosisBalanceNum > 0 && (
                      <SelectItem value="100">
                        Gnosis (${gnosisBalanceNum.toFixed(2)} available)
                      </SelectItem>
                    )}
                    {arbitrumBalanceNum > 0 && (
                      <SelectItem value="42161">
                        Arbitrum (${arbitrumBalanceNum.toFixed(2)} available)
                      </SelectItem>
                    )}
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
