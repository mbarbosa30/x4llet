import { type User, type InsertUser, type BalanceResponse, type Transaction, type PaymentRequest, type Authorization, authorizations } from "@shared/schema";
import { randomUUID } from "crypto";
import { createPublicClient, http, type Address } from 'viem';
import { base, celo } from 'viem/chains';
import { db } from "./db";
import { eq, and, or } from "drizzle-orm";

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
      const isSend = tx.from.toLowerCase() === address.toLowerCase();
      const amount = formatUsdcAmount(tx.value);

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
        amount: '250.00',
        timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
        status: 'completed',
        txHash: '0xabc123...',
      },
      {
        id: randomUUID(),
        type: 'send',
        from: mockAddress,
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '50.00',
        timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
        status: 'completed',
        txHash: '0xdef456...',
      },
      {
        id: randomUUID(),
        type: 'receive',
        from: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        to: mockAddress,
        amount: '1000.00',
        timestamp: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
        status: 'completed',
        txHash: '0x789ghi...',
      },
    ];

    this.balances.set(`${mockAddress}-8453`, {
      balance: '1250.00',
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
      
      // Convert from 6 decimals to human readable (using BigInt to preserve precision)
      const balanceInUsdc = formatUsdcAmount(balance);
      console.log(`[Balance API] Converted balance: ${balanceInUsdc} USDC`);
      
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
      
      const txAmount = parseFloat(tx.amount);
      const currentBalance = parseFloat(existing.balance);
      
      if (tx.type === 'receive') {
        existing.balance = (currentBalance + txAmount).toFixed(2);
      } else {
        existing.balance = (currentBalance - txAmount).toFixed(2);
      }
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
}

// Database storage with PostgreSQL for authorizations
export class DbStorage extends MemStorage {
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
}

export const storage = new DbStorage();
