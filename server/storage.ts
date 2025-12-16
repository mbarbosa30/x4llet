import { type User, type InsertUser, type BalanceResponse, type Transaction, type PaymentRequest, type Authorization, type AaveOperation, type PoolSettings, type PoolDraw, type PoolContribution, type PoolYieldSnapshot, type Referral, type GoodDollarIdentity, type GoodDollarClaim, type CachedGdBalance, type InsertGoodDollarIdentity, type InsertGoodDollarClaim, type XpBalance, type XpClaim, type AiConversation, type AiMessage, type IpEvent, type InsertIpEvent, authorizations, wallets, cachedBalances, cachedTransactions, exchangeRates, balanceHistory, cachedMaxflowScores, gasDrips, aaveOperations, poolSettings, poolDraws, poolContributions, poolYieldSnapshots, referrals, gooddollarIdentities, gooddollarClaims, cachedGdBalances, xpBalances, xpClaims, globalSettings, aiConversations, ipEvents } from "@shared/schema";
import { randomUUID } from "crypto";
import { createPublicClient, http, type Address } from 'viem';
import { base, celo, gnosis, arbitrum } from 'viem/chains';
import { db } from "./db";
import { eq, and, or, desc, sql, gte, gt, count, sum } from "drizzle-orm";
import { getNetworkByChainId } from "@shared/networks";

function resolveChainForStorage(chainId: number) {
  switch (chainId) {
    case 8453:
      return { viemChain: base, name: 'Base' };
    case 42220:
      return { viemChain: celo, name: 'Celo' };
    case 100:
      return { viemChain: gnosis, name: 'Gnosis' };
    case 42161:
      return { viemChain: arbitrum, name: 'Arbitrum' };
    default:
      return null;
  }
}

const USDC_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

// Normalize MaxFlow score data to ensure consistent snake_case property names
// This handles both old camelCase API responses and new snake_case v1 responses
function normalizeMaxFlowScore(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const normalized: any = { ...data };
  
  // Map camelCase to snake_case for top-level properties
  if ('localHealth' in normalized && !('local_health' in normalized)) {
    normalized.local_health = normalized.localHealth;
    delete normalized.localHealth;
  }
  if ('vouchCounts' in normalized && !('vouch_counts' in normalized)) {
    normalized.vouch_counts = normalized.vouchCounts;
    delete normalized.vouchCounts;
  }
  if ('algorithmBreakdown' in normalized && !('algorithm_breakdown' in normalized)) {
    const breakdown = normalized.algorithmBreakdown;
    if (breakdown && typeof breakdown === 'object') {
      // Normalize baselines if present
      let normalizedBaselines = breakdown.baselines;
      if (normalizedBaselines && typeof normalizedBaselines === 'object') {
        normalizedBaselines = {
          healthy_vouch_count: normalizedBaselines.healthyVouchCount ?? normalizedBaselines.healthy_vouch_count,
          healthy_redundancy: normalizedBaselines.healthyRedundancy ?? normalizedBaselines.healthy_redundancy,
        };
      }
      
      normalized.algorithm_breakdown = {
        flow_component: breakdown.flowComponent ?? breakdown.flow_component,
        redundancy_component: breakdown.redundancyComponent ?? breakdown.redundancy_component,
        direct_flow: breakdown.directFlow ?? breakdown.direct_flow,
        effective_redundancy: breakdown.effectiveRedundancy ?? breakdown.effective_redundancy,
        dilution_factor: breakdown.dilutionFactor ?? breakdown.dilution_factor,
        vertex_disjoint_paths: breakdown.vertexDisjointPaths ?? breakdown.vertex_disjoint_paths,
        ego_network_size: breakdown.egoNetworkSize ?? breakdown.ego_network_size,
        edge_density: breakdown.edgeDensity ?? breakdown.edge_density,
        baselines: normalizedBaselines,
      };
    }
    delete normalized.algorithmBreakdown;
  }
  
  // Also normalize algorithm_breakdown.baselines if it already exists with camelCase
  if (normalized.algorithm_breakdown?.baselines) {
    const baselines = normalized.algorithm_breakdown.baselines;
    if ('healthyVouchCount' in baselines || 'healthyRedundancy' in baselines) {
      normalized.algorithm_breakdown.baselines = {
        healthy_vouch_count: baselines.healthyVouchCount ?? baselines.healthy_vouch_count,
        healthy_redundancy: baselines.healthyRedundancy ?? baselines.healthy_redundancy,
      };
    }
  }
  
  // Normalize vouch_counts if it exists with camelCase
  if (normalized.vouch_counts) {
    const vc = normalized.vouch_counts;
    normalized.vouch_counts = {
      incoming_total: vc.incomingTotal ?? vc.incoming_total,
      incoming_active: vc.incomingActive ?? vc.incoming_active,
      outgoing_total: vc.outgoingTotal ?? vc.outgoing_total,
      unique_vouchers: vc.uniqueVouchers ?? vc.unique_vouchers,
    };
  }
  
  // Normalize activity if it exists with camelCase
  if (normalized.activity) {
    const act = normalized.activity;
    normalized.activity = {
      last_vouch_given_at: act.lastVouchGivenAt ?? act.last_vouch_given_at,
    };
  }
  
  return normalized;
}

// Helper function to convert USDC raw value (6 decimals) to human-readable string with 2 decimal places
// Uses BigInt to preserve precision for large amounts and rounds to nearest cent
function formatUsdcAmount(rawValue: string | bigint): string {
  const valueBigInt = typeof rawValue === 'string' ? BigInt(rawValue) : rawValue;
  const decimals = 1000000n; // 6 decimals for USDC
  
  // Round to nearest cent by adding half of the smallest unit we're displaying (0.005 USDC = 5000 units)
  const roundedValue = valueBigInt + 5000n;
  
  // Get integer part (whole USDC)
  const integerPart = roundedValue / decimals;
  
  // Get fractional part (cents) 
  const remainder = roundedValue % decimals;
  const fractionalPart = remainder / 10000n; // Divide by 10^4 to get 2 decimal places
  
  // Format with 2 decimal places
  const fractionalStr = fractionalPart.toString().padStart(2, '0');
  return `${integerPart}.${fractionalStr}`;
}

interface BlockExplorerTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

// Parse transaction response from any Etherscan-compatible API
function parseTransactionResponse(data: any, address: string, chainName: string): Transaction[] {
  if (data.status !== '1' || !data.result) {
    return [];
  }

  const transactions: Transaction[] = data.result.map((tx: BlockExplorerTx) => {
    const normalizedWallet = address.toLowerCase();
    const normalizedFrom = tx.from.toLowerCase();
    const normalizedTo = tx.to.toLowerCase();
    
    const isSend = normalizedFrom === normalizedWallet;
    const amount = tx.value;

    console.log(`[Transaction Type Detection] TX ${tx.hash.slice(0, 10)}...`);
    console.log(`  Wallet: ${normalizedWallet}`);
    console.log(`  From:   ${normalizedFrom}`);
    console.log(`  To:     ${normalizedTo}`);
    console.log(`  Type:   ${isSend ? 'SEND' : 'RECEIVE'}`);
    console.log(`  Amount: ${amount} micro-USDC`);

    return {
      id: tx.hash,
      type: isSend ? 'send' : 'receive',
      from: normalizedFrom,
      to: normalizedTo,
      amount,
      timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      status: 'completed',
      txHash: tx.hash,
    } as Transaction;
  });

  console.log(`[Explorer] Found ${transactions.length} ${chainName} transactions`);
  return transactions;
}

// Etherscan v2 unified API with chain-specific fallback for rate limit resilience
async function fetchTransactionsFromEtherscan(address: string, chainId: number): Promise<Transaction[]> {
  const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
  
  // Map chainId to USDC contract address
  const usdcAddresses: Record<number, string> = {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base mainnet
    42220: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',  // Celo mainnet
    100: '0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0',  // Gnosis USDC.e (Circle standard)
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum native USDC
  };

  const usdcAddress = usdcAddresses[chainId];
  if (!usdcAddress) {
    console.error(`[Explorer] Unsupported chainId: ${chainId}`);
    return [];
  }

  const chainName = chainId === 8453 ? 'Base' : chainId === 42220 ? 'Celo' : chainId === 100 ? 'Gnosis' : chainId === 42161 ? 'Arbitrum' : `Chain ${chainId}`;

  // Try unified Etherscan v2 API first (if API key available)
  if (etherscanApiKey) {
    const unifiedUrl = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=tokentx&contractaddress=${usdcAddress}&address=${address}&sort=desc&apikey=${etherscanApiKey}`;
    
    try {
      console.log(`[Etherscan v2] Fetching ${chainName} transactions for ${address}`);
      const response = await fetch(unifiedUrl);
      const data = await response.json();

      if (data.status === '1' && data.result) {
        const transactions = parseTransactionResponse(data, address, chainName);
        if (transactions.length > 0) {
          return transactions;
        }
      }
      console.log(`[Etherscan v2] ${chainName} API returned: ${data.message || 'no results'} - trying chain-specific fallback`);
    } catch (error) {
      console.log(`[Etherscan v2] ${chainName} request failed - trying chain-specific fallback`);
    }
  }

  // Fallback to chain-specific APIs for better rate limit handling
  const chainSpecificApis: Record<number, { url: string; keyEnv: string; name: string }> = {
    8453: {
      url: 'https://api.basescan.org/api',
      keyEnv: 'BASESCAN_API_KEY',
      name: 'BaseScan',
    },
    42220: {
      url: 'https://api.celoscan.io/api',
      keyEnv: 'CELOSCAN_API_KEY',
      name: 'CeloScan',
    },
    100: {
      url: 'https://api.gnosisscan.io/api',
      keyEnv: 'GNOSISSCAN_API_KEY',
      name: 'GnosisScan',
    },
    42161: {
      url: 'https://api.arbiscan.io/api',
      keyEnv: 'ARBISCAN_API_KEY',
      name: 'Arbiscan',
    },
  };

  const chainApi = chainSpecificApis[chainId];
  if (!chainApi) {
    console.log(`[Explorer] No chain-specific fallback for chainId ${chainId}`);
    return [];
  }

  const chainApiKey = process.env[chainApi.keyEnv];
  if (!chainApiKey) {
    console.log(`[${chainApi.name}] No API key (${chainApi.keyEnv}) - cannot fetch transactions`);
    return [];
  }

  const fallbackUrl = `${chainApi.url}?module=account&action=tokentx&contractaddress=${usdcAddress}&address=${address}&sort=desc&apikey=${chainApiKey}`;

  try {
    console.log(`[${chainApi.name}] Fetching ${chainName} transactions (fallback)`);
    const response = await fetch(fallbackUrl);
    const data = await response.json();

    if (data.status === '1' && data.result) {
      return parseTransactionResponse(data, address, chainName);
    }
    
    console.log(`[${chainApi.name}] No transactions found or API error:`, data.message);
    return [];
  } catch (error) {
    console.error(`[${chainApi.name}] Error fetching transactions:`, error);
    return [];
  }
}

export interface MaxFlowScore {
  address: string;
  local_health: number;
  cached: boolean;
  cached_at: string | null;
  vouch_counts: {
    incoming_total: number;
    incoming_active: number;
    outgoing_total: number;
    unique_vouchers: number;
  };
  activity: {
    last_vouch_given_at: string | null;
  };
  algorithm_breakdown?: {
    flow_component: number;
    redundancy_component: number;
    direct_flow: number;
    effective_redundancy: number;
    dilution_factor: number;
    vertex_disjoint_paths: number;
    ego_network_size: number;
    edge_density: number;
    baselines: {
      healthy_vouch_count: number;
      healthy_redundancy: number;
    };
  };
}

export interface BalanceHistoryPoint {
  timestamp: string;
  balance: string;
}

export interface InflationData {
  currency: string;
  dailyRate: number; // average daily inflation/deflation rate
  monthlyRate: number; // average monthly rate for display
  annualRate: number; // annualized rate for animations
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getBalance(address: string, chainId: number): Promise<BalanceResponse>;
  getTransactions(address: string, chainId: number): Promise<Transaction[]>;
  addTransaction(address: string, chainId: number, tx: Transaction): Promise<void>;
  
  saveAuthorization(auth: Authorization): Promise<void>;
  getAuthorization(nonce: string, chainId: number): Promise<Authorization | undefined>;
  getAuthorizationsByAddress(address: string, chainId: number): Promise<Authorization[]>;
  markAuthorizationUsed(nonce: string, chainId: number, txHash: string): Promise<void>;
  
  getMaxFlowScore(address: string): Promise<MaxFlowScore | null>;
  getMaxFlowScoreRaw(address: string): Promise<MaxFlowScore | null>; // Bypasses staleness check
  saveMaxFlowScore(address: string, scoreData: MaxFlowScore): Promise<void>;
  
  getBalanceHistory(address: string, chainId: number, days?: number): Promise<BalanceHistoryPoint[]>;
  saveBalanceSnapshot(address: string, chainId: number, balance: string): Promise<void>;
  getInflationRate(currency: string): Promise<InflationData | null>;
  
  // User-facing cache refresh
  clearCacheForAddress(address: string): Promise<void>;
  
  // Admin methods
  clearAllCaches(): Promise<void>;
  clearCachedBalances(): Promise<void>;
  clearBalanceHistory(): Promise<void>;
  clearTransactionsAndBalances(): Promise<void>;
  backfillAllWallets(): Promise<{ walletsProcessed: number; totalSnapshots: number; errors: string[] }>;
  migrateToMicroUsdc(): Promise<{ migratedTransactions: number; migratedBalances: number }>;
  
  // Gas drip methods
  getRecentGasDrips(address: string, chainId: number, since: Date): Promise<GasDrip[]>;
  createGasDrip(drip: { address: string; chainId: number; amount: string; status: string }): Promise<GasDrip>;
  updateGasDrip(id: string, update: { status?: string; txHash?: string }): Promise<void>;
  
  // Aave operation tracking for recovery
  createAaveOperation(op: {
    userAddress: string;
    chainId: number;
    operationType: 'supply' | 'withdraw';
    amount: string;
    status: string;
    step?: string;
  }): Promise<AaveOperation>;
  updateAaveOperation(id: string, update: Partial<{
    status: string;
    step: string;
    transferTxHash: string;
    approveTxHash: string;
    supplyTxHash: string;
    withdrawTxHash: string;
    refundTxHash: string;
    errorMessage: string;
    retryCount: number;
    resolvedAt: Date;
    resolvedBy: string;
  }>): Promise<void>;
  getAaveOperation(id: string): Promise<AaveOperation | null>;
  getPendingAaveOperations(): Promise<AaveOperation[]>;
  getFailedAaveOperations(): Promise<AaveOperation[]>;
  getAaveNetPrincipal(userAddress: string): Promise<{ chainId: number; netPrincipalMicro: string; trackingStarted: string | null }[]>;
  
  // GoodDollar UBI methods
  upsertGoodDollarIdentity(data: InsertGoodDollarIdentity): Promise<GoodDollarIdentity>;
  getGoodDollarIdentity(walletAddress: string): Promise<GoodDollarIdentity | null>;
  recordGoodDollarClaim(data: InsertGoodDollarClaim): Promise<GoodDollarClaim>;
  syncGoodDollarClaims(claims: InsertGoodDollarClaim[]): Promise<{ inserted: number; skipped: number }>;
  getGoodDollarClaimHistory(walletAddress: string, limit?: number): Promise<GoodDollarClaim[]>;
  upsertGdBalance(address: string, balance: string, balanceFormatted: string, decimals?: number): Promise<CachedGdBalance>;
  getGdBalance(address: string): Promise<CachedGdBalance | null>;
  getGoodDollarAnalytics(): Promise<{
    totalVerifiedUsers: number;
    totalClaims: number;
    totalGdClaimed: string;
    totalGdClaimedFormatted: string;
    recentClaims: Array<{
      walletAddress: string;
      amountFormatted: string;
      claimedDay: number;
      createdAt: Date;
    }>;
    activeClaimers: number;
  }>;
  
  // aUSDC balance caching (uses negative chainIds to distinguish from USDC)
  cacheAUsdcBalance(address: string, chainId: number, balance: string): Promise<void>;
  getCachedAUsdcBalance(address: string, chainId: number): Promise<string>;
  
  // XP System methods
  getXpBalance(walletAddress: string): Promise<XpBalance | null>;
  claimXp(walletAddress: string, xpAmount: number, maxFlowSignal: number): Promise<XpClaim>;
  deductXp(walletAddress: string, xpAmount: number): Promise<{ success: boolean; newBalance: number }>;
  refundXp(walletAddress: string, xpAmount: number): Promise<{ success: boolean; newBalance: number }>;
  creditXpFromGdExchange(walletAddress: string, xpAmountCenti: number, gdAmount: string): Promise<{ success: boolean; newBalance: number }>;
  getXpClaimHistory(walletAddress: string, limit?: number): Promise<XpClaim[]>;
  
  // AI Conversation methods
  getAiConversation(walletAddress: string): Promise<AiConversation | null>;
  saveAiConversation(walletAddress: string, messages: AiMessage[]): Promise<void>;
  clearAiConversation(walletAddress: string): Promise<void>;
}

export interface GasDrip {
  id: string;
  address: string;
  chainId: number;
  amount: string;
  txHash: string | null;
  status: string;
  createdAt: Date;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private balances: Map<string, BalanceResponse>;
  private authorizations: Map<string, Authorization>;

  constructor() {
    this.users = new Map();
    this.balances = new Map();
    this.authorizations = new Map();
    
    this.initMockData();
  }

  private initMockData() {
    const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
    const mockTransactions: Transaction[] = [
      {
        id: randomUUID(),
        type: 'receive',
        from: '0x9f8a26F2C9F90C4E3c8b12D7E3A4B5C6D7E8F9A0',
        to: mockAddress,
        amount: '250000000', // 250.00 USDC in micro-USDC
        timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
        status: 'completed',
        txHash: '0xabc123...',
      },
      {
        id: randomUUID(),
        type: 'send',
        from: mockAddress,
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '50000000', // 50.00 USDC in micro-USDC
        timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
        status: 'completed',
        txHash: '0xdef456...',
      },
      {
        id: randomUUID(),
        type: 'receive',
        from: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        to: mockAddress,
        amount: '1000000000', // 1000.00 USDC in micro-USDC
        timestamp: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
        status: 'completed',
        txHash: '0x789ghi...',
      },
    ];

    this.balances.set(`${mockAddress}-8453`, {
      balance: '1250.00',
      balanceMicro: '1250000000', // 1250.00 USDC in micro-USDC
      decimals: 6,
      nonce: randomUUID().replace(/-/g, '').slice(0, 32),
      transactions: mockTransactions,
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getBalance(address: string, chainId: number): Promise<BalanceResponse> {
    const key = `${address}-${chainId}`;
    
    console.log(`[Balance API] Fetching balance for address: ${address}, chainId: ${chainId}`);
    
    try {
      // Fetch real blockchain balance using network config
      const chainInfo = resolveChainForStorage(chainId);
      const networkConfig = getNetworkByChainId(chainId);
      
      if (!chainInfo || !networkConfig) {
        throw new Error(`Unsupported chainId: ${chainId}`);
      }
      
      const chain = chainInfo.viemChain;
      const usdcAddress = networkConfig.usdcAddress as Address;
      
      console.log(`[Balance API] Using ${chainInfo.name} (chainId: ${chainId}), USDC: ${usdcAddress}`);
      console.log(`[Balance API] RPC URL: ${chain.rpcUrls.default.http[0]}`);
      
      const client = createPublicClient({
        chain,
        transport: http(),
      });
      
      console.log('[Balance API] Calling balanceOf on USDC contract...');
      const balance = await client.readContract({
        address: usdcAddress,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address as Address],
      }) as bigint;
      
      console.log(`[Balance API] Raw balance from blockchain: ${balance.toString()}`);
      
      // Store canonical micro-USDC integer
      const balanceMicro = balance.toString();
      
      // Convert to human readable for display (using BigInt to preserve precision)
      const balanceInUsdc = formatUsdcAmount(balance);
      console.log(`[Balance API] Balance: ${balanceInUsdc} USDC (${balanceMicro} micro-USDC)`);
      
      // Fetch on-chain transactions using Etherscan v2 unified API
      console.log('[Balance API] Fetching on-chain transaction history...');
      const onChainTransactions = await fetchTransactionsFromEtherscan(address, chainId);
      
      // Get locally stored transactions (from wallet-initiated transfers)
      const existing = this.balances.get(key);
      const localTransactions = existing?.transactions || [];
      
      // Merge on-chain and local transactions, removing duplicates by txHash
      const transactionMap = new Map<string, Transaction>();
      
      // Add on-chain transactions first
      onChainTransactions.forEach(tx => {
        if (tx.txHash) {
          transactionMap.set(tx.txHash, tx);
        }
      });
      
      // Add local transactions (may override on-chain if same txHash)
      localTransactions.forEach(tx => {
        if (tx.txHash && !transactionMap.has(tx.txHash)) {
          transactionMap.set(tx.txHash, tx);
        }
      });
      
      // Convert back to array and sort by timestamp (newest first)
      const transactions = Array.from(transactionMap.values()).sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      console.log(`[Balance API] Total transactions: ${transactions.length} (${onChainTransactions.length} on-chain, ${localTransactions.length} local)`);
      
      const response: BalanceResponse = {
        balance: balanceInUsdc,
        balanceMicro,
        decimals: 6,
        nonce: randomUUID().replace(/-/g, '').slice(0, 32),
        transactions,
      };
      
      // Cache the result
      this.balances.set(key, response);
      console.log(`[Balance API] Success! Returning balance: ${balanceInUsdc}`);
      return response;
    } catch (error) {
      console.error('[Balance API] ERROR fetching blockchain balance:', error);
      console.error('[Balance API] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Fallback to cached data or zero balance
      const existing = this.balances.get(key);
      if (existing) {
        console.log('[Balance API] Returning cached balance after error');
        return existing;
      }
      
      console.log('[Balance API] No cache available, returning zero balance');
      const fallback: BalanceResponse = {
        balance: '0.00',
        balanceMicro: '0',
        decimals: 6,
        nonce: randomUUID().replace(/-/g, '').slice(0, 32),
        transactions: [],
      };
      
      return fallback;
    }
  }

  async getTransactions(address: string, chainId: number): Promise<Transaction[]> {
    const balance = await this.getBalance(address, chainId);
    return balance.transactions;
  }

  async addTransaction(address: string, chainId: number, tx: Transaction): Promise<void> {
    const key = `${address}-${chainId}`;
    const existing = this.balances.get(key);
    
    if (existing) {
      existing.transactions.unshift(tx);
      
      // Convert amount to micro-USDC if it's in legacy decimal format
      let txAmountMicro: bigint;
      if (tx.amount.includes('.')) {
        // Legacy decimal format (e.g., "50.00") - convert to micro-USDC
        const parts = tx.amount.split('.');
        const whole = parts[0] || '0';
        const fraction = (parts[1] || '0').padEnd(6, '0').slice(0, 6);
        txAmountMicro = BigInt(whole + fraction);
      } else {
        // Already in micro-USDC format (e.g., "50000000")
        txAmountMicro = BigInt(tx.amount);
      }
      
      const currentBalanceMicro = BigInt(existing.balanceMicro);
      
      let newBalanceMicro: bigint;
      if (tx.type === 'receive') {
        newBalanceMicro = currentBalanceMicro + txAmountMicro;
      } else {
        newBalanceMicro = currentBalanceMicro - txAmountMicro;
      }
      
      // Update both micro and display formats
      existing.balanceMicro = newBalanceMicro.toString();
      existing.balance = (Number(newBalanceMicro) / 1e6).toFixed(2);
    }
  }

  async saveAuthorization(auth: Authorization): Promise<void> {
    const key = `${auth.nonce}-${auth.chainId}`;
    this.authorizations.set(key, auth);
  }

  async getAuthorization(nonce: string, chainId: number): Promise<Authorization | undefined> {
    const key = `${nonce}-${chainId}`;
    return this.authorizations.get(key);
  }

  async getAuthorizationsByAddress(address: string, chainId: number): Promise<Authorization[]> {
    return Array.from(this.authorizations.values()).filter(
      auth => (auth.from === address || auth.to === address) && auth.chainId === chainId
    );
  }

  async markAuthorizationUsed(nonce: string, chainId: number, txHash: string): Promise<void> {
    const key = `${nonce}-${chainId}`;
    const auth = this.authorizations.get(key);
    if (auth) {
      auth.status = 'used';
      auth.usedAt = new Date().toISOString();
      auth.txHash = txHash;
    }
  }

  async getMaxFlowScore(address: string): Promise<MaxFlowScore | null> {
    // MemStorage doesn't cache MaxFlow scores
    return null;
  }

  async getMaxFlowScoreRaw(address: string): Promise<MaxFlowScore | null> {
    // MemStorage doesn't cache MaxFlow scores
    return null;
  }

  async saveMaxFlowScore(address: string, scoreData: MaxFlowScore): Promise<void> {
    // MemStorage doesn't cache MaxFlow scores
  }

  async getBalanceHistory(address: string, chainId: number, days: number = 30): Promise<BalanceHistoryPoint[]> {
    // MemStorage doesn't track balance history
    return [];
  }

  async saveBalanceSnapshot(address: string, chainId: number, balance: string): Promise<void> {
    // MemStorage doesn't track balance history
  }

  async getInflationRate(currency: string): Promise<InflationData | null> {
    // MemStorage doesn't track inflation rates
    return null;
  }

  async clearAllCaches(): Promise<void> {
    // Clear in-memory caches
    this.balances.clear();
    this.authorizations.clear();
  }

  async clearCachedBalances(): Promise<void> {
    // Clear in-memory balance cache
    this.balances.clear();
  }

  async clearBalanceHistory(): Promise<void> {
    // MemStorage doesn't track balance history, no-op
  }

  async clearTransactionsAndBalances(): Promise<void> {
    // Clear in-memory caches (preserve authorizations which could include MaxFlow-like data)
    this.balances.clear();
  }

  async backfillAllWallets(): Promise<{ walletsProcessed: number; totalSnapshots: number; errors: string[] }> {
    // MemStorage doesn't track balance history, no-op
    return { walletsProcessed: 0, totalSnapshots: 0, errors: [] };
  }

  async migrateToMicroUsdc(): Promise<{ migratedTransactions: number; migratedBalances: number }> {
    // MemStorage doesn't use database, no-op
    return { migratedTransactions: 0, migratedBalances: 0 };
  }

  async clearCacheForAddress(address: string): Promise<void> {
    // Clear balance cache for this address
    this.balances.delete(address);
  }

  async getRecentGasDrips(address: string, chainId: number, since: Date): Promise<GasDrip[]> {
    // MemStorage doesn't track gas drips
    return [];
  }

  async createGasDrip(drip: { address: string; chainId: number; amount: string; status: string }): Promise<GasDrip> {
    // MemStorage doesn't track gas drips
    return {
      id: randomUUID(),
      address: drip.address,
      chainId: drip.chainId,
      amount: drip.amount,
      txHash: null,
      status: drip.status,
      createdAt: new Date(),
    };
  }

  async updateGasDrip(id: string, update: { status?: string; txHash?: string }): Promise<void> {
    // MemStorage doesn't track gas drips, no-op
  }

  async createAaveOperation(op: {
    userAddress: string;
    chainId: number;
    operationType: 'supply' | 'withdraw';
    amount: string;
    status: string;
    step?: string;
  }): Promise<AaveOperation> {
    // MemStorage stub
    return {
      id: randomUUID(),
      userAddress: op.userAddress,
      chainId: op.chainId,
      operationType: op.operationType,
      amount: op.amount,
      status: op.status,
      step: op.step || null,
      transferTxHash: null,
      approveTxHash: null,
      supplyTxHash: null,
      withdrawTxHash: null,
      refundTxHash: null,
      errorMessage: null,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    };
  }

  async updateAaveOperation(id: string, update: Partial<{
    status: string;
    step: string;
    transferTxHash: string;
    approveTxHash: string;
    supplyTxHash: string;
    withdrawTxHash: string;
    refundTxHash: string;
    errorMessage: string;
    retryCount: number;
    resolvedAt: Date;
    resolvedBy: string;
  }>): Promise<void> {
    // MemStorage stub - no-op
  }

  async getAaveOperation(id: string): Promise<AaveOperation | null> {
    return null;
  }

  async getPendingAaveOperations(): Promise<AaveOperation[]> {
    return [];
  }

  async getFailedAaveOperations(): Promise<AaveOperation[]> {
    return [];
  }

  async getAaveNetPrincipal(userAddress: string): Promise<{ chainId: number; netPrincipalMicro: string; trackingStarted: string | null }[]> {
    return [];
  }

  async upsertGoodDollarIdentity(data: InsertGoodDollarIdentity): Promise<GoodDollarIdentity> {
    return {
      id: randomUUID(),
      walletAddress: data.walletAddress,
      isWhitelisted: data.isWhitelisted ?? false,
      whitelistedRoot: data.whitelistedRoot ?? null,
      lastAuthenticated: data.lastAuthenticated ?? null,
      authenticationPeriod: data.authenticationPeriod ?? null,
      expiresAt: data.expiresAt ?? null,
      isExpired: data.isExpired ?? false,
      daysUntilExpiry: data.daysUntilExpiry ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getGoodDollarIdentity(walletAddress: string): Promise<GoodDollarIdentity | null> {
    return null;
  }

  async recordGoodDollarClaim(data: InsertGoodDollarClaim): Promise<GoodDollarClaim> {
    return {
      id: randomUUID(),
      walletAddress: data.walletAddress,
      txHash: data.txHash,
      amount: data.amount,
      amountFormatted: data.amountFormatted,
      claimedDay: data.claimedDay,
      gasDripTxHash: data.gasDripTxHash ?? null,
      createdAt: new Date(),
    };
  }

  async syncGoodDollarClaims(claims: InsertGoodDollarClaim[]): Promise<{ inserted: number; skipped: number }> {
    // MemStorage doesn't persist, just return count
    return { inserted: claims.length, skipped: 0 };
  }

  async getGoodDollarClaimHistory(walletAddress: string, limit?: number): Promise<GoodDollarClaim[]> {
    return [];
  }

  async upsertGdBalance(address: string, balance: string, balanceFormatted: string, decimals: number = 2): Promise<CachedGdBalance> {
    return {
      id: randomUUID(),
      address,
      balance,
      balanceFormatted,
      decimals,
      updatedAt: new Date(),
    };
  }

  async getGdBalance(address: string): Promise<CachedGdBalance | null> {
    return null;
  }

  async getGoodDollarAnalytics(): Promise<{
    totalVerifiedUsers: number;
    totalClaims: number;
    totalGdClaimed: string;
    totalGdClaimedFormatted: string;
    recentClaims: Array<{ walletAddress: string; amountFormatted: string; claimedDay: number; createdAt: Date }>;
    activeClaimers: number;
  }> {
    return {
      totalVerifiedUsers: 0,
      totalClaims: 0,
      totalGdClaimed: '0',
      totalGdClaimedFormatted: '0.00',
      recentClaims: [],
      activeClaimers: 0,
    };
  }

  async cacheAUsdcBalance(address: string, chainId: number, balance: string): Promise<void> {
    // MemStorage stub - no-op
  }

  async getCachedAUsdcBalance(address: string, chainId: number): Promise<string> {
    return '0';
  }

  async getXpBalance(walletAddress: string): Promise<XpBalance | null> {
    return null;
  }

  async claimXp(walletAddress: string, xpAmount: number, maxFlowSignal: number): Promise<XpClaim> {
    throw new Error('XP claiming not available in MemStorage');
  }

  async deductXp(walletAddress: string, xpAmount: number): Promise<{ success: boolean; newBalance: number }> {
    throw new Error('XP deduction not available in MemStorage');
  }

  async refundXp(walletAddress: string, xpAmount: number): Promise<{ success: boolean; newBalance: number }> {
    throw new Error('XP refund not available in MemStorage');
  }

  async creditXpFromGdExchange(walletAddress: string, xpAmountCenti: number, gdAmount: string): Promise<{ success: boolean; newBalance: number }> {
    throw new Error('XP credit from G$ exchange not available in MemStorage');
  }

  async getXpClaimHistory(walletAddress: string, limit?: number): Promise<XpClaim[]> {
    return [];
  }

  async getAiConversation(walletAddress: string): Promise<AiConversation | null> {
    return null;
  }

  async saveAiConversation(walletAddress: string, messages: AiMessage[]): Promise<void> {
    // MemStorage stub - no-op
  }

  async clearAiConversation(walletAddress: string): Promise<void> {
    // MemStorage stub - no-op
  }
}

// Database storage with PostgreSQL for all data
export class DbStorage extends MemStorage {
  private readonly CACHE_TTL_MS = 30000; // 30 seconds for balance cache
  private readonly TRANSACTION_CACHE_TTL_MS = 300000; // 5 minutes for transaction cache
  private readonly RATE_TTL_MS = 14400000; // 4 hours for exchange rates

  async registerWallet(address: string): Promise<void> {
    try {
      await db.insert(wallets).values({
        address,
      }).onConflictDoUpdate({
        target: wallets.address,
        set: {
          lastSeen: new Date(),
        },
      });
    } catch (error) {
      console.error('[DB] Error registering wallet:', error);
    }
  }

  async getBalance(address: string, chainId: number): Promise<BalanceResponse> {
    // Register wallet if first time seeing it
    await this.registerWallet(address);

    // Check cache first
    const cached = await db
      .select()
      .from(cachedBalances)
      .where(and(eq(cachedBalances.address, address), eq(cachedBalances.chainId, chainId)))
      .limit(1);

    const now = new Date();
    const cacheAge = cached[0] ? now.getTime() - cached[0].updatedAt.getTime() : Infinity;

    // Return cached balance if fresh enough
    if (cached[0] && cacheAge < this.CACHE_TTL_MS) {
      console.log(`[DB Cache] Returning cached balance for ${address} (age: ${Math.round(cacheAge / 1000)}s)`);
      
      const transactions = await this.getTransactions(address, chainId);
      
      // Cached balance should be stored as micro-USDC integer
      // Handle legacy decimal format if migration hasn't run yet
      let balanceMicro: string;
      if (cached[0].balance.includes('.')) {
        // Legacy decimal format - convert to micro-USDC
        console.warn(`[DB Cache] Found legacy decimal balance "${cached[0].balance}" - converting to micro-USDC`);
        const balanceParts = cached[0].balance.split('.');
        const balanceWhole = balanceParts[0] || '0';
        const balanceFraction = (balanceParts[1] || '0').padEnd(6, '0').slice(0, 6);
        balanceMicro = balanceWhole + balanceFraction;
      } else {
        // Already in micro-USDC format
        balanceMicro = cached[0].balance;
      }
      
      const balanceFormatted = formatUsdcAmount(balanceMicro);
      
      return {
        balance: balanceFormatted,
        balanceMicro,
        decimals: cached[0].decimals,
        nonce: cached[0].nonce,
        transactions,
      };
    }

    // Cache miss or stale - fetch from blockchain
    console.log(`[DB Cache] Cache ${cached[0] ? 'stale' : 'miss'} - fetching fresh balance from blockchain`);
    const freshBalance = await super.getBalance(address, chainId);

    // Store fresh data in database
    await this.cacheBalance(address, chainId, freshBalance);
    await this.cacheTransactions(address, chainId, freshBalance.transactions);

    return freshBalance;
  }

  private async cacheBalance(address: string, chainId: number, balance: BalanceResponse): Promise<void> {
    try {
      await db.insert(cachedBalances).values({
        address,
        chainId,
        balance: balance.balanceMicro,
        decimals: balance.decimals,
        nonce: balance.nonce,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [cachedBalances.address, cachedBalances.chainId],
        set: {
          balance: balance.balanceMicro,
          nonce: balance.nonce,
          updatedAt: new Date(),
        },
      });

      // Save per-chain balance snapshot for history tracking
      await this.saveBalanceSnapshot(address, chainId, balance.balanceMicro);

      // Also save aggregated snapshot (chainId=0) with total balance across all chains
      await this.saveAggregatedBalanceSnapshot(address, chainId, balance.balanceMicro);
    } catch (error) {
      console.error('[DB] Error caching balance:', error);
    }
  }

  private async saveAggregatedBalanceSnapshot(address: string, updatedChainId: number, updatedBalance: string): Promise<void> {
    try {
      // Fetch balances from ALL chains to calculate total
      const allChainIds = [8453, 42220, 100, 42161]; // Base, Celo, Gnosis, Arbitrum
      const otherChainIds = allChainIds.filter(id => id !== updatedChainId);
      
      const otherChainsCached = await db
        .select()
        .from(cachedBalances)
        .where(
          and(
            eq(cachedBalances.address, address),
            or(...otherChainIds.map(id => eq(cachedBalances.chainId, id)))
          )
        );

      // Calculate total balance (current chain + all other chains)
      let totalBalance = BigInt(updatedBalance);
      const balanceBreakdown: string[] = [`${updatedChainId}: ${updatedBalance}`];
      
      for (const cached of otherChainsCached) {
        const balance = cached.balance || '0';
        totalBalance += BigInt(balance);
        balanceBreakdown.push(`${cached.chainId}: ${balance}`);
      }

      // Save aggregated snapshot with chainId=0 to indicate "all chains"
      await this.saveBalanceSnapshot(address, 0, totalBalance.toString());
      
      console.log(`[DB] Saved aggregated snapshot: ${totalBalance.toString()} micro-USDC (${balanceBreakdown.join(', ')})`);
    } catch (error) {
      console.error('[DB] Error saving aggregated balance snapshot:', error);
    }
  }

  private async cacheTransactions(address: string, chainId: number, transactions: Transaction[]): Promise<void> {
    const now = new Date();
    for (const tx of transactions) {
      try {
        if (!tx.txHash) continue;

        await db.insert(cachedTransactions).values({
          txHash: tx.txHash,
          chainId,
          type: tx.type,
          from: tx.from,
          to: tx.to,
          amount: tx.amount,
          timestamp: new Date(tx.timestamp),
          status: tx.status,
          cachedAt: now,
        }).onConflictDoUpdate({
          target: cachedTransactions.txHash,
          set: {
            cachedAt: now,
          },
        });
      } catch (error) {
        console.error(`[DB] Error caching transaction ${tx.txHash}:`, error);
      }
    }
  }

  async getTransactions(address: string, chainId: number): Promise<Transaction[]> {
    // Normalize address to lowercase for case-insensitive matching
    const normalizedAddress = address.toLowerCase();
    
    // Check cache first
    const cachedResults = await db
      .select()
      .from(cachedTransactions)
      .where(
        and(
          eq(cachedTransactions.chainId, chainId),
          or(
            sql`LOWER(${cachedTransactions.from}) = ${normalizedAddress}`,
            sql`LOWER(${cachedTransactions.to}) = ${normalizedAddress}`
          )
        )
      )
      .orderBy(desc(cachedTransactions.timestamp));

    // Calculate cache age from the most recently cached transaction
    const now = new Date();
    const cacheAge = cachedResults[0]?.cachedAt 
      ? now.getTime() - cachedResults[0].cachedAt.getTime() 
      : Infinity;

    // Return cached transactions if fresh enough
    if (cachedResults.length > 0 && cacheAge < this.TRANSACTION_CACHE_TTL_MS) {
      console.log(`[DB Cache] Returning cached transactions for ${address} on chain ${chainId} (age: ${Math.round(cacheAge / 1000)}s)`);
      return cachedResults.map(tx => ({
        id: tx.txHash,
        type: tx.type as 'send' | 'receive',
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        timestamp: tx.timestamp.toISOString(),
        status: tx.status as 'pending' | 'completed' | 'failed',
        txHash: tx.txHash,
      }));
    }

    // Cache miss or stale - fetch fresh transactions from Etherscan
    console.log(`[DB Cache] Transaction cache ${cachedResults.length === 0 ? 'miss' : 'stale'} for ${address} on chain ${chainId}, fetching fresh data`);
    const freshTransactions = await fetchTransactionsFromEtherscan(address, chainId);
    
    // Merge fresh transactions with cached ones (by txHash) to preserve history
    // This handles cases where API returns partial data (e.g., only sends, rate limits, etc.)
    const freshTxHashes = new Set(freshTransactions.map(tx => tx.txHash));
    const cachedTxs = cachedResults.map(tx => ({
      id: tx.txHash,
      type: tx.type as 'send' | 'receive',
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      timestamp: tx.timestamp.toISOString(),
      status: tx.status as 'pending' | 'completed' | 'failed',
      txHash: tx.txHash,
    }));
    
    // Keep cached transactions that aren't in the fresh fetch (preserve old data)
    const preservedTxs = cachedTxs.filter(tx => tx.txHash && !freshTxHashes.has(tx.txHash));
    
    // Merge fresh + preserved transactions and sort by timestamp descending
    const mergedTransactions = [...freshTransactions, ...preservedTxs].sort((a, b) => {
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      // Tiebreaker: use txHash for deterministic ordering
      return (a.txHash || '').localeCompare(b.txHash || '');
    });
    
    // Update cache freshness for ALL transactions (fresh + preserved) after successful fetch
    if (freshTransactions.length > 0) {
      console.log(`[DB Cache] Fetched ${freshTransactions.length} fresh transactions, preserving ${preservedTxs.length} cached transactions`);
      
      // Cache fresh transactions (upsert updates cachedAt)
      await this.cacheTransactions(address, chainId, freshTransactions);
      
      // Update cachedAt for preserved transactions to maintain unified freshness
      const now = new Date();
      for (const tx of preservedTxs) {
        if (!tx.txHash) continue;
        try {
          await db
            .update(cachedTransactions)
            .set({ cachedAt: now })
            .where(eq(cachedTransactions.txHash, tx.txHash));
        } catch (error) {
          console.error(`[DB] Error updating cachedAt for preserved transaction ${tx.txHash}:`, error);
        }
      }
    } else if (cachedResults.length > 0) {
      console.log(`[DB Cache] Fresh fetch returned no transactions, returning ${cachedResults.length} cached transactions`);
    }
    
    return mergedTransactions;
  }

  async addTransaction(address: string, chainId: number, tx: Transaction): Promise<void> {
    await super.addTransaction(address, chainId, tx);
    
    if (tx.txHash) {
      await this.cacheTransactions(address, chainId, [tx]);
    }

    // Invalidate balance cache so next fetch gets fresh data
    await db
      .delete(cachedBalances)
      .where(and(eq(cachedBalances.address, address), eq(cachedBalances.chainId, chainId)));
  }

  async getExchangeRate(currency: string): Promise<number | null> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const cached = await db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.currency, currency.toUpperCase()), eq(exchangeRates.date, today)))
      .limit(1);

    if (cached[0]) {
      const age = Date.now() - cached[0].updatedAt.getTime();
      if (age < this.RATE_TTL_MS) {
        console.log(`[DB Cache] Returning cached exchange rate for ${currency} (age: ${Math.round(age / 1000)}s)`);
        return parseFloat(cached[0].rate);
      }
    }

    return null;
  }

  async cacheExchangeRate(currency: string, rate: number): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      await db.insert(exchangeRates).values({
        currency: currency.toUpperCase(),
        rate: rate.toString(),
        date: today,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [exchangeRates.currency, exchangeRates.date],
        set: {
          rate: rate.toString(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(`[DB] Error caching exchange rate for ${currency}:`, error);
    }
  }

  async saveAuthorization(auth: Authorization): Promise<void> {
    await db.insert(authorizations).values({
      id: auth.id,
      chainId: auth.chainId,
      nonce: auth.nonce,
      from: auth.from,
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      signature: auth.signature,
      status: auth.status,
      usedAt: auth.usedAt ? new Date(auth.usedAt) : undefined,
      txHash: auth.txHash,
    });
  }

  async getAuthorization(nonce: string, chainId: number): Promise<Authorization | undefined> {
    const result = await db
      .select()
      .from(authorizations)
      .where(and(eq(authorizations.nonce, nonce), eq(authorizations.chainId, chainId)))
      .limit(1);
    
    if (result.length === 0) {
      return undefined;
    }

    const auth = result[0];
    return {
      id: auth.id,
      chainId: auth.chainId,
      nonce: auth.nonce,
      from: auth.from,
      to: auth.to,
      value: auth.value,
      validAfter: auth.validAfter,
      validBefore: auth.validBefore,
      signature: auth.signature,
      status: auth.status as 'pending' | 'used' | 'cancelled' | 'expired',
      createdAt: auth.createdAt.toISOString(),
      usedAt: auth.usedAt?.toISOString(),
      txHash: auth.txHash || undefined,
    };
  }

  async getAuthorizationsByAddress(address: string, chainId: number): Promise<Authorization[]> {
    const results = await db
      .select()
      .from(authorizations)
      .where(
        and(
          eq(authorizations.chainId, chainId),
          or(
            eq(authorizations.from, address),
            eq(authorizations.to, address)
          )
        )
      );
    
    return results
      .map((auth: typeof authorizations.$inferSelect) => ({
        id: auth.id,
        chainId: auth.chainId,
        nonce: auth.nonce,
        from: auth.from,
        to: auth.to,
        value: auth.value,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        signature: auth.signature,
        status: auth.status as 'pending' | 'used' | 'cancelled' | 'expired',
        createdAt: auth.createdAt.toISOString(),
        usedAt: auth.usedAt?.toISOString(),
        txHash: auth.txHash || undefined,
      }));
  }

  async markAuthorizationUsed(nonce: string, chainId: number, txHash: string): Promise<void> {
    await db
      .update(authorizations)
      .set({
        status: 'used',
        usedAt: new Date(),
        txHash,
      })
      .where(and(eq(authorizations.nonce, nonce), eq(authorizations.chainId, chainId)));
  }

  async getMaxFlowScore(address: string): Promise<MaxFlowScore | null> {
    // Stale-while-revalidate: Always return cached data if it exists
    // Caller should check _stale flag and trigger background refresh if needed
    try {
      const MAXFLOW_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours - match frontend staleTime
      
      const cached = await db
        .select()
        .from(cachedMaxflowScores)
        .where(eq(cachedMaxflowScores.address, address.toLowerCase()))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const cacheAge = Date.now() - cached[0].updatedAt.getTime();
      const rawData = JSON.parse(cached[0].scoreData);
      const normalizedData = normalizeMaxFlowScore(rawData) as MaxFlowScore;
      
      // Mark as stale if cache is older than TTL, but still return the data
      if (cacheAge > MAXFLOW_CACHE_TTL_MS) {
        console.log(`[DB Cache] MaxFlow score stale for ${address} (age: ${Math.round(cacheAge / 1000 / 60)}min), returning with _stale flag`);
        return { ...normalizedData, _stale: true } as MaxFlowScore;
      }

      console.log(`[DB Cache] Returning fresh MaxFlow score for ${address} (age: ${Math.round(cacheAge / 1000)}s)`);
      return normalizedData;
    } catch (error) {
      console.error('[DB] Error fetching cached MaxFlow score:', error);
      return null;
    }
  }

  // Raw getter that bypasses staleness checks - used to preserve metadata when updating
  async getMaxFlowScoreRaw(address: string): Promise<MaxFlowScore | null> {
    try {
      const cached = await db
        .select()
        .from(cachedMaxflowScores)
        .where(eq(cachedMaxflowScores.address, address.toLowerCase()))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const rawData = JSON.parse(cached[0].scoreData);
      return normalizeMaxFlowScore(rawData) as MaxFlowScore;
    } catch (error) {
      console.error('[DB] Error fetching raw MaxFlow score:', error);
      return null;
    }
  }

  async saveMaxFlowScore(address: string, scoreData: MaxFlowScore): Promise<void> {
    try {
      // Normalize to snake_case before saving to ensure consistent format
      const normalizedData = normalizeMaxFlowScore(scoreData);
      
      await db
        .insert(cachedMaxflowScores)
        .values({
          address: address.toLowerCase(),
          scoreData: JSON.stringify(normalizedData),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: cachedMaxflowScores.address,
          set: {
            scoreData: JSON.stringify(normalizedData),
            updatedAt: new Date(),
          },
        });
      
      console.log(`[DB Cache] Saved MaxFlow score for ${address}`);
    } catch (error) {
      console.error('[DB] Error saving MaxFlow score:', error);
    }
  }

  async getBalanceHistory(address: string, chainId: number, days: number = 30): Promise<BalanceHistoryPoint[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const results = await db
        .select()
        .from(balanceHistory)
        .where(
          and(
            eq(balanceHistory.address, address),
            eq(balanceHistory.chainId, chainId)
          )
        )
        .orderBy(balanceHistory.timestamp);

      return results
        .filter(r => r.timestamp >= cutoffDate)
        .map(r => ({
          timestamp: r.timestamp.toISOString(),
          balance: r.balance,
        }));
    } catch (error) {
      console.error('[DB] Error fetching balance history:', error);
      return [];
    }
  }

  /**
   * Saves a balance snapshot to the history table. Only creates a new entry if the balance has changed.
   * @param balance - The balance in micro-USDC format (e.g., "1000000" = 1 USDC)
   */
  async saveBalanceSnapshot(address: string, chainId: number, balance: string): Promise<void> {
    try {
      // Check the most recent balance snapshot for this address/chain
      const recentSnapshot = await db
        .select()
        .from(balanceHistory)
        .where(
          and(
            eq(balanceHistory.address, address),
            eq(balanceHistory.chainId, chainId)
          )
        )
        .orderBy(desc(balanceHistory.timestamp))
        .limit(1);

      // Only save if balance has changed (or if this is the first snapshot)
      if (recentSnapshot.length > 0 && recentSnapshot[0].balance === balance) {
        console.log(`[DB] Balance unchanged for ${address}, skipping snapshot`);
        return;
      }

      await db.insert(balanceHistory).values({
        address,
        chainId,
        balance,
        timestamp: new Date(),
      });
      
      // Format for display (micro-USDC to USDC)
      const displayBalance = (parseFloat(balance) / 1e6).toFixed(2);
      console.log(`[DB] Saved balance snapshot for ${address}: ${displayBalance} USDC (${balance} micro-USDC)`);
    } catch (error) {
      console.error('[DB] Error saving balance snapshot:', error);
    }
  }

  async getInflationRate(currency: string): Promise<InflationData | null> {
    try {
      // Get exchange rates from the last 90 days for better accuracy
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

      const results = await db
        .select()
        .from(exchangeRates)
        .where(eq(exchangeRates.currency, currency.toUpperCase()))
        .orderBy(exchangeRates.date);

      const filteredResults = results.filter(r => r.date >= ninetyDaysAgoStr);

      if (filteredResults.length < 2) {
        console.log(`[Inflation] Not enough data to calculate inflation rate for ${currency}`);
        return null;
      }

      // Calculate daily changes
      const dailyChanges: number[] = [];
      for (let i = 1; i < filteredResults.length; i++) {
        const prevRate = parseFloat(filteredResults[i - 1].rate);
        const currentRate = parseFloat(filteredResults[i].rate);
        const change = ((currentRate - prevRate) / prevRate);
        dailyChanges.push(change);
      }

      // Calculate average daily rate
      const avgDailyRate = dailyChanges.reduce((sum, change) => sum + change, 0) / dailyChanges.length;
      
      // Convert to monthly and annual rates (compound)
      const monthlyRate = Math.pow(1 + avgDailyRate, 30) - 1;
      const annualRate = Math.pow(1 + avgDailyRate, 365) - 1;

      console.log(`[Inflation] ${currency}: Daily ${(avgDailyRate * 100).toFixed(4)}%, Monthly ${(monthlyRate * 100).toFixed(2)}%, Annual ${(annualRate * 100).toFixed(2)}% (based on ${filteredResults.length} days of data)`);

      return {
        currency: currency.toUpperCase(),
        dailyRate: avgDailyRate,
        monthlyRate,
        annualRate,
      };
    } catch (error) {
      console.error('[DB] Error calculating inflation rate:', error);
      return null;
    }
  }

  async backfillBalanceHistory(address: string, chainId: number): Promise<{ snapshotsCreated: number; finalBalance: string }> {
    try {
      console.log(`[Admin] Starting balance history reconstruction for ${address} on chain ${chainId}`);
      
      // Get current on-chain balance first
      const currentBalanceResult = await this.getBalance(address, chainId);
      if (!currentBalanceResult) {
        throw new Error('Failed to fetch current on-chain balance');
      }
      
      // Use the canonical micro-USDC integer directly
      const currentBalanceMicro = BigInt(currentBalanceResult.balanceMicro);
      console.log(`[Admin] Current on-chain balance: ${currentBalanceResult.balance} USDC (${currentBalanceMicro} micro-USDC)`);
      
      // Get all cached transactions for this address
      const transactions = await this.getTransactions(address, chainId);
      
      if (transactions.length === 0) {
        console.log(`[Admin] No transactions found for ${address}`);
        return { 
          snapshotsCreated: 0, 
          finalBalance: currentBalanceResult.balance 
        };
      }

      // Sort transactions by timestamp (newest first for backwards replay)
      const completedTxs = transactions
        .filter(tx => tx.status === 'completed')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      console.log(`[Admin] Processing ${completedTxs.length} completed transactions backwards from current balance`);

      let runningBalance = currentBalanceMicro;
      const snapshots: Array<{ balance: string; timestamp: Date }> = [];

      // Work backwards: for each transaction, calculate what the balance was BEFORE it
      for (const tx of completedTxs) {
        // Parse amount as micro-USDC integer, converting from legacy decimal if needed
        let amount: bigint;
        if (tx.amount.includes('.')) {
          // Legacy decimal format - convert to micro-USDC
          const parts = tx.amount.split('.');
          const whole = parts[0] || '0';
          const fraction = (parts[1] || '0').padEnd(6, '0').slice(0, 6);
          amount = BigInt(whole + fraction);
          console.log(`[Admin] Converted legacy amount "${tx.amount}" to micro-USDC: ${amount}`);
        } else {
          // Already in micro-USDC format
          amount = BigInt(tx.amount);
        }

        // Record balance AFTER this transaction (before going backwards)
        snapshots.push({
          balance: runningBalance.toString(),
          timestamp: new Date(tx.timestamp),
        });

        // Calculate balance BEFORE this transaction by reversing it
        if (tx.type === 'receive') {
          runningBalance -= amount; // Was lower before receiving
        } else if (tx.type === 'send') {
          runningBalance += amount; // Was higher before sending
        }
      }

      // Now insert snapshots in chronological order (oldest first)
      snapshots.reverse();
      let snapshotsCreated = 0;

      for (const snapshot of snapshots) {
        try {
          await db.insert(balanceHistory).values({
            address,
            chainId,
            balance: snapshot.balance,
            timestamp: snapshot.timestamp,
          });
          snapshotsCreated++;
        } catch (error) {
          // Skip duplicates
        }
      }

      const finalBalance = (Number(currentBalanceMicro) / 1e6).toFixed(6);
      console.log(`[Admin] Created ${snapshotsCreated} balance snapshots. Final balance: ${finalBalance} USDC`);

      // Validation: the oldest reconstructed balance should make sense
      if (runningBalance < 0) {
        console.warn(`[Admin] WARNING: Reconstructed oldest balance is negative (${runningBalance}). Transaction history may be incomplete.`);
      }

      return {
        snapshotsCreated,
        finalBalance,
      };
    } catch (error) {
      console.error('[Admin] Error backfilling balance history:', error);
      throw error;
    }
  }

  async backfillExchangeRates(): Promise<{ ratesAdded: number; currencies: string[] }> {
    try {
      console.log('[Admin] Starting exchange rate backfill from Currency API');
      
      const currencies = ['eur', 'gbp', 'jpy', 'ars', 'brl', 'mxn', 'ngn', 'kes', 'inr', 'cad', 'aud'];
      let ratesAdded = 0;

      // Fetch rates for the past 90 days
      const endDate = new Date();
      const dates: string[] = [];
      
      for (let i = 0; i <= 90; i++) {
        const date = new Date(endDate);
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }

      console.log(`[Admin] Fetching exchange rates for ${dates.length} days`);
      console.log(`[Admin] Date range: ${dates[dates.length - 1]} to ${dates[0]}`);

      // CDN URLs for fallback
      const getCdnUrls = (dateStr: string) => [
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`,
        `https://${dateStr}.currency-api.pages.dev/v1/currencies/usd.json`
      ];

      // Fetch data for each date
      for (const dateStr of dates) {
        try {
          let data = null;
          
          // Try both CDN endpoints
          for (const apiUrl of getCdnUrls(dateStr)) {
            try {
              const response = await fetch(apiUrl);
              if (response.ok) {
                data = await response.json();
                break;
              }
            } catch (e) {
              continue;
            }
          }

          if (!data || !data.usd) {
            console.warn(`[Admin] No data available for ${dateStr}, skipping`);
            continue;
          }

          // Insert rates for each currency
          for (const currency of currencies) {
            const rate = data.usd[currency];
            if (rate) {
              try {
                await db.insert(exchangeRates).values({
                  currency: currency.toUpperCase(),
                  rate: rate.toString(),
                  date: dateStr,
                  updatedAt: new Date(),
                }).onConflictDoUpdate({
                  target: [exchangeRates.currency, exchangeRates.date],
                  set: {
                    rate: rate.toString(),
                    updatedAt: new Date(),
                  },
                });
                
                ratesAdded++;
              } catch (error) {
                console.error(`[Admin] Error inserting rate for ${currency} on ${dateStr}:`, error);
              }
            }
          }
          
          // Small delay to avoid overwhelming the CDN
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[Admin] Error fetching data for ${dateStr}:`, error);
        }
      }

      console.log(`[Admin] Backfilled ${ratesAdded} exchange rate snapshots across ${dates.length} dates`);

      return {
        ratesAdded,
        currencies: currencies.map(c => c.toUpperCase()),
      };
    } catch (error) {
      console.error('[Admin] Error backfilling exchange rates:', error);
      throw error;
    }
  }

  async clearAllCaches(): Promise<void> {
    try {
      console.log('[Admin] Clearing all caches');
      
      await db.delete(cachedBalances);
      await db.delete(cachedTransactions);
      await db.delete(cachedMaxflowScores);
      
      console.log('[Admin] All caches cleared successfully');
    } catch (error) {
      console.error('[Admin] Error clearing caches:', error);
      throw error;
    }
  }

  async clearCachedBalances(): Promise<void> {
    try {
      console.log('[Admin] Clearing cached balances');
      await db.delete(cachedBalances);
      console.log('[Admin] Cached balances cleared successfully');
    } catch (error) {
      console.error('[Admin] Error clearing cached balances:', error);
      throw error;
    }
  }

  async clearCacheForAddress(address: string): Promise<void> {
    try {
      const normalizedAddress = address.toLowerCase();
      console.log(`[Refresh] Clearing cache for address: ${address}`);
      
      await db.delete(cachedBalances).where(
        sql`LOWER(${cachedBalances.address}) = ${normalizedAddress}`
      );
      await db.delete(cachedTransactions).where(
        sql`LOWER(${cachedTransactions.from}) = ${normalizedAddress} OR LOWER(${cachedTransactions.to}) = ${normalizedAddress}`
      );
      await db.delete(cachedMaxflowScores).where(
        sql`LOWER(${cachedMaxflowScores.address}) = ${normalizedAddress}`
      );
      
      console.log(`[Refresh] Cache cleared for address: ${address}`);
    } catch (error) {
      console.error(`[Refresh] Error clearing cache for ${address}:`, error);
      throw error;
    }
  }

  async clearBalanceHistory(): Promise<void> {
    try {
      console.log('[Admin] Clearing balance history');
      await db.delete(balanceHistory);
      console.log('[Admin] Balance history cleared successfully');
    } catch (error) {
      console.error('[Admin] Error clearing balance history:', error);
      throw error;
    }
  }

  async clearTransactionsAndBalances(): Promise<void> {
    try {
      console.log('[Admin] Clearing transactions and balances (preserving MaxFlow scores)');
      
      await db.delete(cachedBalances);
      await db.delete(cachedTransactions);
      
      console.log('[Admin] Transactions and balances cleared successfully');
    } catch (error) {
      console.error('[Admin] Error clearing transactions and balances:', error);
      throw error;
    }
  }

  async backfillAllWallets(): Promise<{ walletsProcessed: number; totalSnapshots: number; errors: string[] }> {
    try {
      console.log('[Admin] Starting backfill for all wallets');
      
      // Get all unique wallet addresses from the database
      const walletRecords = await db
        .select({ address: wallets.address })
        .from(wallets);
      
      console.log(`[Admin] Found ${walletRecords.length} wallets in database`);
      
      let walletsProcessed = 0;
      let totalSnapshots = 0;
      const errors: string[] = [];
      const chains = [42220, 8453]; // Celo and Base
      
      for (const wallet of walletRecords) {
        const address = wallet.address;
        console.log(`[Admin] Processing wallet ${address}`);
        
        let walletSucceeded = false;
        for (const chainId of chains) {
          try {
            const result = await this.backfillBalanceHistory(address, chainId);
            totalSnapshots += result.snapshotsCreated;
            walletSucceeded = true;
            console.log(`[Admin] ${address} on chain ${chainId}: ${result.snapshotsCreated} snapshots, final balance: ${result.finalBalance}`);
          } catch (error: any) {
            const errorMsg = `${address} on chain ${chainId}: ${error.message}`;
            console.error(`[Admin] Error: ${errorMsg}`);
            errors.push(errorMsg);
          }
        }
        
        // After processing both chains, reconstruct aggregated snapshots
        if (walletSucceeded) {
          try {
            const aggregatedCount = await this.reconstructAggregatedHistory(address);
            totalSnapshots += aggregatedCount;
            console.log(`[Admin] ${address}: Created ${aggregatedCount} aggregated snapshots`);
          } catch (error: any) {
            const errorMsg = `${address} aggregation: ${error.message}`;
            console.error(`[Admin] Error: ${errorMsg}`);
            errors.push(errorMsg);
          }
          walletsProcessed++;
        }
      }
      
      console.log(`[Admin] Backfill complete: ${walletsProcessed} wallets, ${totalSnapshots} total snapshots, ${errors.length} errors`);
      
      return {
        walletsProcessed,
        totalSnapshots,
        errors,
      };
    } catch (error) {
      console.error('[Admin] Error during bulk backfill:', error);
      throw error;
    }
  }

  private async reconstructAggregatedHistory(address: string): Promise<number> {
    try {
      console.log(`[Admin] Reconstructing aggregated balance history for ${address}`);
      
      // Get all unique timestamps from both chains
      const baseSnapshots = await db
        .select()
        .from(balanceHistory)
        .where(and(eq(balanceHistory.address, address), eq(balanceHistory.chainId, 8453)))
        .orderBy(balanceHistory.timestamp);
      
      const celoSnapshots = await db
        .select()
        .from(balanceHistory)
        .where(and(eq(balanceHistory.address, address), eq(balanceHistory.chainId, 42220)))
        .orderBy(balanceHistory.timestamp);
      
      // Collect all unique timestamps
      const timestampSet = new Set<number>();
      baseSnapshots.forEach(s => timestampSet.add(s.timestamp.getTime()));
      celoSnapshots.forEach(s => timestampSet.add(s.timestamp.getTime()));
      
      const timestamps = Array.from(timestampSet).sort((a, b) => a - b);
      
      if (timestamps.length === 0) {
        console.log(`[Admin] No snapshots found for ${address}`);
        return 0;
      }
      
      // Create maps for quick lookup
      const baseMap = new Map(baseSnapshots.map(s => [s.timestamp.getTime(), BigInt(s.balance)]));
      const celoMap = new Map(celoSnapshots.map(s => [s.timestamp.getTime(), BigInt(s.balance)]));
      
      // For each timestamp, calculate the total balance using forward-fill
      let lastBaseBalance = 0n;
      let lastCeloBalance = 0n;
      let snapshotsCreated = 0;
      
      for (const ts of timestamps) {
        // Update balances if we have new data at this timestamp
        if (baseMap.has(ts)) {
          lastBaseBalance = baseMap.get(ts)!;
        }
        if (celoMap.has(ts)) {
          lastCeloBalance = celoMap.get(ts)!;
        }
        
        const totalBalance = lastBaseBalance + lastCeloBalance;
        
        // Save aggregated snapshot (chainId=0)
        try {
          await db.insert(balanceHistory).values({
            address,
            chainId: 0,
            balance: totalBalance.toString(),
            timestamp: new Date(ts),
          });
          snapshotsCreated++;
        } catch (error) {
          // Skip duplicates
        }
      }
      
      console.log(`[Admin] Created ${snapshotsCreated} aggregated snapshots for ${address}`);
      return snapshotsCreated;
    } catch (error) {
      console.error('[Admin] Error reconstructing aggregated history:', error);
      throw error;
    }
  }

  async migrateToMicroUsdc(): Promise<{ migratedTransactions: number; migratedBalances: number }> {
    try {
      console.log('[Admin] Starting micro-USDC migration');
      
      // Migrate cached_transactions: convert decimal amounts to micro-USDC integers
      // Only convert values that look like decimals (contain a decimal point)
      const txResult = await db.execute(sql`
        UPDATE cached_transactions
        SET amount = CAST(CAST(amount AS NUMERIC) * 1000000 AS TEXT)
        WHERE amount ~ '^[0-9]+\.[0-9]+$'
      `);
      
      // Migrate cached_balances: convert decimal balances to micro-USDC integers
      // Only convert values that look like decimals (contain a decimal point)
      const balanceResult = await db.execute(sql`
        UPDATE cached_balances
        SET balance = CAST(CAST(balance AS NUMERIC) * 1000000 AS TEXT)
        WHERE balance ~ '^[0-9]+\.[0-9]+$'
      `);
      
      const migratedTransactions = txResult.rowCount ?? 0;
      const migratedBalances = balanceResult.rowCount ?? 0;
      
      console.log(`[Admin] Migration complete: ${migratedTransactions} transactions, ${migratedBalances} balances`);
      
      return {
        migratedTransactions,
        migratedBalances,
      };
    } catch (error) {
      console.error('[Admin] Error during micro-USDC migration:', error);
      throw error;
    }
  }

  async pruneOldBalanceHistory(): Promise<{ deletedSnapshots: number }> {
    try {
      console.log('[Admin] Pruning old balance history');
      
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await db
        .delete(balanceHistory)
        .where(sql`${balanceHistory.timestamp} < ${ninetyDaysAgo}`);
      
      // Drizzle doesn't return row count, so we'll return 0 for now
      console.log('[Admin] Old balance history pruned');

      return {
        deletedSnapshots: 0,
      };
    } catch (error) {
      console.error('[Admin] Error pruning old data:', error);
      throw error;
    }
  }

  async getAdminStats(): Promise<{
    totalWallets: number;
    totalTransactions: number;
    cachedBalances: number;
    exchangeRateSnapshots: number;
    balanceHistoryPoints: number;
  }> {
    try {
      const [walletsResult] = await db.select({ count: sql<number>`count(*)` }).from(wallets);
      const [txResult] = await db.select({ count: sql<number>`count(*)` }).from(cachedTransactions);
      const [balancesResult] = await db.select({ count: sql<number>`count(*)` }).from(cachedBalances);
      const [ratesResult] = await db.select({ count: sql<number>`count(*)` }).from(exchangeRates);
      const [historyResult] = await db.select({ count: sql<number>`count(*)` }).from(balanceHistory);

      return {
        totalWallets: Number(walletsResult.count),
        totalTransactions: Number(txResult.count),
        cachedBalances: Number(balancesResult.count),
        exchangeRateSnapshots: Number(ratesResult.count),
        balanceHistoryPoints: Number(historyResult.count),
      };
    } catch (error) {
      console.error('[Admin] Error fetching stats:', error);
      throw error;
    }
  }

  async getAllWalletsWithDetails(): Promise<Array<{
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
  }>> {
    try {
      const allWallets = await db.select().from(wallets).orderBy(desc(wallets.lastSeen));
      
      const results = await Promise.all(allWallets.map(async (wallet) => {
        const normalizedAddress = wallet.address.toLowerCase();
        
        // Use case-insensitive matching for cached balances
        const balanceData = await db
          .select()
          .from(cachedBalances)
          .where(sql`LOWER(${cachedBalances.address}) = ${normalizedAddress}`);
        
        const balanceByChain = { base: '0', celo: '0', gnosis: '0', arbitrum: '0' };
        const aUsdcByChain = { base: '0', celo: '0', gnosis: '0', arbitrum: '0' };
        let totalBalance = BigInt(0);
        let totalAUsdcBalance = BigInt(0);
        
        for (const b of balanceData) {
          const balanceStr = b.balance || '0';
          const amount = BigInt(balanceStr);
          
          if (b.chainId > 0) {
            totalBalance += amount;
            if (b.chainId === 8453) balanceByChain.base = balanceStr;
            else if (b.chainId === 42220) balanceByChain.celo = balanceStr;
            else if (b.chainId === 100) balanceByChain.gnosis = balanceStr;
            else if (b.chainId === 42161) balanceByChain.arbitrum = balanceStr;
          } else {
            totalAUsdcBalance += amount;
            if (b.chainId === -8453) aUsdcByChain.base = balanceStr;
            else if (b.chainId === -42220) aUsdcByChain.celo = balanceStr;
            else if (b.chainId === -100) aUsdcByChain.gnosis = balanceStr;
            else if (b.chainId === -42161) aUsdcByChain.arbitrum = balanceStr;
          }
        }
        
        // Use case-insensitive matching for transactions
        const txData = await db
          .select({
            count: sql<number>`count(*)`,
            volume: sql<string>`COALESCE(SUM(CAST(amount AS BIGINT)), 0)`,
          })
          .from(cachedTransactions)
          .where(
            or(
              sql`LOWER(${cachedTransactions.from}) = ${normalizedAddress}`,
              sql`LOWER(${cachedTransactions.to}) = ${normalizedAddress}`
            )
          );
        
        const transferCount = Number(txData[0]?.count || 0);
        const totalVolume = txData[0]?.volume || '0';
        
        const savingsBalance = totalAUsdcBalance.toString();
        
        // Use case-insensitive matching for pool settings
        const poolData = await db
          .select()
          .from(poolSettings)
          .where(sql`LOWER(${poolSettings.walletAddress}) = ${normalizedAddress}`)
          .limit(1);
        
        const poolOptInPercent = poolData[0]?.optInPercent || 0;
        const poolApproved = poolData[0]?.facilitatorApproved || false;
        
        // Use case-insensitive matching for maxflow scores
        const maxflowData = await db
          .select()
          .from(cachedMaxflowScores)
          .where(sql`LOWER(${cachedMaxflowScores.address}) = ${normalizedAddress}`)
          .limit(1);
        
        let maxFlowScore: number | null = null;
        if (maxflowData.length > 0) {
          try {
            const scoreData = JSON.parse(maxflowData[0].scoreData);
            maxFlowScore = scoreData.local_health || null;
          } catch {
            maxFlowScore = null;
          }
        }
        
        // Check GoodDollar verification status
        const gdIdentity = await db
          .select()
          .from(gooddollarIdentities)
          .where(sql`LOWER(${gooddollarIdentities.walletAddress}) = ${normalizedAddress}`)
          .limit(1);
        
        const isGoodDollarVerified = gdIdentity.length > 0 && gdIdentity[0].isWhitelisted && !gdIdentity[0].isExpired;
        
        // Fetch G$ balance from cache
        const gdBalanceData = await db
          .select()
          .from(cachedGdBalances)
          .where(sql`LOWER(${cachedGdBalances.address}) = ${normalizedAddress}`)
          .limit(1);
        
        const gdBalance = gdBalanceData[0]?.balance || '0';
        const gdBalanceFormatted = gdBalanceData[0]?.balanceFormatted || '0.00';
        
        return {
          address: wallet.address,
          createdAt: wallet.createdAt.toISOString(),
          lastSeen: wallet.lastSeen.toISOString(),
          totalBalance: totalBalance.toString(),
          balanceByChain,
          aUsdcBalance: totalAUsdcBalance.toString(),
          aUsdcByChain,
          transferCount,
          totalVolume,
          savingsBalance,
          poolOptInPercent,
          poolApproved,
          maxFlowScore,
          isGoodDollarVerified,
          gdBalance,
          gdBalanceFormatted,
        };
      }));
      
      return results;
    } catch (error) {
      console.error('[Admin] Error fetching wallet details:', error);
      throw error;
    }
  }

  async getRecentActivity(): Promise<Array<{
    txHash: string;
    from: string;
    to: string;
    amount: string;
    timestamp: string;
    chainId: number;
  }>> {
    try {
      const results = await db
        .select()
        .from(cachedTransactions)
        .orderBy(desc(cachedTransactions.timestamp))
        .limit(20);

      return results.map(tx => ({
        txHash: tx.txHash,
        from: tx.from,
        to: tx.to,
        amount: tx.amount,
        timestamp: tx.timestamp.toISOString(),
        chainId: tx.chainId,
      }));
    } catch (error) {
      console.error('[Admin] Error fetching recent activity:', error);
      throw error;
    }
  }

  async getRecentGasDrips(address: string, chainId: number, since: Date): Promise<GasDrip[]> {
    try {
      const results = await db
        .select()
        .from(gasDrips)
        .where(
          and(
            eq(gasDrips.address, address.toLowerCase()),
            eq(gasDrips.chainId, chainId),
            gte(gasDrips.createdAt, since)
          )
        )
        .orderBy(desc(gasDrips.createdAt));

      return results.map(drip => ({
        id: drip.id,
        address: drip.address,
        chainId: drip.chainId,
        amount: drip.amount,
        txHash: drip.txHash,
        status: drip.status,
        createdAt: drip.createdAt,
      }));
    } catch (error) {
      console.error('[GasDrip] Error fetching recent drips:', error);
      return [];
    }
  }

  async createGasDrip(drip: { address: string; chainId: number; amount: string; status: string }): Promise<GasDrip> {
    try {
      const [result] = await db
        .insert(gasDrips)
        .values({
          address: drip.address.toLowerCase(),
          chainId: drip.chainId,
          amount: drip.amount,
          status: drip.status,
        })
        .returning();

      return {
        id: result.id,
        address: result.address,
        chainId: result.chainId,
        amount: result.amount,
        txHash: result.txHash,
        status: result.status,
        createdAt: result.createdAt,
      };
    } catch (error) {
      console.error('[GasDrip] Error creating drip record:', error);
      throw error;
    }
  }

  async updateGasDrip(id: string, update: { status?: string; txHash?: string }): Promise<void> {
    try {
      await db
        .update(gasDrips)
        .set({
          ...(update.status && { status: update.status }),
          ...(update.txHash && { txHash: update.txHash }),
        })
        .where(eq(gasDrips.id, id));
    } catch (error) {
      console.error('[GasDrip] Error updating drip record:', error);
      throw error;
    }
  }

  async createAaveOperation(op: {
    userAddress: string;
    chainId: number;
    operationType: 'supply' | 'withdraw';
    amount: string;
    status: string;
    step?: string;
  }): Promise<AaveOperation> {
    try {
      const [result] = await db
        .insert(aaveOperations)
        .values({
          userAddress: op.userAddress.toLowerCase(),
          chainId: op.chainId,
          operationType: op.operationType,
          amount: op.amount,
          status: op.status,
          step: op.step,
        })
        .returning();
      console.log('[AaveOps] Created operation record:', result.id);
      return result;
    } catch (error) {
      console.error('[AaveOps] Error creating operation record:', error);
      throw error;
    }
  }

  async updateAaveOperation(id: string, update: Partial<{
    status: string;
    step: string;
    transferTxHash: string;
    approveTxHash: string;
    supplyTxHash: string;
    withdrawTxHash: string;
    refundTxHash: string;
    errorMessage: string;
    retryCount: number;
    resolvedAt: Date;
    resolvedBy: string;
  }>): Promise<void> {
    try {
      await db
        .update(aaveOperations)
        .set({
          ...update,
          updatedAt: new Date(),
        })
        .where(eq(aaveOperations.id, id));
    } catch (error) {
      console.error('[AaveOps] Error updating operation record:', error);
      throw error;
    }
  }

  async getAaveOperation(id: string): Promise<AaveOperation | null> {
    try {
      const [result] = await db
        .select()
        .from(aaveOperations)
        .where(eq(aaveOperations.id, id))
        .limit(1);
      return result || null;
    } catch (error) {
      console.error('[AaveOps] Error fetching operation:', error);
      return null;
    }
  }

  async getPendingAaveOperations(): Promise<AaveOperation[]> {
    try {
      return await db
        .select()
        .from(aaveOperations)
        .where(
          or(
            eq(aaveOperations.status, 'pending'),
            eq(aaveOperations.status, 'transferring'),
            eq(aaveOperations.status, 'approving'),
            eq(aaveOperations.status, 'supplying')
          )
        )
        .orderBy(desc(aaveOperations.createdAt));
    } catch (error) {
      console.error('[AaveOps] Error fetching pending operations:', error);
      return [];
    }
  }

  async getFailedAaveOperations(): Promise<AaveOperation[]> {
    try {
      return await db
        .select()
        .from(aaveOperations)
        .where(
          or(
            eq(aaveOperations.status, 'failed'),
            eq(aaveOperations.status, 'refund_failed')
          )
        )
        .orderBy(desc(aaveOperations.createdAt));
    } catch (error) {
      console.error('[AaveOps] Error fetching failed operations:', error);
      return [];
    }
  }

  async getAaveNetPrincipal(userAddress: string): Promise<{ chainId: number; netPrincipalMicro: string; trackingStarted: string | null }[]> {
    const chainIds = [8453, 42220, 100, 42161]; // Base, Celo, Gnosis, Arbitrum
    const results: { chainId: number; netPrincipalMicro: string; trackingStarted: string | null }[] = [];
    const normalizedAddress = userAddress.toLowerCase();

    for (const chainId of chainIds) {
      try {
        // Query using case-insensitive comparison via sql lower()
        const operations = await db
          .select()
          .from(aaveOperations)
          .where(
            and(
              sql`lower(${aaveOperations.userAddress}) = ${normalizedAddress}`,
              eq(aaveOperations.chainId, chainId),
              eq(aaveOperations.status, 'completed')
            )
          )
          .orderBy(aaveOperations.createdAt);

        let netPrincipal = 0n;
        let trackingStarted: string | null = null;

        for (const op of operations) {
          const amount = BigInt(op.amount);
          if (op.operationType === 'supply') {
            netPrincipal += amount;
          } else if (op.operationType === 'withdraw') {
            netPrincipal -= amount;
          }
          if (!trackingStarted && op.createdAt) {
            trackingStarted = op.createdAt.toISOString();
          }
        }

        results.push({
          chainId,
          netPrincipalMicro: netPrincipal.toString(),
          trackingStarted,
        });
      } catch (error) {
        console.error(`[AaveOps] Error calculating net principal for chain ${chainId}:`, error);
        // Always return an entry for each chain, even on error
        results.push({
          chainId,
          netPrincipalMicro: '0',
          trackingStarted: null,
        });
      }
    }

    return results;
  }

  // ===== POOL (Prize-Linked Savings) METHODS =====

  async getPoolSettings(walletAddress: string): Promise<PoolSettings | null> {
    try {
      const result = await db
        .select()
        .from(poolSettings)
        .where(eq(poolSettings.walletAddress, walletAddress.toLowerCase()))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('[Pool] Error getting settings:', error);
      return null;
    }
  }

  async upsertPoolSettings(walletAddress: string, optInPercent: number): Promise<void> {
    try {
      const existing = await this.getPoolSettings(walletAddress);
      if (existing) {
        await db
          .update(poolSettings)
          .set({ optInPercent, updatedAt: new Date() })
          .where(eq(poolSettings.walletAddress, walletAddress.toLowerCase()));
      } else {
        await db.insert(poolSettings).values({
          walletAddress: walletAddress.toLowerCase(),
          optInPercent,
        });
      }
    } catch (error) {
      console.error('[Pool] Error upserting settings:', error);
      throw error;
    }
  }

  async updateFacilitatorApproval(walletAddress: string, approved: boolean, txHash?: string): Promise<void> {
    try {
      await db
        .update(poolSettings)
        .set({ 
          facilitatorApproved: approved, 
          approvalTxHash: txHash || null,
          updatedAt: new Date() 
        })
        .where(eq(poolSettings.walletAddress, walletAddress.toLowerCase()));
    } catch (error) {
      console.error('[Pool] Error updating facilitator approval:', error);
      throw error;
    }
  }

  async getApprovedParticipants(): Promise<PoolSettings[]> {
    try {
      return await db
        .select()
        .from(poolSettings)
        .where(and(
          gt(poolSettings.optInPercent, 0),
          eq(poolSettings.facilitatorApproved, true)
        ));
    } catch (error) {
      console.error('[Pool] Error getting approved participants:', error);
      return [];
    }
  }

  async getAllPoolSettings(): Promise<PoolSettings[]> {
    try {
      return await db.select().from(poolSettings);
    } catch (error) {
      console.error('[Pool] Error getting all settings:', error);
      return [];
    }
  }

  async getOptedInParticipantCount(): Promise<number> {
    try {
      const settings = await db.select().from(poolSettings).where(gt(poolSettings.optInPercent, 0));
      return settings.length;
    } catch (error) {
      console.error('[Pool] Error getting opted-in participant count:', error);
      return 0;
    }
  }

  async getPoolDraw(weekNumber: number, year: number): Promise<PoolDraw | null> {
    try {
      const result = await db
        .select()
        .from(poolDraws)
        .where(and(
          eq(poolDraws.weekNumber, weekNumber),
          eq(poolDraws.year, year)
        ))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('[Pool] Error getting draw:', error);
      return null;
    }
  }

  async createPoolDraw(data: { weekNumber: number; year: number; weekStart: Date; weekEnd: Date }): Promise<PoolDraw> {
    try {
      const result = await db
        .insert(poolDraws)
        .values({
          weekNumber: data.weekNumber,
          year: data.year,
          weekStart: data.weekStart,
          weekEnd: data.weekEnd,
        })
        .returning();
      return result[0];
    } catch (error) {
      console.error('[Pool] Error creating draw:', error);
      throw error;
    }
  }

  async getPoolDrawHistory(limit: number): Promise<PoolDraw[]> {
    try {
      return await db
        .select()
        .from(poolDraws)
        .where(eq(poolDraws.status, 'completed'))
        .orderBy(desc(poolDraws.drawnAt))
        .limit(limit);
    } catch (error) {
      console.error('[Pool] Error getting draw history:', error);
      return [];
    }
  }

  async completeDraw(drawId: string, data: { 
    winnerAddress: string; 
    winnerTickets: string; 
    winningNumber: string; 
    totalPool?: string;
    totalTickets?: string;
  }): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        status: 'completed',
        winnerAddress: data.winnerAddress,
        winnerTickets: data.winnerTickets,
        winningNumber: data.winningNumber,
        drawnAt: new Date(),
      };
      
      // Optionally update final pool and ticket totals (calculated at draw time)
      if (data.totalPool) updateData.totalPool = data.totalPool;
      if (data.totalTickets) updateData.totalTickets = data.totalTickets;
      
      await db
        .update(poolDraws)
        .set(updateData)
        .where(eq(poolDraws.id, drawId));
    } catch (error) {
      console.error('[Pool] Error completing draw:', error);
      throw error;
    }
  }

  async getPoolContribution(drawId: string, walletAddress: string): Promise<PoolContribution | null> {
    try {
      const result = await db
        .select()
        .from(poolContributions)
        .where(and(
          eq(poolContributions.drawId, drawId),
          eq(poolContributions.walletAddress, walletAddress.toLowerCase())
        ))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('[Pool] Error getting contribution:', error);
      return null;
    }
  }

  async getPoolContributionsForDraw(drawId: string): Promise<PoolContribution[]> {
    try {
      return await db
        .select()
        .from(poolContributions)
        .where(eq(poolContributions.drawId, drawId));
    } catch (error) {
      console.error('[Pool] Error getting contributions for draw:', error);
      return [];
    }
  }

  async addPoolContribution(drawId: string, walletAddress: string, amount: string): Promise<void> {
    try {
      const existing = await this.getPoolContribution(drawId, walletAddress);
      if (existing) {
        const newYield = (BigInt(existing.yieldContributed) + BigInt(amount)).toString();
        const newTotal = (BigInt(newYield) + BigInt(existing.referralBonusTickets)).toString();
        await db
          .update(poolContributions)
          .set({ 
            yieldContributed: newYield, 
            totalTickets: newTotal,
            updatedAt: new Date() 
          })
          .where(eq(poolContributions.id, existing.id));
      } else {
        await db.insert(poolContributions).values({
          drawId,
          walletAddress: walletAddress.toLowerCase(),
          yieldContributed: amount,
          totalTickets: amount,
        });
      }
    } catch (error) {
      console.error('[Pool] Error adding contribution:', error);
      throw error;
    }
  }

  async addReferralBonus(drawId: string, referrerAddress: string, bonusAmount: string): Promise<void> {
    try {
      const existing = await this.getPoolContribution(drawId, referrerAddress);
      if (existing) {
        const newBonus = (BigInt(existing.referralBonusTickets) + BigInt(bonusAmount)).toString();
        const newTotal = (BigInt(existing.yieldContributed) + BigInt(newBonus)).toString();
        await db
          .update(poolContributions)
          .set({ 
            referralBonusTickets: newBonus, 
            totalTickets: newTotal,
            updatedAt: new Date() 
          })
          .where(eq(poolContributions.id, existing.id));
      } else {
        await db.insert(poolContributions).values({
          drawId,
          walletAddress: referrerAddress.toLowerCase(),
          referralBonusTickets: bonusAmount,
          totalTickets: bonusAmount,
        });
      }
    } catch (error) {
      console.error('[Pool] Error adding referral bonus:', error);
      throw error;
    }
  }

  async updateDrawTotals(drawId: string): Promise<void> {
    try {
      const contributions = await this.getPoolContributionsForDraw(drawId);
      
      let totalPool = 0n;
      let totalTickets = 0n;
      
      for (const c of contributions) {
        totalPool += BigInt(c.yieldContributed);
        totalTickets += BigInt(c.totalTickets);
      }
      
      await db
        .update(poolDraws)
        .set({
          totalPool: totalPool.toString(),
          totalTickets: totalTickets.toString(),
          participantCount: contributions.length,
        })
        .where(eq(poolDraws.id, drawId));
    } catch (error) {
      console.error('[Pool] Error updating draw totals:', error);
      throw error;
    }
  }

  async getReferralsByReferrer(referrerAddress: string): Promise<Referral[]> {
    try {
      return await db
        .select()
        .from(referrals)
        .where(eq(referrals.referrerAddress, referrerAddress.toLowerCase()));
    } catch (error) {
      console.error('[Pool] Error getting referrals:', error);
      return [];
    }
  }

  async getAllReferrals(): Promise<Referral[]> {
    try {
      return await db.select().from(referrals);
    } catch (error) {
      console.error('[Pool] Error getting all referrals:', error);
      return [];
    }
  }

  async getReferralByReferee(refereeAddress: string): Promise<Referral | null> {
    try {
      const result = await db
        .select()
        .from(referrals)
        .where(eq(referrals.refereeAddress, refereeAddress.toLowerCase()))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('[Pool] Error getting referral by referee:', error);
      return null;
    }
  }

  async createReferral(data: { referrerAddress: string; refereeAddress: string; referralCode: string }): Promise<void> {
    try {
      await db.insert(referrals).values({
        referrerAddress: data.referrerAddress.toLowerCase(),
        refereeAddress: data.refereeAddress.toLowerCase(),
        referralCode: data.referralCode,
      });
    } catch (error) {
      console.error('[Pool] Error creating referral:', error);
      throw error;
    }
  }

  async findAddressByReferralCode(code: string): Promise<string | null> {
    try {
      // Referral code is first 8 chars of address (without 0x prefix)
      // We need to find a wallet that has been seen in the system
      const pattern = `0x${code.toLowerCase()}%`;
      const result = await db
        .select()
        .from(wallets)
        .where(sql`lower(${wallets.address}) LIKE ${pattern}`)
        .limit(1);
      return result[0]?.address || null;
    } catch (error) {
      console.error('[Pool] Error finding address by referral code:', error);
      return null;
    }
  }

  // ===== POOL YIELD SNAPSHOTS =====

  async getYieldSnapshot(walletAddress: string): Promise<PoolYieldSnapshot | null> {
    try {
      const result = await db
        .select()
        .from(poolYieldSnapshots)
        .where(eq(poolYieldSnapshots.walletAddress, walletAddress.toLowerCase()))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('[Pool] Error getting yield snapshot:', error);
      return null;
    }
  }

  async upsertYieldSnapshot(walletAddress: string, data: {
    lastAusdcBalance?: string;
    lastCollectedAt?: Date;
    totalYieldCollected?: string;
    // Net deposits tracking for interest calculation
    netDeposits?: string;
    // Weekly yield tracking - stores accrued yield at last draw
    snapshotYield?: string;
    weekNumber?: number;
    year?: number;
    isFirstWeek?: boolean;
  }): Promise<void> {
    try {
      const existing = await this.getYieldSnapshot(walletAddress);
      if (existing) {
        await db
          .update(poolYieldSnapshots)
          .set({
            ...(data.lastAusdcBalance !== undefined && { lastAusdcBalance: data.lastAusdcBalance }),
            lastCollectedAt: data.lastCollectedAt || new Date(),
            totalYieldCollected: data.totalYieldCollected || existing.totalYieldCollected,
            // Update net deposits if provided
            ...(data.netDeposits !== undefined && { netDeposits: data.netDeposits }),
            // Update weekly tracking fields if provided
            ...(data.snapshotYield !== undefined && { snapshotYield: data.snapshotYield }),
            ...(data.weekNumber !== undefined && { weekNumber: data.weekNumber }),
            ...(data.year !== undefined && { year: data.year }),
            ...(data.isFirstWeek !== undefined && { isFirstWeek: data.isFirstWeek }),
            updatedAt: new Date(),
          })
          .where(eq(poolYieldSnapshots.walletAddress, walletAddress.toLowerCase()));
      } else {
        await db.insert(poolYieldSnapshots).values({
          walletAddress: walletAddress.toLowerCase(),
          lastAusdcBalance: data.lastAusdcBalance || '0',
          lastCollectedAt: data.lastCollectedAt || new Date(),
          totalYieldCollected: data.totalYieldCollected || '0',
          netDeposits: data.netDeposits || '0',
          snapshotYield: data.snapshotYield || '0',
          weekNumber: data.weekNumber,
          year: data.year,
          isFirstWeek: data.isFirstWeek ?? true,
        });
      }
    } catch (error) {
      console.error('[Pool] Error upserting yield snapshot:', error);
      throw error;
    }
  }

  async getAllYieldSnapshots(): Promise<PoolYieldSnapshot[]> {
    try {
      return await db.select().from(poolYieldSnapshots);
    } catch (error) {
      console.error('[Pool] Error getting all yield snapshots:', error);
      return [];
    }
  }

  async getYieldSnapshotsWithOptIn(): Promise<Array<PoolYieldSnapshot & { optInPercent: number }>> {
    try {
      const snapshots = await this.getAllYieldSnapshots();
      const result: Array<PoolYieldSnapshot & { optInPercent: number }> = [];
      
      for (const snapshot of snapshots) {
        const settings = await this.getPoolSettings(snapshot.walletAddress);
        if (settings && settings.optInPercent > 0) {
          result.push({
            ...snapshot,
            optInPercent: settings.optInPercent,
          });
        }
      }
      
      return result;
    } catch (error) {
      console.error('[Pool] Error getting yield snapshots with opt-in:', error);
      return [];
    }
  }

  // ===== ANALYTICS METHODS =====

  async getAnalyticsOverview(): Promise<{
    totalWallets: number;
    activeWallets: number;
    totalTransactions: number;
    totalVolumeUsd: string;
    poolParticipants: number;
    totalYieldCollected: string;
  }> {
    try {
      const [walletsResult] = await db.select({ count: sql<number>`count(*)` }).from(wallets);
      
      // Count ALL transaction types for comprehensive metric
      const [usdcTxResult] = await db.select({ count: sql<number>`count(*)` }).from(cachedTransactions);
      const [gasDripResult] = await db.select({ count: sql<number>`count(*)` }).from(gasDrips);
      const [aaveOpsResult] = await db.select({ count: sql<number>`count(*)` }).from(aaveOperations);
      const [gdClaimsResult] = await db.select({ count: sql<number>`count(*)` }).from(gooddollarClaims);
      
      const totalTransactions = 
        Number(usdcTxResult?.count || 0) + 
        Number(gasDripResult?.count || 0) + 
        Number(aaveOpsResult?.count || 0) + 
        Number(gdClaimsResult?.count || 0);
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [activeResult] = await db.select({ count: sql<number>`count(*)` })
        .from(wallets)
        .where(gte(wallets.lastSeen, thirtyDaysAgo));
      
      const volumeResult = await db.select({ total: sql<string>`COALESCE(SUM(CAST(amount AS NUMERIC)), 0)` })
        .from(cachedTransactions);
      
      const [poolResult] = await db.select({ count: sql<number>`count(*)` })
        .from(poolSettings)
        .where(sql`opt_in_percent > 0`);
      
      const yieldResult = await db.select({ total: sql<string>`COALESCE(SUM(CAST(total_yield_collected AS NUMERIC)), 0)` })
        .from(poolYieldSnapshots);

      return {
        totalWallets: Number(walletsResult.count),
        activeWallets: Number(activeResult.count),
        totalTransactions,
        totalVolumeUsd: volumeResult[0]?.total || '0',
        poolParticipants: Number(poolResult.count),
        totalYieldCollected: yieldResult[0]?.total || '0',
      };
    } catch (error) {
      console.error('[Analytics] Error getting overview:', error);
      return {
        totalWallets: 0,
        activeWallets: 0,
        totalTransactions: 0,
        totalVolumeUsd: '0',
        poolParticipants: 0,
        totalYieldCollected: '0',
      };
    }
  }

  async getXpAnalytics(): Promise<{
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
  }> {
    try {
      // Total XP distributed (in centi-XP, divide by 100 for display)
      const [xpTotalResult] = await db.select({ 
        total: sql<string>`COALESCE(SUM(total_xp), 0)`,
        count: sql<number>`count(*)`
      }).from(xpBalances);
      
      const totalXpCenti = Number(xpTotalResult?.total || 0);
      const activeXpUsers = Number(xpTotalResult?.count || 0);
      
      // XP from MaxFlow claims (xpClaims table stores MaxFlow-sourced XP)
      const [maxflowXpResult] = await db.select({ 
        total: sql<string>`COALESCE(SUM(xp_amount), 0)`,
        count: sql<number>`count(*)`
      }).from(xpClaims);
      
      const xpFromMaxFlow = Number(maxflowXpResult?.total || 0);
      const totalXpClaims = Number(maxflowXpResult?.count || 0);
      
      // AI chat usage - count users with conversations and estimate messages
      const [aiResult] = await db.select({ count: sql<number>`count(*)` }).from(aiConversations);
      const aiChatUsers = Number(aiResult?.count || 0);
      
      // Estimate total AI messages by parsing messages JSON
      let aiChatMessages = 0;
      try {
        const conversations = await db.select({ messages: aiConversations.messages }).from(aiConversations);
        for (const conv of conversations) {
          try {
            const msgs = JSON.parse(conv.messages || '[]');
            // Count only user messages (each costs 1 XP)
            aiChatMessages += msgs.filter((m: any) => m.role === 'user').length;
          } catch {}
        }
      } catch {}
      
      const avgXpPerUser = activeXpUsers > 0 ? totalXpCenti / activeXpUsers : 0;
      
      return {
        totalXpDistributed: totalXpCenti,
        totalXpDistributedFormatted: (totalXpCenti / 100).toFixed(2),
        activeXpUsers,
        xpFromMaxFlow,
        xpFromMaxFlowFormatted: (xpFromMaxFlow / 100).toFixed(2),
        totalXpClaims,
        aiChatUsers,
        aiChatMessages,
        avgXpPerUser: Math.round(avgXpPerUser),
        avgXpPerUserFormatted: (avgXpPerUser / 100).toFixed(2),
      };
    } catch (error) {
      console.error('[Analytics] Error getting XP analytics:', error);
      return {
        totalXpDistributed: 0,
        totalXpDistributedFormatted: '0.00',
        activeXpUsers: 0,
        xpFromMaxFlow: 0,
        xpFromMaxFlowFormatted: '0.00',
        totalXpClaims: 0,
        aiChatUsers: 0,
        aiChatMessages: 0,
        avgXpPerUser: 0,
        avgXpPerUserFormatted: '0.00',
      };
    }
  }

  async getWalletGrowth(days: number = 30): Promise<Array<{ date: string; count: number }>> {
    try {
      const results = await db.execute(sql`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM wallets
        WHERE created_at >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date,
        count: Number(row.count),
      }));
    } catch (error) {
      console.error('[Analytics] Error getting wallet growth:', error);
      return [];
    }
  }

  async getTransactionVolume(days: number = 30): Promise<Array<{ date: string; volume: string; count: number }>> {
    try {
      const results = await db.execute(sql`
        SELECT DATE(timestamp) as date, 
               COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as volume,
               COUNT(*) as count
        FROM cached_transactions
        WHERE timestamp >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp)
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date,
        volume: row.volume?.toString() || '0',
        count: Number(row.count),
      }));
    } catch (error) {
      console.error('[Analytics] Error getting transaction volume:', error);
      return [];
    }
  }

  async getChainBreakdown(): Promise<{
    transactions: Array<{ chainId: number; count: number; volume: string }>;
    balances: Array<{ chainId: number; totalBalance: string; walletCount: number }>;
  }> {
    try {
      const txResults = await db.execute(sql`
        SELECT chain_id as "chainId",
               COUNT(*) as count,
               COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as volume
        FROM cached_transactions
        GROUP BY chain_id
      `);

      const balanceResults = await db.execute(sql`
        SELECT chain_id as "chainId",
               COALESCE(SUM(CAST(balance AS NUMERIC)), 0) as "totalBalance",
               COUNT(DISTINCT address) as "walletCount"
        FROM cached_balances
        GROUP BY chain_id
      `);

      return {
        transactions: (txResults.rows as any[]).map(row => ({
          chainId: Number(row.chainId),
          count: Number(row.count),
          volume: row.volume?.toString() || '0',
        })),
        balances: (balanceResults.rows as any[]).map(row => ({
          chainId: Number(row.chainId),
          totalBalance: row.totalBalance?.toString() || '0',
          walletCount: Number(row.walletCount),
        })),
      };
    } catch (error) {
      console.error('[Analytics] Error getting chain breakdown:', error);
      return { transactions: [], balances: [] };
    }
  }

  async getPoolAnalytics(): Promise<{
    currentDraw: PoolDraw | null;
    totalPrizesPaid: string;
    totalContributions: string;
    drawHistory: PoolDraw[];
    participationByPercent: Array<{ percent: number; count: number }>;
    referralStats: { total: number; activeReferrers: number };
  }> {
    try {
      const currentDraw = await db.select()
        .from(poolDraws)
        .where(eq(poolDraws.status, 'active'))
        .limit(1);

      const draws = await db.select()
        .from(poolDraws)
        .orderBy(desc(poolDraws.year), desc(poolDraws.weekNumber))
        .limit(12);

      const completedDraws = draws.filter(d => d.status === 'completed');
      const totalPrizesPaid = completedDraws.reduce((sum, d) => sum + BigInt(d.totalPool || '0'), 0n);

      const [contribResult] = await db.select({ total: sql<string>`COALESCE(SUM(CAST(yield_contributed AS NUMERIC)), 0)` })
        .from(poolContributions);

      const percentGroups = await db.execute(sql`
        SELECT 
          CASE 
            WHEN opt_in_percent = 0 THEN 0
            WHEN opt_in_percent <= 25 THEN 25
            WHEN opt_in_percent <= 50 THEN 50
            WHEN opt_in_percent <= 75 THEN 75
            ELSE 100
          END as percent_group,
          COUNT(*) as count
        FROM pool_settings
        GROUP BY percent_group
        ORDER BY percent_group
      `);

      const [referralCount] = await db.select({ count: sql<number>`count(*)` }).from(referrals);
      const activeReferrers = await db.execute(sql`
        SELECT COUNT(DISTINCT referrer_address) as count FROM referrals
      `);

      return {
        currentDraw: currentDraw[0] || null,
        totalPrizesPaid: totalPrizesPaid.toString(),
        totalContributions: contribResult?.total || '0',
        drawHistory: draws,
        participationByPercent: (percentGroups.rows as any[]).map(row => ({
          percent: Number(row.percent_group),
          count: Number(row.count),
        })),
        referralStats: {
          total: Number(referralCount?.count || 0),
          activeReferrers: Number((activeReferrers.rows[0] as any)?.count || 0),
        },
      };
    } catch (error) {
      console.error('[Analytics] Error getting pool analytics:', error);
      return {
        currentDraw: null,
        totalPrizesPaid: '0',
        totalContributions: '0',
        drawHistory: [],
        participationByPercent: [],
        referralStats: { total: 0, activeReferrers: 0 },
      };
    }
  }

  async getAaveAnalytics(): Promise<{
    totalDeposits: string;
    totalWithdrawals: string;
    activeOperations: number;
    operationsByChain: Array<{ chainId: number; deposits: string; withdrawals: string }>;
  }> {
    try {
      const results = await db.execute(sql`
        SELECT 
          chain_id as "chainId",
          COALESCE(SUM(CASE WHEN operation_type = 'supply' AND status = 'completed' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as deposits,
          COALESCE(SUM(CASE WHEN operation_type = 'withdraw' AND status = 'completed' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as withdrawals
        FROM aave_operations
        GROUP BY chain_id
      `);

      const [activeOps] = await db.select({ count: sql<number>`count(*)` })
        .from(aaveOperations)
        .where(or(
          eq(aaveOperations.status, 'pending'),
          eq(aaveOperations.status, 'transferring'),
          eq(aaveOperations.status, 'approving'),
          eq(aaveOperations.status, 'supplying')
        ));

      const chainResults = (results.rows as any[]).map(row => ({
        chainId: Number(row.chainId),
        deposits: row.deposits?.toString() || '0',
        withdrawals: row.withdrawals?.toString() || '0',
      }));

      const totalDeposits = chainResults.reduce((sum, c) => sum + BigInt(c.deposits), 0n);
      const totalWithdrawals = chainResults.reduce((sum, c) => sum + BigInt(c.withdrawals), 0n);

      return {
        totalDeposits: totalDeposits.toString(),
        totalWithdrawals: totalWithdrawals.toString(),
        activeOperations: Number(activeOps?.count || 0),
        operationsByChain: chainResults,
      };
    } catch (error) {
      console.error('[Analytics] Error getting Aave analytics:', error);
      return {
        totalDeposits: '0',
        totalWithdrawals: '0',
        activeOperations: 0,
        operationsByChain: [],
      };
    }
  }

  async getFacilitatorAnalytics(): Promise<{
    totalTransfersProcessed: number;
    totalGasDrips: number;
    gasDripsByChain: Array<{ chainId: number; count: number; totalAmount: string }>;
    authorizationsByStatus: Array<{ status: string; count: number }>;
  }> {
    try {
      const [authCount] = await db.select({ count: sql<number>`count(*)` })
        .from(authorizations)
        .where(eq(authorizations.status, 'used'));

      const [dripCount] = await db.select({ count: sql<number>`count(*)` }).from(gasDrips);

      const dripsByChain = await db.execute(sql`
        SELECT chain_id as "chainId",
               COUNT(*) as count,
               COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as "totalAmount"
        FROM gas_drips
        WHERE status = 'completed'
        GROUP BY chain_id
      `);

      const authByStatus = await db.execute(sql`
        SELECT status, COUNT(*) as count
        FROM authorizations
        GROUP BY status
      `);

      return {
        totalTransfersProcessed: Number(authCount?.count || 0),
        totalGasDrips: Number(dripCount?.count || 0),
        gasDripsByChain: (dripsByChain.rows as any[]).map(row => ({
          chainId: Number(row.chainId),
          count: Number(row.count),
          totalAmount: row.totalAmount?.toString() || '0',
        })),
        authorizationsByStatus: (authByStatus.rows as any[]).map(row => ({
          status: row.status,
          count: Number(row.count),
        })),
      };
    } catch (error) {
      console.error('[Analytics] Error getting facilitator analytics:', error);
      return {
        totalTransfersProcessed: 0,
        totalGasDrips: 0,
        gasDripsByChain: [],
        authorizationsByStatus: [],
      };
    }
  }

  async getMaxFlowAnalytics(): Promise<{
    totalScored: number;
    scoreDistribution: Array<{ range: string; count: number }>;
    averageScore: number;
  }> {
    try {
      const scores = await db.select().from(cachedMaxflowScores);
      
      const scoreValues = scores.map(s => {
        try {
          const data = JSON.parse(s.scoreData);
          return data.local_health || 0;
        } catch {
          return 0;
        }
      }).filter(s => s > 0);

      const ranges = [
        { range: '0-10', min: 0, max: 10 },
        { range: '10-20', min: 10, max: 20 },
        { range: '20-30', min: 20, max: 30 },
        { range: '30-40', min: 30, max: 40 },
        { range: '40-50', min: 40, max: 50 },
        { range: '50-60', min: 50, max: 60 },
        { range: '60-70', min: 60, max: 70 },
        { range: '70-80', min: 70, max: 80 },
        { range: '80-90', min: 80, max: 90 },
        { range: '90-100', min: 90, max: 101 },
      ];

      const distribution = ranges.map(r => ({
        range: r.range,
        count: scoreValues.filter(s => s >= r.min && s < r.max).length,
      }));

      const avgScore = scoreValues.length > 0 
        ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length 
        : 0;

      return {
        totalScored: scores.length,
        scoreDistribution: distribution,
        averageScore: avgScore,
      };
    } catch (error) {
      console.error('[Analytics] Error getting MaxFlow analytics:', error);
      return {
        totalScored: 0,
        scoreDistribution: [],
        averageScore: 0,
      };
    }
  }

  async getCumulativeWalletGrowth(days: number = 30): Promise<Array<{ date: string; cumulative: number; daily: number }>> {
    try {
      const results = await db.execute(sql`
        WITH daily_counts AS (
          SELECT DATE(created_at) as date, COUNT(*) as daily_count
          FROM wallets
          WHERE created_at >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
          GROUP BY DATE(created_at)
        ),
        all_dates AS (
          SELECT generate_series(
            (NOW() - ${sql.raw(`INTERVAL '${days} days'`)})::date,
            CURRENT_DATE,
            '1 day'::interval
          )::date as date
        ),
        filled AS (
          SELECT d.date, COALESCE(dc.daily_count, 0) as daily_count
          FROM all_dates d
          LEFT JOIN daily_counts dc ON d.date = dc.date
        ),
        base_count AS (
          SELECT COUNT(*) as cnt FROM wallets WHERE created_at < NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
        )
        SELECT 
          f.date,
          (SELECT cnt FROM base_count) + SUM(f.daily_count) OVER (ORDER BY f.date) as cumulative,
          f.daily_count as daily
        FROM filled f
        ORDER BY f.date
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date?.toISOString?.()?.split('T')[0] || row.date,
        cumulative: Number(row.cumulative),
        daily: Number(row.daily),
      }));
    } catch (error) {
      console.error('[Analytics] Error getting cumulative wallet growth:', error);
      return [];
    }
  }

  async getActiveVsInactiveWallets(): Promise<{ active7d: number; active30d: number; inactive: number; total: number }> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [total] = await db.select({ count: sql<number>`count(*)` }).from(wallets);
      const [active7d] = await db.select({ count: sql<number>`count(*)` })
        .from(wallets)
        .where(gte(wallets.lastSeen, sevenDaysAgo));
      const [active30d] = await db.select({ count: sql<number>`count(*)` })
        .from(wallets)
        .where(gte(wallets.lastSeen, thirtyDaysAgo));

      return {
        active7d: Number(active7d.count),
        active30d: Number(active30d.count),
        inactive: Number(total.count) - Number(active30d.count),
        total: Number(total.count),
      };
    } catch (error) {
      console.error('[Analytics] Error getting active vs inactive wallets:', error);
      return { active7d: 0, active30d: 0, inactive: 0, total: 0 };
    }
  }

  async getTransactionTrends(days: number = 30): Promise<Array<{ date: string; count: number; avgSize: string }>> {
    try {
      const results = await db.execute(sql`
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as count,
          COALESCE(AVG(CAST(amount AS NUMERIC)), 0) as avg_size
        FROM cached_transactions
        WHERE timestamp >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp)
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date?.toISOString?.()?.split('T')[0] || row.date,
        count: Number(row.count),
        avgSize: row.avg_size?.toString() || '0',
      }));
    } catch (error) {
      console.error('[Analytics] Error getting transaction trends:', error);
      return [];
    }
  }

  async getTVLOverTime(days: number = 30): Promise<Array<{ date: string; tvl: string }>> {
    try {
      const results = await db.execute(sql`
        SELECT 
          DATE(timestamp) as date,
          SUM(CAST(balance AS NUMERIC)) as tvl
        FROM (
          SELECT DISTINCT ON (address, chain_id, DATE(timestamp))
            address, chain_id, balance, timestamp
          FROM balance_history
          WHERE timestamp >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
          ORDER BY address, chain_id, DATE(timestamp), timestamp DESC
        ) daily_balances
        GROUP BY DATE(timestamp)
        ORDER BY DATE(timestamp)
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date?.toISOString?.()?.split('T')[0] || row.date,
        tvl: row.tvl?.toString() || '0',
      }));
    } catch (error) {
      console.error('[Analytics] Error getting TVL over time:', error);
      return [];
    }
  }

  async getBalanceDistribution(): Promise<Array<{ range: string; count: number; totalBalance: string }>> {
    try {
      const results = await db.execute(sql`
        WITH wallet_totals AS (
          SELECT 
            address,
            SUM(CAST(balance AS NUMERIC)) as total_balance
          FROM cached_balances
          GROUP BY address
        ),
        bucketed AS (
          SELECT 
            CASE 
              WHEN total_balance = 0 THEN '$0'
              WHEN total_balance < 1000000 THEN '$0-$1'
              WHEN total_balance < 10000000 THEN '$1-$10'
              WHEN total_balance < 50000000 THEN '$10-$50'
              WHEN total_balance < 100000000 THEN '$50-$100'
              WHEN total_balance < 500000000 THEN '$100-$500'
              ELSE '$500+'
            END as range,
            CASE 
              WHEN total_balance = 0 THEN 1
              WHEN total_balance < 1000000 THEN 2
              WHEN total_balance < 10000000 THEN 3
              WHEN total_balance < 50000000 THEN 4
              WHEN total_balance < 100000000 THEN 5
              WHEN total_balance < 500000000 THEN 6
              ELSE 7
            END as sort_order,
            total_balance
          FROM wallet_totals
        )
        SELECT 
          range,
          COUNT(*) as count,
          COALESCE(SUM(total_balance), 0) as total_balance
        FROM bucketed
        GROUP BY range, sort_order
        ORDER BY sort_order
      `);
      return (results.rows as any[]).map(row => ({
        range: row.range,
        count: Number(row.count),
        totalBalance: row.total_balance?.toString() || '0',
      }));
    } catch (error) {
      console.error('[Analytics] Error getting balance distribution:', error);
      return [];
    }
  }

  async getChainUsageOverTime(days: number = 30): Promise<Array<{ date: string; base: number; celo: number; gnosis: number }>> {
    try {
      const results = await db.execute(sql`
        WITH all_dates AS (
          SELECT generate_series(
            (NOW() - ${sql.raw(`INTERVAL '${days} days'`)})::date,
            CURRENT_DATE,
            '1 day'::interval
          )::date as date
        ),
        chain_counts AS (
          SELECT 
            DATE(timestamp) as date,
            chain_id,
            COUNT(*) as count
          FROM cached_transactions
          WHERE timestamp >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
          GROUP BY DATE(timestamp), chain_id
        )
        SELECT 
          d.date,
          COALESCE(SUM(CASE WHEN cc.chain_id = 8453 THEN cc.count ELSE 0 END), 0) as base,
          COALESCE(SUM(CASE WHEN cc.chain_id = 42220 THEN cc.count ELSE 0 END), 0) as celo,
          COALESCE(SUM(CASE WHEN cc.chain_id = 100 THEN cc.count ELSE 0 END), 0) as gnosis
        FROM all_dates d
        LEFT JOIN chain_counts cc ON d.date = cc.date
        GROUP BY d.date
        ORDER BY d.date
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date?.toISOString?.()?.split('T')[0] || row.date,
        base: Number(row.base),
        celo: Number(row.celo),
        gnosis: Number(row.gnosis),
      }));
    } catch (error) {
      console.error('[Analytics] Error getting chain usage over time:', error);
      return [];
    }
  }

  async getDAUWAU(days: number = 30): Promise<Array<{ date: string; dau: number; wau: number }>> {
    try {
      const results = await db.execute(sql`
        WITH all_dates AS (
          SELECT generate_series(
            (NOW() - ${sql.raw(`INTERVAL '${days} days'`)})::date,
            CURRENT_DATE,
            '1 day'::interval
          )::date as date
        ),
        daily_active AS (
          SELECT DATE(last_seen) as date, COUNT(DISTINCT address) as dau
          FROM wallets
          WHERE last_seen >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
          GROUP BY DATE(last_seen)
        ),
        weekly_active AS (
          SELECT 
            d.date,
            COUNT(DISTINCT w.address) as wau
          FROM all_dates d
          LEFT JOIN wallets w ON w.last_seen >= d.date - INTERVAL '7 days' AND w.last_seen < d.date + INTERVAL '1 day'
          GROUP BY d.date
        )
        SELECT 
          d.date,
          COALESCE(da.dau, 0) as dau,
          COALESCE(wa.wau, 0) as wau
        FROM all_dates d
        LEFT JOIN daily_active da ON d.date = da.date
        LEFT JOIN weekly_active wa ON d.date = wa.date
        ORDER BY d.date
      `);
      return (results.rows as any[]).map(row => ({
        date: row.date?.toISOString?.()?.split('T')[0] || row.date,
        dau: Number(row.dau),
        wau: Number(row.wau),
      }));
    } catch (error) {
      console.error('[Analytics] Error getting DAU/WAU:', error);
      return [];
    }
  }

  async getFeatureAdoptionRates(): Promise<{
    poolAdoption: { enrolled: number; total: number; rate: number };
    maxflowAdoption: { scored: number; total: number; rate: number };
    gooddollarAdoption: { verified: number; total: number; rate: number };
  }> {
    try {
      const [totalWallets] = await db.select({ count: sql<number>`count(*)` }).from(wallets);
      const [poolEnrolled] = await db.select({ count: sql<number>`count(*)` })
        .from(poolSettings)
        .where(gt(poolSettings.optInPercent, 0));
      const [maxflowScored] = await db.select({ count: sql<number>`count(*)` }).from(cachedMaxflowScores);
      const [gdVerified] = await db.select({ count: sql<number>`count(*)` })
        .from(gooddollarIdentities)
        .where(eq(gooddollarIdentities.isWhitelisted, true));

      const total = Number(totalWallets.count) || 1;
      const pool = Number(poolEnrolled.count);
      const maxflow = Number(maxflowScored.count);
      const gd = Number(gdVerified.count);

      return {
        poolAdoption: { enrolled: pool, total, rate: Math.round((pool / total) * 100) },
        maxflowAdoption: { scored: maxflow, total, rate: Math.round((maxflow / total) * 100) },
        gooddollarAdoption: { verified: gd, total, rate: Math.round((gd / total) * 100) },
      };
    } catch (error) {
      console.error('[Analytics] Error getting feature adoption rates:', error);
      return {
        poolAdoption: { enrolled: 0, total: 0, rate: 0 },
        maxflowAdoption: { scored: 0, total: 0, rate: 0 },
        gooddollarAdoption: { verified: 0, total: 0, rate: 0 },
      };
    }
  }

  async getConversionFunnels(): Promise<{
    walletToFirstTx: { total: number; converted: number; rate: number };
    oneTimeToRepeat: { oneTime: number; repeat: number; rate: number };
    newToActive: { newLast30d: number; activeLast7d: number; rate: number };
  }> {
    try {
      const [totalWallets] = await db.select({ count: sql<number>`count(*)` }).from(wallets);

      const walletsWithTx = await db.execute(sql`
        SELECT COUNT(DISTINCT w.address) as count
        FROM wallets w
        INNER JOIN cached_transactions ct ON LOWER(ct."from") = LOWER(w.address) OR LOWER(ct."to") = LOWER(w.address)
      `);

      const repeatUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM (
          SELECT address FROM (
            SELECT LOWER("from") as address FROM cached_transactions
            UNION ALL
            SELECT LOWER("to") as address FROM cached_transactions
          ) all_addresses
          GROUP BY address
          HAVING COUNT(*) >= 3
        ) repeat_users
      `);

      const oneTimeUsers = await db.execute(sql`
        SELECT COUNT(*) as count FROM (
          SELECT address FROM (
            SELECT LOWER("from") as address FROM cached_transactions
            UNION ALL
            SELECT LOWER("to") as address FROM cached_transactions
          ) all_addresses
          GROUP BY address
          HAVING COUNT(*) = 1 OR COUNT(*) = 2
        ) one_time_users
      `);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [newLast30d] = await db.select({ count: sql<number>`count(*)` })
        .from(wallets)
        .where(gte(wallets.createdAt, thirtyDaysAgo));
      const [activeLast7d] = await db.select({ count: sql<number>`count(*)` })
        .from(wallets)
        .where(and(gte(wallets.createdAt, thirtyDaysAgo), gte(wallets.lastSeen, sevenDaysAgo)));

      const total = Number(totalWallets.count) || 1;
      const converted = Number((walletsWithTx.rows[0] as any)?.count) || 0;
      const repeat = Number((repeatUsers.rows[0] as any)?.count) || 0;
      const oneTime = Number((oneTimeUsers.rows[0] as any)?.count) || 0;
      const newUsers = Number(newLast30d.count) || 1;
      const activeNew = Number(activeLast7d.count) || 0;

      return {
        walletToFirstTx: { total, converted, rate: Math.round((converted / total) * 100) },
        oneTimeToRepeat: { oneTime, repeat, rate: oneTime + repeat > 0 ? Math.round((repeat / (oneTime + repeat)) * 100) : 0 },
        newToActive: { newLast30d: newUsers, activeLast7d: activeNew, rate: Math.round((activeNew / newUsers) * 100) },
      };
    } catch (error) {
      console.error('[Analytics] Error getting conversion funnels:', error);
      return {
        walletToFirstTx: { total: 0, converted: 0, rate: 0 },
        oneTimeToRepeat: { oneTime: 0, repeat: 0, rate: 0 },
        newToActive: { newLast30d: 0, activeLast7d: 0, rate: 0 },
      };
    }
  }

  async getWalletsWithScoreNoBalance(): Promise<Array<{
    address: string;
    maxFlowScore: number;
    totalXp: number;
    lastSeen: string;
  }>> {
    try {
      // Get all scores, balances, wallets, GoodDollar identities, and XP balances in bulk
      const [scores, allBalances, allWallets, gdIdentities, xpBalancesData] = await Promise.all([
        db.select().from(cachedMaxflowScores),
        db.select().from(cachedBalances),
        db.select().from(wallets),
        db.select().from(gooddollarIdentities),
        db.select().from(xpBalances),
      ]);
      
      // Build lookup maps for efficient access
      const balanceByAddress = new Map<string, bigint>();
      for (const b of allBalances) {
        const addr = b.address.toLowerCase();
        const current = balanceByAddress.get(addr) || BigInt(0);
        // Parse balance as micro-USDC integer (handles both "0" and numeric strings)
        let amount = BigInt(0);
        try {
          // Balance is stored as micro-USDC string (e.g., "1000000" for 1 USDC)
          const balanceStr = b.balance || '0';
          // Handle potential decimal strings by removing decimals (shouldn't happen but be safe)
          const intPart = balanceStr.split('.')[0];
          amount = BigInt(intPart || '0');
        } catch {
          amount = BigInt(0);
        }
        balanceByAddress.set(addr, current + amount);
      }
      
      const walletByAddress = new Map<string, typeof allWallets[0]>();
      for (const w of allWallets) {
        walletByAddress.set(w.address.toLowerCase(), w);
      }
      
      // Build GoodDollar verified lookup (whitelisted = face verified)
      const gdVerifiedAddresses = new Set<string>();
      for (const gd of gdIdentities) {
        if (gd.isWhitelisted) {
          gdVerifiedAddresses.add(gd.walletAddress.toLowerCase());
        }
      }
      
      // Build XP lookup
      const xpByAddress = new Map<string, number>();
      for (const xp of xpBalancesData) {
        xpByAddress.set(xp.walletAddress.toLowerCase(), xp.totalXp);
      }
      
      const results: Array<{
        address: string;
        maxFlowScore: number;
        totalXp: number;
        lastSeen: string;
      }> = [];
      
      for (const score of scores) {
        try {
          const scoreData = JSON.parse(score.scoreData);
          const maxFlowScore = scoreData.local_health || 0;
          
          // Skip if score is 0 or less
          if (maxFlowScore <= 0) continue;
          
          const normalizedAddress = score.address.toLowerCase();
          
          // Check total balance across all chains
          const totalBalance = balanceByAddress.get(normalizedAddress) || BigInt(0);
          
          // Check if GoodDollar verified
          const isGdVerified = gdVerifiedAddresses.has(normalizedAddress);
          
          // Check if has claimed XP
          const totalXp = xpByAddress.get(normalizedAddress) || 0;
          
          // Only include if:
          // 1. Total balance is 0
          // 2. GoodDollar face verified
          // 3. Has claimed some XP (totalXp > 0)
          if (totalBalance === BigInt(0) && isGdVerified && totalXp > 0) {
            const walletInfo = walletByAddress.get(normalizedAddress);
            
            results.push({
              address: score.address,
              maxFlowScore,
              totalXp,
              lastSeen: walletInfo?.lastSeen?.toISOString() || score.updatedAt.toISOString(),
            });
          }
        } catch {
          // Skip entries with invalid score data
          continue;
        }
      }
      
      // Sort by maxFlowScore descending
      results.sort((a, b) => b.maxFlowScore - a.maxFlowScore);
      
      return results;
    } catch (error) {
      console.error('[Admin] Error fetching wallets with score but no balance:', error);
      throw error;
    }
  }

  // GoodDollar UBI Methods
  async upsertGoodDollarIdentity(data: InsertGoodDollarIdentity): Promise<GoodDollarIdentity> {
    const normalizedAddress = data.walletAddress.toLowerCase();
    const now = new Date();
    
    const result = await db.insert(gooddollarIdentities).values({
      walletAddress: normalizedAddress,
      isWhitelisted: data.isWhitelisted ?? false,
      whitelistedRoot: data.whitelistedRoot ?? null,
      lastAuthenticated: data.lastAuthenticated ?? null,
      authenticationPeriod: data.authenticationPeriod ?? null,
      expiresAt: data.expiresAt ?? null,
      isExpired: data.isExpired ?? false,
      daysUntilExpiry: data.daysUntilExpiry ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: gooddollarIdentities.walletAddress,
      set: {
        isWhitelisted: data.isWhitelisted ?? false,
        whitelistedRoot: data.whitelistedRoot ?? null,
        lastAuthenticated: data.lastAuthenticated ?? null,
        authenticationPeriod: data.authenticationPeriod ?? null,
        expiresAt: data.expiresAt ?? null,
        isExpired: data.isExpired ?? false,
        daysUntilExpiry: data.daysUntilExpiry ?? null,
        updatedAt: now,
      },
    }).returning();
    
    console.log(`[GoodDollar] Upserted identity for ${normalizedAddress}: whitelisted=${data.isWhitelisted}`);
    return result[0];
  }

  async getGoodDollarIdentity(walletAddress: string): Promise<GoodDollarIdentity | null> {
    const normalizedAddress = walletAddress.toLowerCase();
    const result = await db
      .select()
      .from(gooddollarIdentities)
      .where(eq(gooddollarIdentities.walletAddress, normalizedAddress))
      .limit(1);
    
    return result[0] || null;
  }

  async recordGoodDollarClaim(data: InsertGoodDollarClaim): Promise<GoodDollarClaim> {
    const normalizedAddress = data.walletAddress.toLowerCase();
    
    const result = await db.insert(gooddollarClaims).values({
      walletAddress: normalizedAddress,
      txHash: data.txHash,
      amount: data.amount,
      amountFormatted: data.amountFormatted,
      claimedDay: data.claimedDay,
      gasDripTxHash: data.gasDripTxHash ?? null,
    }).returning();
    
    console.log(`[GoodDollar] Recorded claim for ${normalizedAddress}: ${data.amountFormatted} G$ (day ${data.claimedDay})`);
    return result[0];
  }

  async syncGoodDollarClaims(claims: InsertGoodDollarClaim[]): Promise<{ inserted: number; skipped: number }> {
    if (claims.length === 0) {
      return { inserted: 0, skipped: 0 };
    }

    let inserted = 0;
    let skipped = 0;

    // Insert each claim individually with ON CONFLICT DO NOTHING for deduplication by txHash
    for (const claim of claims) {
      const normalizedAddress = claim.walletAddress.toLowerCase();
      try {
        const result = await db.insert(gooddollarClaims).values({
          walletAddress: normalizedAddress,
          txHash: claim.txHash,
          amount: claim.amount,
          amountFormatted: claim.amountFormatted,
          claimedDay: claim.claimedDay,
          gasDripTxHash: claim.gasDripTxHash ?? null,
        }).onConflictDoNothing({
          target: gooddollarClaims.txHash,
        }).returning();

        if (result.length > 0) {
          inserted++;
          console.log(`[GoodDollar Sync] Inserted claim: ${claim.txHash.slice(0, 10)}... (day ${claim.claimedDay})`);
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`[GoodDollar Sync] Error inserting claim ${claim.txHash}:`, error);
        skipped++;
      }
    }

    console.log(`[GoodDollar Sync] Complete: ${inserted} inserted, ${skipped} skipped`);
    return { inserted, skipped };
  }

  async getGoodDollarClaimHistory(walletAddress: string, limit: number = 30): Promise<GoodDollarClaim[]> {
    const normalizedAddress = walletAddress.toLowerCase();
    const result = await db
      .select()
      .from(gooddollarClaims)
      .where(eq(gooddollarClaims.walletAddress, normalizedAddress))
      .orderBy(desc(gooddollarClaims.createdAt))
      .limit(limit);
    
    return result;
  }

  async upsertGdBalance(address: string, balance: string, balanceFormatted: string, decimals: number = 2): Promise<CachedGdBalance> {
    const normalizedAddress = address.toLowerCase();
    const now = new Date();
    
    const result = await db.insert(cachedGdBalances).values({
      address: normalizedAddress,
      balance,
      balanceFormatted,
      decimals,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: cachedGdBalances.address,
      set: {
        balance,
        balanceFormatted,
        decimals,
        updatedAt: now,
      },
    }).returning();
    
    return result[0];
  }

  async getGdBalance(address: string): Promise<CachedGdBalance | null> {
    const normalizedAddress = address.toLowerCase();
    const result = await db
      .select()
      .from(cachedGdBalances)
      .where(eq(cachedGdBalances.address, normalizedAddress))
      .limit(1);
    
    return result[0] || null;
  }

  async getGoodDollarAnalytics(): Promise<{
    totalVerifiedUsers: number;
    totalClaims: number;
    totalGdClaimed: string;
    totalGdClaimedFormatted: string;
    recentClaims: Array<{
      walletAddress: string;
      amountFormatted: string;
      claimedDay: number;
      createdAt: Date;
    }>;
    activeClaimers: number;
  }> {
    try {
      // Get total verified users
      const [verifiedCount] = await db.select({ count: sql<number>`count(*)` })
        .from(gooddollarIdentities)
        .where(eq(gooddollarIdentities.isWhitelisted, true));

      // Get total claims and sum (amount is raw BigInt with 18 decimals, so divide by 10^18)
      const claimStats = await db.execute(sql`
        SELECT 
          COUNT(*) as "totalClaims",
          COALESCE(SUM(CAST(amount AS NUMERIC) / 1000000000000000000), 0) as "totalAmount"
        FROM gooddollar_claims
      `);

      // Get recent claims (last 10)
      const recentClaims = await db
        .select({
          walletAddress: gooddollarClaims.walletAddress,
          amountFormatted: gooddollarClaims.amountFormatted,
          claimedDay: gooddollarClaims.claimedDay,
          createdAt: gooddollarClaims.createdAt,
        })
        .from(gooddollarClaims)
        .orderBy(desc(gooddollarClaims.createdAt))
        .limit(10);

      // Get active claimers (claimed in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const activeClaimersResult = await db.execute(sql`
        SELECT COUNT(DISTINCT wallet_address) as "activeClaimers"
        FROM gooddollar_claims
        WHERE created_at >= ${sevenDaysAgo}
      `);

      const totalAmount = Number(claimStats.rows[0]?.totalAmount || 0);
      const totalAmountFormatted = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return {
        totalVerifiedUsers: Number(verifiedCount?.count || 0),
        totalClaims: Number(claimStats.rows[0]?.totalClaims || 0),
        totalGdClaimed: totalAmount.toString(),
        totalGdClaimedFormatted: totalAmountFormatted,
        recentClaims,
        activeClaimers: Number(activeClaimersResult.rows[0]?.activeClaimers || 0),
      };
    } catch (error) {
      console.error('[GoodDollar] Error getting analytics:', error);
      return {
        totalVerifiedUsers: 0,
        totalClaims: 0,
        totalGdClaimed: '0',
        totalGdClaimedFormatted: '0.00',
        recentClaims: [],
        activeClaimers: 0,
      };
    }
  }

  async cacheAUsdcBalance(address: string, chainId: number, balance: string): Promise<void> {
    try {
      const aUsdcChainId = -chainId;
      await db.insert(cachedBalances).values({
        address,
        chainId: aUsdcChainId,
        balance,
        decimals: 6,
        nonce: '0',
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [cachedBalances.address, cachedBalances.chainId],
        set: {
          balance,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('[DB] Error caching aUSDC balance:', error);
    }
  }

  async getCachedAUsdcBalance(address: string, chainId: number): Promise<string> {
    try {
      const aUsdcChainId = -chainId;
      const cached = await db
        .select()
        .from(cachedBalances)
        .where(and(eq(cachedBalances.address, address), eq(cachedBalances.chainId, aUsdcChainId)))
        .limit(1);
      return cached[0]?.balance || '0';
    } catch (error) {
      console.error('[DB] Error getting cached aUSDC balance:', error);
      return '0';
    }
  }

  async getXpBalance(walletAddress: string): Promise<XpBalance | null> {
    try {
      const normalized = walletAddress.toLowerCase();
      const result = await db
        .select()
        .from(xpBalances)
        .where(eq(xpBalances.walletAddress, normalized))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('[XP] Error getting XP balance:', error);
      return null;
    }
  }

  async claimXp(walletAddress: string, xpAmount: number, maxFlowSignal: number): Promise<XpClaim> {
    const normalized = walletAddress.toLowerCase();
    const now = new Date();
    
    const existingBalance = await this.getXpBalance(normalized);
    
    if (existingBalance) {
      await db
        .update(xpBalances)
        .set({
          totalXp: existingBalance.totalXp + xpAmount,
          lastClaimTime: now,
          claimCount: existingBalance.claimCount + 1,
          updatedAt: now,
        })
        .where(eq(xpBalances.walletAddress, normalized));
    } else {
      await db.insert(xpBalances).values({
        walletAddress: normalized,
        totalXp: xpAmount,
        lastClaimTime: now,
        claimCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    const [claim] = await db.insert(xpClaims).values({
      walletAddress: normalized,
      xpAmount,
      maxFlowSignal,
      claimedAt: now,
    }).returning();
    
    console.log(`[XP] Claimed ${xpAmount} XP for ${normalized} (signal: ${maxFlowSignal})`);
    return claim;
  }

  async deductXp(walletAddress: string, xpAmount: number): Promise<{ success: boolean; newBalance: number }> {
    const normalized = walletAddress.toLowerCase();
    const now = new Date();
    
    // Use atomic UPDATE with WHERE clause to prevent race conditions
    // This ensures balance check and deduction happen in a single atomic operation
    const result = await db
      .update(xpBalances)
      .set({
        totalXp: sql`"total_xp" - ${xpAmount}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(xpBalances.walletAddress, normalized),
          gte(xpBalances.totalXp, xpAmount)
        )
      )
      .returning({ newBalance: xpBalances.totalXp });
    
    if (result.length === 0) {
      // Either no balance exists or insufficient XP
      const existingBalance = await this.getXpBalance(normalized);
      if (!existingBalance) {
        console.log(`[XP] Deduct failed: No XP balance for ${normalized}`);
        return { success: false, newBalance: 0 };
      }
      console.log(`[XP] Deduct failed: Insufficient XP for ${normalized} (has ${existingBalance.totalXp}, needs ${xpAmount})`);
      return { success: false, newBalance: existingBalance.totalXp };
    }
    
    const newBalance = result[0].newBalance;
    console.log(`[XP] Deducted ${xpAmount} XP from ${normalized} (new balance: ${newBalance})`);
    return { success: true, newBalance };
  }

  async refundXp(walletAddress: string, xpAmount: number): Promise<{ success: boolean; newBalance: number }> {
    const normalized = walletAddress.toLowerCase();
    const now = new Date();
    
    const existingBalance = await this.getXpBalance(normalized);
    
    if (!existingBalance) {
      // Create balance with refund amount if no existing balance
      await db.insert(xpBalances).values({
        walletAddress: normalized,
        totalXp: xpAmount,
        claimCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[XP] Refunded ${xpAmount} XP to ${normalized} (new balance: ${xpAmount})`);
      return { success: true, newBalance: xpAmount };
    }
    
    const newBalance = existingBalance.totalXp + xpAmount;
    
    await db
      .update(xpBalances)
      .set({
        totalXp: newBalance,
        updatedAt: now,
      })
      .where(eq(xpBalances.walletAddress, normalized));
    
    console.log(`[XP] Refunded ${xpAmount} XP to ${normalized} (new balance: ${newBalance})`);
    return { success: true, newBalance };
  }

  async creditXpFromGdExchange(walletAddress: string, xpAmountCenti: number, gdAmount: string): Promise<{ success: boolean; newBalance: number }> {
    const normalized = walletAddress.toLowerCase();
    const now = new Date();
    
    const existingBalance = await this.getXpBalance(normalized);
    
    if (!existingBalance) {
      // Create new balance entry
      await db.insert(xpBalances).values({
        walletAddress: normalized,
        totalXp: xpAmountCenti,
        claimCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[XP] Credited ${xpAmountCenti} centi-XP from G$ exchange (${gdAmount} G$) to ${normalized} (new balance: ${xpAmountCenti})`);
      return { success: true, newBalance: xpAmountCenti };
    }
    
    const newBalance = existingBalance.totalXp + xpAmountCenti;
    
    await db
      .update(xpBalances)
      .set({
        totalXp: newBalance,
        updatedAt: now,
      })
      .where(eq(xpBalances.walletAddress, normalized));
    
    console.log(`[XP] Credited ${xpAmountCenti} centi-XP from G$ exchange (${gdAmount} G$) to ${normalized} (new balance: ${newBalance})`);
    return { success: true, newBalance };
  }

  async getXpClaimHistory(walletAddress: string, limit: number = 50): Promise<XpClaim[]> {
    try {
      const normalized = walletAddress.toLowerCase();
      return await db
        .select()
        .from(xpClaims)
        .where(eq(xpClaims.walletAddress, normalized))
        .orderBy(desc(xpClaims.claimedAt))
        .limit(limit);
    } catch (error) {
      console.error('[XP] Error getting claim history:', error);
      return [];
    }
  }

  async getGlobalStats(): Promise<{
    totalUsers: number;
    totalTransfers: number;
    totalXp: number;
    totalConnections: number;
    gasSponsoredUsd: number;
  }> {
    try {
      const [walletsResult] = await db.select({ count: count() }).from(wallets);
      const [xpResult] = await db.select({ total: sum(xpBalances.totalXp) }).from(xpBalances);
      
      // Count ALL transaction types for comprehensive "Transactions" metric
      const [usdcTxResult] = await db.select({ count: count() }).from(cachedTransactions);
      const [gasDripResult] = await db.select({ count: count() }).from(gasDrips);
      const [aaveOpsResult] = await db.select({ count: count() }).from(aaveOperations);
      const [gdClaimsResult] = await db.select({ count: count() }).from(gooddollarClaims);
      
      const totalTransactions = 
        (usdcTxResult?.count || 0) + 
        (gasDripResult?.count || 0) + 
        (aaveOpsResult?.count || 0) + 
        (gdClaimsResult?.count || 0);

      // Count connections (vouches) by parsing all MaxFlow score data
      let totalConnections = 0;
      try {
        const maxflowScores = await db.select({ scoreData: cachedMaxflowScores.scoreData }).from(cachedMaxflowScores);
        for (const score of maxflowScores) {
          try {
            const data = JSON.parse(score.scoreData);
            // Count incoming vouches from vouch_counts or vouchCounts
            const vouchCounts = data.vouch_counts || data.vouchCounts;
            if (vouchCounts) {
              totalConnections += (vouchCounts.incoming || 0);
            }
          } catch {}
        }
      } catch (e) {
        console.error('[Stats] Error counting connections:', e);
      }

      // Get cached gas sponsored USD value
      let gasSponsoredUsd = 0;
      try {
        const [setting] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'gas_sponsored_usd'));
        if (setting) {
          gasSponsoredUsd = parseFloat(setting.value) || 0;
        }
      } catch (e) {
        console.error('[Stats] Error getting gas sponsored:', e);
      }

      const totalXpCenti = Number(xpResult?.total) || 0;
      return {
        totalUsers: walletsResult?.count || 0,
        totalTransfers: totalTransactions,
        totalXp: Math.round(totalXpCenti) / 100,
        totalConnections,
        gasSponsoredUsd,
      };
    } catch (error) {
      console.error('[Stats] Error getting global stats:', error);
      return { totalUsers: 0, totalTransfers: 0, totalXp: 0, totalConnections: 0, gasSponsoredUsd: 0 };
    }
  }

  async setGlobalSetting(key: string, value: string): Promise<void> {
    try {
      await db.insert(globalSettings).values({
        key,
        value,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: globalSettings.key,
        set: { value, updatedAt: new Date() },
      });
    } catch (error) {
      console.error('[Settings] Error setting global setting:', error);
      throw error;
    }
  }

  async getGlobalSetting(key: string): Promise<string | null> {
    try {
      const [setting] = await db.select().from(globalSettings).where(eq(globalSettings.key, key));
      return setting?.value || null;
    } catch (error) {
      console.error('[Settings] Error getting global setting:', error);
      return null;
    }
  }

  async getAiConversation(walletAddress: string): Promise<AiConversation | null> {
    try {
      const normalized = walletAddress.toLowerCase();
      const [conversation] = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.walletAddress, normalized))
        .limit(1);
      return conversation || null;
    } catch (error) {
      console.error('[AI] Error getting conversation:', error);
      return null;
    }
  }

  async saveAiConversation(walletAddress: string, messages: AiMessage[]): Promise<void> {
    try {
      const normalized = walletAddress.toLowerCase();
      const messagesJson = JSON.stringify(messages);
      const now = new Date();
      
      await db.insert(aiConversations).values({
        walletAddress: normalized,
        messages: messagesJson,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: aiConversations.walletAddress,
        set: {
          messages: messagesJson,
          updatedAt: now,
        },
      });
    } catch (error) {
      console.error('[AI] Error saving conversation:', error);
      throw error;
    }
  }

  async clearAiConversation(walletAddress: string): Promise<void> {
    try {
      const normalized = walletAddress.toLowerCase();
      await db.delete(aiConversations).where(eq(aiConversations.walletAddress, normalized));
    } catch (error) {
      console.error('[AI] Error clearing conversation:', error);
      throw error;
    }
  }

  async getEligibleAirdropWallets(): Promise<Array<{
    address: string;
    lastSeen: string;
    totalBalance: string;
  }>> {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const recentWallets = await db
        .select()
        .from(wallets)
        .where(gte(wallets.lastSeen, oneWeekAgo))
        .orderBy(desc(wallets.lastSeen));

      const allBalances = await db.select().from(cachedBalances);

      const balanceByAddress = new Map<string, bigint>();
      for (const b of allBalances) {
        const addr = b.address.toLowerCase();
        const current = balanceByAddress.get(addr) || BigInt(0);
        try {
          const balanceStr = b.balance || '0';
          // Balances are stored as micro-USDC strings (e.g., "1000000" = 1 USDC)
          // Parse directly as BigInt without decimal handling
          const amount = BigInt(balanceStr);
          balanceByAddress.set(addr, current + amount);
        } catch {
          // Skip invalid balances
        }
      }

      const eligibleWallets = recentWallets
        .filter(w => {
          const balance = balanceByAddress.get(w.address.toLowerCase()) || BigInt(0);
          return balance === BigInt(0);
        })
        .map(w => ({
          address: w.address,
          lastSeen: w.lastSeen.toISOString(),
          totalBalance: '0',
        }));

      return eligibleWallets;
    } catch (error) {
      console.error('[Airdrop] Error getting eligible wallets:', error);
      throw error;
    }
  }

  // =============================================
  // IP Events (Sybil Detection)
  // =============================================

  async logIpEvent(event: InsertIpEvent): Promise<void> {
    try {
      await db.insert(ipEvents).values({
        walletAddress: event.walletAddress.toLowerCase(),
        ipHash: event.ipHash,
        networkPrefix: event.networkPrefix,
        eventType: event.eventType,
        userAgent: event.userAgent,
        screenResolution: event.screenResolution,
        timezone: event.timezone,
        language: event.language,
        platform: event.platform,
        hardwareConcurrency: event.hardwareConcurrency,
        deviceMemory: event.deviceMemory,
        storageToken: event.storageToken,
      });
    } catch (error) {
      console.error('[Sybil] Error logging IP event:', error);
      // Don't throw - IP logging should not break main functionality
    }
  }

  async getIpEventsForWallet(walletAddress: string): Promise<IpEvent[]> {
    try {
      return await db
        .select()
        .from(ipEvents)
        .where(eq(ipEvents.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(ipEvents.createdAt));
    } catch (error) {
      console.error('[Sybil] Error getting IP events:', error);
      return [];
    }
  }

  async hasIpEventsForWallet(walletAddress: string): Promise<boolean> {
    try {
      const result = await db
        .select({ count: count() })
        .from(ipEvents)
        .where(eq(ipEvents.walletAddress, walletAddress.toLowerCase()));
      return result[0]?.count > 0;
    } catch (error) {
      console.error('[Sybil] Error checking IP events:', error);
      return false; // Assume no events on error to allow logging
    }
  }

  async isWalletSuspicious(walletAddress: string): Promise<{ suspicious: boolean; reason?: string; score?: number }> {
    try {
      const normalizedAddress = walletAddress.toLowerCase();
      
      // Get fingerprint signals for this wallet (most recent event)
      const walletEvents = await db
        .select()
        .from(ipEvents)
        .where(eq(ipEvents.walletAddress, normalizedAddress))
        .orderBy(desc(ipEvents.createdAt))
        .limit(1);
      
      if (walletEvents.length === 0) {
        return { suspicious: false, score: 0 };
      }
      
      const myEvent = walletEvents[0];
      
      // Find other wallets with matching signals using weighted scoring
      // Strong signals (2 points each): IP, storageToken, userAgent
      // Medium signals (1 point each): screen, hardware (cores+memory)
      // Weak signals (0.5 points each): timezone, language, platform
      const result = await db.execute(sql`
        WITH my_signals AS (
          SELECT 
            ip_hash, storage_token, user_agent, screen_resolution,
            hardware_concurrency, device_memory, timezone, language, platform
          FROM ip_events
          WHERE wallet_address = ${normalizedAddress}
          ORDER BY created_at DESC
          LIMIT 1
        ),
        other_wallets AS (
          SELECT DISTINCT ON (wallet_address)
            wallet_address,
            ip_hash, storage_token, user_agent, screen_resolution,
            hardware_concurrency, device_memory, timezone, language, platform
          FROM ip_events
          WHERE wallet_address != ${normalizedAddress}
          ORDER BY wallet_address, created_at DESC
        ),
        scored AS (
          SELECT 
            o.wallet_address,
            (CASE WHEN o.ip_hash = m.ip_hash AND m.ip_hash IS NOT NULL THEN 2.0 ELSE 0 END) +
            (CASE WHEN o.storage_token = m.storage_token AND m.storage_token IS NOT NULL THEN 2.0 ELSE 0 END) +
            (CASE WHEN o.user_agent = m.user_agent AND m.user_agent IS NOT NULL THEN 2.0 ELSE 0 END) +
            (CASE WHEN o.screen_resolution = m.screen_resolution AND m.screen_resolution IS NOT NULL THEN 1.0 ELSE 0 END) +
            (CASE WHEN o.hardware_concurrency = m.hardware_concurrency AND o.device_memory = m.device_memory 
                  AND m.hardware_concurrency IS NOT NULL AND m.device_memory IS NOT NULL THEN 1.0 ELSE 0 END) +
            (CASE WHEN o.timezone = m.timezone AND m.timezone IS NOT NULL THEN 0.5 ELSE 0 END) +
            (CASE WHEN o.language = m.language AND m.language IS NOT NULL THEN 0.5 ELSE 0 END) +
            (CASE WHEN o.platform = m.platform AND m.platform IS NOT NULL THEN 0.5 ELSE 0 END)
            AS score
          FROM other_wallets o
          CROSS JOIN my_signals m
        )
        SELECT wallet_address, score
        FROM scored
        WHERE score >= 4.0
        ORDER BY score DESC
        LIMIT 10
      `);

      if (result.rows && result.rows.length > 0) {
        const topMatch = result.rows[0] as any;
        const matchCount = result.rows.length;
        return {
          suspicious: true,
          reason: `Fingerprint matches ${matchCount} other wallet${matchCount > 1 ? 's' : ''} (score: ${topMatch.score})`,
          score: parseFloat(topMatch.score),
        };
      }

      return { suspicious: false, score: 0 };
    } catch (error) {
      console.error('[Sybil] Error checking wallet suspicious status:', error);
      return { suspicious: false }; // Fail open to not block legitimate users
    }
  }

  async getSuspiciousIpPatterns(minWallets: number = 2): Promise<Array<{
    ipHash: string;
    walletCount: number;
    wallets: string[];
    eventCount: number;
    firstSeen: string;
    lastSeen: string;
  }>> {
    try {
      // Get IP hashes that have multiple wallets
      const results = await db.execute(sql`
        SELECT 
          ip_hash,
          COUNT(DISTINCT wallet_address) as wallet_count,
          ARRAY_AGG(DISTINCT wallet_address) as wallets,
          COUNT(*) as event_count,
          MIN(created_at) as first_seen,
          MAX(created_at) as last_seen
        FROM ip_events
        GROUP BY ip_hash
        HAVING COUNT(DISTINCT wallet_address) >= ${minWallets}
        ORDER BY wallet_count DESC, event_count DESC
        LIMIT 100
      `);

      return (results.rows as any[]).map(row => ({
        ipHash: row.ip_hash,
        walletCount: parseInt(row.wallet_count),
        wallets: row.wallets || [],
        eventCount: parseInt(row.event_count),
        firstSeen: row.first_seen ? new Date(row.first_seen).toISOString() : '',
        lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : '',
      }));
    } catch (error) {
      console.error('[Sybil] Error getting suspicious patterns:', error);
      return [];
    }
  }

  async getIpAnalyticsSummary(): Promise<{
    totalEvents: number;
    uniqueIps: number;
    uniqueWallets: number;
    suspiciousIps: number;
    eventsByType: Record<string, number>;
  }> {
    try {
      const [totals, byType, suspicious] = await Promise.all([
        db.execute(sql`
          SELECT 
            COUNT(*) as total_events,
            COUNT(DISTINCT ip_hash) as unique_ips,
            COUNT(DISTINCT wallet_address) as unique_wallets
          FROM ip_events
        `),
        db.execute(sql`
          SELECT event_type, COUNT(*) as count
          FROM ip_events
          GROUP BY event_type
        `),
        db.execute(sql`
          SELECT COUNT(*) as count FROM (
            SELECT ip_hash 
            FROM ip_events 
            GROUP BY ip_hash 
            HAVING COUNT(DISTINCT wallet_address) >= 2
          ) as suspicious
        `),
      ]);

      const totalsRow = (totals.rows as any[])[0] || {};
      const eventsByType: Record<string, number> = {};
      for (const row of byType.rows as any[]) {
        eventsByType[row.event_type] = parseInt(row.count);
      }

      return {
        totalEvents: parseInt(totalsRow.total_events || '0'),
        uniqueIps: parseInt(totalsRow.unique_ips || '0'),
        uniqueWallets: parseInt(totalsRow.unique_wallets || '0'),
        suspiciousIps: parseInt(((suspicious.rows as any[])[0]?.count) || '0'),
        eventsByType,
      };
    } catch (error) {
      console.error('[Sybil] Error getting analytics summary:', error);
      return {
        totalEvents: 0,
        uniqueIps: 0,
        uniqueWallets: 0,
        suspiciousIps: 0,
        eventsByType: {},
      };
    }
  }

  async getWalletFingerprintDetails(walletAddress: string): Promise<{
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
  }> {
    try {
      const normalizedAddress = walletAddress.toLowerCase();
      
      // Get most recent fingerprint for this wallet
      const events = await db
        .select()
        .from(ipEvents)
        .where(eq(ipEvents.walletAddress, normalizedAddress))
        .orderBy(desc(ipEvents.createdAt))
        .limit(1);
      
      if (events.length === 0) {
        return { fingerprint: null, scoreBreakdown: [], totalScore: 0, matchingWallets: [] };
      }
      
      const myEvent = events[0];
      const fingerprint = {
        ipHash: myEvent.ipHash,
        userAgent: myEvent.userAgent,
        screenResolution: myEvent.screenResolution,
        timezone: myEvent.timezone,
        language: myEvent.language,
        platform: myEvent.platform,
        hardwareConcurrency: myEvent.hardwareConcurrency,
        deviceMemory: myEvent.deviceMemory,
        storageToken: myEvent.storageToken,
      };
      
      // Calculate score breakdown against other wallets
      const result = await db.execute(sql`
        WITH other_wallets AS (
          SELECT DISTINCT ON (wallet_address)
            wallet_address,
            ip_hash, storage_token, user_agent, screen_resolution,
            hardware_concurrency, device_memory, timezone, language, platform
          FROM ip_events
          WHERE wallet_address != ${normalizedAddress}
          ORDER BY wallet_address, created_at DESC
        )
        SELECT 
          wallet_address,
          CASE WHEN ip_hash = ${myEvent.ipHash} AND ${myEvent.ipHash} IS NOT NULL THEN 2.0 ELSE 0 END as ip_score,
          CASE WHEN storage_token = ${myEvent.storageToken} AND ${myEvent.storageToken} IS NOT NULL THEN 2.0 ELSE 0 END as token_score,
          CASE WHEN user_agent = ${myEvent.userAgent} AND ${myEvent.userAgent} IS NOT NULL THEN 2.0 ELSE 0 END as ua_score,
          CASE WHEN screen_resolution = ${myEvent.screenResolution} AND ${myEvent.screenResolution} IS NOT NULL THEN 1.0 ELSE 0 END as screen_score,
          CASE WHEN hardware_concurrency = ${myEvent.hardwareConcurrency} AND device_memory = ${myEvent.deviceMemory}
                AND ${myEvent.hardwareConcurrency} IS NOT NULL AND ${myEvent.deviceMemory} IS NOT NULL THEN 1.0 ELSE 0 END as hardware_score,
          CASE WHEN timezone = ${myEvent.timezone} AND ${myEvent.timezone} IS NOT NULL THEN 0.5 ELSE 0 END as tz_score,
          CASE WHEN language = ${myEvent.language} AND ${myEvent.language} IS NOT NULL THEN 0.5 ELSE 0 END as lang_score,
          CASE WHEN platform = ${myEvent.platform} AND ${myEvent.platform} IS NOT NULL THEN 0.5 ELSE 0 END as platform_score
        FROM other_wallets
      `);
      
      const scoreBreakdown: Array<{ wallet: string; signal: string; points: number }> = [];
      const matchingWallets = new Set<string>();
      let totalScore = 0;
      
      for (const row of result.rows as any[]) {
        const wallet = row.wallet_address;
        const scores = [
          { signal: 'IP', points: parseFloat(row.ip_score) },
          { signal: 'Storage Token', points: parseFloat(row.token_score) },
          { signal: 'User-Agent', points: parseFloat(row.ua_score) },
          { signal: 'Screen', points: parseFloat(row.screen_score) },
          { signal: 'Hardware', points: parseFloat(row.hardware_score) },
          { signal: 'Timezone', points: parseFloat(row.tz_score) },
          { signal: 'Language', points: parseFloat(row.lang_score) },
          { signal: 'Platform', points: parseFloat(row.platform_score) },
        ];
        
        const walletTotal = scores.reduce((sum, s) => sum + s.points, 0);
        if (walletTotal >= 4) {
          matchingWallets.add(wallet);
          for (const s of scores) {
            if (s.points > 0) {
              scoreBreakdown.push({ wallet, signal: s.signal, points: s.points });
            }
          }
          if (walletTotal > totalScore) totalScore = walletTotal;
        }
      }
      
      return {
        fingerprint,
        scoreBreakdown,
        totalScore,
        matchingWallets: Array.from(matchingWallets),
      };
    } catch (error) {
      console.error('[Sybil] Error getting wallet fingerprint details:', error);
      return { fingerprint: null, scoreBreakdown: [], totalScore: 0, matchingWallets: [] };
    }
  }

  async getSuspiciousStorageTokenPatterns(minWallets: number = 2): Promise<Array<{
    storageToken: string;
    walletCount: number;
    wallets: string[];
    eventCount: number;
    firstSeen: string;
    lastSeen: string;
  }>> {
    try {
      const results = await db.execute(sql`
        SELECT 
          storage_token,
          COUNT(DISTINCT wallet_address) as wallet_count,
          ARRAY_AGG(DISTINCT wallet_address) as wallets,
          COUNT(*) as event_count,
          MIN(created_at) as first_seen,
          MAX(created_at) as last_seen
        FROM ip_events
        WHERE storage_token IS NOT NULL
        GROUP BY storage_token
        HAVING COUNT(DISTINCT wallet_address) >= ${minWallets}
        ORDER BY wallet_count DESC, event_count DESC
        LIMIT 100
      `);

      return (results.rows as any[]).map(row => ({
        storageToken: row.storage_token,
        walletCount: parseInt(row.wallet_count),
        wallets: row.wallets || [],
        eventCount: parseInt(row.event_count),
        firstSeen: row.first_seen ? new Date(row.first_seen).toISOString() : '',
        lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : '',
      }));
    } catch (error) {
      console.error('[Sybil] Error getting suspicious storage token patterns:', error);
      return [];
    }
  }

  async getAllFlaggedWalletsWithScores(): Promise<Array<{
    wallet: string;
    score: number;
    matchCount: number;
    signals: string[];
  }>> {
    try {
      // Get all wallets and their highest matching scores
      const results = await db.execute(sql`
        WITH wallet_fingerprints AS (
          SELECT DISTINCT ON (wallet_address)
            wallet_address,
            ip_hash, storage_token, user_agent, screen_resolution,
            hardware_concurrency, device_memory, timezone, language, platform
          FROM ip_events
          ORDER BY wallet_address, created_at DESC
        ),
        scored_pairs AS (
          SELECT 
            w1.wallet_address as wallet1,
            w2.wallet_address as wallet2,
            (CASE WHEN w1.ip_hash = w2.ip_hash AND w1.ip_hash IS NOT NULL THEN 2.0 ELSE 0 END) +
            (CASE WHEN w1.storage_token = w2.storage_token AND w1.storage_token IS NOT NULL THEN 2.0 ELSE 0 END) +
            (CASE WHEN w1.user_agent = w2.user_agent AND w1.user_agent IS NOT NULL THEN 2.0 ELSE 0 END) +
            (CASE WHEN w1.screen_resolution = w2.screen_resolution AND w1.screen_resolution IS NOT NULL THEN 1.0 ELSE 0 END) +
            (CASE WHEN w1.hardware_concurrency = w2.hardware_concurrency AND w1.device_memory = w2.device_memory 
                  AND w1.hardware_concurrency IS NOT NULL AND w1.device_memory IS NOT NULL THEN 1.0 ELSE 0 END) +
            (CASE WHEN w1.timezone = w2.timezone AND w1.timezone IS NOT NULL THEN 0.5 ELSE 0 END) +
            (CASE WHEN w1.language = w2.language AND w1.language IS NOT NULL THEN 0.5 ELSE 0 END) +
            (CASE WHEN w1.platform = w2.platform AND w1.platform IS NOT NULL THEN 0.5 ELSE 0 END) as score,
            ARRAY_REMOVE(ARRAY[
              CASE WHEN w1.ip_hash = w2.ip_hash AND w1.ip_hash IS NOT NULL THEN 'IP' END,
              CASE WHEN w1.storage_token = w2.storage_token AND w1.storage_token IS NOT NULL THEN 'Token' END,
              CASE WHEN w1.user_agent = w2.user_agent AND w1.user_agent IS NOT NULL THEN 'UA' END,
              CASE WHEN w1.screen_resolution = w2.screen_resolution AND w1.screen_resolution IS NOT NULL THEN 'Screen' END,
              CASE WHEN w1.hardware_concurrency = w2.hardware_concurrency AND w1.device_memory = w2.device_memory THEN 'HW' END,
              CASE WHEN w1.timezone = w2.timezone AND w1.timezone IS NOT NULL THEN 'TZ' END,
              CASE WHEN w1.language = w2.language AND w1.language IS NOT NULL THEN 'Lang' END,
              CASE WHEN w1.platform = w2.platform AND w1.platform IS NOT NULL THEN 'Plat' END
            ], NULL) as matching_signals
          FROM wallet_fingerprints w1
          CROSS JOIN wallet_fingerprints w2
          WHERE w1.wallet_address < w2.wallet_address
        )
        SELECT 
          wallet,
          MAX(score) as max_score,
          COUNT(*) as match_count,
          ARRAY_AGG(DISTINCT signal) as all_signals
        FROM (
          SELECT wallet1 as wallet, score, UNNEST(matching_signals) as signal FROM scored_pairs WHERE score >= 4
          UNION ALL
          SELECT wallet2 as wallet, score, UNNEST(matching_signals) as signal FROM scored_pairs WHERE score >= 4
        ) flagged
        GROUP BY wallet
        ORDER BY max_score DESC, match_count DESC
        LIMIT 200
      `);

      return (results.rows as any[]).map(row => ({
        wallet: row.wallet,
        score: parseFloat(row.max_score),
        matchCount: parseInt(row.match_count),
        signals: row.all_signals || [],
      }));
    } catch (error) {
      console.error('[Sybil] Error getting flagged wallets with scores:', error);
      return [];
    }
  }
}

export const storage = new DbStorage();
