import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Database, TrendingUp, Trash2, Activity, CheckCircle2, AlertCircle, Lock, Users, ArrowUpDown, ChevronDown, ChevronUp, Network, UserCheck, PiggyBank, Coins, Shield, Settings, BarChart3, Clock, DollarSign, Wallet, Gift, RefreshCw, HandHeart, Check, Info, ScanFace } from 'lucide-react';
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
  chainId: number;
}

interface WalletDetails {
  address: string;
  createdAt: string;
  lastSeen: string;
  totalBalance: string;
  balanceByChain: { base: string; celo: string; gnosis: string; arbitrum: string };
  aUsdcBalance: string;
  aUsdcByChain: { base: string; celo: string; gnosis: string; arbitrum: string };
  transferCount: number;
  totalVolume: string;
  savingsBalance: string;
  poolOptInPercent: number;
  poolApproved: boolean;
  maxFlowScore: number | null;
  isGoodDollarVerified: boolean;
}

interface TrustedUnfundedWallet {
  address: string;
  maxFlowScore: number;
  totalXp: number;
  lastSeen: string;
}

interface AnalyticsOverview {
  totalWallets: number;
  activeWallets: number;
  totalTransactions: number;
  totalVolumeUsd: string;
  poolParticipants: number;
  totalYieldCollected: string;
}

interface PoolDraw {
  id: string;
  weekNumber: number;
  year: number;
  weekStart: string;
  weekEnd: string;
  totalPool: string;
  totalTickets: string;
  sponsoredPool: string;
  participantCount: number;
  winnerAddress: string | null;
  winnerTickets: string | null;
  status: string;
  drawnAt: string | null;
  winningNumber: string | null;
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

interface SybilAnalytics {
  totalEvents: number;
  uniqueIps: number;
  uniqueWallets: number;
  suspiciousIps: number;
  eventsByType: Record<string, number>;
}

interface SuspiciousIpPattern {
  ipHash: string;
  walletCount: number;
  wallets: string[];
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface FlaggedWallet {
  wallet: string;
  score: number;
  matchCount: number;
  signals: string[];
  clusterSize: number;
  isExempt: boolean;
  exemptReason: string | null;
  isFaceChecked: boolean;
  faceCheckedAt: string | null;
}

interface StorageTokenPattern {
  storageToken: string;
  walletCount: number;
  wallets: string[];
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface WalletFingerprint {
  fingerprint: {
    ipHash: string;
    userAgent: string | null;
    screenResolution: string | null;
    timezone: string | null;
    language: string | null;
    platform: string | null;
    hardwareConcurrency: number | null;
    deviceMemory: number | null;
    storageToken: string | null;
  } | null;
  scoreBreakdown: Array<{
    wallet: string;
    signal: string;
    points: number;
  }>;
  totalScore: number;
  matchingWallets: string[];
}

interface WalletGrowthPoint {
  date: string;
  count: number;
}

interface TransactionVolumePoint {
  date: string;
  volume: string;
  count: number;
}

interface SchedulerStatus {
  scheduler: {
    isRunning: boolean;
    isConfigured: boolean;
    nextDrawTime: string;
    hoursUntilDraw: number;
    currentWeekDraw: {
      weekNumber: number;
      year: number;
      status: string;
    } | null;
    lastExecutedDrawKey: string;
    facilitatorBalances: {
      celo: string;
      aUsdc: string;
      hasMinGas: boolean;
    };
    drawSchedule: string;
    checkInterval: string;
  };
}

interface AaveOperation {
  id: string;
  userAddress: string;
  chainId: number;
  operationType: string;
  amount: string;
  status: string;
  step: string | null;
  transferTxHash: string | null;
  approveTxHash: string | null;
  supplyTxHash: string | null;
  refundTxHash: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  chainName?: string;
}

interface AaveOperationsResponse {
  count: number;
  operations: AaveOperation[];
}

type SortField = 'balance' | 'transfers' | 'maxflow' | 'volume' | 'created' | 'lastSeen' | 'pool';
type SortDirection = 'asc' | 'desc';

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
  const [isBackfillingAllWallets, setIsBackfillingAllWallets] = useState(false);
  const [isClearingCaches, setIsClearingCaches] = useState(false);
  const [isClearingBalances, setIsClearingBalances] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isClearingTransactionsAndBalances, setIsClearingTransactionsAndBalances] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isRefetchingMaxFlow, setIsRefetchingMaxFlow] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealthStatus | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentTransaction[]>([]);
  const [walletList, setWalletList] = useState<WalletDetails[]>([]);
  const [isLoadingWallets, setIsLoadingWallets] = useState(false);
  const [sortField, setSortField] = useState<SortField>('lastSeen');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [trustedUnfundedWallets, setTrustedUnfundedWallets] = useState<TrustedUnfundedWallet[]>([]);
  const [isLoadingTrustedUnfunded, setIsLoadingTrustedUnfunded] = useState(false);
  
  // Analytics state
  const [activeTab, setActiveTab] = useState('overview');
  const [poolAnalytics, setPoolAnalytics] = useState<PoolAnalytics | null>(null);
  const [aaveAnalytics, setAaveAnalytics] = useState<AaveAnalytics | null>(null);
  const [facilitatorAnalytics, setFacilitatorAnalytics] = useState<FacilitatorAnalytics | null>(null);
  const [maxFlowAnalytics, setMaxFlowAnalytics] = useState<MaxFlowAnalytics | null>(null);
  const [goodDollarAnalytics, setGoodDollarAnalytics] = useState<GoodDollarAnalytics | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [aaveOperations, setAaveOperations] = useState<AaveOperationsResponse | null>(null);
  const [isLoadingPoolAnalytics, setIsLoadingPoolAnalytics] = useState(false);
  const [isLoadingAaveAnalytics, setIsLoadingAaveAnalytics] = useState(false);
  const [isLoadingFacilitatorAnalytics, setIsLoadingFacilitatorAnalytics] = useState(false);
  const [isLoadingMaxFlowAnalytics, setIsLoadingMaxFlowAnalytics] = useState(false);
  const [isLoadingGoodDollarAnalytics, setIsLoadingGoodDollarAnalytics] = useState(false);
  const [isLoadingSchedulerStatus, setIsLoadingSchedulerStatus] = useState(false);
  const [isLoadingAaveOperations, setIsLoadingAaveOperations] = useState(false);
  
  // GoodDollar sync claims state
  const [syncClaimsAddress, setSyncClaimsAddress] = useState('');
  const [isSyncingClaims, setIsSyncingClaims] = useState(false);
  const [syncClaimsResult, setSyncClaimsResult] = useState<{ inserted: number; skipped: number; claims: Array<{ txHash: string; amountFormatted: string; claimedDay: number }> } | null>(null);

  // Airdrop state
  const [airdropAmount, setAirdropAmount] = useState('0.05');
  const [airdropPreview, setAirdropPreview] = useState<{ count: number; wallets: Array<{ address: string; lastSeen: string }> } | null>(null);
  const [isLoadingAirdropPreview, setIsLoadingAirdropPreview] = useState(false);
  const [isExecutingAirdrop, setIsExecutingAirdrop] = useState(false);
  const [airdropResult, setAirdropResult] = useState<{ sent: number; failed: number; totalSent: number; results: Array<{ address: string; txHash?: string; error?: string }> } | null>(null);

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

  const loadWalletList = async (auth: string) => {
    setIsLoadingWallets(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/wallets', auth);
      const wallets = await res.json();
      setWalletList(wallets);
    } catch (error) {
      console.error('Failed to load wallet list:', error);
      toast({
        title: 'Load Failed',
        description: 'Failed to load wallet list',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingWallets(false);
    }
  };

  const loadTrustedUnfundedWallets = async (auth: string) => {
    setIsLoadingTrustedUnfunded(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/wallets-scored-no-balance', auth);
      const wallets = await res.json();
      setTrustedUnfundedWallets(wallets);
    } catch (error) {
      console.error('Failed to load trusted unfunded wallets:', error);
      toast({
        title: 'Load Failed',
        description: 'Failed to load trusted unfunded wallets',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingTrustedUnfunded(false);
    }
  };

  const loadPoolAnalytics = async (auth: string) => {
    setIsLoadingPoolAnalytics(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/analytics/pool', auth);
      setPoolAnalytics(await res.json());
    } catch (error) {
      console.error('Failed to load pool analytics:', error);
    } finally {
      setIsLoadingPoolAnalytics(false);
    }
  };

  const loadAaveAnalytics = async (auth: string) => {
    setIsLoadingAaveAnalytics(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/analytics/aave', auth);
      setAaveAnalytics(await res.json());
    } catch (error) {
      console.error('Failed to load aave analytics:', error);
    } finally {
      setIsLoadingAaveAnalytics(false);
    }
  };

  const loadFacilitatorAnalytics = async (auth: string) => {
    setIsLoadingFacilitatorAnalytics(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/analytics/facilitator', auth);
      setFacilitatorAnalytics(await res.json());
    } catch (error) {
      console.error('Failed to load facilitator analytics:', error);
    } finally {
      setIsLoadingFacilitatorAnalytics(false);
    }
  };

  const loadMaxFlowAnalytics = async (auth: string) => {
    setIsLoadingMaxFlowAnalytics(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/analytics/maxflow', auth);
      setMaxFlowAnalytics(await res.json());
    } catch (error) {
      console.error('Failed to load maxflow analytics:', error);
    } finally {
      setIsLoadingMaxFlowAnalytics(false);
    }
  };

  const loadGoodDollarAnalytics = async (auth: string) => {
    setIsLoadingGoodDollarAnalytics(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/analytics/gooddollar', auth);
      setGoodDollarAnalytics(await res.json());
    } catch (error) {
      console.error('Failed to load gooddollar analytics:', error);
    } finally {
      setIsLoadingGoodDollarAnalytics(false);
    }
  };

  const handleSyncGoodDollarClaims = async () => {
    if (!syncClaimsAddress || !/^0x[a-fA-F0-9]{40}$/.test(syncClaimsAddress)) {
      toast({
        title: 'Invalid Address',
        description: 'Please enter a valid wallet address',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncingClaims(true);
    setSyncClaimsResult(null);
    try {
      const response = await fetch('/api/admin/gooddollar/sync-claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({ walletAddress: syncClaimsAddress }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Sync failed' }));
        throw new Error(errorData.error || 'Failed to sync claims');
      }

      const result = await response.json();
      setSyncClaimsResult(result);
      
      toast({
        title: 'Sync Complete',
        description: `Synced ${result.inserted} new claims, ${result.skipped} already existed`,
      });

      // Refresh analytics to show updated data
      loadGoodDollarAnalytics(authHeader);
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync claims from blockchain',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingClaims(false);
    }
  };

  const loadSchedulerStatus = async (auth: string) => {
    setIsLoadingSchedulerStatus(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/pool/scheduler', auth);
      setSchedulerStatus(await res.json());
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    } finally {
      setIsLoadingSchedulerStatus(false);
    }
  };

  const loadAaveOperations = async (auth: string) => {
    setIsLoadingAaveOperations(true);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/aave-operations', auth);
      setAaveOperations(await res.json());
    } catch (error) {
      console.error('Failed to load aave operations:', error);
    } finally {
      setIsLoadingAaveOperations(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Load data on-demand when tab is selected
    if (tab === 'pool' && !poolAnalytics && !isLoadingPoolAnalytics) {
      loadPoolAnalytics(authHeader);
      loadSchedulerStatus(authHeader);
    } else if (tab === 'aave' && !aaveAnalytics && !isLoadingAaveAnalytics) {
      loadAaveAnalytics(authHeader);
    } else if (tab === 'trust' && !facilitatorAnalytics && !isLoadingFacilitatorAnalytics) {
      loadFacilitatorAnalytics(authHeader);
      loadMaxFlowAnalytics(authHeader);
    } else if (tab === 'operations' && !aaveOperations && !isLoadingAaveOperations) {
      loadAaveOperations(authHeader);
      loadSchedulerStatus(authHeader);
    } else if (tab === 'wallets' && walletList.length === 0 && !isLoadingWallets) {
      loadWalletList(authHeader);
    } else if (tab === 'gooddollar' && !goodDollarAnalytics && !isLoadingGoodDollarAnalytics) {
      loadGoodDollarAnalytics(authHeader);
    }
  };

  const sortedWallets = [...walletList].sort((a, b) => {
    let comparison = 0;
    const safeBalance = (val: string) => {
      try { return BigInt(val || '0'); } catch { return BigInt(0); }
    };
    switch (sortField) {
      case 'balance': {
        const aVal = safeBalance(a.totalBalance);
        const bVal = safeBalance(b.totalBalance);
        comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        break;
      }
      case 'transfers':
        comparison = a.transferCount - b.transferCount;
        break;
      case 'maxflow': {
        const aScore = a.maxFlowScore ?? -1;
        const bScore = b.maxFlowScore ?? -1;
        comparison = aScore - bScore;
        break;
      }
      case 'volume': {
        const aVol = safeBalance(a.totalVolume);
        const bVol = safeBalance(b.totalVolume);
        comparison = aVol > bVol ? 1 : aVol < bVol ? -1 : 0;
        break;
      }
      case 'created':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'lastSeen':
        comparison = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime();
        break;
      case 'pool':
        comparison = a.poolOptInPercent - b.poolOptInPercent;
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {label}
      {sortField === field ? (
        sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );

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

  const handleBackfillAllWallets = async () => {
    if (!confirm('This will backfill balance history for ALL wallets in the database on both Base and Celo. This may take a while. Continue?')) {
      return;
    }

    setIsBackfillingAllWallets(true);
    try {
      const res = await authenticatedRequest('POST', '/api/admin/backfill-all-wallets', authHeader);
      const result = await res.json();

      const errorMsg = (result.errors && result.errors.length > 0)
        ? ` (${result.errors.length} errors)`
        : '';

      toast({
        title: 'Bulk Backfill Complete',
        description: `Processed ${result.walletsProcessed || 0} wallets, created ${result.totalSnapshots || 0} snapshots${errorMsg}`,
      });

      if (result.errors && result.errors.length > 0) {
        console.error('Backfill errors:', result.errors);
      }

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Bulk Backfill Failed',
        description: error.message || 'Failed to backfill all wallets',
        variant: 'destructive',
      });
    } finally {
      setIsBackfillingAllWallets(false);
    }
  };

  const handleRefetchMaxFlowScores = async () => {
    if (!confirm('This will refetch MaxFlow scores for ALL wallets from the MaxFlow API. This may take a while. Continue?')) {
      return;
    }

    setIsRefetchingMaxFlow(true);
    try {
      const res = await authenticatedRequest('POST', '/api/admin/refetch-maxflow-scores', authHeader);
      const result = await res.json();

      const errorMsg = (result.errors && result.errors.length > 0)
        ? ` (${result.errors.length} errors)`
        : '';

      toast({
        title: 'MaxFlow Scores Updated',
        description: `Processed ${result.walletsProcessed || 0} wallets, updated ${result.scoresUpdated || 0} scores${errorMsg}`,
      });

      if (result.errors && result.errors.length > 0) {
        console.error('MaxFlow refetch errors:', result.errors);
      }

      loadWalletList(authHeader);
    } catch (error: any) {
      toast({
        title: 'Refetch Failed',
        description: error.message || 'Failed to refetch MaxFlow scores',
        variant: 'destructive',
      });
    } finally {
      setIsRefetchingMaxFlow(false);
    }
  };

  const handleClearTransactionsAndBalances = async () => {
    if (!confirm('This will clear cached transactions and balances but preserve MaxFlow scores. They will be refetched from the blockchain. Continue?')) {
      return;
    }

    setIsClearingTransactionsAndBalances(true);
    try {
      await authenticatedRequest('POST', '/api/admin/clear-transactions-and-balances', authHeader);

      toast({
        title: 'Transactions & Balances Cleared',
        description: 'Data will be refetched from blockchain (MaxFlow scores preserved)',
      });

      loadDashboardData(authHeader);
    } catch (error: any) {
      toast({
        title: 'Clear Failed',
        description: error.message || 'Failed to clear transactions and balances',
        variant: 'destructive',
      });
    } finally {
      setIsClearingTransactionsAndBalances(false);
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

  const handleAirdropPreview = async () => {
    setIsLoadingAirdropPreview(true);
    setAirdropPreview(null);
    setAirdropResult(null);
    try {
      const res = await authenticatedRequest('GET', '/api/admin/airdrop/preview', authHeader);
      const data = await res.json();
      setAirdropPreview(data);
    } catch (error: any) {
      toast({
        title: 'Preview Failed',
        description: error.message || 'Failed to load eligible wallets',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAirdropPreview(false);
    }
  };

  const handleAirdropExecute = async () => {
    const amount = parseFloat(airdropAmount);
    if (!amount || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid USDC amount',
        variant: 'destructive',
      });
      return;
    }

    if (!airdropPreview || airdropPreview.count === 0) {
      toast({
        title: 'No Eligible Wallets',
        description: 'Run preview first to find eligible wallets',
        variant: 'destructive',
      });
      return;
    }

    const totalCost = amount * airdropPreview.count;
    if (!confirm(`Send ${amount} USDC to ${airdropPreview.count} wallets?\n\nTotal: ${totalCost.toFixed(2)} USDC\n\nThis cannot be undone.`)) {
      return;
    }

    setIsExecutingAirdrop(true);
    try {
      const res = await fetch('/api/admin/airdrop/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({ amountUsdc: amount, chainId: 42220 }), // Celo
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `Request failed with status ${res.status}`);
      }
      
      const result = await res.json();
      setAirdropResult(result);
      setAirdropPreview(null);

      toast({
        title: 'Airdrop Complete',
        description: `Sent ${result.amountPerWallet} USDC to ${result.sent} wallets. ${result.failed} failed.`,
      });
    } catch (error: any) {
      toast({
        title: 'Airdrop Failed',
        description: error.message || 'Failed to execute airdrop',
        variant: 'destructive',
      });
    } finally {
      setIsExecutingAirdrop(false);
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
                    <Loader2 className="h-4 w-4 animate-spin" />
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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 font-heading tracking-tight" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground">System management and analytics</p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-9 mb-6" data-testid="admin-tabs">
            <TabsTrigger value="overview" className="flex items-center gap-1.5" data-testid="tab-overview">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="pool" className="flex items-center gap-1.5" data-testid="tab-pool">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">Pool</span>
            </TabsTrigger>
            <TabsTrigger value="aave" className="flex items-center gap-1.5" data-testid="tab-aave">
              <PiggyBank className="h-4 w-4" />
              <span className="hidden sm:inline">Aave</span>
            </TabsTrigger>
            <TabsTrigger value="trust" className="flex items-center gap-1.5" data-testid="tab-trust">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Trust</span>
            </TabsTrigger>
            <TabsTrigger value="gooddollar" className="flex items-center gap-1.5" data-testid="tab-gooddollar">
              <HandHeart className="h-4 w-4" />
              <span className="hidden sm:inline">GoodDollar</span>
            </TabsTrigger>
            <TabsTrigger value="sybil" className="flex items-center gap-1.5" data-testid="tab-sybil">
              <AlertCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Sybil</span>
            </TabsTrigger>
            <TabsTrigger value="facecheck" className="flex items-center gap-1.5" data-testid="tab-facecheck">
              <ScanFace className="h-4 w-4" />
              <span className="hidden sm:inline">Face</span>
            </TabsTrigger>
            <TabsTrigger value="wallets" className="flex items-center gap-1.5" data-testid="tab-wallets">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Wallets</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex items-center gap-1.5" data-testid="tab-tools">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Tools</span>
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
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
                      <div key={tx.txHash} className="text-xs p-2 bg-muted">
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{formatAmount(tx.amount)}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-background border">
                              {tx.chainId === 8453 ? 'Base' : tx.chainId === 42220 ? 'Celo' : tx.chainId === 42161 ? 'Arbitrum' : 'Gnosis'}
                            </span>
                          </div>
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
          </TabsContent>

          {/* Pool Tab */}
          <TabsContent value="pool" className="space-y-6">
            {isLoadingPoolAnalytics || isLoadingSchedulerStatus ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Scheduler Status */}
                {schedulerStatus && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Pool Scheduler Status
                      </CardTitle>
                      <CardDescription>Weekly draw automation status</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground block">Status</span>
                          <span className="font-medium flex items-center gap-1">
                            {schedulerStatus.scheduler.isRunning ? (
                              <><CheckCircle2 className="h-4 w-4 text-green-500" /> Running</>
                            ) : (
                              <><AlertCircle className="h-4 w-4 text-red-500" /> Stopped</>
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Next Draw</span>
                          <span className="font-medium">{new Date(schedulerStatus.scheduler.nextDrawTime).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Hours Until Draw</span>
                          <span className="font-medium">{schedulerStatus.scheduler.hoursUntilDraw.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Gas Balance (CELO)</span>
                          <span className="font-medium flex items-center gap-1">
                            {schedulerStatus.scheduler.facilitatorBalances.celo}
                            {schedulerStatus.scheduler.facilitatorBalances.hasMinGas ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            )}
                          </span>
                        </div>
                      </div>
                      {schedulerStatus.scheduler.currentWeekDraw && (
                        <div className="pt-2 border-t">
                          <span className="text-xs text-muted-foreground">Current Week: </span>
                          <span className="font-mono text-sm">
                            W{schedulerStatus.scheduler.currentWeekDraw.weekNumber}/{schedulerStatus.scheduler.currentWeekDraw.year}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">Status: </span>
                          <span className="text-sm">{schedulerStatus.scheduler.currentWeekDraw.status}</span>
                        </div>
                      )}
                      <Button onClick={() => loadSchedulerStatus(authHeader)} variant="outline" className="w-full" data-testid="button-refresh-scheduler">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Status
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Pool Analytics */}
                {poolAnalytics && (
                  <>
                    <div className="grid md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Prizes Paid</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{formatAmount(poolAnalytics.totalPrizesPaid)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Contributions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{formatAmount(poolAnalytics.totalContributions)}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Active Referrers</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{poolAnalytics.referralStats.activeReferrers}</div>
                          <p className="text-xs text-muted-foreground">{poolAnalytics.referralStats.total} total referrals</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Draw History */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Gift className="h-5 w-5" />
                          Draw History
                        </CardTitle>
                        <CardDescription>Past pool draws and winners</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {poolAnalytics.drawHistory.length > 0 ? (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {poolAnalytics.drawHistory.map((draw) => (
                              <div key={draw.id} className="text-xs p-2 bg-muted flex justify-between items-center">
                                <div>
                                  <span className="font-medium">W{draw.weekNumber}/{draw.year}</span>
                                  <span className="text-muted-foreground ml-2">{draw.participantCount} participants</span>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono">{formatAmount(draw.totalPool)}</div>
                                  {draw.winnerAddress && (
                                    <div className="text-muted-foreground">
                                      Winner: {draw.winnerAddress.slice(0, 6)}...{draw.winnerAddress.slice(-4)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No draws yet</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Participation Distribution */}
                    {poolAnalytics.participationByPercent.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Participation by Opt-in Percent
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-5 gap-2">
                            {poolAnalytics.participationByPercent.map((p) => (
                              <div key={p.percent} className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-bold">{p.count}</div>
                                <div className="text-xs text-muted-foreground">{p.percent}%</div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}

                {!poolAnalytics && !isLoadingPoolAnalytics && (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground mb-4">Pool analytics not loaded</p>
                      <Button onClick={() => { loadPoolAnalytics(authHeader); loadSchedulerStatus(authHeader); }} data-testid="button-load-pool-analytics">
                        Load Pool Analytics
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Aave Tab */}
          <TabsContent value="aave" className="space-y-6">
            {isLoadingAaveAnalytics ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : aaveAnalytics ? (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Deposits</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatAmount(aaveAnalytics.totalDeposits)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Withdrawals</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatAmount(aaveAnalytics.totalWithdrawals)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Active Operations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{aaveAnalytics.activeOperations}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Operations by Chain */}
                {aaveAnalytics.operationsByChain.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Operations by Chain
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {aaveAnalytics.operationsByChain.map((chain) => (
                          <div key={chain.chainId} className="flex justify-between items-center p-2 bg-muted rounded">
                            <span className="font-medium">
                              {chain.chainId === 8453 ? 'Base' : chain.chainId === 42220 ? 'Celo' : chain.chainId === 42161 ? 'Arbitrum' : 'Gnosis'}
                            </span>
                            <div className="flex gap-4 text-sm">
                              <span className="text-green-600">+{formatAmount(chain.deposits)}</span>
                              <span className="text-red-600">-{formatAmount(chain.withdrawals)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button onClick={() => loadAaveAnalytics(authHeader)} variant="outline" className="w-full" data-testid="button-refresh-aave">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Aave Analytics
                </Button>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground mb-4">Aave analytics not loaded</p>
                  <Button onClick={() => loadAaveAnalytics(authHeader)} data-testid="button-load-aave-analytics">
                    Load Aave Analytics
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Trust Tab */}
          <TabsContent value="trust" className="space-y-6">
            {isLoadingFacilitatorAnalytics || isLoadingMaxFlowAnalytics ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* MaxFlow Analytics */}
                {maxFlowAnalytics && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Network className="h-5 w-5" />
                        MaxFlow Score Distribution
                      </CardTitle>
                      <CardDescription>Network trust signal scoring</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground block">Total Scored</span>
                          <span className="text-2xl font-bold">{maxFlowAnalytics.totalScored}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Average Score</span>
                          <span className="text-2xl font-bold">{maxFlowAnalytics.averageScore.toFixed(2)}</span>
                        </div>
                      </div>
                      {maxFlowAnalytics.scoreDistribution.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm font-medium">Distribution</span>
                          <div className="grid grid-cols-4 gap-2">
                            {maxFlowAnalytics.scoreDistribution.map((d) => (
                              <div key={d.range} className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-bold">{d.count}</div>
                                <div className="text-xs text-muted-foreground">{d.range}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Facilitator Analytics */}
                {facilitatorAnalytics && (
                  <>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Transfers Processed</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{facilitatorAnalytics.totalTransfersProcessed}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Gas Drips</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{facilitatorAnalytics.totalGasDrips}</div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Gas Drips by Chain */}
                    {facilitatorAnalytics.gasDripsByChain.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Gas Drips by Chain
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {facilitatorAnalytics.gasDripsByChain.map((chain) => (
                              <div key={chain.chainId} className="flex justify-between items-center p-2 bg-muted rounded">
                                <span className="font-medium">
                                  {chain.chainId === 8453 ? 'Base' : chain.chainId === 42220 ? 'Celo' : chain.chainId === 42161 ? 'Arbitrum' : 'Gnosis'}
                                </span>
                                <div className="text-sm">
                                  <span>{chain.count} drips</span>
                                  <span className="ml-2 text-muted-foreground">({chain.totalAmount})</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Authorizations by Status */}
                    {facilitatorAnalytics.authorizationsByStatus.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <UserCheck className="h-5 w-5" />
                            Authorizations by Status
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-4 gap-2">
                            {facilitatorAnalytics.authorizationsByStatus.map((s) => (
                              <div key={s.status} className="text-center p-2 bg-muted rounded">
                                <div className="text-lg font-bold">{s.count}</div>
                                <div className="text-xs text-muted-foreground capitalize">{s.status}</div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}

                {/* Verified Unfunded Wallets */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      Verified Unfunded Wallets
                    </CardTitle>
                    <CardDescription>
                      Face verified wallets with MaxFlow score, XP claimed, but no USDC balance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {trustedUnfundedWallets.length > 0 ? (
                      <>
                        <div className="grid grid-cols-4 gap-2 px-2 py-1 border-b text-xs">
                          <div>Address</div>
                          <div>MaxFlow</div>
                          <div>XP</div>
                          <div>Last Seen</div>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {trustedUnfundedWallets.map((wallet) => (
                            <div key={wallet.address} className="grid grid-cols-4 gap-2 p-2 bg-muted text-xs">
                              <div className="font-mono truncate">
                                {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                              </div>
                              <div className="font-mono">
                                {wallet.maxFlowScore.toFixed(2)}
                              </div>
                              <div className="font-mono">
                                {(wallet.totalXp / 100).toFixed(2)}
                              </div>
                              <div className="text-muted-foreground">
                                {new Date(wallet.lastSeen).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {trustedUnfundedWallets.length} verified wallet{trustedUnfundedWallets.length !== 1 ? 's' : ''} without funds
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {isLoadingTrustedUnfunded ? 'Loading...' : 'No wallets match criteria (face verified + MaxFlow + XP + no balance)'}
                      </p>
                    )}
                    <Button 
                      onClick={() => loadTrustedUnfundedWallets(authHeader)} 
                      variant="outline" 
                      className="w-full" 
                      disabled={isLoadingTrustedUnfunded}
                      data-testid="button-load-trusted-unfunded"
                    >
                      {isLoadingTrustedUnfunded && <Loader2 className="h-4 w-4 animate-spin" />}
                      {trustedUnfundedWallets.length > 0 ? 'Refresh' : 'Load Verified Unfunded Wallets'}
                    </Button>
                  </CardContent>
                </Card>

                {!facilitatorAnalytics && !maxFlowAnalytics && !isLoadingFacilitatorAnalytics && (
                  <Button onClick={() => { loadFacilitatorAnalytics(authHeader); loadMaxFlowAnalytics(authHeader); }} data-testid="button-load-trust-analytics">
                    Load Trust Analytics
                  </Button>
                )}
              </>
            )}
          </TabsContent>

          {/* GoodDollar Tab */}
          <TabsContent value="gooddollar" className="space-y-6">
            {isLoadingGoodDollarAnalytics ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : goodDollarAnalytics ? (
              <>
                <div className="grid md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Verified Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-gd-verified-users">{goodDollarAnalytics.totalVerifiedUsers}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Claims</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-gd-total-claims">{goodDollarAnalytics.totalClaims}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total G$ Claimed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-gd-total-claimed">{goodDollarAnalytics.totalGdClaimedFormatted} G$</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Active Claimers (7d)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="text-gd-active-claimers">{goodDollarAnalytics.activeClaimers}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Claims */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HandHeart className="h-5 w-5" />
                      Recent Claims
                    </CardTitle>
                    <CardDescription>Last 10 GoodDollar UBI claims</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {goodDollarAnalytics.recentClaims.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {goodDollarAnalytics.recentClaims.map((claim, idx) => (
                          <div key={idx} className="text-xs p-2 bg-muted flex justify-between items-center" data-testid={`row-gd-claim-${idx}`}>
                            <div>
                              <span className="font-mono">{claim.walletAddress.slice(0, 8)}...{claim.walletAddress.slice(-6)}</span>
                              <span className="text-muted-foreground ml-2">Day {claim.claimedDay}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-mono">{claim.amountFormatted} G$</div>
                              <div className="text-muted-foreground">{new Date(claim.createdAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No claims recorded yet</p>
                    )}
                  </CardContent>
                </Card>

                {/* Sync Claims from Blockchain */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5" />
                      Sync Claims from Blockchain
                    </CardTitle>
                    <CardDescription>
                      Fetch GoodDollar claim history from CeloScan for a wallet address
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="0x... wallet address"
                        value={syncClaimsAddress}
                        onChange={(e) => setSyncClaimsAddress(e.target.value)}
                        className="font-mono text-sm"
                        data-testid="input-sync-claims-address"
                      />
                      <Button 
                        onClick={handleSyncGoodDollarClaims} 
                        disabled={isSyncingClaims || !syncClaimsAddress}
                        data-testid="button-sync-claims"
                      >
                        {isSyncingClaims && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Sync Claims
                      </Button>
                    </div>
                    
                    {syncClaimsResult && (
                      <div className="space-y-2">
                        <div className="flex gap-4 text-sm">
                          <span className="text-green-600">Inserted: {syncClaimsResult.inserted}</span>
                          <span className="text-muted-foreground">Skipped: {syncClaimsResult.skipped}</span>
                        </div>
                        {syncClaimsResult.claims.length > 0 && (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {syncClaimsResult.claims.map((claim, idx) => (
                              <div key={idx} className="text-xs p-2 bg-muted flex justify-between items-center" data-testid={`row-synced-claim-${idx}`}>
                                <span className="font-mono text-muted-foreground">{claim.txHash.slice(0, 12)}...</span>
                                <span>{claim.amountFormatted} G$ (Day {claim.claimedDay})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Button onClick={() => loadGoodDollarAnalytics(authHeader)} variant="outline" className="w-full" data-testid="button-refresh-gooddollar">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh GoodDollar Analytics
                </Button>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground mb-4">GoodDollar analytics not loaded</p>
                  <Button onClick={() => loadGoodDollarAnalytics(authHeader)} data-testid="button-load-gooddollar-analytics">
                    Load GoodDollar Analytics
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Sybil Detection Tab */}
          <TabsContent value="sybil" className="space-y-6">
            <SybilScoresDashboard authHeader={authHeader} />
            <SybilDetectionPanel authHeader={authHeader} />
          </TabsContent>

          {/* Face Check Tab */}
          <TabsContent value="facecheck" className="space-y-6">
            <FaceCheckDashboard authHeader={authHeader} />
          </TabsContent>

          {/* Wallets Tab */}
          <TabsContent value="wallets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Wallets
                </CardTitle>
                <CardDescription>
                  Complete list of registered wallets with balances, activity, and pool status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {walletList.length > 0 ? (
                  <>
                    <div className="grid grid-cols-8 gap-2 px-2 py-1 border-b text-xs">
                      <div className="col-span-2">Address</div>
                      <SortButton field="balance" label="USDC" />
                      <div className="text-xs font-medium text-muted-foreground">Earn</div>
                      <SortButton field="transfers" label="Txns" />
                      <SortButton field="maxflow" label="Score" />
                      <SortButton field="lastSeen" label="Last Seen" />
                      <SortButton field="pool" label="Pool %" />
                    </div>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {sortedWallets.map((wallet) => (
                        <div key={wallet.address} className="text-xs">
                          <div
                            className="grid grid-cols-8 gap-2 p-2 bg-muted cursor-pointer hover:bg-muted/80"
                            onClick={() => setExpandedWallet(expandedWallet === wallet.address ? null : wallet.address)}
                          >
                            <div className="col-span-2 font-mono truncate flex items-center gap-1">
                              {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                              {wallet.isGoodDollarVerified && (
                                <HandHeart className="h-3 w-3 text-cyan-500" />
                              )}
                            </div>
                            <div className="font-mono">{formatAmount(wallet.totalBalance || '0')}</div>
                            <div className="font-mono text-emerald-600">{formatAmount(wallet.aUsdcBalance || '0')}</div>
                            <div>{wallet.transferCount || 0}</div>
                            <div className="font-mono text-muted-foreground">
                              {wallet.maxFlowScore !== null ? wallet.maxFlowScore.toFixed(2) : '—'}
                            </div>
                            <div className="text-muted-foreground">
                              {new Date(wallet.lastSeen).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-1">
                              <span>{wallet.poolOptInPercent}%</span>
                              {wallet.poolApproved && (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              )}
                            </div>
                          </div>
                          {expandedWallet === wallet.address && (
                            <div className="p-2 bg-background border border-t-0 space-y-2">
                              <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                                <div>
                                  <span className="block text-[10px] uppercase">Base USDC</span>
                                  <span className="font-mono">{formatAmount(wallet.balanceByChain?.base || '0')}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase">Celo USDC</span>
                                  <span className="font-mono">{formatAmount(wallet.balanceByChain?.celo || '0')}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase">Gnosis USDC</span>
                                  <span className="font-mono">{formatAmount(wallet.balanceByChain?.gnosis || '0')}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                                <div>
                                  <span className="block text-[10px] uppercase text-emerald-600">Base Earn</span>
                                  <span className="font-mono text-emerald-600">{formatAmount(wallet.aUsdcByChain?.base || '0')}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase text-emerald-600">Celo Earn</span>
                                  <span className="font-mono text-emerald-600">{formatAmount(wallet.aUsdcByChain?.celo || '0')}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase text-emerald-600">Gnosis Earn</span>
                                  <span className="font-mono text-emerald-600">{formatAmount(wallet.aUsdcByChain?.gnosis || '0')}</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-muted-foreground">
                                <div>
                                  <span className="block text-[10px] uppercase">Created</span>
                                  <span>{new Date(wallet.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase">Volume</span>
                                  <span className="font-mono">{formatAmount(wallet.totalVolume || '0')}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase">MaxFlow Score</span>
                                  <span className="font-mono">{wallet.maxFlowScore !== null ? wallet.maxFlowScore.toFixed(4) : 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] uppercase">Pool Status</span>
                                  <span>{wallet.poolApproved ? 'Approved' : 'Not Approved'}</span>
                                </div>
                              </div>
                              <div className="pt-1">
                                <span className="text-[10px] uppercase text-muted-foreground">Full Address</span>
                                <div className="font-mono text-[11px] break-all">{wallet.address}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                <Button
                  onClick={() => loadWalletList(authHeader)}
                  disabled={isLoadingWallets}
                  variant="outline"
                  className="w-full"
                  data-testid="button-load-wallets"
                >
                  {isLoadingWallets ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : walletList.length > 0 ? (
                    'Refresh Wallet List'
                  ) : (
                    'Load Wallet List'
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tools Tab */}
          <TabsContent value="tools" className="space-y-6">
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
                    {isBackfillingBalances && <Loader2 className="h-4 w-4 animate-spin" />}
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
                    {isBackfillingRates && <Loader2 className="h-4 w-4 animate-spin" />}
                    Backfill Exchange Rates
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Backfill All Wallets
                  </CardTitle>
                  <CardDescription>
                    Reconstruct balance history for ALL wallets on both Base and Celo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleBackfillAllWallets}
                    disabled={isBackfillingAllWallets}
                    className="w-full"
                    data-testid="button-backfill-all-wallets"
                  >
                    {isBackfillingAllWallets && <Loader2 className="h-4 w-4 animate-spin" />}
                    Backfill All Wallets
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    Refetch MaxFlow Scores
                  </CardTitle>
                  <CardDescription>
                    Fetch fresh MaxFlow scores from the API for all wallets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleRefetchMaxFlowScores}
                    disabled={isRefetchingMaxFlow}
                    className="w-full"
                    data-testid="button-refetch-maxflow"
                  >
                    {isRefetchingMaxFlow && <Loader2 className="h-4 w-4 animate-spin" />}
                    Refetch MaxFlow Scores
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Airdrop Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Airdrop USDC to New Users
                </CardTitle>
                <CardDescription>
                  Send USDC to wallets with 0 balance that were active in the last 7 days
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label htmlFor="airdrop-amount">Amount per wallet (USDC)</Label>
                    <Input
                      id="airdrop-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={airdropAmount}
                      onChange={(e) => setAirdropAmount(e.target.value)}
                      placeholder="0.05"
                      data-testid="input-airdrop-amount"
                    />
                  </div>
                  <Button
                    onClick={handleAirdropPreview}
                    disabled={isLoadingAirdropPreview}
                    variant="outline"
                    data-testid="button-airdrop-preview"
                  >
                    {isLoadingAirdropPreview && <Loader2 className="h-4 w-4 animate-spin" />}
                    Preview
                  </Button>
                </div>

                {airdropPreview && (
                  <div className="border p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Eligible wallets:</span>
                      <span className="font-bold">{airdropPreview.count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount per wallet:</span>
                      <span className="font-bold">{airdropAmount} USDC</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total cost:</span>
                      <span className="font-bold">{(parseFloat(airdropAmount) * airdropPreview.count).toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Network:</span>
                      <span className="font-bold">Base</span>
                    </div>
                    
                    {airdropPreview.count > 0 && (
                      <>
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          First {Math.min(5, airdropPreview.wallets.length)} wallets:
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {airdropPreview.wallets.slice(0, 5).map((w) => (
                            <div key={w.address} className="text-xs font-mono bg-muted p-1">
                              {w.address.slice(0, 10)}...{w.address.slice(-8)}
                            </div>
                          ))}
                          {airdropPreview.wallets.length > 5 && (
                            <div className="text-xs text-muted-foreground">
                              ...and {airdropPreview.wallets.length - 5} more
                            </div>
                          )}
                        </div>

                        <Button
                          onClick={handleAirdropExecute}
                          disabled={isExecutingAirdrop}
                          className="w-full"
                          data-testid="button-airdrop-execute"
                        >
                          {isExecutingAirdrop && <Loader2 className="h-4 w-4 animate-spin" />}
                          Confirm Airdrop
                        </Button>
                      </>
                    )}
                    
                    {airdropPreview.count === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-2">
                        No eligible wallets found
                      </div>
                    )}
                  </div>
                )}

                {airdropResult && (
                  <div className="border border-green-500/30 bg-green-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-green-600 font-medium">
                      <Check className="h-4 w-4" />
                      Airdrop Complete
                    </div>
                    <div className="text-sm space-y-1">
                      <div>Sent: {airdropResult.sent} wallets</div>
                      {airdropResult.failed > 0 && (
                        <div className="text-destructive">Failed: {airdropResult.failed} wallets</div>
                      )}
                      <div>Total sent: {airdropResult.totalSent.toFixed(2)} USDC</div>
                    </div>
                  </div>
                )}
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
                    {isClearingCaches && <Loader2 className="h-4 w-4 animate-spin" />}
                    Clear All Caches
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trash2 className="h-5 w-5" />
                    Clear Transactions & Balances
                  </CardTitle>
                  <CardDescription>
                    Clear cached transactions and balances (preserves MaxFlow scores)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleClearTransactionsAndBalances}
                    disabled={isClearingTransactionsAndBalances}
                    variant="outline"
                    className="w-full"
                    data-testid="button-clear-transactions-balances"
                  >
                    {isClearingTransactionsAndBalances && <Loader2 className="h-4 w-4 animate-spin" />}
                    Clear Transactions & Balances
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
                    {isPruning && <Loader2 className="h-4 w-4 animate-spin" />}
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
                    {isClearingBalances && <Loader2 className="h-4 w-4 animate-spin" />}
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
                    {isClearingHistory && <Loader2 className="h-4 w-4 animate-spin" />}
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
                    {isMigrating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Migrate to Micro-USDC
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Sybil Confidence Scores Dashboard
interface SybilScoreData {
  id: string;
  walletAddress: string;
  score: number;
  tier: string;
  signalBreakdown: string;
  reasonCodes: string;
  trustOffsets: string;
  xpMultiplier: string;
  manualOverride: boolean;
  manualTier: string | null;
  manualReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function SybilScoresDashboard({ authHeader }: { authHeader: string | null }) {
  const [scores, setScores] = useState<SybilScoreData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set());
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [showBatchOverride, setShowBatchOverride] = useState(false);
  const [batchTier, setBatchTier] = useState<string>('clear');
  const [batchReason, setBatchReason] = useState('');
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const { toast } = useToast();

  const loadScores = async () => {
    if (!authHeader) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/sybil-scores?limit=${limit}`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        const data = await res.json();
        setScores(data);
        setSelectedWallets(new Set());
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load sybil scores', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authHeader) {
      loadScores();
    }
  }, [authHeader, limit]);

  const filteredScores = tierFilter === 'all' 
    ? scores 
    : scores.filter(s => {
        const tier = s.manualOverride ? s.manualTier || s.tier : s.tier;
        return tier === tierFilter;
      });

  const toggleWallet = (address: string) => {
    const newSet = new Set(selectedWallets);
    if (newSet.has(address)) {
      newSet.delete(address);
    } else {
      newSet.add(address);
    }
    setSelectedWallets(newSet);
  };

  const selectAll = () => {
    if (selectedWallets.size === filteredScores.length) {
      setSelectedWallets(new Set());
    } else {
      setSelectedWallets(new Set(filteredScores.map(s => s.walletAddress)));
    }
  };

  const executeBatchOverride = async () => {
    if (!authHeader || selectedWallets.size === 0) return;
    if (!batchReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for the override', variant: 'destructive' });
      return;
    }
    
    setIsBatchProcessing(true);
    try {
      const res = await fetch('/api/admin/sybil-scores/batch/override', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: authHeader 
        },
        body: JSON.stringify({
          addresses: Array.from(selectedWallets),
          tier: batchTier,
          reason: batchReason.trim(),
        }),
      });
      
      if (res.ok) {
        const result = await res.json();
        toast({ 
          title: 'Batch Override Complete', 
          description: `${result.successful}/${result.processed} wallets updated to ${batchTier.toUpperCase()}` 
        });
        setShowBatchOverride(false);
        setBatchReason('');
        loadScores();
      } else {
        const error = await res.json();
        toast({ title: 'Error', description: error.error || 'Batch override failed', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to process batch override', variant: 'destructive' });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const executeBatchRecalculate = async () => {
    if (!authHeader || selectedWallets.size === 0) return;
    
    setIsBatchProcessing(true);
    try {
      const res = await fetch('/api/admin/sybil-scores/batch/recalculate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: authHeader 
        },
        body: JSON.stringify({
          addresses: Array.from(selectedWallets),
        }),
      });
      
      if (res.ok) {
        const result = await res.json();
        toast({ 
          title: 'Batch Recalculate Complete', 
          description: `${result.successful}/${result.processed} scores recalculated` 
        });
        loadScores();
      } else {
        const error = await res.json();
        toast({ title: 'Error', description: error.error || 'Batch recalculate failed', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to process batch recalculate', variant: 'destructive' });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const executeBatchClearOverride = async () => {
    if (!authHeader || selectedWallets.size === 0) return;
    
    setIsBatchProcessing(true);
    try {
      const res = await fetch('/api/admin/sybil-scores/batch/clear-override', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: authHeader 
        },
        body: JSON.stringify({
          addresses: Array.from(selectedWallets),
        }),
      });
      
      if (res.ok) {
        const result = await res.json();
        toast({ 
          title: 'Overrides Cleared', 
          description: `${result.successful}/${result.processed} overrides removed` 
        });
        loadScores();
      } else {
        const error = await res.json();
        toast({ title: 'Error', description: error.error || 'Batch clear failed', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to clear overrides', variant: 'destructive' });
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const getTierBadge = (tier: string, isOverride: boolean) => {
    const colors: Record<string, string> = {
      clear: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      limit: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      block: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return (
      <Badge className={`${colors[tier] || 'bg-muted'} ${isOverride ? 'ring-2 ring-purple-500' : ''}`}>
        {tier.toUpperCase()}
        {isOverride && ' (Manual)'}
      </Badge>
    );
  };

  const getXpDisplay = (multiplier: string) => {
    const m = parseFloat(multiplier) || 1.0;
    const xp = Math.round(120 * m);
    return `${xp} XP`;
  };

  // Calculate tier distribution
  const tierCounts = scores.reduce((acc, s) => {
    const tier = s.manualOverride ? s.manualTier || s.tier : s.tier;
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Unified Sybil Confidence Scores
          </CardTitle>
          <CardDescription>
            Combines device fingerprint, face verification, and trust signals into a single 0-100 score.
            Higher score = higher sybil risk. XP is adjusted based on tier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 border-2 border-foreground">
              <div className="text-2xl font-bold text-green-600">{tierCounts['clear'] || 0}</div>
              <div className="text-xs text-muted-foreground">Clear (0-29)</div>
              <div className="text-xs">120 XP</div>
            </div>
            <div className="p-3 border-2 border-foreground">
              <div className="text-2xl font-bold text-amber-600">{tierCounts['warn'] || 0}</div>
              <div className="text-xs text-muted-foreground">Warn (30-59)</div>
              <div className="text-xs">60 XP</div>
            </div>
            <div className="p-3 border-2 border-foreground">
              <div className="text-2xl font-bold text-orange-600">{tierCounts['limit'] || 0}</div>
              <div className="text-xs text-muted-foreground">Limit (60-79)</div>
              <div className="text-xs">20 XP</div>
            </div>
            <div className="p-3 border-2 border-foreground">
              <div className="text-2xl font-bold text-red-600">{tierCounts['block'] || 0}</div>
              <div className="text-xs text-muted-foreground">Block (80-100)</div>
              <div className="text-xs">0 XP</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={loadScores} disabled={isLoading} size="sm" data-testid="button-refresh-scores">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
                <SelectItem value="100">100 rows</SelectItem>
                <SelectItem value="200">200 rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signal Weights</CardTitle>
          <CardDescription>How each signal contributes to the risk score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-bold mb-2 text-destructive">Risk Signals (increase score)</div>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>+35:</strong> Same face on different device</li>
                <li><strong>+30:</strong> Photo/screen spoof detected</li>
                <li><strong>+25:</strong> Same device token</li>
                <li><strong>+10:</strong> Same IP address (per wallet)</li>
                <li><strong>+5:</strong> Same browser user agent</li>
              </ul>
            </div>
            <div>
              <div className="font-bold mb-2 text-green-600">Trust Signals (reduce score)</div>
              <ul className="space-y-1 text-muted-foreground">
                <li><strong>-30:</strong> GoodDollar verified identity</li>
                <li><strong>-10:</strong> Passed liveness challenges</li>
                <li><strong>-0.2/day:</strong> Account age (max -20)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {showBatchOverride && (
        <Card className="border-2 border-purple-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Batch Override: {selectedWallets.size} Wallets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Set Tier</label>
                <Select value={batchTier} onValueChange={setBatchTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clear">Clear (120 XP)</SelectItem>
                    <SelectItem value="warn">Warn (60 XP)</SelectItem>
                    <SelectItem value="limit">Limit (20 XP)</SelectItem>
                    <SelectItem value="block">Block (0 XP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Reason (required)</label>
                <Input 
                  value={batchReason}
                  onChange={(e) => setBatchReason(e.target.value)}
                  placeholder="Admin override reason..."
                  data-testid="input-batch-reason"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={executeBatchOverride}
                disabled={isBatchProcessing || !batchReason.trim()}
                data-testid="button-execute-batch-override"
              >
                {isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Apply Override to {selectedWallets.size} Wallets
              </Button>
              <Button 
                variant="outline"
                onClick={() => setShowBatchOverride(false)}
                data-testid="button-cancel-batch-override"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4 flex-wrap">
            <span>Wallet Scores ({filteredScores.length})</span>
            <div className="flex items-center gap-2">
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Filter tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  <SelectItem value="clear">Clear</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
          {selectedWallets.size > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary">{selectedWallets.size} selected</Badge>
              <Button 
                size="sm" 
                onClick={() => setShowBatchOverride(true)}
                data-testid="button-batch-override"
              >
                Set Tier
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={executeBatchRecalculate}
                disabled={isBatchProcessing}
                data-testid="button-batch-recalculate"
              >
                {isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Recalculate
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={executeBatchClearOverride}
                disabled={isBatchProcessing}
                data-testid="button-batch-clear-override"
              >
                Clear Overrides
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setSelectedWallets(new Set())}
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredScores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {scores.length === 0 
                ? 'No sybil scores recorded yet. Scores are calculated during Face Check verification.'
                : `No wallets in ${tierFilter} tier.`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-foreground">
                    <th className="p-2 w-8">
                      <input 
                        type="checkbox"
                        checked={selectedWallets.size === filteredScores.length && filteredScores.length > 0}
                        onChange={selectAll}
                        className="h-4 w-4"
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="text-left p-2">Wallet</th>
                    <th className="text-left p-2">Score</th>
                    <th className="text-left p-2">Tier</th>
                    <th className="text-left p-2">XP Award</th>
                    <th className="text-left p-2">Signals</th>
                    <th className="text-left p-2">Trust Offsets</th>
                    <th className="text-left p-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScores.map((s) => {
                    let signals: Record<string, number> = {};
                    let trusts: Record<string, number> = {};
                    let reasons: string[] = [];
                    try { 
                      if (s.signalBreakdown) signals = JSON.parse(s.signalBreakdown) || {}; 
                    } catch {}
                    try { 
                      if (s.trustOffsets) trusts = JSON.parse(s.trustOffsets) || {}; 
                    } catch {}
                    try { 
                      if (s.reasonCodes) reasons = JSON.parse(s.reasonCodes) || []; 
                    } catch {}
                    const tier = s.manualOverride ? s.manualTier || s.tier : s.tier;
                    const isSelected = selectedWallets.has(s.walletAddress);
                    
                    return (
                      <tr 
                        key={s.id} 
                        className={`border-b border-muted hover-elevate ${isSelected ? 'bg-muted/50' : ''}`}
                        onClick={() => toggleWallet(s.walletAddress)}
                      >
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleWallet(s.walletAddress)}
                            className="h-4 w-4"
                            data-testid={`checkbox-wallet-${s.walletAddress.slice(0, 8)}`}
                          />
                        </td>
                        <td className="p-2 font-mono text-xs">
                          {s.walletAddress.slice(0, 8)}...{s.walletAddress.slice(-6)}
                        </td>
                        <td className="p-2">
                          <span className={`font-bold ${s.score >= 60 ? 'text-red-600' : s.score >= 30 ? 'text-amber-600' : 'text-green-600'}`}>
                            {s.score}
                          </span>
                        </td>
                        <td className="p-2">{getTierBadge(tier, s.manualOverride)}</td>
                        <td className="p-2">{getXpDisplay(s.xpMultiplier)}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(signals).map(([key, val]) => (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key}: +{val}
                              </Badge>
                            ))}
                            {Object.keys(signals).length === 0 && (
                              <span className="text-muted-foreground text-xs">None</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(trusts).map(([key, val]) => (
                              <Badge key={key} variant="outline" className="text-xs bg-green-50 dark:bg-green-950">
                                {key}: -{val}
                              </Badge>
                            ))}
                            {Object.keys(trusts).length === 0 && (
                              <span className="text-muted-foreground text-xs">None</span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {new Date(s.updatedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Sybil Detection Panel Component
function SybilDetectionPanel({ authHeader }: { authHeader: string | null }) {
  const [analytics, setAnalytics] = useState<SybilAnalytics | null>(null);
  const [suspiciousPatterns, setSuspiciousPatterns] = useState<SuspiciousIpPattern[]>([]);
  const [flaggedWallets, setFlaggedWallets] = useState<FlaggedWallet[]>([]);
  const [tokenPatterns, setTokenPatterns] = useState<StorageTokenPattern[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [walletFingerprint, setWalletFingerprint] = useState<WalletFingerprint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedIp, setExpandedIp] = useState<string | null>(null);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'scored' | 'ip' | 'token'>('scored');
  const { toast } = useToast();

  const loadSybilData = async () => {
    if (!authHeader) return;
    setIsLoading(true);
    try {
      const [analyticsRes, patternsRes, flaggedRes, tokensRes] = await Promise.all([
        fetch('/api/admin/analytics/sybil', { headers: { Authorization: authHeader } }),
        fetch('/api/admin/analytics/sybil/suspicious?minWallets=2', { headers: { Authorization: authHeader } }),
        fetch('/api/admin/analytics/sybil/flagged', { headers: { Authorization: authHeader } }),
        fetch('/api/admin/analytics/sybil/tokens?minWallets=2', { headers: { Authorization: authHeader } }),
      ]);
      
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (patternsRes.ok) setSuspiciousPatterns(await patternsRes.json());
      if (flaggedRes.ok) setFlaggedWallets(await flaggedRes.json());
      if (tokensRes.ok) setTokenPatterns(await tokensRes.json());
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load sybil analytics', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadWalletFingerprint = async (wallet: string) => {
    if (!authHeader) return;
    setSelectedWallet(wallet);
    try {
      const res = await fetch(`/api/admin/analytics/sybil/fingerprint/${wallet}`, {
        headers: { Authorization: authHeader },
      });
      if (res.ok) {
        setWalletFingerprint(await res.json());
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load wallet fingerprint', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (authHeader) {
      loadSybilData();
    }
  }, [authHeader]);

  const signalLabels: Record<string, string> = {
    'IP': 'Same IP (2pts)',
    'Token': 'Same Device Token (2pts)',
    'UA': 'Same Browser (2pts)',
    'Screen': 'Same Screen (1pt)',
    'HW': 'Same Hardware (1pt)',
    'TZ': 'Same Timezone (0.5pt)',
    'Lang': 'Same Language (0.5pt)',
    'Plat': 'Same Platform (0.5pt)',
  };

  const [showScoringGuide, setShowScoringGuide] = useState(false);

  return (
    <div className="space-y-6">
      {/* Introduction Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            What is Sybil Detection?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Sybil attacks</strong> occur when one person creates multiple fake identities to abuse trust systems, 
            claim rewards multiple times, or manipulate voting/reputation. In nanoPay, this undermines the integrity of 
            MaxFlow vouching, GoodDollar claims, and pool participation.
          </p>
          <p>
            This system uses <strong>browser fingerprinting</strong> to detect when multiple wallets are operated from 
            the same device or network. Each wallet session collects signals like IP address, screen resolution, 
            browser type, and a persistent device token stored in IndexedDB.
          </p>
          <p>
            <strong>Social pressure mechanism:</strong> Flagged wallets are warned that suspicious activity affects not 
            just them, but everyone who vouched for them. This creates accountability through the vouch network.
          </p>
        </CardContent>
      </Card>

      {/* Scoring Guide */}
      <div className="border-2 border-foreground bg-background">
        <div 
          className="p-4 cursor-pointer hover-elevate flex items-center justify-between" 
          onClick={() => setShowScoringGuide(!showScoringGuide)}
        >
          <div>
            <div className="font-bold flex items-center gap-2">
              <Info className="h-5 w-5" />
              How Scoring Works
            </div>
            <div className="text-sm text-muted-foreground">
              Weighted scoring combines multiple signals to reduce false positives
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${showScoringGuide ? 'rotate-180' : ''}`} />
        </div>
        {showScoringGuide && (
          <div className="p-4 pt-0 space-y-4">
            <div className="p-3 bg-foreground text-background text-sm font-bold">
              THRESHOLD: Wallets scoring ≥4 points are flagged as suspicious
            </div>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="bg-foreground text-background p-3">
                <div className="font-bold mb-2 uppercase text-xs tracking-wide">Strong (2 pts)</div>
                <ul className="space-y-1 text-background/80 text-xs">
                  <li><strong>IP:</strong> Same network</li>
                  <li><strong>Token:</strong> Browser storage ID</li>
                  <li><strong>UA:</strong> Browser fingerprint</li>
                </ul>
              </div>
              <div className="border-2 border-foreground p-3">
                <div className="font-bold mb-2 uppercase text-xs tracking-wide">Medium (1 pt)</div>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li><strong>Screen:</strong> Resolution + ratio</li>
                  <li><strong>Hardware:</strong> CPU + RAM</li>
                </ul>
              </div>
              <div className="border border-foreground/50 p-3">
                <div className="font-bold mb-2 uppercase text-xs tracking-wide">Weak (0.5 pts)</div>
                <ul className="space-y-1 text-muted-foreground text-xs">
                  <li><strong>Timezone</strong></li>
                  <li><strong>Language</strong></li>
                  <li><strong>Platform</strong></li>
                </ul>
              </div>
            </div>
            <div className="p-3 bg-muted text-xs">
              <strong>Why ≥4?</strong> Requires 2 strong signals, or 1 strong + 2 medium signals. 
              Reduces false positives from users on shared networks with common devices.
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fingerprint Events</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-sybil-total-events">
              {analytics?.totalEvents ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique IPs</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-sybil-unique-ips">
              {analytics?.uniqueIps ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tracked Wallets</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-sybil-unique-wallets">
              {analytics?.uniqueWallets ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Flagged / Exempt</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-sybil-suspicious">
              <span className="text-amber-600">{flaggedWallets.filter(w => !w.isExempt).length}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-green-600">{flaggedWallets.filter(w => w.isExempt).length}</span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Face Verification Management */}
      <FaceVerificationManagement authHeader={authHeader} />

      {/* View Toggle with Descriptions */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeView === 'scored' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('scored')}
            data-testid="button-view-scored"
          >
            Weighted Scores
          </Button>
          <Button
            variant={activeView === 'ip' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('ip')}
            data-testid="button-view-ip"
          >
            By IP
          </Button>
          <Button
            variant={activeView === 'token' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveView('token')}
            data-testid="button-view-token"
          >
            By Device Token
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {activeView === 'scored' && 'Shows wallets ranked by total fingerprint similarity score. Higher scores indicate stronger evidence of sybil behavior.'}
          {activeView === 'ip' && 'Groups wallets by shared IP address. Useful for finding clusters from the same network (could be VPN, office, or home).'}
          {activeView === 'token' && 'Groups wallets by device token (persistent browser ID). This is the strongest signal - same token means same browser instance.'}
        </p>
      </div>

      {/* Weighted Scores View */}
      {activeView === 'scored' && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Flagged Wallets by Score
            </CardTitle>
            <CardDescription>
              Wallets with weighted fingerprint score ≥4. Exempt wallets shown separately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {flaggedWallets.length > 0 ? (
              <div className="space-y-4">
                {/* Exemption Legend */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-amber-500"></span>
                    <span>Flagged</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-500"></span>
                    <span>GoodDollar Verified</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-500"></span>
                    <span>Small Cluster (≤3)</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 gap-2 px-2 py-1 border-b text-xs font-medium text-muted-foreground">
                  <div>Wallet</div>
                  <div>Score</div>
                  <div>Cluster</div>
                  <div>Status</div>
                  <div>Face Check</div>
                  <div>Signals</div>
                </div>
                {flaggedWallets.map((item) => (
                  <div
                    key={item.wallet}
                    className={`grid grid-cols-6 gap-2 p-2 cursor-pointer hover-elevate ${
                      item.isExempt 
                        ? item.exemptReason === 'gooddollar_verified' 
                          ? 'bg-green-500/10 border-l-2 border-green-500' 
                          : 'bg-blue-500/10 border-l-2 border-blue-500'
                        : 'bg-amber-500/10 border-l-2 border-amber-500'
                    }`}
                    onClick={() => loadWalletFingerprint(item.wallet)}
                    data-testid={`row-flagged-wallet-${item.wallet.slice(0, 8)}`}
                  >
                    <div className="font-mono text-xs truncate">{item.wallet}</div>
                    <div className={`font-semibold ${item.isExempt ? 'text-muted-foreground' : 'text-amber-600'}`}>
                      {item.score.toFixed(1)}
                    </div>
                    <div className="text-xs">{item.clusterSize} wallet{item.clusterSize !== 1 ? 's' : ''}</div>
                    <div className="text-xs">
                      {item.isExempt ? (
                        <span className={item.exemptReason === 'gooddollar_verified' ? 'text-green-600' : 'text-blue-600'}>
                          {item.exemptReason === 'gooddollar_verified' ? 'Verified' : 'Small cluster'}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-semibold">FLAGGED</span>
                      )}
                    </div>
                    <div className="text-xs">
                      {item.isFaceChecked ? (
                        <span className="text-violet-600">✓ {item.faceCheckedAt ? new Date(item.faceCheckedAt).toLocaleDateString() : ''}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {item.signals.map((sig) => (
                        <span key={sig} className="px-1 py-0.5 bg-background text-xs">
                          {sig}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : (
                  'No flagged wallets detected'
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* IP Patterns View */}
      {activeView === 'ip' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Suspicious IP Patterns
            </CardTitle>
            <CardDescription>
              IP addresses with multiple wallets
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suspiciousPatterns.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-2 px-2 py-1 border-b text-xs font-medium text-muted-foreground">
                  <div>IP Hash</div>
                  <div>Wallets</div>
                  <div>Events</div>
                  <div>First Seen</div>
                  <div>Last Seen</div>
                </div>
                {suspiciousPatterns.map((pattern) => (
                  <div key={pattern.ipHash} data-testid={`row-suspicious-ip-${pattern.ipHash.slice(0, 8)}`}>
                    <div 
                      className="grid grid-cols-5 gap-2 p-2 bg-muted cursor-pointer hover-elevate"
                      onClick={() => setExpandedIp(expandedIp === pattern.ipHash ? null : pattern.ipHash)}
                    >
                      <div className="font-mono text-xs">{pattern.ipHash.slice(0, 12)}...</div>
                      <div className="font-semibold text-amber-600">{pattern.walletCount}</div>
                      <div>{pattern.eventCount}</div>
                      <div className="text-xs text-muted-foreground">
                        {pattern.firstSeen ? new Date(pattern.firstSeen).toLocaleDateString() : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pattern.lastSeen ? new Date(pattern.lastSeen).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    {expandedIp === pattern.ipHash && (
                      <div className="p-3 bg-muted/50 border-l-2 border-amber-500 ml-2 space-y-1">
                        <div className="text-xs text-muted-foreground mb-2">Associated Wallets:</div>
                        {pattern.wallets.map((wallet, idx) => (
                          <div key={idx} className="font-mono text-xs p-1 bg-background cursor-pointer hover-elevate" onClick={() => loadWalletFingerprint(wallet)}>
                            {wallet}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {isLoading ? 'Loading...' : 'No suspicious IP patterns detected'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Token Patterns View */}
      {activeView === 'token' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Suspicious Device Token Patterns
            </CardTitle>
            <CardDescription>
              Storage tokens (persistent device IDs) with multiple wallets
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tokenPatterns.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-5 gap-2 px-2 py-1 border-b text-xs font-medium text-muted-foreground">
                  <div>Token</div>
                  <div>Wallets</div>
                  <div>Events</div>
                  <div>First Seen</div>
                  <div>Last Seen</div>
                </div>
                {tokenPatterns.map((pattern) => (
                  <div key={pattern.storageToken} data-testid={`row-suspicious-token-${pattern.storageToken.slice(0, 8)}`}>
                    <div 
                      className="grid grid-cols-5 gap-2 p-2 bg-muted cursor-pointer hover-elevate"
                      onClick={() => setExpandedToken(expandedToken === pattern.storageToken ? null : pattern.storageToken)}
                    >
                      <div className="font-mono text-xs">{pattern.storageToken.slice(0, 12)}...</div>
                      <div className="font-semibold text-amber-600">{pattern.walletCount}</div>
                      <div>{pattern.eventCount}</div>
                      <div className="text-xs text-muted-foreground">
                        {pattern.firstSeen ? new Date(pattern.firstSeen).toLocaleDateString() : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pattern.lastSeen ? new Date(pattern.lastSeen).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    {expandedToken === pattern.storageToken && (
                      <div className="p-3 bg-muted/50 border-l-2 border-amber-500 ml-2 space-y-1">
                        <div className="text-xs text-muted-foreground mb-2">Associated Wallets:</div>
                        {pattern.wallets.map((wallet, idx) => (
                          <div key={idx} className="font-mono text-xs p-1 bg-background cursor-pointer hover-elevate" onClick={() => loadWalletFingerprint(wallet)}>
                            {wallet}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                {isLoading ? 'Loading...' : 'No suspicious device token patterns detected'}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wallet Fingerprint Details Modal */}
      {selectedWallet && walletFingerprint && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Fingerprint Details
              </span>
              <Button size="sm" variant="ghost" onClick={() => setSelectedWallet(null)}>
                Close
              </Button>
            </CardTitle>
            <CardDescription className="font-mono text-xs break-all">
              {selectedWallet}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {walletFingerprint.fingerprint ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-muted">
                    <div className="text-muted-foreground">IP Hash</div>
                    <div className="font-mono truncate">{walletFingerprint.fingerprint.ipHash.slice(0, 16)}...</div>
                  </div>
                  <div className="p-2 bg-muted">
                    <div className="text-muted-foreground">Device Token</div>
                    <div className="font-mono truncate">{walletFingerprint.fingerprint.storageToken?.slice(0, 16) || 'N/A'}...</div>
                  </div>
                  <div className="p-2 bg-muted">
                    <div className="text-muted-foreground">Screen</div>
                    <div className="font-mono">{walletFingerprint.fingerprint.screenResolution || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-muted">
                    <div className="text-muted-foreground">Hardware</div>
                    <div className="font-mono">{walletFingerprint.fingerprint.hardwareConcurrency || '?'} cores, {walletFingerprint.fingerprint.deviceMemory || '?'}GB</div>
                  </div>
                  <div className="p-2 bg-muted">
                    <div className="text-muted-foreground">Timezone</div>
                    <div className="font-mono">{walletFingerprint.fingerprint.timezone || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-muted">
                    <div className="text-muted-foreground">Language</div>
                    <div className="font-mono">{walletFingerprint.fingerprint.language || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-muted col-span-2">
                    <div className="text-muted-foreground">User-Agent</div>
                    <div className="font-mono text-xs truncate">{walletFingerprint.fingerprint.userAgent || 'N/A'}</div>
                  </div>
                </div>

                {walletFingerprint.totalScore >= 4 && (
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-500">
                    <div className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
                      Suspicious Score: {walletFingerprint.totalScore.toFixed(1)} (threshold: 4)
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      Matching {walletFingerprint.matchingWallets.length} other wallet(s):
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {walletFingerprint.matchingWallets.map((w) => (
                        <div key={w} className="font-mono text-xs p-1 bg-background cursor-pointer hover-elevate" onClick={() => loadWalletFingerprint(w)}>
                          {w}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {walletFingerprint.scoreBreakdown.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Signal Breakdown:</div>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set(walletFingerprint.scoreBreakdown.map(s => s.signal))).map((sig) => (
                        <span key={sig} className="px-2 py-1 bg-muted text-xs">
                          {signalLabels[sig] || sig}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No fingerprint data collected for this wallet
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Event Breakdown */}
      {analytics?.eventsByType && Object.keys(analytics.eventsByType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Events by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(analytics.eventsByType).map(([type, count]) => (
                <div key={type} className="p-3 bg-muted" data-testid={`stat-event-type-${type}`}>
                  <div className="text-xs text-muted-foreground capitalize">{type.replace('_', ' ')}</div>
                  <div className="text-lg font-semibold">{count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actionable Guidance */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5" />
            What To Do With Flagged Wallets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {/* Exemption Rules */}
          <div className="p-3 bg-green-500/10 border border-green-500/30 space-y-2">
            <div className="font-semibold text-green-700 dark:text-green-400">Automatic Exemptions (not flagged to MaxFlow):</div>
            <ul className="space-y-1 text-xs">
              <li><strong className="text-green-600">GoodDollar Verified:</strong> Wallets with face verification are trusted humans</li>
              <li><strong className="text-blue-600">Small Cluster (≤3 wallets):</strong> Users often lose wallets or try multiple addresses</li>
            </ul>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="font-semibold text-foreground">Investigation Steps:</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Check their <strong>MaxFlow vouch network</strong> - who vouched for them?</li>
                <li>Review <strong>GoodDollar claim history</strong> - multiple claims from same device?</li>
                <li>Look at <strong>Pool participation</strong> - are they gaming referral bonuses?</li>
                <li>Compare <strong>transaction patterns</strong> - do flagged wallets send to each other?</li>
              </ol>
            </div>
            <div className="space-y-2">
              <div className="font-semibold text-foreground">Possible Actions:</div>
              <ul className="space-y-1">
                <li><strong>Score 4-5:</strong> Monitor but likely legitimate</li>
                <li><strong>Score 5-6:</strong> Contact vouchers to investigate</li>
                <li><strong>Score 7+:</strong> Consider excluding from pools/airdrops</li>
                <li><strong>Confirmed sybil:</strong> Revoke claims, notify vouch network</li>
              </ul>
            </div>
          </div>
          <div className="p-2 bg-background text-xs">
            <strong>Note:</strong> Exempt wallets still appear in the list for visibility but are NOT sent to the public MaxFlow API. 
            Always investigate before taking action. The weighted scoring system is designed to minimize these cases.
          </div>
        </CardContent>
      </Card>

      <Button onClick={loadSybilData} variant="outline" className="w-full" disabled={isLoading} data-testid="button-refresh-sybil">
        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
        Refresh Sybil Analytics
      </Button>
    </div>
  );
}

function FaceVerificationManagement({ authHeader }: { authHeader: string | null }) {
  const { toast } = useToast();
  const [isDeletingLegacy, setIsDeletingLegacy] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const deleteLegacyRecords = async () => {
    if (!authHeader) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in as admin first',
        variant: 'destructive',
      });
      return;
    }
    setIsDeletingLegacy(true);
    try {
      const response = await fetch('/api/admin/face-verifications/without-embeddings', {
        method: 'DELETE',
        headers: { 'Authorization': authHeader },
      });
      const data = await response.json();
      if (response.ok) {
        toast({
          title: 'Legacy Records Deleted',
          description: `Removed ${data.deleted} face verification records without embeddings`,
        });
      } else if (response.status === 401) {
        toast({
          title: 'Session Expired',
          description: 'Please log in again',
          variant: 'destructive',
        });
      } else {
        throw new Error(data.error || 'Failed to delete');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete legacy records',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingLegacy(false);
    }
  };

  const deleteAllRecords = async () => {
    if (!authHeader) {
      toast({
        title: 'Not Authenticated',
        description: 'Please log in as admin first',
        variant: 'destructive',
      });
      return;
    }
    if (!window.confirm('Are you sure you want to delete ALL face verification records? This cannot be undone.')) {
      return;
    }
    setIsDeletingAll(true);
    try {
      const response = await fetch('/api/admin/face-verifications/all', {
        method: 'DELETE',
        headers: { 'Authorization': authHeader },
      });
      const data = await response.json();
      if (response.ok) {
        toast({
          title: 'All Records Deleted',
          description: `Removed all ${data.deleted} face verification records`,
        });
      } else if (response.status === 401) {
        toast({
          title: 'Session Expired',
          description: 'Please log in again',
          variant: 'destructive',
        });
      } else {
        throw new Error(data.error || 'Failed to delete');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete all records',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanFace className="h-5 w-5" />
          Face Verification Management
        </CardTitle>
        <CardDescription>
          Clean up legacy face verification records that don't have embeddings for proper matching
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={deleteLegacyRecords}
            disabled={isDeletingLegacy || !authHeader}
            data-testid="button-delete-legacy-face"
          >
            {isDeletingLegacy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete Records Without Embeddings
          </Button>
          <Button
            variant="destructive"
            onClick={deleteAllRecords}
            disabled={isDeletingAll || !authHeader}
            data-testid="button-delete-all-face"
          >
            {isDeletingAll ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete All Face Verifications
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Legacy records (created before the embedding system) can only match by exact hash. 
          Deleting them allows users to re-verify with the improved fuzzy matching system.
        </p>
      </CardContent>
    </Card>
  );
}

// Face Check Dashboard - Texture Analysis Metrics
interface FaceCheckDiagnostic {
  walletAddress: string;
  status: string;
  similarityScore: string | null;
  qualityMetrics: string | null;
  userAgent: string | null;
  processingTimeMs: number | null;
  matchedWalletScore: string | null;
  challengesPassed: string;
  createdAt: string;
}

interface ParsedQualityMetrics {
  faceSize?: string;
  centered?: boolean;
  noOcclusion?: boolean;
  moireScore?: number;
  textureVariance?: number;
  isLikelySpoof?: boolean;
  textureConfidence?: number;
  textureReason?: string;
}

function FaceCheckDashboard({ authHeader }: { authHeader: string | null }) {
  const [diagnostics, setDiagnostics] = useState<FaceCheckDiagnostic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState<any>(null);
  const { toast } = useToast();

  const handleReclassify = async (execute: boolean) => {
    if (!authHeader) return;
    setIsReclassifying(true);
    setReclassifyResult(null);
    try {
      const response = await fetch('/api/admin/face-verification/reclassify', {
        method: 'POST',
        headers: { 
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ execute })
      });
      if (response.ok) {
        const data = await response.json();
        setReclassifyResult(data);
        toast({
          title: execute ? 'Reclassification Complete' : 'Preview Ready',
          description: execute 
            ? `Updated ${data.updated?.length || 0} records` 
            : `Found ${data.totalToReclassify} records to reclassify`,
        });
        if (execute) {
          fetchDiagnostics();
        }
      } else {
        toast({
          title: 'Error',
          description: 'Failed to reclassify records',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Reclassify error:', error);
      toast({
        title: 'Error',
        description: 'Failed to reclassify records',
        variant: 'destructive'
      });
    } finally {
      setIsReclassifying(false);
    }
  };

  const fetchDiagnostics = async () => {
    if (!authHeader) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/face-verification/diagnostics?limit=${limit}`, {
        headers: { 'Authorization': authHeader },
      });
      if (response.ok) {
        const data = await response.json();
        setDiagnostics(data);
      }
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authHeader) {
      fetchDiagnostics();
    }
  }, [authHeader, limit]);

  // Parse quality metrics from JSON strings and coerce to numbers
  const parsedDiagnostics = diagnostics.map(d => {
    let metrics: ParsedQualityMetrics = {};
    try {
      if (d.qualityMetrics) {
        const raw = JSON.parse(d.qualityMetrics);
        metrics = {
          faceSize: raw.faceSize,
          centered: raw.centered,
          noOcclusion: raw.noOcclusion,
          moireScore: raw.moireScore !== undefined ? Number(raw.moireScore) : undefined,
          textureVariance: raw.textureVariance !== undefined ? Number(raw.textureVariance) : undefined,
          isLikelySpoof: raw.isLikelySpoof === true || raw.isLikelySpoof === 'true',
          textureConfidence: raw.textureConfidence !== undefined ? Number(raw.textureConfidence) : undefined,
          textureReason: raw.textureReason,
        };
      }
    } catch {}
    return { ...d, parsedMetrics: metrics };
  });

  // Calculate statistics
  const withTextureData = parsedDiagnostics.filter(d => d.parsedMetrics.moireScore !== undefined);
  const avgMoire = withTextureData.length > 0 
    ? withTextureData.reduce((sum, d) => sum + (d.parsedMetrics.moireScore || 0), 0) / withTextureData.length 
    : 0;
  const avgVariance = withTextureData.length > 0 
    ? withTextureData.reduce((sum, d) => sum + (d.parsedMetrics.textureVariance || 0), 0) / withTextureData.length 
    : 0;
  const spoofFlagged = withTextureData.filter(d => d.parsedMetrics.isLikelySpoof).length;
  
  // Distribution buckets for charts
  const moireBuckets = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const moireDistribution = moireBuckets.slice(0, -1).map((bucket, i) => ({
    range: `${bucket.toFixed(1)}-${moireBuckets[i + 1].toFixed(1)}`,
    count: withTextureData.filter(d => {
      const score = d.parsedMetrics.moireScore || 0;
      return score >= bucket && score < moireBuckets[i + 1];
    }).length,
    threshold: bucket >= 0.7 ? 'suspicious' : 'normal',
  }));

  const varianceBuckets = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 1.0];
  const varianceDistribution = varianceBuckets.slice(0, -1).map((bucket, i) => ({
    range: `${bucket.toFixed(2)}-${varianceBuckets[i + 1].toFixed(2)}`,
    count: withTextureData.filter(d => {
      const score = d.parsedMetrics.textureVariance || 0;
      return score >= bucket && score < varianceBuckets[i + 1];
    }).length,
    threshold: bucket < 0.06 ? 'suspicious' : 'normal',
  }));

  // Status breakdown
  const statusCounts = {
    verified: parsedDiagnostics.filter(d => d.status === 'verified').length,
    needs_review: parsedDiagnostics.filter(d => d.status === 'needs_review').length,
    duplicate: parsedDiagnostics.filter(d => d.status === 'duplicate').length,
    failed: parsedDiagnostics.filter(d => d.status === 'failed').length,
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Records</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-face-total">
              {diagnostics.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With Texture Data</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-face-texture">
              {withTextureData.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Moiré</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-face-moire">
              {avgMoire.toFixed(3)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Variance</CardDescription>
            <CardTitle className="text-2xl" data-testid="text-face-variance">
              {avgVariance.toFixed(3)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Spoof Flagged</CardDescription>
            <CardTitle className="text-2xl text-amber-600" data-testid="text-face-spoof">
              {spoofFlagged}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Verification Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500" />
              <span className="text-sm">Verified: {statusCounts.verified}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500" />
              <span className="text-sm">Needs Review: {statusCounts.needs_review}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-amber-500" />
              <span className="text-sm">Duplicate: {statusCounts.duplicate}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500" />
              <span className="text-sm">Failed: {statusCounts.failed}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reclassify Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Recalculate Distances (Euclidean)
          </CardTitle>
          <CardDescription>
            Recalculate face similarity using Euclidean distance and reclassify records.
            Thresholds: &lt;0.4 = duplicate, 0.4-0.6 = needs_review, &gt;0.6 = verified
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={() => handleReclassify(false)} 
              disabled={isReclassifying}
              variant="outline"
              data-testid="button-reclassify-preview"
            >
              {isReclassifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Preview Changes
            </Button>
            <Button 
              onClick={() => handleReclassify(true)} 
              disabled={isReclassifying}
              variant="default"
              data-testid="button-reclassify-execute"
            >
              {isReclassifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Execute Reclassification
            </Button>
          </div>
          
          {reclassifyResult && (
            <div className="p-4 bg-muted rounded-md space-y-2">
              <div className="flex gap-4 text-sm">
                <span>Analyzed: <strong>{reclassifyResult.totalAnalyzed}</strong></span>
                <span>Kept as duplicate: <strong>{reclassifyResult.keptAsDuplicate}</strong></span>
                <span>To reclassify: <strong>{reclassifyResult.totalToReclassify}</strong></span>
              </div>
              {reclassifyResult.executed && (
                <div className="text-sm text-green-600">
                  Updated {reclassifyResult.updated?.length || 0} records
                </div>
              )}
              {reclassifyResult.toReclassify?.length > 0 && (
                <div className="mt-2">
                  <div className="text-sm font-medium mb-1">Records to reclassify:</div>
                  <div className="max-h-40 overflow-y-auto text-xs space-y-1">
                    {reclassifyResult.toReclassify.map((r: any, i: number) => (
                      <div key={i} className="flex gap-2 items-center">
                        <span className="font-mono">{r.walletAddress.slice(0, 10)}...</span>
                        <Badge variant={r.newStatus === 'verified' ? 'default' : 'secondary'}>
                          {r.currentStatus} → {r.newStatus}
                        </Badge>
                        <span className="text-muted-foreground">
                          distance: {r.newDistance?.toFixed(3) || 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Moiré Score Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Moiré Score Distribution
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (Higher = more periodic patterns, threshold: 0.70)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {moireDistribution.map((bucket, i) => {
              const maxCount = Math.max(...moireDistribution.map(b => b.count), 1);
              const height = (bucket.count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div 
                    className={`w-full ${bucket.threshold === 'suspicious' ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ height: `${height}%`, minHeight: bucket.count > 0 ? '4px' : '0' }}
                    title={`${bucket.range}: ${bucket.count}`}
                  />
                  <span className="text-[10px] text-muted-foreground rotate-45 origin-left">
                    {bucket.range.split('-')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Low (normal)</span>
            <span>High (suspicious)</span>
          </div>
        </CardContent>
      </Card>

      {/* Variance Score Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Texture Variance Distribution
            <span className="text-xs font-normal text-muted-foreground ml-2">
              (Lower = flatter texture, threshold: 0.06)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {varianceDistribution.map((bucket, i) => {
              const maxCount = Math.max(...varianceDistribution.map(b => b.count), 1);
              const height = (bucket.count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div 
                    className={`w-full ${bucket.threshold === 'suspicious' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ height: `${height}%`, minHeight: bucket.count > 0 ? '4px' : '0' }}
                    title={`${bucket.range}: ${bucket.count}`}
                  />
                  <span className="text-[10px] text-muted-foreground rotate-45 origin-left">
                    {bucket.range.split('-')[0]}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Low (suspicious)</span>
            <span>High (normal)</span>
          </div>
        </CardContent>
      </Card>

      {/* Recent Verifications Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ScanFace className="h-5 w-5" />
                Recent Face Verifications
              </CardTitle>
              <CardDescription>
                Detailed view of face verification attempts with texture analysis metrics
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Show:</Label>
              <select 
                value={limit} 
                onChange={(e) => setLimit(Number(e.target.value))}
                className="text-xs border p-1"
                data-testid="select-face-limit"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchDiagnostics}
                disabled={isLoading}
                data-testid="button-refresh-face"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Wallet</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-right p-2">Moiré</th>
                  <th className="text-right p-2">Variance</th>
                  <th className="text-center p-2">Spoof?</th>
                  <th className="text-right p-2">Confidence</th>
                  <th className="text-right p-2">Similarity</th>
                  <th className="text-left p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {parsedDiagnostics.map((d, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-mono">
                      {d.walletAddress.slice(0, 8)}...{d.walletAddress.slice(-4)}
                    </td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 text-[10px] ${
                        d.status === 'verified' ? 'bg-green-100 text-green-700' :
                        d.status === 'duplicate' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className={`p-2 text-right font-mono ${
                      (d.parsedMetrics.moireScore || 0) > 0.7 ? 'text-amber-600 font-bold' : ''
                    }`}>
                      {d.parsedMetrics.moireScore?.toFixed(3) ?? '—'}
                    </td>
                    <td className={`p-2 text-right font-mono ${
                      (d.parsedMetrics.textureVariance || 1) < 0.06 ? 'text-amber-600 font-bold' : ''
                    }`}>
                      {d.parsedMetrics.textureVariance?.toFixed(3) ?? '—'}
                    </td>
                    <td className="p-2 text-center">
                      {d.parsedMetrics.isLikelySpoof ? (
                        <AlertCircle className="h-4 w-4 text-red-500 mx-auto" />
                      ) : d.parsedMetrics.moireScore !== undefined ? (
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {d.parsedMetrics.textureConfidence?.toFixed(2) ?? '—'}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {d.similarityScore ? `${(parseFloat(d.similarityScore) * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {diagnostics.length === 0 && !isLoading && (
            <div className="text-center text-muted-foreground py-8">
              No face verification records found
            </div>
          )}
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Threshold Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-5 w-5" />
            Current Thresholds (Data Gathering Mode)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-medium">Moiré Threshold: 0.70</p>
              <p className="text-muted-foreground text-xs">
                Scores above this indicate periodic patterns (screen pixels)
              </p>
            </div>
            <div>
              <p className="font-medium">Variance Threshold: 0.06</p>
              <p className="text-muted-foreground text-xs">
                Scores below this indicate flat textures (photo/screen)
              </p>
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> XP blocking is currently disabled (TEXTURE_ANALYSIS_BLOCKING=false).
              All texture metrics are logged for analysis. Enable blocking only after verifying thresholds with production data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
