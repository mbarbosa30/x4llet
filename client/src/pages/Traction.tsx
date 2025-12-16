import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, DollarSign, Network, Sparkles, PiggyBank, Gift, Trophy, Search, ArrowUpDown, RefreshCw, Copy, ScanFace, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface TractionUser {
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
  gdBalance: string;
  gdBalanceFormatted: string;
  xpBalance: number;
  xpClaimCount: number;
  isFaceChecked: boolean;
  faceCheckedAt: string | null;
  faceCheckStatus: 'verified' | 'duplicate' | 'failed' | null;
}

interface TractionResponse {
  users: TractionUser[];
  totalCount: number;
  fetchedAt: string;
}

type SortField = 'lastSeen' | 'totalBalance' | 'maxFlowScore' | 'transferCount' | 'xpBalance' | 'createdAt';
type SortDirection = 'asc' | 'desc';

function formatMicroUsdc(micro: string): string {
  const value = BigInt(micro);
  const dollars = Number(value) / 1_000_000;
  return dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

export default function Traction() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('lastSeen');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  const [filterVouched, setFilterVouched] = useState<string>('all');
  const [filterGoodDollar, setFilterGoodDollar] = useState<string>('all');
  const [filterHasUsdc, setFilterHasUsdc] = useState<string>('all');
  const [filterHasGd, setFilterHasGd] = useState<string>('all');
  const [filterHasSavings, setFilterHasSavings] = useState<string>('all');
  const [filterInPool, setFilterInPool] = useState<string>('all');
  const [filterHasXp, setFilterHasXp] = useState<string>('all');
  const [filterFaceChecked, setFilterFaceChecked] = useState<string>('all');

  const { data, isLoading, error, refetch, isFetching } = useQuery<TractionResponse>({
    queryKey: ['/api/traction/users'],
    staleTime: 60000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnMount: 'always',
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
      queryClient.invalidateQueries({ queryKey: ['/api/traction/users'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync GoodDollar identities',
        variant: 'destructive',
      });
    },
  });

  const filteredAndSortedUsers = useMemo(() => {
    if (!data?.users) return [];
    
    let users = [...data.users];
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      users = users.filter(u => u.address.toLowerCase().includes(q));
    }
    
    if (filterVouched !== 'all') {
      users = users.filter(u => 
        filterVouched === 'yes' ? (u.maxFlowScore !== null && u.maxFlowScore > 0) : (u.maxFlowScore === null || u.maxFlowScore === 0)
      );
    }
    
    if (filterGoodDollar !== 'all') {
      users = users.filter(u => 
        filterGoodDollar === 'yes' ? u.isGoodDollarVerified : !u.isGoodDollarVerified
      );
    }
    
    if (filterHasUsdc !== 'all') {
      users = users.filter(u => 
        filterHasUsdc === 'yes' ? BigInt(u.totalBalance) > 0n : BigInt(u.totalBalance) === 0n
      );
    }
    
    if (filterHasGd !== 'all') {
      users = users.filter(u => 
        filterHasGd === 'yes' ? BigInt(u.gdBalance) > 0n : BigInt(u.gdBalance) === 0n
      );
    }
    
    if (filterHasSavings !== 'all') {
      users = users.filter(u => 
        filterHasSavings === 'yes' ? BigInt(u.aUsdcBalance) > 0n : BigInt(u.aUsdcBalance) === 0n
      );
    }
    
    if (filterInPool !== 'all') {
      users = users.filter(u => 
        filterInPool === 'yes' ? u.poolOptInPercent > 0 : u.poolOptInPercent === 0
      );
    }
    
    if (filterHasXp !== 'all') {
      users = users.filter(u => 
        filterHasXp === 'yes' ? u.xpBalance > 0 : u.xpBalance === 0
      );
    }
    
    if (filterFaceChecked !== 'all') {
      users = users.filter(u => 
        filterFaceChecked === 'yes' ? u.isFaceChecked : !u.isFaceChecked
      );
    }
    
    users.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'lastSeen':
          comparison = new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime();
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'totalBalance':
          comparison = Number(BigInt(a.totalBalance) - BigInt(b.totalBalance));
          break;
        case 'maxFlowScore':
          comparison = (a.maxFlowScore || 0) - (b.maxFlowScore || 0);
          break;
        case 'transferCount':
          comparison = a.transferCount - b.transferCount;
          break;
        case 'xpBalance':
          comparison = a.xpBalance - b.xpBalance;
          break;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });
    
    return users;
  }, [data?.users, searchQuery, sortField, sortDirection, filterVouched, filterGoodDollar, filterHasUsdc, filterHasGd, filterHasSavings, filterInPool, filterHasXp, filterFaceChecked]);

  const stats = useMemo(() => {
    if (!data?.users) return null;
    const users = data.users;
    return {
      total: users.length,
      withVouch: users.filter(u => u.maxFlowScore !== null && u.maxFlowScore > 0).length,
      goodDollarVerified: users.filter(u => u.isGoodDollarVerified).length,
      withUsdc: users.filter(u => BigInt(u.totalBalance) > 0n).length,
      withGd: users.filter(u => BigInt(u.gdBalance) > 0n).length,
      withSavings: users.filter(u => BigInt(u.aUsdcBalance) > 0n).length,
      inPool: users.filter(u => u.poolOptInPercent > 0).length,
      withXp: users.filter(u => u.xpBalance > 0).length,
      faceChecked: users.filter(u => u.isFaceChecked).length,
      filteredCount: filteredAndSortedUsers.length,
    };
  }, [data?.users, filteredAndSortedUsers.length]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  if (isLoading && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2 font-mono uppercase">Loading users...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="border-foreground max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-destructive font-semibold uppercase">Failed to load data</p>
            <p className="text-sm text-muted-foreground mt-2">Will retry automatically or click below</p>
            <Button onClick={() => refetch()} className="mt-4" data-testid="button-retry">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            <StatCard icon={Users} label="Total Users" value={stats.total} testId="stat-total" />
            <StatCard icon={Network} label="Vouched" value={stats.withVouch} testId="stat-vouched" />
            <StatCard icon={Gift} label="G$ Verified" value={stats.goodDollarVerified} testId="stat-gooddollar" />
            <StatCard icon={DollarSign} label="Has USDC" value={stats.withUsdc} testId="stat-usdc" />
            <StatCard icon={Sparkles} label="Has G$" value={stats.withGd} testId="stat-gd" />
            <StatCard icon={PiggyBank} label="Has Savings" value={stats.withSavings} testId="stat-savings" />
            <StatCard icon={Trophy} label="In Pool" value={stats.inPool} testId="stat-pool" />
            <StatCard icon={Sparkles} label="Has XP" value={stats.withXp} testId="stat-xp" />
            <StatCard icon={ScanFace} label="Face Check" value={stats.faceChecked} testId="stat-facecheck" />
          </div>
        )}

        <Card className="border-foreground">
          <CardHeader className="border-b border-foreground/20 pb-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 font-mono"
                  data-testid="input-search"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterSelect label="Vouched" value={filterVouched} onChange={setFilterVouched} testId="filter-vouched" />
                <FilterSelect label="G$ Verified" value={filterGoodDollar} onChange={setFilterGoodDollar} testId="filter-gooddollar" />
                <FilterSelect label="Has USDC" value={filterHasUsdc} onChange={setFilterHasUsdc} testId="filter-usdc" />
                <FilterSelect label="Has G$" value={filterHasGd} onChange={setFilterHasGd} testId="filter-gd" />
                <FilterSelect label="Savings" value={filterHasSavings} onChange={setFilterHasSavings} testId="filter-savings" />
                <FilterSelect label="In Pool" value={filterInPool} onChange={setFilterInPool} testId="filter-pool" />
                <FilterSelect label="Has XP" value={filterHasXp} onChange={setFilterHasXp} testId="filter-xp" />
                <FilterSelect label="Face Check" value={filterFaceChecked} onChange={setFilterFaceChecked} testId="filter-facecheck" />
              </div>
            </div>
            {stats && (
              <p className="text-sm text-muted-foreground font-mono mt-2">
                Showing {stats.filteredCount} of {stats.total} users
              </p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-foreground/20 bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-wider">Address</th>
                    <SortableHeader label="Last Seen" field="lastSeen" currentField={sortField} direction={sortDirection} onSort={toggleSort} />
                    <SortableHeader label="USDC" field="totalBalance" currentField={sortField} direction={sortDirection} onSort={toggleSort} />
                    <SortableHeader label="MaxFlow" field="maxFlowScore" currentField={sortField} direction={sortDirection} onSort={toggleSort} />
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-wider">G$ Ver.</th>
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-wider">G$ Bal.</th>
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-wider">Savings</th>
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-wider">Pool</th>
                    <SortableHeader label="XP" field="xpBalance" currentField={sortField} direction={sortDirection} onSort={toggleSort} />
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-wider">Face</th>
                    <SortableHeader label="Txns" field="transferCount" currentField={sortField} direction={sortDirection} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedUsers.map((user, idx) => (
                    <tr key={user.address} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'} data-testid={`row-user-${idx}`}>
                      <td className="p-3 font-mono text-xs">
                        <div className="flex items-center gap-1">
                          <span className="break-all" data-testid={`text-address-${idx}`}>
                            {user.address}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(user.address).then(() => {
                                toast({
                                  title: 'Copied',
                                  description: 'Address copied to clipboard',
                                });
                              }).catch(() => {
                                toast({
                                  title: 'Copy failed',
                                  description: 'Unable to copy to clipboard',
                                  variant: 'destructive',
                                });
                              });
                            }}
                            className="p-1 hover:bg-muted rounded shrink-0"
                            aria-label="Copy address"
                            data-testid={`button-copy-address-${idx}`}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{timeAgo(user.lastSeen)}</td>
                      <td className="p-3 font-mono text-xs">${formatMicroUsdc(user.totalBalance)}</td>
                      <td className="p-3">
                        {user.maxFlowScore !== null && user.maxFlowScore > 0 ? (
                          <Badge variant="accent" className="font-mono text-xs">{user.maxFlowScore}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        {user.isGoodDollarVerified ? (
                          <Badge className="bg-green-600 text-white text-xs">Yes</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {BigInt(user.gdBalance) > 0n ? user.gdBalanceFormatted : '-'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {BigInt(user.aUsdcBalance) > 0n ? `$${formatMicroUsdc(user.aUsdcBalance)}` : '-'}
                      </td>
                      <td className="p-3">
                        {user.poolOptInPercent > 0 ? (
                          <Badge variant="secondary" className="text-xs">{user.poolOptInPercent}%</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {user.xpBalance > 0 ? (user.xpBalance / 100).toFixed(2) : '-'}
                      </td>
                      <td className="p-3 text-xs">
                        {user.faceCheckStatus === 'verified' ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : user.faceCheckStatus === 'duplicate' ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : user.faceCheckStatus === 'failed' ? (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs">{user.transferCount || '-'}</td>
                    </tr>
                  ))}
                  {filteredAndSortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-muted-foreground">
                        No users match the current filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, testId }: { icon: any; label: string; value: number; testId: string }) {
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

function FilterSelect({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[120px] h-8 text-xs font-mono uppercase" data-testid={testId}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: All</SelectItem>
        <SelectItem value="yes">{label}: Yes</SelectItem>
        <SelectItem value="no">{label}: No</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SortableHeader({ 
  label, 
  field, 
  currentField, 
  direction, 
  onSort 
}: { 
  label: string; 
  field: SortField; 
  currentField: SortField; 
  direction: SortDirection; 
  onSort: (f: SortField) => void;
}) {
  const isActive = currentField === field;
  return (
    <th className="text-left p-3">
      <button
        onClick={() => onSort(field)}
        className={`font-mono text-xs uppercase tracking-wider inline-flex items-center gap-1 hover:text-[#0055FF] ${isActive ? 'text-[#0055FF]' : ''}`}
        data-testid={`sort-${field}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
      </button>
    </th>
  );
}
