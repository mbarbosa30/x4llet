import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Database, TrendingUp, Trash2, Activity, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { formatAmount } from '@/lib/formatAmount';

interface AdminStats {
  totalWallets: number;
  totalTransactions: number;
  cachedBalances: number;
  exchangeRateSnapshots: number;
  balanceHistoryPoints: number;
}

interface ApiHealthStatus {
  maxflowApi: boolean;
  frankfurterApi: boolean;
  baseRpc: boolean;
  celoRpc: boolean;
}

interface RecentTransaction {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
}

function createAuthHeader(username: string, password: string): string {
  const credentials = btoa(`${username}:${password}`);
  return `Basic ${credentials}`;
}

async function authenticatedRequest(method: string, url: string, authHeader: string) {
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  return response;
}

export default function Admin() {
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authHeader, setAuthHeader] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  const [isBackfillingBalances, setIsBackfillingBalances] = useState(false);
  const [isBackfillingRates, setIsBackfillingRates] = useState(false);
  const [isClearingCaches, setIsClearingCaches] = useState(false);
  const [isClearingBalances, setIsClearingBalances] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentTransaction[]>([]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);

    const authHeaderValue = createAuthHeader(username, password);

    try {
      await authenticatedRequest('GET', '/api/admin/stats', authHeaderValue);
      
      setAuthHeader(authHeaderValue);
      setIsAuthenticated(true);
      setPassword('');
      
      toast({
        title: 'Authenticated',
        description: 'Welcome to the admin dashboard',
      });

      loadDashboardData(authHeaderValue);
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

  const loadDashboardData = async (auth: string) => {
    try {
      const [statsRes, healthRes, activityRes] = await Promise.all([
        authenticatedRequest('GET', '/api/admin/stats', auth),
        authenticatedRequest('GET', '/api/admin/health', auth),
        authenticatedRequest('GET', '/api/admin/recent-activity', auth),
      ]);

      setStats(await statsRes.json());
      setApiHealth(await healthRes.json());
      setRecentActivity(await activityRes.json());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const handleBackfillBalances = async () => {
    if (!walletAddress) {
      toast({
        title: 'Address Required',
        description: 'Please enter a wallet address',
        variant: 'destructive',
      });
      return;
    }

    setIsBackfillingBalances(true);
    try {
      const res = await authenticatedRequest('POST', `/api/admin/backfill-balances/${walletAddress}`, authHeader);
      const result = await res.json();

      toast({
        title: 'Balance History Reconstructed',
        description: `Added ${result.snapshotsCreated} historical balance points`,
      });
    } catch (error: any) {
      toast({
        title: 'Backfill Failed',
        description: error.message || 'Failed to reconstruct balance history',
        variant: 'destructive',
      });
    } finally {
      setIsBackfillingBalances(false);
    }
  };

  const handleBackfillRates = async () => {
    setIsBackfillingRates(true);
    try {
      const res = await authenticatedRequest('POST', '/api/admin/backfill-exchange-rates', authHeader);
      const result = await res.json();

      toast({
        title: 'Exchange Rates Backfilled',
        description: `Added ${result.ratesAdded} historical exchange rate snapshots`,
      });
    } catch (error: any) {
      toast({
        title: 'Backfill Failed',
        description: error.message || 'Failed to backfill exchange rates',
        variant: 'destructive',
      });
    } finally {
      setIsBackfillingRates(false);
    }
  };

  const handleClearCaches = async () => {
    if (!confirm('Are you sure? This will clear all cached balances, transactions, and MaxFlow scores.')) {
      return;
    }

    setIsClearingCaches(true);
    try {
      await authenticatedRequest('POST', '/api/admin/clear-caches', authHeader);

      toast({
        title: 'Caches Cleared',
        description: 'All cached data has been removed',
      });

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Clear Failed',
        description: error.message || 'Failed to clear caches',
        variant: 'destructive',
      });
    } finally {
      setIsClearingCaches(false);
    }
  };

  const handleClearCachedBalances = async () => {
    if (!confirm('Clear cached balances? They will be refetched from the blockchain on next balance check.')) {
      return;
    }

    setIsClearingBalances(true);
    try {
      await authenticatedRequest('POST', '/api/admin/clear-cached-balances', authHeader);

      toast({
        title: 'Cached Balances Cleared',
        description: 'Balances will be refetched from blockchain',
      });

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Clear Failed',
        description: error.message || 'Failed to clear cached balances',
        variant: 'destructive',
      });
    } finally {
      setIsClearingBalances(false);
    }
  };

  const handleClearBalanceHistory = async () => {
    if (!confirm('Clear all balance history? This can be reconstructed from cached transactions using the backfill tool.')) {
      return;
    }

    setIsClearingHistory(true);
    try {
      await authenticatedRequest('POST', '/api/admin/clear-balance-history', authHeader);

      toast({
        title: 'Balance History Cleared',
        description: 'Use backfill to reconstruct from transactions',
      });

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Clear Failed',
        description: error.message || 'Failed to clear balance history',
        variant: 'destructive',
      });
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handlePruneOldData = async () => {
    if (!confirm('This will remove balance snapshots older than 90 days. Continue?')) {
      return;
    }

    setIsPruning(true);
    try {
      const res = await authenticatedRequest('POST', '/api/admin/prune-old-data', authHeader);
      const result = await res.json();

      toast({
        title: 'Data Pruned',
        description: `Removed ${result.deletedSnapshots} old balance snapshots`,
      });

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Prune Failed',
        description: error.message || 'Failed to prune old data',
        variant: 'destructive',
      });
    } finally {
      setIsPruning(false);
    }
  };

  const handleMigrateToMicroUsdc = async () => {
    if (!confirm('This will convert decimal amounts (e.g., "1.000000") to micro-USDC integers (e.g., "1000000") in cached_transactions and cached_balances. Only amounts < 1000 will be migrated. Continue?')) {
      return;
    }

    setIsMigrating(true);
    try {
      const res = await authenticatedRequest('POST', '/api/admin/migrate-to-micro-usdc', authHeader);
      const result = await res.json();

      toast({
        title: 'Migration Complete',
        description: `Migrated ${result.migratedTransactions} transactions and ${result.migratedBalances} balances`,
      });

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Migration Failed',
        description: error.message || 'Failed to migrate to micro-USDC',
        variant: 'destructive',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-6 h-6 text-primary" />
              <CardTitle>Admin Login</CardTitle>
            </div>
            <CardDescription>
              Enter your credentials to access the admin dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  data-testid="input-admin-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  data-testid="input-admin-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isAuthenticating}
                data-testid="button-admin-login"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Login'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground">System management and maintenance tools</p>
        </div>

        {/* Data Backfill Section */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Backfill Balance History
              </CardTitle>
              <CardDescription>
                Reconstruct historical balance snapshots from cached transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="wallet-address">Wallet Address</Label>
                <Input
                  id="wallet-address"
                  placeholder="0x..."
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  data-testid="input-wallet-address"
                />
              </div>
              <Button
                onClick={handleBackfillBalances}
                disabled={isBackfillingBalances}
                className="w-full"
                data-testid="button-backfill-balances"
              >
                {isBackfillingBalances && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reconstruct Balance History
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Backfill Exchange Rates
              </CardTitle>
              <CardDescription>
                Fetch past 90 days of historical exchange rates from Frankfurter API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleBackfillRates}
                disabled={isBackfillingRates}
                className="w-full"
                data-testid="button-backfill-rates"
              >
                {isBackfillingRates && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Backfill Exchange Rates
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* System Health Section */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Statistics
              </CardTitle>
              <CardDescription>Current database record counts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Wallets</span>
                    <span className="font-medium">{stats.totalWallets}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cached Transactions</span>
                    <span className="font-medium">{stats.totalTransactions}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cached Balances</span>
                    <span className="font-medium">{stats.cachedBalances}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exchange Rate Snapshots</span>
                    <span className="font-medium">{stats.exchangeRateSnapshots}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance History Points</span>
                    <span className="font-medium">{stats.balanceHistoryPoints}</span>
                  </div>
                </>
              ) : null}
              <Button onClick={() => loadDashboardData(authHeader)} variant="outline" className="w-full" data-testid="button-fetch-stats">
                {stats ? 'Refresh Stats' : 'Load Stats'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                API Health Check
              </CardTitle>
              <CardDescription>Test connectivity to external services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {apiHealth ? (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">MaxFlow API</span>
                    {apiHealth.maxflowApi ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Frankfurter API</span>
                    {apiHealth.frankfurterApi ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Base RPC</span>
                    {apiHealth.baseRpc ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Celo RPC</span>
                    {apiHealth.celoRpc ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </>
              ) : null}
              <Button onClick={() => loadDashboardData(authHeader)} variant="outline" className="w-full" data-testid="button-check-health">
                {apiHealth ? 'Recheck Health' : 'Check Health'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Last 20 transactions across all users</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recentActivity.map((tx) => (
                  <div key={tx.txHash} className="text-xs p-2 bg-muted rounded-md">
                    <div className="flex justify-between mb-1">
                      <span className="font-mono">{formatAmount(tx.amount)}</span>
                      <span className="text-muted-foreground">
                        {new Date(tx.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {tx.from.slice(0, 6)}...{tx.from.slice(-4)} → {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <Button onClick={() => loadDashboardData(authHeader)} variant="outline" className="w-full" data-testid="button-fetch-activity">
              {recentActivity.length > 0 ? 'Refresh Activity' : 'Load Recent Activity'}
            </Button>
          </CardContent>
        </Card>

        {/* Maintenance Section */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Clear All Caches
              </CardTitle>
              <CardDescription>
                Remove all cached balances, transactions, and MaxFlow scores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleClearCaches}
                disabled={isClearingCaches}
                variant="destructive"
                className="w-full"
                data-testid="button-clear-caches"
              >
                {isClearingCaches && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clear All Caches
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Prune Old Data
              </CardTitle>
              <CardDescription>
                Remove balance snapshots older than 90 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handlePruneOldData}
                disabled={isPruning}
                variant="outline"
                className="w-full"
                data-testid="button-prune-data"
              >
                {isPruning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Prune Old Snapshots
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Clear Cached Balances
              </CardTitle>
              <CardDescription>
                Remove cached balances only (will refetch from blockchain)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleClearCachedBalances}
                disabled={isClearingBalances}
                variant="outline"
                className="w-full"
                data-testid="button-clear-balances"
              >
                {isClearingBalances && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clear Cached Balances
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Clear Balance History
              </CardTitle>
              <CardDescription>
                Remove all balance snapshots (can reconstruct from transactions)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleClearBalanceHistory}
                disabled={isClearingHistory}
                variant="outline"
                className="w-full"
                data-testid="button-clear-history"
              >
                {isClearingHistory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Clear Balance History
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Migrate to Micro-USDC
              </CardTitle>
              <CardDescription>
                Convert decimal amounts to micro-USDC integers (one-time migration)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleMigrateToMicroUsdc}
                disabled={isMigrating}
                variant="outline"
                className="w-full"
                data-testid="button-migrate-usdc"
              >
                {isMigrating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Migrate to Micro-USDC
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
