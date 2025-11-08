import { type User, type InsertUser, type BalanceResponse, type Transaction, type PaymentRequest, type Authorization, authorizations, wallets, cachedBalances, cachedTransactions, exchangeRates, balanceHistory, cachedMaxflowScores } from "@shared/schema";
import { randomUUID } from "crypto";
import { createPublicClient, http, type Address } from 'viem';
import { base, celo } from 'viem/chains';
import { db } from "./db";
import { eq, and, or, desc, sql } from "drizzle-orm";

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

// Etherscan v2 unified API - supports 60+ EVM chains with single API key
async function fetchTransactionsFromEtherscan(address: string, chainId: number): Promise<Transaction[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.log('[Etherscan v2] No API key configured, skipping on-chain transaction fetch');
    console.log('[Etherscan v2] Please add ETHERSCAN_API_KEY to your Replit Secrets');
    return [];
  }

  // Map chainId to USDC contract address
  const usdcAddresses: Record<number, string> = {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // Base mainnet
    42220: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',  // Celo mainnet
  };

  const usdcAddress = usdcAddresses[chainId];
  if (!usdcAddress) {
    console.error(`[Etherscan v2] Unsupported chainId: ${chainId}`);
    return [];
  }

  const chainName = chainId === 8453 ? 'Base' : chainId === 42220 ? 'Celo' : `Chain ${chainId}`;
  
  // Etherscan v2 unified endpoint with chainid parameter
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=tokentx&contractaddress=${usdcAddress}&address=${address}&sort=desc&apikey=${apiKey}`;

  try {
    console.log(`[Etherscan v2] Fetching ${chainName} transactions for ${address}`);
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== '1' || !data.result) {
      console.log(`[Etherscan v2] No ${chainName} transactions found or API error:`, data.message);
      return [];
    }

    const transactions: Transaction[] = data.result.map((tx: BlockExplorerTx) => {
      // Normalize addresses for comparison (handle checksum variations)
      const normalizedWallet = address.toLowerCase();
      const normalizedFrom = tx.from.toLowerCase();
      const normalizedTo = tx.to.toLowerCase();
      
      const isSend = normalizedFrom === normalizedWallet;
      // Store raw micro-USDC value to preserve full 6-decimal precision
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

    console.log(`[Etherscan v2] Found ${transactions.length} ${chainName} transactions`);
    return transactions;
  } catch (error) {
    console.error(`[Etherscan v2] Error fetching ${chainName} transactions:`, error);
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
  
  // Admin methods
  clearAllCaches(): Promise<void>;
  clearCachedBalances(): Promise<void>;
  clearBalanceHistory(): Promise<void>;
  migrateToMicroUsdc(): Promise<{ migratedTransactions: number; migratedBalances: number }>;
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
      // Fetch real blockchain balance
      const chain = chainId === 8453 ? base : celo;
      const usdcAddress = chainId === 8453 
        ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address  // Base USDC
        : '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as Address; // Celo Circle native USDC
      
      console.log(`[Balance API] Using ${chain.name} (chainId: ${chain.id}), USDC: ${usdcAddress}`);
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

  async migrateToMicroUsdc(): Promise<{ migratedTransactions: number; migratedBalances: number }> {
    // MemStorage doesn't use database, no-op
    return { migratedTransactions: 0, migratedBalances: 0 };
  }
}

// Database storage with PostgreSQL for all data
export class DbStorage extends MemStorage {
  private readonly CACHE_TTL_MS = 30000; // 30 seconds for balance cache
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
      
      // Parse cached balance to get micro-USDC
      // Cached balance is stored as decimal string (legacy format)
      const balanceParts = cached[0].balance.split('.');
      const balanceWhole = balanceParts[0] || '0';
      const balanceFraction = (balanceParts[1] || '0').padEnd(6, '0').slice(0, 6);
      const balanceMicro = balanceWhole + balanceFraction;
      
      return {
        balance: cached[0].balance,
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
        balance: balance.balance,
        decimals: balance.decimals,
        nonce: balance.nonce,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [cachedBalances.address, cachedBalances.chainId],
        set: {
          balance: balance.balance,
          nonce: balance.nonce,
          updatedAt: new Date(),
        },
      });

      // Save balance snapshot for history tracking (using micro-USDC for precision)
      await this.saveBalanceSnapshot(address, chainId, balance.balanceMicro);
    } catch (error) {
      console.error('[DB] Error caching balance:', error);
    }
  }

  private async cacheTransactions(address: string, chainId: number, transactions: Transaction[]): Promise<void> {
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
        }).onConflictDoNothing();
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

    const cached = cachedResults.map(tx => ({
      id: tx.txHash,
      type: tx.type as 'send' | 'receive',
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      timestamp: tx.timestamp.toISOString(),
      status: tx.status as 'pending' | 'completed' | 'failed',
      txHash: tx.txHash,
    }));

    // If cache is empty, fetch fresh transactions from Etherscan
    // This handles the case where transactions were added after initial empty cache
    if (cached.length === 0) {
      console.log(`[DB Cache] No cached transactions for ${address} on chain ${chainId}, fetching fresh data`);
      const freshTransactions = await fetchTransactionsFromEtherscan(address, chainId);
      
      // Cache the fresh transactions
      if (freshTransactions.length > 0) {
        await this.cacheTransactions(address, chainId, freshTransactions);
      }
      
      return freshTransactions;
    }

    return cached;
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

  async migrateToMicroUsdc(): Promise<{ migratedTransactions: number; migratedBalances: number }> {
    try {
      console.log('[Admin] Starting micro-USDC migration');
      
      // Migrate cached_transactions: convert decimal amounts to micro-USDC integers
      const txResult = await db.execute(sql`
        UPDATE cached_transactions
        SET amount = CAST(CAST(amount AS NUMERIC) * 1000000 AS TEXT)
        WHERE amount ~ '^[0-9]+\.[0-9]+$'
          AND CAST(amount AS NUMERIC) < 1000
      `);
      
      // Migrate cached_balances: convert decimal balances to micro-USDC integers  
      const balanceResult = await db.execute(sql`
        UPDATE cached_balances
        SET balance = CAST(CAST(balance AS NUMERIC) * 1000000 AS TEXT)
        WHERE balance ~ '^[0-9]+\.[0-9]+$'
          AND CAST(balance AS NUMERIC) < 1000
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
}

export const storage = new DbStorage();
