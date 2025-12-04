import { type User, type InsertUser, type BalanceResponse, type Transaction, type PaymentRequest, type Authorization, type AaveOperation, type PoolSettings, type PoolDraw, type PoolContribution, type Referral, authorizations, wallets, cachedBalances, cachedTransactions, exchangeRates, balanceHistory, cachedMaxflowScores, gasDrips, aaveOperations, poolSettings, poolDraws, poolContributions, referrals } from "@shared/schema";
import { randomUUID } from "crypto";
import { createPublicClient, http, type Address } from 'viem';
import { base, celo, gnosis } from 'viem/chains';
import { db } from "./db";
import { eq, and, or, desc, sql, gte } from "drizzle-orm";
import { getNetworkByChainId } from "@shared/networks";

function resolveChainForStorage(chainId: number) {
  switch (chainId) {
    case 8453:
      return { viemChain: base, name: 'Base' };
    case 42220:
      return { viemChain: celo, name: 'Celo' };
    case 100:
      return { viemChain: gnosis, name: 'Gnosis' };
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
      from: tx.from,
      to: tx.to,
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
  };

  const usdcAddress = usdcAddresses[chainId];
  if (!usdcAddress) {
    console.error(`[Explorer] Unsupported chainId: ${chainId}`);
    return [];
  }

  const chainName = chainId === 8453 ? 'Base' : chainId === 42220 ? 'Celo' : chainId === 100 ? 'Gnosis' : `Chain ${chainId}`;

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
  ownerAddress: string;
  localHealth: number;
  seedAddresses: string[];
  metrics: {
    totalNodes: number;
    acceptedUsers: number;
    avgResidualFlow: number;
    medianMinCut: number;
    maxPossibleFlow: number;
  };
  nodeDetails: any[];
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
}

// Database storage with PostgreSQL for all data
export class DbStorage extends MemStorage {
  private readonly CACHE_TTL_MS = 30000; // 30 seconds for balance cache
  private readonly TRANSACTION_CACHE_TTL_MS = 300000; // 5 minutes for transaction cache
  private readonly RATE_TTL_MS = 300000; // 5 minutes for exchange rates

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
      // Fetch the balance from the OTHER chain to calculate total
      const otherChainId = updatedChainId === 8453 ? 42220 : 8453;
      
      const otherChainCached = await db
        .select()
        .from(cachedBalances)
        .where(and(eq(cachedBalances.address, address), eq(cachedBalances.chainId, otherChainId)))
        .limit(1);

      // Calculate total balance (current chain + other chain, or just current if other doesn't exist)
      const otherChainBalance = otherChainCached[0]?.balance || '0';
      const totalBalance = (BigInt(updatedBalance) + BigInt(otherChainBalance)).toString();

      // Save aggregated snapshot with chainId=0 to indicate "all chains"
      await this.saveBalanceSnapshot(address, 0, totalBalance);
      
      console.log(`[DB] Saved aggregated snapshot: ${totalBalance} micro-USDC (${updatedChainId}: ${updatedBalance}, ${otherChainId}: ${otherChainBalance})`);
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
    // Check cache first
    const cachedResults = await db
      .select()
      .from(cachedTransactions)
      .where(
        and(
          eq(cachedTransactions.chainId, chainId),
          or(
            eq(cachedTransactions.from, address),
            eq(cachedTransactions.to, address)
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
    try {
      const MAXFLOW_CACHE_TTL_MS = 300000; // 5 minutes
      
      const cached = await db
        .select()
        .from(cachedMaxflowScores)
        .where(eq(cachedMaxflowScores.address, address.toLowerCase()))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const cacheAge = Date.now() - cached[0].updatedAt.getTime();
      
      if (cacheAge > MAXFLOW_CACHE_TTL_MS) {
        console.log(`[DB Cache] MaxFlow score cache expired for ${address} (age: ${Math.round(cacheAge / 1000)}s)`);
        return null;
      }

      console.log(`[DB Cache] Returning cached MaxFlow score for ${address} (age: ${Math.round(cacheAge / 1000)}s)`);
      return JSON.parse(cached[0].scoreData) as MaxFlowScore;
    } catch (error) {
      console.error('[DB] Error fetching cached MaxFlow score:', error);
      return null;
    }
  }

  async saveMaxFlowScore(address: string, scoreData: MaxFlowScore): Promise<void> {
    try {
      await db
        .insert(cachedMaxflowScores)
        .values({
          address: address.toLowerCase(),
          scoreData: JSON.stringify(scoreData),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: cachedMaxflowScores.address,
          set: {
            scoreData: JSON.stringify(scoreData),
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
    const chainIds = [8453, 42220, 100]; // Base, Celo, Gnosis
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

  async getAllPoolSettings(): Promise<PoolSettings[]> {
    try {
      return await db.select().from(poolSettings);
    } catch (error) {
      console.error('[Pool] Error getting all settings:', error);
      return [];
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

  async completeDraw(drawId: string, data: { winnerAddress: string; winnerTickets: string; winningNumber: string }): Promise<void> {
    try {
      await db
        .update(poolDraws)
        .set({
          status: 'completed',
          winnerAddress: data.winnerAddress,
          winnerTickets: data.winnerTickets,
          winningNumber: data.winningNumber,
          drawnAt: new Date(),
        })
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
}

export const storage = new DbStorage();
