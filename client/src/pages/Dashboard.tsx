import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, Lock, Wallet, Users, TrendingUp, Activity, 
  DollarSign, Gift, Zap, Network, PiggyBank, Trophy,
  BarChart3, PieChart, RefreshCw, Plus, Heart, Sparkles,
  CheckCircle2, Clock, Coins, TrendingDown, Percent
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

interface AnalyticsOverview {
  totalWallets: number;
  activeWallets: number;
  totalTransactions: number;
  totalVolumeUsd: string;
  poolParticipants: number;
  totalYieldCollected: string;
}

interface WalletGrowth {
  date: string;
  count: number;
}

interface TransactionVolume {
  date: string;
  volume: string;
  count: number;
}

interface ChainBreakdown {
  transactions: Array<{ chainId: number; count: number; volume: string }>;
  balances: Array<{ chainId: number; totalBalance: string; walletCount: number }>;
}

interface PoolDraw {
  id: string;
  weekNumber: number;
  year: number;
  totalPool: string;
  totalTickets: string;
  participantCount: number;
  winnerAddress: string | null;
  status: string;
  drawnAt: string | null;
}

interface PoolAnalytics {
  currentDraw: PoolDraw | null;
  totalPrizesPaid: string;
  totalContributions: string;
  drawHistory: PoolDraw[];
  participationByPercent: Array<{ percent: number; count: number }>;
  referralStats: { total: number; activeReferrers: number };
}

interface AaveAnalytics {
  totalDeposits: string;
  totalWithdrawals: string;
  activeOperations: number;
  operationsByChain: Array<{ chainId: number; deposits: string; withdrawals: string }>;
}

interface FacilitatorAnalytics {
  totalTransfersProcessed: number;
  totalGasDrips: number;
  gasDripsByChain: Array<{ chainId: number; count: number; totalAmount: string }>;
  authorizationsByStatus: Array<{ status: string; count: number }>;
}

interface MaxFlowAnalytics {
  totalScored: number;
  scoreDistribution: Array<{ range: string; count: number }>;
  averageScore: number;
}

interface GoodDollarAnalytics {
  totalVerifiedUsers: number;
  totalClaims: number;
  totalGdClaimed: string;
  totalGdClaimedFormatted: string;
  recentClaims: Array<{
    walletAddress: string;
    amountFormatted: string;
    claimedDay: number;
    createdAt: string;
  }>;
  activeClaimers: number;
}

interface XpAnalytics {
  totalXpDistributed: number;
  totalXpDistributedFormatted: string;
  activeXpUsers: number;
  xpFromMaxFlow: number;
  xpFromMaxFlowFormatted: string;
  totalXpClaims: number;
  aiChatUsers: number;
  aiChatMessages: number;
  avgXpPerUser: number;
  avgXpPerUserFormatted: string;
}

interface CumulativeGrowth {
  date: string;
  cumulative: number;
  daily: number;
}

interface ActiveInactive {
  active7d: number;
  active30d: number;
  inactive: number;
  total: number;
}

interface TransactionTrend {
  date: string;
  count: number;
  avgSize: string;
}

interface TVLData {
  date: string;
  tvl: string;
}

interface BalanceDistribution {
  range: string;
  count: number;
  totalBalance: string;
}

interface ChainUsage {
  date: string;
  base: number;
  celo: number;
  gnosis: number;
}

interface DAUWAU {
  date: string;
  dau: number;
  wau: number;
}

interface FeatureAdoption {
  poolAdoption: { enrolled: number; total: number; rate: number };
  maxflowAdoption: { scored: number; total: number; rate: number };
  gooddollarAdoption: { verified: number; total: number; rate: number };
}

interface ConversionFunnels {
  walletToFirstTx: { total: number; converted: number; rate: number };
  oneTimeToRepeat: { oneTime: number; repeat: number; rate: number };
  newToActive: { newLast30d: number; activeLast7d: number; rate: number };
}

const CHAIN_NAMES: Record<number, string> = {
  8453: 'Base',
  42220: 'Celo',
  100: 'Gnosis',
};

const CHAIN_COLORS: Record<number, string> = {
  8453: '#0052FF',
  42220: '#FCFF52',
  100: '#04795B',
};

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F'];

function formatMicroUsdc(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const usd = num / 1_000_000;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(2)}K`;
  return `$${usd.toFixed(2)}`;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function safeBigInt(value: string | number | undefined | null): bigint {
  if (value === undefined || value === null || value === '') return BigInt(0);
  try {
    return BigInt(typeof value === 'string' ? value : Math.floor(value));
  } catch {
    return BigInt(0);
  }
}

function createAuthHeader(username: string, password: string): string {
  const credentials = btoa(`${username}:${password}`);
  return `Basic ${credentials}`;
}

async function authenticatedRequest(method: string, url: string, authHeader: string, body?: any) {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [walletGrowth, setWalletGrowth] = useState<WalletGrowth[]>([]);
  const [transactionVolume, setTransactionVolume] = useState<TransactionVolume[]>([]);
  const [chainBreakdown, setChainBreakdown] = useState<ChainBreakdown | null>(null);
  const [poolAnalytics, setPoolAnalytics] = useState<PoolAnalytics | null>(null);
  const [aaveAnalytics, setAaveAnalytics] = useState<AaveAnalytics | null>(null);
  const [facilitatorAnalytics, setFacilitatorAnalytics] = useState<FacilitatorAnalytics | null>(null);
  const [maxflowAnalytics, setMaxflowAnalytics] = useState<MaxFlowAnalytics | null>(null);
  const [gooddollarAnalytics, setGooddollarAnalytics] = useState<GoodDollarAnalytics | null>(null);
  const [xpAnalytics, setXpAnalytics] = useState<XpAnalytics | null>(null);

  const [cumulativeGrowth, setCumulativeGrowth] = useState<CumulativeGrowth[]>([]);
  const [activeInactive, setActiveInactive] = useState<ActiveInactive | null>(null);
  const [transactionTrends, setTransactionTrends] = useState<TransactionTrend[]>([]);
  const [tvlData, setTvlData] = useState<TVLData[]>([]);
  const [balanceDistribution, setBalanceDistribution] = useState<BalanceDistribution[]>([]);
  const [chainUsage, setChainUsage] = useState<ChainUsage[]>([]);
  const [dauWau, setDauWau] = useState<DAUWAU[]>([]);
  const [featureAdoption, setFeatureAdoption] = useState<FeatureAdoption | null>(null);
  const [conversionFunnels, setConversionFunnels] = useState<ConversionFunnels | null>(null);

  const [donationAmount, setDonationAmount] = useState('');
  const [isDonating, setIsDonating] = useState(false);
  const [timePeriod, setTimePeriod] = useState<7 | 30 | 90>(30);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);

    const authHeaderValue = createAuthHeader(username, password);

    try {
      await authenticatedRequest('GET', '/api/admin/analytics/overview', authHeaderValue);
      
      setAuthHeader(authHeaderValue);
      setIsAuthenticated(true);
      setPassword('');
      
      toast({
        title: 'Authenticated',
        description: 'Welcome to the analytics dashboard',
      });

      loadAllData(authHeaderValue);
    } catch (error: any) {
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const loadAllData = async (auth: string, days: number = timePeriod) => {
    setIsLoading(true);
    try {
      const [
        overviewRes,
        walletGrowthRes,
        transactionVolumeRes,
        chainBreakdownRes,
        poolRes,
        aaveRes,
        facilitatorRes,
        maxflowRes,
        gooddollarRes,
        xpRes,
        cumulativeGrowthRes,
        activeInactiveRes,
        transactionTrendsRes,
        tvlRes,
        balanceDistRes,
        chainUsageRes,
        dauWauRes,
        featureAdoptionRes,
        funnelsRes,
      ] = await Promise.all([
        authenticatedRequest('GET', '/api/admin/analytics/overview', auth),
        authenticatedRequest('GET', `/api/admin/analytics/wallet-growth?days=${days}`, auth),
        authenticatedRequest('GET', `/api/admin/analytics/transaction-volume?days=${days}`, auth),
        authenticatedRequest('GET', '/api/admin/analytics/chain-breakdown', auth),
        authenticatedRequest('GET', '/api/admin/analytics/pool', auth),
        authenticatedRequest('GET', '/api/admin/analytics/aave', auth),
        authenticatedRequest('GET', '/api/admin/analytics/facilitator', auth),
        authenticatedRequest('GET', '/api/admin/analytics/maxflow', auth),
        authenticatedRequest('GET', '/api/admin/analytics/gooddollar', auth),
        authenticatedRequest('GET', '/api/admin/analytics/xp', auth),
        authenticatedRequest('GET', `/api/admin/analytics/cumulative-growth?days=${days}`, auth),
        authenticatedRequest('GET', '/api/admin/analytics/active-inactive', auth),
        authenticatedRequest('GET', `/api/admin/analytics/transaction-trends?days=${days}`, auth),
        authenticatedRequest('GET', `/api/admin/analytics/tvl?days=${days}`, auth),
        authenticatedRequest('GET', '/api/admin/analytics/balance-distribution', auth),
        authenticatedRequest('GET', `/api/admin/analytics/chain-usage?days=${days}`, auth),
        authenticatedRequest('GET', `/api/admin/analytics/dau-wau?days=${days}`, auth),
        authenticatedRequest('GET', '/api/admin/analytics/feature-adoption', auth),
        authenticatedRequest('GET', '/api/admin/analytics/funnels', auth),
      ]);

      setOverview(await overviewRes.json());
      setWalletGrowth(await walletGrowthRes.json());
      setTransactionVolume(await transactionVolumeRes.json());
      setChainBreakdown(await chainBreakdownRes.json());
      setPoolAnalytics(await poolRes.json());
      setAaveAnalytics(await aaveRes.json());
      setFacilitatorAnalytics(await facilitatorRes.json());
      setMaxflowAnalytics(await maxflowRes.json());
      setGooddollarAnalytics(await gooddollarRes.json());
      setXpAnalytics(await xpRes.json());
      setCumulativeGrowth(await cumulativeGrowthRes.json());
      setActiveInactive(await activeInactiveRes.json());
      setTransactionTrends(await transactionTrendsRes.json());
      setTvlData(await tvlRes.json());
      setBalanceDistribution(await balanceDistRes.json());
      setChainUsage(await chainUsageRes.json());
      setDauWau(await dauWauRes.json());
      setFeatureAdoption(await featureAdoptionRes.json());
      setConversionFunnels(await funnelsRes.json());
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast({
        title: 'Failed to load data',
        description: 'Some analytics may not be available',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDonate = async () => {
    if (!donationAmount || parseFloat(donationAmount) <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid donation amount',
        variant: 'destructive',
      });
      return;
    }

    setIsDonating(true);
    try {
      const amountMicro = Math.round(parseFloat(donationAmount) * 1_000_000).toString();
      const res = await authenticatedRequest('POST', '/api/admin/pool/donate', authHeader, { amount: amountMicro });
      const result = await res.json();

      toast({
        title: 'Donation successful',
        description: `Added $${result.donatedFormatted} to sponsored pool. New total prize: $${result.totalPrizePoolFormatted}`,
      });

      setDonationAmount('');
      loadAllData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Donation failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsDonating(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 w-fit">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Analytics Dashboard</CardTitle>
            <CardDescription>
              Sign in with admin credentials to view comprehensive analytics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  data-testid="input-dashboard-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  data-testid="input-dashboard-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isAuthenticating} data-testid="button-dashboard-login">
                {isAuthenticating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Sign In
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const volumeChartData = transactionVolume.map(v => ({
    date: new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    volume: Number(v.volume) / 1_000_000,
    count: v.count,
  }));

  const walletChartData = walletGrowth.map(w => ({
    date: new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: w.count,
  }));

  const chainTxData = chainBreakdown?.transactions.map(t => ({
    name: CHAIN_NAMES[t.chainId] || `Chain ${t.chainId}`,
    value: t.count,
    volume: Number(t.volume) / 1_000_000,
    color: CHAIN_COLORS[t.chainId] || '#888888',
  })) || [];

  const chainBalanceData = chainBreakdown?.balances.map(b => ({
    name: CHAIN_NAMES[b.chainId] || `Chain ${b.chainId}`,
    balance: Number(b.totalBalance) / 1_000_000,
    wallets: b.walletCount,
    color: CHAIN_COLORS[b.chainId] || '#888888',
  })) || [];

  const poolParticipationData = poolAnalytics?.participationByPercent.filter(p => p.count > 0).map(p => ({
    name: p.percent === 0 ? 'Not participating' : `${p.percent}%`,
    value: p.count,
  })) || [];

  const drawHistoryData = poolAnalytics?.drawHistory.slice(0, 8).reverse().map(d => ({
    week: `W${d.weekNumber}`,
    prize: Number(d.totalPool) / 1_000_000,
    participants: d.participantCount,
  })) || [];

  const aaveChainData = aaveAnalytics?.operationsByChain.map(o => ({
    name: CHAIN_NAMES[o.chainId] || `Chain ${o.chainId}`,
    deposits: Number(o.deposits) / 1_000_000,
    withdrawals: Number(o.withdrawals) / 1_000_000,
  })) || [];

  const maxflowDistData = maxflowAnalytics?.scoreDistribution || [];

  const cumulativeChartData = cumulativeGrowth.map(c => ({
    date: new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cumulative: c.cumulative,
    daily: c.daily,
  }));

  const activeInactiveData = activeInactive ? [
    { name: 'Active 7d', value: activeInactive.active7d, color: '#22c55e' },
    { name: 'Active 30d', value: activeInactive.active30d - activeInactive.active7d, color: '#84cc16' },
    { name: 'Inactive', value: activeInactive.inactive, color: '#94a3b8' },
  ].filter(d => d.value > 0) : [];

  const txTrendsChartData = transactionTrends.map(t => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: t.count,
    avgSize: Number(t.avgSize) / 1_000_000,
  }));

  const tvlChartData = tvlData.map(t => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tvl: Number(t.tvl) / 1_000_000,
  }));

  const balanceDistChartData = balanceDistribution.map(b => ({
    range: b.range,
    count: b.count,
    total: Number(b.totalBalance) / 1_000_000,
  }));

  const chainUsageChartData = chainUsage.map(c => ({
    date: new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Base: c.base,
    Celo: c.celo,
    Gnosis: c.gnosis,
  }));

  const dauWauChartData = dauWau.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    DAU: d.dau,
    WAU: d.wau,
  }));

  const adoptionChartData = featureAdoption ? [
    { name: 'Prize Pool', rate: featureAdoption.poolAdoption.rate, enrolled: featureAdoption.poolAdoption.enrolled },
    { name: 'MaxFlow', rate: featureAdoption.maxflowAdoption.rate, enrolled: featureAdoption.maxflowAdoption.scored },
    { name: 'GoodDollar', rate: featureAdoption.gooddollarAdoption.rate, enrolled: featureAdoption.gooddollarAdoption.verified },
  ] : [];

  const funnelChartData = conversionFunnels ? [
    { name: 'Wallet → Tx', rate: conversionFunnels.walletToFirstTx.rate, total: conversionFunnels.walletToFirstTx.total, converted: conversionFunnels.walletToFirstTx.converted },
    { name: 'Repeat Users', rate: conversionFunnels.oneTimeToRepeat.rate, total: conversionFunnels.oneTimeToRepeat.oneTime + conversionFunnels.oneTimeToRepeat.repeat, converted: conversionFunnels.oneTimeToRepeat.repeat },
    { name: 'New → Active', rate: conversionFunnels.newToActive.rate, total: conversionFunnels.newToActive.newLast30d, converted: conversionFunnels.newToActive.activeLast7d },
  ] : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading tracking-tight">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive overview of nanoPay wallet activity
              {lastRefresh && (
                <span className="ml-2 text-xs">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center border rounded-md overflow-hidden">
              {([7, 30, 90] as const).map((days) => (
                <Button
                  key={days}
                  variant={timePeriod === days ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setTimePeriod(days);
                    loadAllData(authHeader, days);
                  }}
                  disabled={isLoading}
                  className="rounded-none border-0"
                  data-testid={`button-period-${days}d`}
                >
                  {days}d
                </Button>
              ))}
            </div>
            <Button onClick={() => loadAllData(authHeader)} disabled={isLoading} data-testid="button-refresh-analytics">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading && !overview ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card data-testid="card-total-wallets">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2  bg-blue-100 dark:bg-blue-900">
                      <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Wallets</p>
                      <p className="text-2xl font-bold" data-testid="metric-total-wallets">{formatNumber(overview?.totalWallets || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-active-wallets">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2  bg-green-100 dark:bg-green-900">
                      <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Active (30d)</p>
                      <p className="text-2xl font-bold" data-testid="metric-active-wallets">{formatNumber(overview?.activeWallets || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-transactions">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2  bg-purple-100 dark:bg-purple-900">
                      <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Transactions</p>
                      <p className="text-2xl font-bold" data-testid="metric-total-transactions">{formatNumber(overview?.totalTransactions || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-volume">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2  bg-orange-100 dark:bg-orange-900">
                      <DollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Volume</p>
                      <p className="text-2xl font-bold" data-testid="metric-total-volume">{formatMicroUsdc(overview?.totalVolumeUsd || '0')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-pool-users">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2  bg-pink-100 dark:bg-pink-900">
                      <Trophy className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Pool Users</p>
                      <p className="text-2xl font-bold" data-testid="metric-pool-users">{formatNumber(overview?.poolParticipants || 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-yield-collected">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2  bg-teal-100 dark:bg-teal-900">
                      <PiggyBank className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Yield Collected</p>
                      <p className="text-2xl font-bold" data-testid="metric-yield-collected">{formatMicroUsdc(overview?.totalYieldCollected || '0')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="growth" className="space-y-4">
              <TabsList className="flex flex-wrap gap-1 w-full max-w-5xl h-auto">
                <TabsTrigger value="growth" data-testid="tab-growth">Growth</TabsTrigger>
                <TabsTrigger value="engagement" data-testid="tab-engagement">Engagement</TabsTrigger>
                <TabsTrigger value="balances" data-testid="tab-balances">Balances</TabsTrigger>
                <TabsTrigger value="chains" data-testid="tab-chains">Chains</TabsTrigger>
                <TabsTrigger value="funnels" data-testid="tab-funnels">Funnels</TabsTrigger>
                <TabsTrigger value="pool" data-testid="tab-pool">Pool</TabsTrigger>
                <TabsTrigger value="yield" data-testid="tab-yield">Yield</TabsTrigger>
                <TabsTrigger value="facilitator" data-testid="tab-facilitator">Facilitator</TabsTrigger>
                <TabsTrigger value="trust" data-testid="tab-trust">Trust</TabsTrigger>
                <TabsTrigger value="ubi" data-testid="tab-ubi">UBI</TabsTrigger>
                <TabsTrigger value="xp" data-testid="tab-xp">XP</TabsTrigger>
              </TabsList>

              <TabsContent value="growth" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Cumulative Wallet Growth
                      </CardTitle>
                      <CardDescription>Total wallets over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={cumulativeChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="cumulative" 
                              stroke="hsl(var(--primary))" 
                              fill="hsl(var(--primary)/0.2)" 
                              name="Total Wallets"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Daily Registrations
                      </CardTitle>
                      <CardDescription>New wallets created per day over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={walletChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="New Wallets" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Active vs Inactive
                      </CardTitle>
                      <CardDescription>Wallet activity breakdown</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={activeInactiveData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {activeInactiveData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                      {activeInactive && (
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                          <div>
                            <p className="text-green-600 font-bold">{activeInactive.active7d}</p>
                            <p className="text-muted-foreground">Active 7d</p>
                          </div>
                          <div>
                            <p className="text-lime-600 font-bold">{activeInactive.active30d}</p>
                            <p className="text-muted-foreground">Active 30d</p>
                          </div>
                          <div>
                            <p className="text-slate-500 font-bold">{activeInactive.inactive}</p>
                            <p className="text-muted-foreground">Inactive</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Transaction Volume
                      </CardTitle>
                      <CardDescription>Daily USDC volume over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={volumeChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Volume']}
                            />
                            <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Transaction Count
                      </CardTitle>
                      <CardDescription>Daily transactions over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={txTrendsChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Transactions" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Average Transaction Size
                      </CardTitle>
                      <CardDescription>Average USDC per transaction over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={txTrendsChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Avg Size']}
                            />
                            <Line type="monotone" dataKey="avgSize" stroke="#10b981" strokeWidth={2} dot={false} name="Avg Size" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="engagement" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Daily & Weekly Active Users
                      </CardTitle>
                      <CardDescription>DAU and WAU over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={dauWauChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Legend />
                            <Area type="monotone" dataKey="WAU" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} name="Weekly Active" />
                            <Area type="monotone" dataKey="DAU" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="Daily Active" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Feature Adoption
                      </CardTitle>
                      <CardDescription>Percentage of users using each feature</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={adoptionChartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" className="text-xs" width={80} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number, name: string, props: any) => [`${value}% (${props.payload.enrolled} users)`, 'Adoption']}
                            />
                            <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      {featureAdoption && (
                        <div className="mt-4 text-sm text-muted-foreground text-center">
                          Total wallets: {featureAdoption.poolAdoption.total}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="balances" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Total Value Locked
                      </CardTitle>
                      <CardDescription>TVL over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={tvlChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`, 'TVL']}
                            />
                            <Area type="monotone" dataKey="tvl" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="TVL" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5" />
                        Balance Distribution
                      </CardTitle>
                      <CardDescription>Wallets by balance range</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={balanceDistChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="range" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number, name: string) => [
                                name === 'count' ? `${value} wallets` : `$${value.toFixed(2)}`,
                                name === 'count' ? 'Wallets' : 'Total Balance'
                              ]}
                            />
                            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Wallets" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="chains" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="h-5 w-5" />
                        Transaction Distribution
                      </CardTitle>
                      <CardDescription>Transactions by chain</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={chainTxData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {chainTxData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number, name: string) => [value, name]}
                            />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Balance by Chain
                      </CardTitle>
                      <CardDescription>Total USDC holdings per chain</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chainBalanceData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" tickFormatter={(v) => `$${v}`} />
                            <YAxis type="category" dataKey="name" className="text-xs" width={80} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Balance']}
                            />
                            <Bar dataKey="balance" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Chain Usage Over Time
                      </CardTitle>
                      <CardDescription>Transaction count by chain over the last {timePeriod} days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chainUsageChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Legend />
                            <Area type="monotone" dataKey="Base" stackId="1" stroke="#0052FF" fill="#0052FF" fillOpacity={0.6} />
                            <Area type="monotone" dataKey="Celo" stackId="1" stroke="#FCFF52" fill="#FCFF52" fillOpacity={0.6} />
                            <Area type="monotone" dataKey="Gnosis" stackId="1" stroke="#04795B" fill="#04795B" fillOpacity={0.6} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Chain Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        {chainBreakdown?.transactions.map(chain => {
                          const balanceData = chainBreakdown.balances.find(b => b.chainId === chain.chainId);
                          return (
                            <Card key={chain.chainId} className="bg-muted/50">
                              <CardContent className="pt-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: CHAIN_COLORS[chain.chainId] }} 
                                  />
                                  <span className="font-semibold">{CHAIN_NAMES[chain.chainId]}</span>
                                </div>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Transactions</span>
                                    <span className="font-medium">{chain.count}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Volume</span>
                                    <span className="font-medium">{formatMicroUsdc(chain.volume)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">TVL</span>
                                    <span className="font-medium">{formatMicroUsdc(balanceData?.totalBalance || '0')}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Wallets</span>
                                    <span className="font-medium">{balanceData?.walletCount || 0}</span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="funnels" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Conversion Funnels
                      </CardTitle>
                      <CardDescription>User journey conversion rates</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={funnelChartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number, name: string, props: any) => [
                                `${value}% (${props.payload.converted}/${props.payload.total})`,
                                'Conversion'
                              ]}
                            />
                            <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Funnel Details</CardTitle>
                      <CardDescription>Breakdown of user conversion metrics</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {conversionFunnels && (
                        <>
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">Wallet → First Transaction</span>
                              <Badge variant={conversionFunnels.walletToFirstTx.rate > 50 ? 'default' : 'secondary'}>
                                {conversionFunnels.walletToFirstTx.rate}%
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {conversionFunnels.walletToFirstTx.converted} of {conversionFunnels.walletToFirstTx.total} wallets made a transaction
                            </div>
                            <div className="mt-2 bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all" 
                                style={{ width: `${conversionFunnels.walletToFirstTx.rate}%` }} 
                              />
                            </div>
                          </div>

                          <div className="p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">Repeat Users</span>
                              <Badge variant={conversionFunnels.oneTimeToRepeat.rate > 30 ? 'default' : 'secondary'}>
                                {conversionFunnels.oneTimeToRepeat.rate}%
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {conversionFunnels.oneTimeToRepeat.repeat} repeat users vs {conversionFunnels.oneTimeToRepeat.oneTime} one-time users
                            </div>
                            <div className="mt-2 bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all" 
                                style={{ width: `${conversionFunnels.oneTimeToRepeat.rate}%` }} 
                              />
                            </div>
                          </div>

                          <div className="p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">New → Active (7d)</span>
                              <Badge variant={conversionFunnels.newToActive.rate > 20 ? 'default' : 'secondary'}>
                                {conversionFunnels.newToActive.rate}%
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {conversionFunnels.newToActive.activeLast7d} of {conversionFunnels.newToActive.newLast30d} new users active in last 7 days
                            </div>
                            <div className="mt-2 bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all" 
                                style={{ width: `${conversionFunnels.newToActive.rate}%` }} 
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="pool" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Trophy className="h-5 w-5" />
                        Current Draw
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-center p-4 bg-gradient-to-br from-primary/10 to-primary/5 ">
                        <p className="text-sm text-muted-foreground mb-1">Prize Pool</p>
                        <p className="text-4xl font-bold text-primary tracking-tight">
                          {formatMicroUsdc(poolAnalytics?.currentDraw?.totalPool || '0')}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Week {poolAnalytics?.currentDraw?.weekNumber}, {poolAnalytics?.currentDraw?.year}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-muted/50 ">
                          <p className="text-2xl font-bold">{poolAnalytics?.currentDraw?.participantCount || 0}</p>
                          <p className="text-xs text-muted-foreground">Participants</p>
                        </div>
                        <div className="text-center p-3 bg-muted/50 ">
                          <p className="text-2xl font-bold">{formatMicroUsdc(poolAnalytics?.currentDraw?.totalTickets || '0')}</p>
                          <p className="text-xs text-muted-foreground">Total Tickets</p>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <Label className="text-sm font-medium">Add to Prize Pool</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Amount (USDC)"
                            value={donationAmount}
                            onChange={(e) => setDonationAmount(e.target.value)}
                            data-testid="input-donation-amount"
                          />
                          <Button onClick={handleDonate} disabled={isDonating} data-testid="button-donate">
                            {isDonating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Draw History</CardTitle>
                      <CardDescription>Prize amounts by week</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={drawHistoryData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="week" className="text-xs" />
                            <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Prize']}
                            />
                            <Bar dataKey="prize" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Pool Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-muted/50 ">
                          <p className="text-xl font-bold">{formatMicroUsdc(poolAnalytics?.totalPrizesPaid || '0')}</p>
                          <p className="text-xs text-muted-foreground">Total Prizes Paid</p>
                        </div>
                        <div className="p-3 bg-muted/50 ">
                          <p className="text-xl font-bold">{formatMicroUsdc(poolAnalytics?.totalContributions || '0')}</p>
                          <p className="text-xs text-muted-foreground">Total Contributions</p>
                        </div>
                        <div className="p-3 bg-muted/50 ">
                          <p className="text-xl font-bold">{poolAnalytics?.referralStats.total || 0}</p>
                          <p className="text-xs text-muted-foreground">Total Referrals</p>
                        </div>
                        <div className="p-3 bg-muted/50 ">
                          <p className="text-xl font-bold">{poolAnalytics?.referralStats.activeReferrers || 0}</p>
                          <p className="text-xs text-muted-foreground">Active Referrers</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">Participation by Opt-in %</p>
                        <div className="space-y-2">
                          {poolAnalytics?.participationByPercent.map(p => (
                            <div key={p.percent} className="flex items-center gap-2">
                              <Badge variant={p.percent === 0 ? 'secondary' : 'default'}>
                                {p.percent === 0 ? 'None' : `${p.percent}%`}
                              </Badge>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary" 
                                  style={{ 
                                    width: `${(p.count / (overview?.totalWallets || 1)) * 100}%` 
                                  }} 
                                />
                              </div>
                              <span className="text-sm text-muted-foreground w-12 text-right">{p.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="yield" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card data-testid="card-tvl">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900">
                          <PiggyBank className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">TVL in Aave</p>
                          <p className="text-2xl font-bold" data-testid="metric-tvl">
                            {formatMicroUsdc(
                              (safeBigInt(aaveAnalytics?.totalDeposits) - safeBigInt(aaveAnalytics?.totalWithdrawals)).toString()
                            )}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-apy">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900">
                          <Percent className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Current APY</p>
                          <p className="text-2xl font-bold text-green-600" data-testid="metric-apy">~4.5%</p>
                          <p className="text-xs text-muted-foreground">Aave USDC on Celo</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-savers">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900">
                          <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Active Savers</p>
                          <p className="text-2xl font-bold" data-testid="metric-savers">{overview?.poolParticipants || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-pending">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 dark:bg-orange-900">
                          <Activity className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Pending Ops</p>
                          <p className="text-2xl font-bold" data-testid="metric-pending-ops">{aaveAnalytics?.activeOperations || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PiggyBank className="h-5 w-5" />
                        Aave Operations by Chain
                      </CardTitle>
                      <CardDescription>Deposits and withdrawals comparison</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={aaveChainData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" className="text-xs" />
                            <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`]}
                            />
                            <Legend />
                            <Bar dataKey="deposits" name="Deposits" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="withdrawals" name="Withdrawals" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Savings Flow Summary
                      </CardTitle>
                      <CardDescription>Total deposit and withdrawal activity</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 text-center">
                          <TrendingUp className="h-6 w-6 mx-auto mb-2 text-green-500" />
                          <p className="text-3xl font-bold text-green-600">{formatMicroUsdc(aaveAnalytics?.totalDeposits || '0')}</p>
                          <p className="text-sm text-muted-foreground">Total Deposits</p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-red-500/10 to-red-500/5 text-center">
                          <TrendingDown className="h-6 w-6 mx-auto mb-2 text-red-500" />
                          <p className="text-3xl font-bold text-red-600">{formatMicroUsdc(aaveAnalytics?.totalWithdrawals || '0')}</p>
                          <p className="text-sm text-muted-foreground">Total Withdrawals</p>
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Net Flow</span>
                          <Coins className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-3xl font-bold text-primary">
                          {formatMicroUsdc(
                            (safeBigInt(aaveAnalytics?.totalDeposits) - safeBigInt(aaveAnalytics?.totalWithdrawals)).toString()
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Currently held in Aave lending pools</p>
                      </div>

                      <div className="p-3 bg-muted/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Est. Annual Yield</span>
                          <span className="font-medium text-green-600">
                            {formatMicroUsdc(
                              Math.round(
                                (Number(safeBigInt(aaveAnalytics?.totalDeposits) - safeBigInt(aaveAnalytics?.totalWithdrawals)) * 0.045)
                              ).toString()
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Based on ~4.5% APY</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Chain Details</CardTitle>
                    <CardDescription>Detailed breakdown of savings activity per chain</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {aaveAnalytics?.operationsByChain.map(chain => {
                        const netFlow = safeBigInt(chain.deposits) - safeBigInt(chain.withdrawals);
                        return (
                          <Card key={chain.chainId} className="bg-muted/50">
                            <CardContent className="pt-4">
                              <div className="flex items-center gap-2 mb-3">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: CHAIN_COLORS[chain.chainId] }} 
                                />
                                <span className="font-semibold">{CHAIN_NAMES[chain.chainId]}</span>
                              </div>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Deposits</span>
                                  <span className="font-medium text-green-600">{formatMicroUsdc(chain.deposits)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Withdrawals</span>
                                  <span className="font-medium text-red-600">{formatMicroUsdc(chain.withdrawals)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2">
                                  <span className="text-muted-foreground">Net TVL</span>
                                  <span className={`font-bold ${netFlow >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                    {formatMicroUsdc(netFlow.toString())}
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                      {!aaveAnalytics?.operationsByChain.length && (
                        <p className="text-center text-muted-foreground py-8 col-span-3">No Aave operations recorded yet</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="facilitator" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        x402 Facilitator Stats
                      </CardTitle>
                      <CardDescription>Gasless transfer processing</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/50  text-center">
                          <p className="text-3xl font-bold">{facilitatorAnalytics?.totalTransfersProcessed || 0}</p>
                          <p className="text-sm text-muted-foreground">Transfers Processed</p>
                        </div>
                        <div className="p-4 bg-muted/50  text-center">
                          <p className="text-3xl font-bold">{facilitatorAnalytics?.totalGasDrips || 0}</p>
                          <p className="text-sm text-muted-foreground">Gas Drips Sent</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">Authorization Status</p>
                        <div className="space-y-2">
                          {facilitatorAnalytics?.authorizationsByStatus.map(a => (
                            <div key={a.status} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                              <Badge variant={a.status === 'used' ? 'default' : 'secondary'}>
                                {a.status}
                              </Badge>
                              <span className="font-medium">{a.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Gas Drips by Chain</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {facilitatorAnalytics?.gasDripsByChain.map(drip => (
                          <div key={drip.chainId} className="p-4 bg-muted/50 ">
                            <div className="flex items-center gap-2 mb-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: CHAIN_COLORS[drip.chainId] }} 
                              />
                              <span className="font-semibold">{CHAIN_NAMES[drip.chainId]}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Drips</p>
                                <p className="text-xl font-bold">{drip.count}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Total Gas</p>
                                <p className="text-xl font-bold">
                                  {(Number(drip.totalAmount) / 1e18).toFixed(4)} ETH
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {!facilitatorAnalytics?.gasDripsByChain.length && (
                          <p className="text-center text-muted-foreground py-8">No gas drips recorded yet</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="trust" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Network className="h-5 w-5" />
                        MaxFlow Scores
                      </CardTitle>
                      <CardDescription>Network signal distribution</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={maxflowDistData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="range" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="count" name="Users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Trust Network Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-muted/50  text-center">
                          <p className="text-3xl font-bold">{maxflowAnalytics?.totalScored || 0}</p>
                          <p className="text-sm text-muted-foreground">Users Scored</p>
                        </div>
                        <div className="p-4 bg-muted/50  text-center">
                          <p className="text-3xl font-bold">{maxflowAnalytics?.averageScore.toFixed(2) || 0}</p>
                          <p className="text-sm text-muted-foreground">Average Score</p>
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 ">
                        <h4 className="font-medium mb-2">Integration Stats</h4>
                        <p className="text-sm text-muted-foreground">
                          MaxFlow scoring provides sybil-resistant identity verification.
                          Higher scores indicate more trusted network positions.
                        </p>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        <p>Score ranges (0-100):</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li><strong>0-20:</strong> New accounts</li>
                          <li><strong>20-40:</strong> Building connections</li>
                          <li><strong>40-60:</strong> Well-connected</li>
                          <li><strong>60-80:</strong> Highly trusted</li>
                          <li><strong>80-100:</strong> Network leaders</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="ubi" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Heart className="h-5 w-5 text-green-500" />
                        GoodDollar UBI Overview
                      </CardTitle>
                      <CardDescription>Universal Basic Income claiming statistics</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 text-center">
                          <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-500" />
                          <p className="text-3xl font-bold">{gooddollarAnalytics?.totalVerifiedUsers || 0}</p>
                          <p className="text-sm text-muted-foreground">Verified Users</p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 text-center">
                          <Sparkles className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                          <p className="text-3xl font-bold">{gooddollarAnalytics?.activeClaimers || 0}</p>
                          <p className="text-sm text-muted-foreground">Active Claimers</p>
                        </div>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Total G$ Distributed</span>
                          <Coins className="h-4 w-4 text-primary" />
                        </div>
                        <p className="text-3xl font-bold text-primary">
                          {gooddollarAnalytics?.totalGdClaimedFormatted || '0'} G$
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Across {gooddollarAnalytics?.totalClaims || 0} total claims
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Recent Claims
                      </CardTitle>
                      <CardDescription>Latest GoodDollar UBI claim activity</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {gooddollarAnalytics?.recentClaims.length ? (
                          gooddollarAnalytics.recentClaims.slice(0, 5).map((claim, index) => (
                            <div 
                              key={index} 
                              className="flex items-center justify-between p-3 bg-muted/50"
                              data-testid={`claim-item-${index}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-500/20 flex items-center justify-center">
                                  <Heart className="h-4 w-4 text-green-500" />
                                </div>
                                <div>
                                  <p className="font-mono text-sm">
                                    {claim.walletAddress.slice(0, 6)}...{claim.walletAddress.slice(-4)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Day {claim.claimedDay}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="secondary">{claim.amountFormatted}</Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(claim.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-muted-foreground py-8">No claims recorded yet</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>About GoodDollar UBI</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5">
                        <p className="text-sm text-muted-foreground">
                          GoodDollar is a decentralized Universal Basic Income protocol that allows verified users 
                          to claim G$ tokens daily. Users must complete face verification to prove they are unique 
                          humans and prevent sybil attacks. Claims are processed on the Celo blockchain.
                        </p>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <div className="text-center">
                            <p className="text-lg font-bold">{gooddollarAnalytics?.totalVerifiedUsers || 0}</p>
                            <p className="text-xs text-muted-foreground">Verified Identities</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold">{gooddollarAnalytics?.totalClaims || 0}</p>
                            <p className="text-xs text-muted-foreground">Total Claims</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold">
                              {gooddollarAnalytics?.totalVerifiedUsers 
                                ? ((gooddollarAnalytics.activeClaimers / gooddollarAnalytics.totalVerifiedUsers) * 100).toFixed(1)
                                : 0}%
                            </p>
                            <p className="text-xs text-muted-foreground">Active Rate</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="xp" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card data-testid="card-xp-total">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900">
                          <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total XP Distributed</p>
                          <p className="text-2xl font-bold" data-testid="metric-total-xp">{xpAnalytics?.totalXpDistributedFormatted || '0'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-xp-users">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900">
                          <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Active XP Users</p>
                          <p className="text-2xl font-bold" data-testid="metric-xp-users">{xpAnalytics?.activeXpUsers || 0}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-xp-avg">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900">
                          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Avg XP per User</p>
                          <p className="text-2xl font-bold" data-testid="metric-xp-avg">{xpAnalytics?.avgXpPerUserFormatted || '0'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5" />
                        XP Sources
                      </CardTitle>
                      <CardDescription>How users earn XP</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Network className="h-5 w-5 text-blue-500" />
                            <div>
                              <p className="font-medium">MaxFlow Vouches</p>
                              <p className="text-xs text-muted-foreground">Social vouching from trusted users</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">{xpAnalytics?.xpFromMaxFlowFormatted || '0'} XP</p>
                            <p className="text-xs text-muted-foreground">{xpAnalytics?.totalXpClaims || 0} claims</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Heart className="h-5 w-5 text-green-500" />
                            <div>
                              <p className="font-medium">GoodDollar Exchange</p>
                              <p className="text-xs text-muted-foreground">G$ converted to XP (1 G$ = 0.01 XP)</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {xpAnalytics ? (Number(xpAnalytics.totalXpDistributed - xpAnalytics.xpFromMaxFlow) / 100).toFixed(2) : '0'} XP
                            </p>
                            <p className="text-xs text-muted-foreground">from G$ conversions</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        XP Usage
                      </CardTitle>
                      <CardDescription>How XP can be spent</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-muted/50">
                          <div className="flex items-center gap-3">
                            <DollarSign className="h-5 w-5 text-green-500" />
                            <div>
                              <p className="font-medium">USDC Savings</p>
                              <p className="text-xs text-muted-foreground">100 XP = 1 USDC (Aave on Celo)</p>
                            </div>
                          </div>
                          <Badge variant="secondary">Primary</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Gift className="h-5 w-5 text-orange-500" />
                            <div>
                              <p className="font-medium">SENADOR Tokens</p>
                              <p className="text-xs text-muted-foreground">1 XP = 1 SENADOR (high-risk)</p>
                            </div>
                          </div>
                          <Badge variant="outline">Experimental</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-muted/50">
                          <div className="flex items-center gap-3">
                            <Sparkles className="h-5 w-5 text-purple-500" />
                            <div>
                              <p className="font-medium">AI Chat</p>
                              <p className="text-xs text-muted-foreground">1 XP per message</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{xpAnalytics?.aiChatMessages || 0} msgs</p>
                            <p className="text-xs text-muted-foreground">{xpAnalytics?.aiChatUsers || 0} users</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>About XP System</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5">
                      <p className="text-sm text-muted-foreground">
                        XP (Experience Points) is earned through social vouching via MaxFlow or by converting GoodDollar (G$) tokens. 
                        XP can be used to claim USDC savings, experimental SENADOR tokens, or AI chat messages.
                        The system incentivizes building trust networks and participating in the GoodDollar UBI ecosystem.
                      </p>
                      <div className="grid grid-cols-4 gap-4 mt-4">
                        <div className="text-center">
                          <p className="text-lg font-bold">{xpAnalytics?.totalXpDistributedFormatted || '0'}</p>
                          <p className="text-xs text-muted-foreground">Total XP</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold">{xpAnalytics?.activeXpUsers || 0}</p>
                          <p className="text-xs text-muted-foreground">XP Holders</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold">{xpAnalytics?.aiChatUsers || 0}</p>
                          <p className="text-xs text-muted-foreground">AI Users</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold">{xpAnalytics?.aiChatMessages || 0}</p>
                          <p className="text-xs text-muted-foreground">AI Messages</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
