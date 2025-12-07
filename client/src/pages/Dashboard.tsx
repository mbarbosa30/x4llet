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
  BarChart3, PieChart, RefreshCw, Plus
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

  const [donationAmount, setDonationAmount] = useState('');
  const [isDonating, setIsDonating] = useState(false);

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

  const loadAllData = async (auth: string) => {
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
      ] = await Promise.all([
        authenticatedRequest('GET', '/api/admin/analytics/overview', auth),
        authenticatedRequest('GET', '/api/admin/analytics/wallet-growth?days=30', auth),
        authenticatedRequest('GET', '/api/admin/analytics/transaction-volume?days=30', auth),
        authenticatedRequest('GET', '/api/admin/analytics/chain-breakdown', auth),
        authenticatedRequest('GET', '/api/admin/analytics/pool', auth),
        authenticatedRequest('GET', '/api/admin/analytics/aave', auth),
        authenticatedRequest('GET', '/api/admin/analytics/facilitator', auth),
        authenticatedRequest('GET', '/api/admin/analytics/maxflow', auth),
      ]);

      setOverview(await overviewRes.json());
      setWalletGrowth(await walletGrowthRes.json());
      setTransactionVolume(await transactionVolumeRes.json());
      setChainBreakdown(await chainBreakdownRes.json());
      setPoolAnalytics(await poolRes.json());
      setAaveAnalytics(await aaveRes.json());
      setFacilitatorAnalytics(await facilitatorRes.json());
      setMaxflowAnalytics(await maxflowRes.json());
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
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
          <Button onClick={() => loadAllData(authHeader)} disabled={isLoading} data-testid="button-refresh-analytics">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
              <TabsList className="grid grid-cols-6 w-full max-w-3xl">
                <TabsTrigger value="growth" data-testid="tab-growth">Growth</TabsTrigger>
                <TabsTrigger value="chains" data-testid="tab-chains">Chains</TabsTrigger>
                <TabsTrigger value="pool" data-testid="tab-pool">Pool</TabsTrigger>
                <TabsTrigger value="yield" data-testid="tab-yield">Yield</TabsTrigger>
                <TabsTrigger value="facilitator" data-testid="tab-facilitator">Facilitator</TabsTrigger>
                <TabsTrigger value="trust" data-testid="tab-trust">Trust</TabsTrigger>
              </TabsList>

              <TabsContent value="growth" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Wallet Registrations
                      </CardTitle>
                      <CardDescription>New wallets created over the last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={walletChartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="date" className="text-xs" />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="count" 
                              stroke="hsl(var(--primary))" 
                              fill="hsl(var(--primary)/0.2)" 
                              name="New Wallets"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Transaction Volume
                      </CardTitle>
                      <CardDescription>Daily USDC volume over the last 30 days</CardDescription>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PiggyBank className="h-5 w-5" />
                        Aave Operations
                      </CardTitle>
                      <CardDescription>Deposits and withdrawals by chain</CardDescription>
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
                      <CardTitle>Yield Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-green-50 dark:bg-green-950 ">
                          <p className="text-3xl font-bold text-green-600">{formatMicroUsdc(aaveAnalytics?.totalDeposits || '0')}</p>
                          <p className="text-sm text-muted-foreground">Total Deposits</p>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-950 ">
                          <p className="text-3xl font-bold text-red-600">{formatMicroUsdc(aaveAnalytics?.totalWithdrawals || '0')}</p>
                          <p className="text-sm text-muted-foreground">Total Withdrawals</p>
                        </div>
                      </div>
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 ">
                        <p className="text-3xl font-bold text-blue-600">
                          {formatMicroUsdc(
                            (BigInt(aaveAnalytics?.totalDeposits || '0') - BigInt(aaveAnalytics?.totalWithdrawals || '0')).toString()
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">Net Position (TVL in Aave)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={aaveAnalytics?.activeOperations ? 'default' : 'secondary'}>
                          {aaveAnalytics?.activeOperations || 0} pending operations
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
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
                        <p>Score ranges:</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li><strong>0-1:</strong> New or isolated accounts</li>
                          <li><strong>1-3:</strong> Some network connections</li>
                          <li><strong>3-5:</strong> Well-connected users</li>
                          <li><strong>5-10:</strong> Highly trusted accounts</li>
                          <li><strong>10+:</strong> Core network participants</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
