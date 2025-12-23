import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, Users, DollarSign, Sparkles, PiggyBank, Search, 
  RefreshCw, Copy, ScanFace, CheckCircle, XCircle, AlertTriangle,
  Shield, Bot, TrendingUp, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

type SortDirection = 'asc' | 'desc' | null;
type WalletSortColumn = 'address' | 'lastSeen' | 'usdc' | 'xp' | 'sybil' | 'face' | 'goodDollar';
type SybilSortColumn = 'address' | 'score' | 'tier' | 'xpMultiplier';
type XpSortColumn = 'address' | 'totalXp' | 'totalSpent' | 'claimCount';

interface OverviewData {
  wallets: { total: number };
  xp: { totalXp: number; totalSpent: number; usersWithXp: number };
  ai: { conversations: number; totalMessages: number };
  savings: { totalDeposits: number; totalWithdrawals: number; depositVolume: string };
  faceVerification: { verified: number; duplicate: number; needsReview: number; total: number };
  sybil: { clear: number; warn: number; limit: number; block: number; total: number };
  goodDollar: { verified: number; total: number };
  fetchedAt: string;
}

interface WalletData {
  address: string;
  createdAt: string;
  lastSeen: string;
  xp: { totalXp: number; totalSpent: number; pendingFaceXp: number };
  sybil: { tier: string; score: number; xpMultiplier: string };
  face: { status: string; createdAt: string | null } | null;
  goodDollar: { isVerified: boolean };
  balance: { usdc: string };
}

interface WalletsResponse {
  wallets: WalletData[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  fetchedAt: string;
}

interface XpData {
  claimsByAction: { actionType: string; count: number; totalXp: number }[];
  recentClaims: { walletAddress: string; xpAmount: number; claimedAt: string }[];
  topEarners: { walletAddress: string; totalXp: number; totalSpent: number; claimCount: number }[];
  fetchedAt: string;
}

interface SybilData {
  scores: {
    walletAddress: string;
    score: number;
    tier: string;
    xpMultiplier: string;
    signalBreakdown: string;
    reasonCodes: string;
    manualOverride: boolean;
    updatedAt: string;
  }[];
  tierCounts: { clear: number; warn: number; limit: number; block: number };
  fetchedAt: string;
}

interface AiData {
  conversations: { walletAddress: string; messageCount: number; createdAt: string; updatedAt: string }[];
  summary: { totalConversations: number; totalMessages: number; xpSpentOnAi: number };
  fetchedAt: string;
}

interface SavingsData {
  recentOperations: { userAddress: string; chainId: number; operationType: string; amount: string; status: string; createdAt: string }[];
  summary: { totalDeposits: number; totalWithdrawals: number; depositVolume: string; withdrawalVolume: string };
  fetchedAt: string;
}

function formatMicroUsdc(micro: string): string {
  const value = BigInt(micro || '0');
  const dollars = Number(value) / 1_000_000;
  return dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function formatXp(centiXp: number): string {
  return (centiXp / 100).toFixed(2);
}

function getTierColor(tier: string): string {
  switch (tier) {
    case 'clear': return 'bg-green-600 text-white';
    case 'warn': return 'bg-amber-500 text-white';
    case 'limit': return 'bg-orange-600 text-white';
    case 'block': return 'bg-red-600 text-white';
    default: return 'bg-muted text-muted-foreground';
  }
}

function SortIcon({ column, sortColumn, sortDir }: { column: string; sortColumn: string | null; sortDir: SortDirection }) {
  if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
  if (sortDir === 'asc') return <ArrowUp className="h-3 w-3 ml-1" />;
  return <ArrowDown className="h-3 w-3 ml-1" />;
}

export default function Traction() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [walletsPage, setWalletsPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Wallets table sorting & filtering
  const [walletsSortCol, setWalletsSortCol] = useState<WalletSortColumn | null>(null);
  const [walletsSortDir, setWalletsSortDir] = useState<SortDirection>(null);
  const [sybilFilter, setSybilFilter] = useState<string>('all');
  const [faceFilter, setFaceFilter] = useState<string>('all');
  const [gdFilter, setGdFilter] = useState<string>('all');
  
  // Sybil table sorting
  const [sybilSortCol, setSybilSortCol] = useState<SybilSortColumn | null>('score');
  const [sybilSortDir, setSybilSortDir] = useState<SortDirection>('desc');
  
  // XP table sorting
  const [xpSortCol, setXpSortCol] = useState<XpSortColumn | null>('totalXp');
  const [xpSortDir, setXpSortDir] = useState<SortDirection>('desc');
  
  const toggleSort = <T extends string>(col: T, currentCol: T | null, currentDir: SortDirection, setCol: (c: T | null) => void, setDir: (d: SortDirection) => void) => {
    if (currentCol !== col) {
      setCol(col);
      setDir('desc');
    } else if (currentDir === 'desc') {
      setDir('asc');
    } else {
      setCol(null);
      setDir(null);
    }
  };

  const overviewQuery = useQuery<OverviewData>({
    queryKey: ['/api/traction/overview'],
    staleTime: 60000,
    retry: 2,
  });

  const walletsQuery = useQuery<WalletsResponse>({
    queryKey: [`/api/traction/wallets?page=${walletsPage}&limit=50`],
    staleTime: 60000,
    retry: 2,
  });

  const xpQuery = useQuery<XpData>({
    queryKey: ['/api/traction/xp'],
    staleTime: 60000,
    retry: 2,
    enabled: activeTab === 'xp',
  });

  const sybilQuery = useQuery<SybilData>({
    queryKey: ['/api/traction/sybil'],
    staleTime: 60000,
    retry: 2,
    enabled: activeTab === 'sybil',
  });

  const aiQuery = useQuery<AiData>({
    queryKey: ['/api/traction/ai'],
    staleTime: 60000,
    retry: 2,
    enabled: activeTab === 'ai',
  });

  const savingsQuery = useQuery<SavingsData>({
    queryKey: ['/api/traction/savings'],
    staleTime: 60000,
    retry: 2,
    enabled: activeTab === 'savings',
  });

  const syncGoodDollarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/traction/sync-gooddollar');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'GoodDollar Sync Complete',
        description: `Synced ${data.synced} wallets, ${data.verified} verified`,
      });
      queryClient.invalidateQueries({ predicate: (query) => 
        (query.queryKey[0] as string)?.startsWith('/api/traction')
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync GoodDollar identities',
        variant: 'destructive',
      });
    },
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ predicate: (query) => 
      (query.queryKey[0] as string)?.startsWith('/api/traction')
    });
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      toast({ title: 'Copied', description: 'Address copied' });
    }).catch(() => {
      toast({ title: 'Failed', description: 'Could not copy', variant: 'destructive' });
    });
  };

  const filteredAndSortedWallets = useMemo(() => {
    let result = walletsQuery.data?.wallets || [];
    
    // Apply search filter
    if (searchQuery) {
      result = result.filter(w => w.address.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    // Apply sybil tier filter
    if (sybilFilter !== 'all') {
      result = result.filter(w => w.sybil.tier === sybilFilter);
    }
    
    // Apply face filter
    if (faceFilter !== 'all') {
      if (faceFilter === 'verified') {
        result = result.filter(w => w.face?.status === 'verified');
      } else if (faceFilter === 'duplicate') {
        result = result.filter(w => w.face?.status === 'duplicate');
      } else if (faceFilter === 'none') {
        result = result.filter(w => !w.face);
      }
    }
    
    // Apply GoodDollar filter
    if (gdFilter !== 'all') {
      if (gdFilter === 'verified') {
        result = result.filter(w => w.goodDollar.isVerified);
      } else {
        result = result.filter(w => !w.goodDollar.isVerified);
      }
    }
    
    // Apply sorting
    if (walletsSortCol && walletsSortDir) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        switch (walletsSortCol) {
          case 'address': cmp = a.address.localeCompare(b.address); break;
          case 'lastSeen': cmp = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime(); break;
          case 'usdc': cmp = BigInt(a.balance.usdc || '0') > BigInt(b.balance.usdc || '0') ? 1 : -1; break;
          case 'xp': cmp = a.xp.totalXp - b.xp.totalXp; break;
          case 'sybil': cmp = a.sybil.score - b.sybil.score; break;
          case 'face': {
            const getVal = (s: string | undefined) => s === 'verified' ? 2 : s === 'duplicate' ? 1 : 0;
            cmp = getVal(a.face?.status) - getVal(b.face?.status);
            break;
          }
          case 'goodDollar': cmp = (a.goodDollar.isVerified ? 1 : 0) - (b.goodDollar.isVerified ? 1 : 0); break;
        }
        return walletsSortDir === 'desc' ? -cmp : cmp;
      });
    }
    
    return result;
  }, [walletsQuery.data?.wallets, searchQuery, sybilFilter, faceFilter, gdFilter, walletsSortCol, walletsSortDir]);

  const sortedSybilScores = useMemo(() => {
    if (!sybilQuery.data?.scores) return [];
    if (!sybilSortCol || !sybilSortDir) return sybilQuery.data.scores;
    
    return [...sybilQuery.data.scores].sort((a, b) => {
      let cmp = 0;
      switch (sybilSortCol) {
        case 'address': cmp = a.walletAddress.localeCompare(b.walletAddress); break;
        case 'score': cmp = a.score - b.score; break;
        case 'tier': {
          const tierOrder = { clear: 0, warn: 1, limit: 2, block: 3 };
          cmp = (tierOrder[a.tier as keyof typeof tierOrder] ?? 0) - (tierOrder[b.tier as keyof typeof tierOrder] ?? 0);
          break;
        }
        case 'xpMultiplier': cmp = parseFloat(a.xpMultiplier) - parseFloat(b.xpMultiplier); break;
      }
      return sybilSortDir === 'desc' ? -cmp : cmp;
    });
  }, [sybilQuery.data?.scores, sybilSortCol, sybilSortDir]);

  const sortedTopEarners = useMemo(() => {
    if (!xpQuery.data?.topEarners) return [];
    if (!xpSortCol || !xpSortDir) return xpQuery.data.topEarners;
    
    return [...xpQuery.data.topEarners].sort((a, b) => {
      let cmp = 0;
      switch (xpSortCol) {
        case 'address': cmp = a.walletAddress.localeCompare(b.walletAddress); break;
        case 'totalXp': cmp = a.totalXp - b.totalXp; break;
        case 'totalSpent': cmp = a.totalSpent - b.totalSpent; break;
        case 'claimCount': cmp = a.claimCount - b.claimCount; break;
      }
      return xpSortDir === 'desc' ? -cmp : cmp;
    });
  }, [xpQuery.data?.topEarners, xpSortCol, xpSortDir]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-foreground p-4 sticky top-0 bg-background z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#0055FF]" aria-hidden="true" />
            <h1 className="text-base font-extrabold uppercase tracking-tight">nanoPay Traction</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => syncGoodDollarMutation.mutate()}
              disabled={syncGoodDollarMutation.isPending}
              data-testid="button-sync-gooddollar"
            >
              {syncGoodDollarMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sync G$
            </Button>
            <Button variant="outline" size="sm" onClick={refreshAll} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-6 w-full max-w-2xl">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="wallets" data-testid="tab-wallets">Wallets</TabsTrigger>
            <TabsTrigger value="sybil" data-testid="tab-sybil">Sybil</TabsTrigger>
            <TabsTrigger value="xp" data-testid="tab-xp">XP</TabsTrigger>
            <TabsTrigger value="ai" data-testid="tab-ai">AI</TabsTrigger>
            <TabsTrigger value="savings" data-testid="tab-savings">Savings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {overviewQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : overviewQuery.error ? (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <p className="text-destructive">Failed to load overview</p>
                  <Button size="sm" onClick={() => overviewQuery.refetch()} className="mt-2">Retry</Button>
                </CardContent>
              </Card>
            ) : overviewQuery.data ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <StatCard icon={Users} label="Total Wallets" value={overviewQuery.data.wallets.total} testId="stat-wallets" />
                  <StatCard icon={Sparkles} label="XP Earned" value={formatXp(overviewQuery.data.xp.totalXp)} testId="stat-xp-earned" />
                  <StatCard icon={Sparkles} label="XP Spent" value={formatXp(overviewQuery.data.xp.totalSpent)} testId="stat-xp-spent" />
                  <StatCard icon={Bot} label="AI Chats" value={overviewQuery.data.ai.conversations} testId="stat-ai" />
                  <StatCard icon={PiggyBank} label="Deposits" value={overviewQuery.data.savings.totalDeposits} testId="stat-deposits" />
                  <StatCard icon={ScanFace} label="Face Verified" value={overviewQuery.data.faceVerification.verified} testId="stat-face" />
                  <StatCard icon={CheckCircle} label="G$ Verified" value={overviewQuery.data.goodDollar.verified} testId="stat-gd" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-foreground">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-mono uppercase">Sybil Tiers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Clear (1.0x)</span>
                        <Badge className="bg-green-600 text-white">{overviewQuery.data.sybil.clear}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Warn (0.5x)</span>
                        <Badge className="bg-amber-500 text-white">{overviewQuery.data.sybil.warn}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Limit (0.167x)</span>
                        <Badge className="bg-orange-600 text-white">{overviewQuery.data.sybil.limit}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Block (0x)</span>
                        <Badge className="bg-red-600 text-white">{overviewQuery.data.sybil.block}</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-foreground">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-mono uppercase">Face Verification</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Verified</span>
                        <Badge className="bg-green-600 text-white">{overviewQuery.data.faceVerification.verified}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Duplicate</span>
                        <Badge className="bg-red-600 text-white">{overviewQuery.data.faceVerification.duplicate}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Needs Review</span>
                        <Badge className="bg-amber-500 text-white">{overviewQuery.data.faceVerification.needsReview}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="wallets" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 font-mono"
                  data-testid="input-search-wallets"
                />
              </div>
              <Select value={sybilFilter} onValueChange={setSybilFilter}>
                <SelectTrigger className="w-[120px]" data-testid="filter-sybil">
                  <SelectValue placeholder="Sybil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sybil</SelectItem>
                  <SelectItem value="clear">Clear</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                </SelectContent>
              </Select>
              <Select value={faceFilter} onValueChange={setFaceFilter}>
                <SelectTrigger className="w-[120px]" data-testid="filter-face">
                  <SelectValue placeholder="Face" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Face</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
              <Select value={gdFilter} onValueChange={setGdFilter}>
                <SelectTrigger className="w-[100px]" data-testid="filter-gd">
                  <SelectValue placeholder="G$" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All G$</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="not">Not Verified</SelectItem>
                </SelectContent>
              </Select>
              {walletsQuery.data && (
                <span className="text-sm text-muted-foreground ml-auto">
                  {filteredAndSortedWallets.length} of {walletsQuery.data.pagination.total} wallets
                </span>
              )}
            </div>

            {walletsQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : walletsQuery.error ? (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <p className="text-destructive">Failed to load wallets</p>
                  <Button size="sm" onClick={() => walletsQuery.refetch()} className="mt-2">Retry</Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-foreground">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-foreground/20 bg-muted/30">
                          <tr>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('address', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">Address<SortIcon column="address" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('lastSeen', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">Last Seen<SortIcon column="lastSeen" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('usdc', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">USDC<SortIcon column="usdc" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('xp', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">XP<SortIcon column="xp" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('sybil', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">Sybil<SortIcon column="sybil" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('face', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">Face<SortIcon column="face" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('goodDollar', walletsSortCol, walletsSortDir, setWalletsSortCol, setWalletsSortDir)}>
                              <div className="flex items-center">G$<SortIcon column="goodDollar" sortColumn={walletsSortCol} sortDir={walletsSortDir} /></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAndSortedWallets.map((wallet, idx) => (
                            <tr key={wallet.address} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} data-testid={`row-wallet-${idx}`}>
                              <td className="p-3 font-mono text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="truncate max-w-[180px]">{wallet.address}</span>
                                  <button onClick={() => copyAddress(wallet.address)} className="p-1 hover:bg-muted rounded shrink-0" data-testid={`btn-copy-${idx}`}>
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 text-xs text-muted-foreground">{timeAgo(wallet.lastSeen)}</td>
                              <td className="p-3 font-mono text-xs">${formatMicroUsdc(wallet.balance.usdc)}</td>
                              <td className="p-3 font-mono text-xs">{formatXp(wallet.xp.totalXp)}</td>
                              <td className="p-3">
                                <Badge className={`text-xs ${getTierColor(wallet.sybil.tier)}`}>
                                  {wallet.sybil.tier}
                                </Badge>
                              </td>
                              <td className="p-3">
                                {wallet.face?.status === 'verified' ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : wallet.face?.status === 'duplicate' ? (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                ) : wallet.face?.status === 'needs_review' ? (
                                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="p-3">
                                {wallet.goodDollar.isVerified ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredAndSortedWallets.length === 0 && (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-muted-foreground">No wallets found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {walletsQuery.data && walletsQuery.data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setWalletsPage(p => Math.max(1, p - 1))}
                      disabled={walletsPage === 1}
                      data-testid="btn-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {walletsPage} of {walletsQuery.data.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setWalletsPage(p => Math.min(walletsQuery.data!.pagination.totalPages, p + 1))}
                      disabled={walletsPage >= walletsQuery.data.pagination.totalPages}
                      data-testid="btn-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="sybil" className="space-y-4">
            {sybilQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : sybilQuery.error ? (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <p className="text-destructive">Failed to load sybil data</p>
                  <Button size="sm" onClick={() => sybilQuery.refetch()} className="mt-2">Retry</Button>
                </CardContent>
              </Card>
            ) : sybilQuery.data ? (
              <>
                <div className="grid grid-cols-4 gap-3">
                  <Card className="border-foreground">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{sybilQuery.data.tierCounts.clear}</div>
                      <div className="text-xs font-mono uppercase text-muted-foreground">Clear</div>
                    </CardContent>
                  </Card>
                  <Card className="border-foreground">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-amber-500">{sybilQuery.data.tierCounts.warn}</div>
                      <div className="text-xs font-mono uppercase text-muted-foreground">Warn</div>
                    </CardContent>
                  </Card>
                  <Card className="border-foreground">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-orange-600">{sybilQuery.data.tierCounts.limit}</div>
                      <div className="text-xs font-mono uppercase text-muted-foreground">Limit</div>
                    </CardContent>
                  </Card>
                  <Card className="border-foreground">
                    <CardContent className="p-3 text-center">
                      <div className="text-2xl font-bold text-red-600">{sybilQuery.data.tierCounts.block}</div>
                      <div className="text-xs font-mono uppercase text-muted-foreground">Block</div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-foreground">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono uppercase">Sybil Scores (Top 100)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-foreground/20 bg-muted/30">
                          <tr>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('address', sybilSortCol, sybilSortDir, setSybilSortCol, setSybilSortDir)}>
                              <div className="flex items-center">Address<SortIcon column="address" sortColumn={sybilSortCol} sortDir={sybilSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('score', sybilSortCol, sybilSortDir, setSybilSortCol, setSybilSortDir)}>
                              <div className="flex items-center">Score<SortIcon column="score" sortColumn={sybilSortCol} sortDir={sybilSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('tier', sybilSortCol, sybilSortDir, setSybilSortCol, setSybilSortDir)}>
                              <div className="flex items-center">Tier<SortIcon column="tier" sortColumn={sybilSortCol} sortDir={sybilSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('xpMultiplier', sybilSortCol, sybilSortDir, setSybilSortCol, setSybilSortDir)}>
                              <div className="flex items-center">XP Mult<SortIcon column="xpMultiplier" sortColumn={sybilSortCol} sortDir={sybilSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase">Override</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSybilScores.map((s, idx) => (
                            <tr key={s.walletAddress} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                              <td className="p-3 font-mono text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="truncate max-w-[180px]">{s.walletAddress}</span>
                                  <button onClick={() => copyAddress(s.walletAddress)} className="p-1 hover:bg-muted rounded shrink-0">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 font-mono text-xs font-bold">{s.score}</td>
                              <td className="p-3">
                                <Badge className={`text-xs ${getTierColor(s.tier)}`}>{s.tier}</Badge>
                              </td>
                              <td className="p-3 font-mono text-xs">{s.xpMultiplier}x</td>
                              <td className="p-3">
                                {s.manualOverride ? (
                                  <Badge variant="secondary" className="text-xs">Manual</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="xp" className="space-y-4">
            {xpQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : xpQuery.error ? (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <p className="text-destructive">Failed to load XP data</p>
                  <Button size="sm" onClick={() => xpQuery.refetch()} className="mt-2">Retry</Button>
                </CardContent>
              </Card>
            ) : xpQuery.data ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-foreground">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono uppercase">Claims by Action Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {xpQuery.data.claimsByAction.length > 0 ? (
                      <div className="space-y-2">
                        {xpQuery.data.claimsByAction.map(action => (
                          <div key={action.actionType} className="flex items-center justify-between">
                            <span className="text-sm font-mono">{action.actionType}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{action.count} claims</Badge>
                              <span className="font-mono text-sm">{formatXp(action.totalXp)} XP</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No claims yet</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-foreground">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono uppercase">Top XP Earners</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-foreground/20 bg-muted/30">
                          <tr>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('address', xpSortCol, xpSortDir, setXpSortCol, setXpSortDir)}>
                              <div className="flex items-center">Address<SortIcon column="address" sortColumn={xpSortCol} sortDir={xpSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('totalXp', xpSortCol, xpSortDir, setXpSortCol, setXpSortDir)}>
                              <div className="flex items-center">Total<SortIcon column="totalXp" sortColumn={xpSortCol} sortDir={xpSortDir} /></div>
                            </th>
                            <th className="text-left p-3 font-mono text-xs uppercase cursor-pointer hover:bg-muted/50" onClick={() => toggleSort('totalSpent', xpSortCol, xpSortDir, setXpSortCol, setXpSortDir)}>
                              <div className="flex items-center">Spent<SortIcon column="totalSpent" sortColumn={xpSortCol} sortDir={xpSortDir} /></div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTopEarners.map((earner, idx) => (
                            <tr key={earner.walletAddress} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                              <td className="p-3 font-mono text-xs">{formatAddress(earner.walletAddress)}</td>
                              <td className="p-3 font-mono text-xs font-bold">{formatXp(earner.totalXp)}</td>
                              <td className="p-3 font-mono text-xs text-muted-foreground">{formatXp(earner.totalSpent)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            {aiQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : aiQuery.error ? (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <p className="text-destructive">Failed to load AI data</p>
                  <Button size="sm" onClick={() => aiQuery.refetch()} className="mt-2">Retry</Button>
                </CardContent>
              </Card>
            ) : aiQuery.data ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard icon={Bot} label="Conversations" value={aiQuery.data.summary.totalConversations} testId="stat-ai-convos" />
                  <StatCard icon={TrendingUp} label="Messages" value={aiQuery.data.summary.totalMessages} testId="stat-ai-msgs" />
                </div>

                <Card className="border-foreground">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono uppercase">Recent AI Conversations</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-foreground/20 bg-muted/30">
                          <tr>
                            <th className="text-left p-3 font-mono text-xs uppercase">Address</th>
                            <th className="text-left p-3 font-mono text-xs uppercase">Messages</th>
                            <th className="text-left p-3 font-mono text-xs uppercase">Last Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiQuery.data.conversations.map((conv, idx) => (
                            <tr key={conv.walletAddress} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                              <td className="p-3 font-mono text-xs">{formatAddress(conv.walletAddress)}</td>
                              <td className="p-3 font-mono text-xs">{conv.messageCount}</td>
                              <td className="p-3 text-xs text-muted-foreground">{timeAgo(conv.updatedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="savings" className="space-y-4">
            {savingsQuery.isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : savingsQuery.error ? (
              <Card className="border-destructive">
                <CardContent className="p-4">
                  <p className="text-destructive">Failed to load savings data</p>
                  <Button size="sm" onClick={() => savingsQuery.refetch()} className="mt-2">Retry</Button>
                </CardContent>
              </Card>
            ) : savingsQuery.data ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon={PiggyBank} label="Deposits" value={savingsQuery.data.summary.totalDeposits} testId="stat-savings-deposits" />
                  <StatCard icon={DollarSign} label="Withdrawals" value={savingsQuery.data.summary.totalWithdrawals} testId="stat-savings-withdrawals" />
                  <Card className="border-foreground">
                    <CardContent className="p-3 text-center">
                      <div className="text-xl font-bold font-mono">${formatMicroUsdc(savingsQuery.data.summary.depositVolume)}</div>
                      <div className="text-xs font-mono uppercase text-muted-foreground">Deposit Vol</div>
                    </CardContent>
                  </Card>
                  <Card className="border-foreground">
                    <CardContent className="p-3 text-center">
                      <div className="text-xl font-bold font-mono">${formatMicroUsdc(savingsQuery.data.summary.withdrawalVolume)}</div>
                      <div className="text-xs font-mono uppercase text-muted-foreground">Withdrawal Vol</div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-foreground">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono uppercase">Recent Operations</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-foreground/20 bg-muted/30">
                          <tr>
                            <th className="text-left p-3 font-mono text-xs uppercase">Address</th>
                            <th className="text-left p-3 font-mono text-xs uppercase">Type</th>
                            <th className="text-left p-3 font-mono text-xs uppercase">Amount</th>
                            <th className="text-left p-3 font-mono text-xs uppercase">Status</th>
                            <th className="text-left p-3 font-mono text-xs uppercase">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {savingsQuery.data.recentOperations.map((op, idx) => (
                            <tr key={`${op.userAddress}-${op.createdAt}`} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                              <td className="p-3 font-mono text-xs">{formatAddress(op.userAddress)}</td>
                              <td className="p-3">
                                <Badge variant={op.operationType === 'supply' ? 'default' : 'secondary'} className="text-xs">
                                  {op.operationType}
                                </Badge>
                              </td>
                              <td className="p-3 font-mono text-xs">${formatMicroUsdc(op.amount)}</td>
                              <td className="p-3">
                                <Badge 
                                  className={`text-xs ${op.status === 'completed' ? 'bg-green-600 text-white' : op.status === 'failed' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}
                                >
                                  {op.status}
                                </Badge>
                              </td>
                              <td className="p-3 text-xs text-muted-foreground">{timeAgo(op.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, testId }: { icon: any; label: string; value: number | string; testId: string }) {
  return (
    <Card className="border-foreground">
      <CardContent className="p-3 flex flex-col items-center justify-center text-center">
        <Icon className="h-4 w-4 mb-1 text-muted-foreground" />
        <div className="text-xl font-bold" data-testid={testId}>{value}</div>
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
