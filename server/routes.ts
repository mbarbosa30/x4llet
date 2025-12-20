import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { transferRequestSchema, transferResponseSchema, paymentRequestSchema, submitAuthorizationSchema, authorizationSchema, type Authorization, aaveOperations, poolDraws } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { getNetworkConfig, getNetworkByChainId } from "@shared/networks";

// =============================================
// IP Hashing for Sybil Detection
// =============================================
// Uses stable salt to track patterns across time (not daily rotation)
// This allows detecting repeat offenders who create multiple wallets
const IP_SALT_SECRET = process.env.IP_SALT_SECRET || 'nanopay-sybil-stable-v1';

function hashIp(ip: string): string {
  // Use stable salt so same IP always hashes to same value
  // This allows cross-session sybil detection
  return createHash('sha256').update(`${ip}-${IP_SALT_SECRET}`).digest('hex').substring(0, 32);
}

function getClientIp(req: Request): string {
  // Check standard proxy headers (Cloudflare, nginx, etc.)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return typeof realIp === 'string' ? realIp : realIp[0];
  // Fallback to connection IP
  return req.socket?.remoteAddress || 'unknown';
}

interface FingerprintData {
  userAgent?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  storageToken?: string;
}

async function logIpEvent(
  req: Request,
  walletAddress: string,
  eventType: 'first_seen' | 'xp_claim' | 'usdc_redemption' | 'airdrop',
  fingerprint?: FingerprintData
): Promise<void> {
  try {
    const clientIp = getClientIp(req);
    if (!clientIp || clientIp === 'unknown') return;
    
    const ipHash = hashIp(clientIp);
    // Use fingerprint data from client if provided, fallback to server-side user-agent
    const userAgent = fingerprint?.userAgent || req.headers['user-agent'] || null;
    
    await storage.logIpEvent({
      walletAddress: walletAddress.toLowerCase(),
      ipHash,
      networkPrefix: null,
      eventType,
      userAgent,
      screenResolution: fingerprint?.screenResolution || null,
      timezone: fingerprint?.timezone || null,
      language: fingerprint?.language || null,
      platform: fingerprint?.platform || null,
      hardwareConcurrency: fingerprint?.hardwareConcurrency || null,
      deviceMemory: fingerprint?.deviceMemory || null,
      storageToken: fingerprint?.storageToken || null,
    });
  } catch (error) {
    // Silent fail - IP logging should never break main functionality
    console.error('[Sybil] Error logging IP event:', error);
  }
}
import { AAVE_POOL_ABI, ATOKEN_ABI, ERC20_ABI, rayToPercent } from "@shared/aave";
import { createPublicClient, createWalletClient, http, type Address, type Hex, hexToSignature, recoverAddress, hashTypedData, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, celo, gnosis, arbitrum } from 'viem/chains';
import { getSchedulerStatus } from './poolScheduler';
import { executePoolDraw } from './drawExecutor';

// USDC EIP-3009 ABI
// Note: Both functions are defined, but this implementation uses transferWithAuthorization for all cases
// (online and offline modes) since the facilitator submits transactions and pays gas fees
const USDC_ABI = [
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'receiveWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

// aUSDC EIP-2612 Permit ABI for gasless yield transfers
const AUSDC_PERMIT_ABI = [
  {
    name: 'permit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'transferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'DOMAIN_SEPARATOR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

function getFacilitatorAccount() {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('FACILITATOR_PRIVATE_KEY not set');
  }
  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(formattedKey as Hex);
}

function resolveChain(chainId: number) {
  switch (chainId) {
    case 8453:
      return { viemChain: base, networkKey: 'base' as const, name: 'Base' };
    case 42220:
      return { viemChain: celo, networkKey: 'celo' as const, name: 'Celo' };
    case 100:
      return { viemChain: gnosis, networkKey: 'gnosis' as const, name: 'Gnosis' };
    case 42161:
      return { viemChain: arbitrum, networkKey: 'arbitrum' as const, name: 'Arbitrum' };
    default:
      return null;
  }
}

// MaxFlow API Proxy Routes (v1 API - https://maxflow.one/api/v1)
// Primary domain with fallback to Replit internal domain for DNS reliability
const MAXFLOW_API_BASE = 'https://maxflow.one/api/v1';
const MAXFLOW_API_FALLBACK = 'https://TrustFlow.replit.app/api/v1'; // Fallback for DNS issues
const MAXFLOW_REQUEST_TIMEOUT_MS = 15000; // 15 second timeout

// Helper: Standard headers for MaxFlow API requests
const MAXFLOW_HEADERS_BASE = {
  'Accept': 'application/json',
  'User-Agent': 'nanoPay/1.0 (https://nanopay.live)',
};

// Helper: Check if error is a DNS resolution failure
function isDnsError(error: any): boolean {
  return error?.cause?.code === 'EAI_AGAIN' || 
         error?.code === 'EAI_AGAIN' ||
         error?.cause?.code === 'ENOTFOUND' ||
         error?.code === 'ENOTFOUND';
}

// Helper: Single fetch attempt with timeout
async function singleFetch(
  url: string, 
  options: RequestInit, 
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<globalThis.Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers as Record<string, string>,
    },
    signal,
  });
}

// Helper: Fetch with timeout, retry, and fallback for MaxFlow API
// Note: Returns globalThis.Response (fetch API), not Express Response
// Implements retry logic for DNS failures (EAI_AGAIN) with exponential backoff
// Falls back to TrustFlow.replit.app if primary domain DNS fails
async function fetchMaxFlow(url: string, options: RequestInit = {}, retries = 3): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MAXFLOW_REQUEST_TIMEOUT_MS);
  
  // Compose signals: both the helper's timeout and any caller-supplied signal can abort
  const signals: AbortSignal[] = [controller.signal];
  if (options.signal) {
    signals.push(options.signal);
  }
  const composedSignal = signals.length > 1 ? AbortSignal.any(signals) : controller.signal;
  
  // Build headers - only add Content-Type for POST/PUT/PATCH with body
  const headers: Record<string, string> = { ...MAXFLOW_HEADERS_BASE };
  const method = (options.method || 'GET').toUpperCase();
  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && options.body) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Retry loop with exponential backoff for DNS failures
  let lastError: any = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await singleFetch(url, options, headers, composedSignal);
    } catch (error: any) {
      lastError = error;
      
      // If it's the last attempt or not a DNS error, break and try fallback below
      if (attempt === retries - 1 || !isDnsError(error)) {
        break;
      }
      
      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = 500 * Math.pow(2, attempt);
      console.log(`[MaxFlow] DNS error (${error.cause?.code || error.code}), retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If DNS error and URL uses primary domain, try fallback
  if (isDnsError(lastError) && url.includes(MAXFLOW_API_BASE)) {
    const fallbackUrl = url.replace(MAXFLOW_API_BASE, MAXFLOW_API_FALLBACK);
    console.log(`[MaxFlow] Primary domain DNS failed, trying fallback: ${fallbackUrl}`);
    
    try {
      const fallbackResponse = await singleFetch(fallbackUrl, options, headers, composedSignal);
      console.log(`[MaxFlow] Fallback succeeded (status: ${fallbackResponse.status})`);
      clearTimeout(timeoutId);
      return fallbackResponse;
    } catch (fallbackError: any) {
      console.error(`[MaxFlow] Fallback also failed: ${fallbackError.cause?.code || fallbackError.code || fallbackError.message}`);
      // Preserve original error for consistency
    }
  }
  
  // All retries and fallback exhausted
  clearTimeout(timeoutId);
  const errorCode = lastError?.cause?.code || lastError?.code;
  if (errorCode === 'EAI_AGAIN' || errorCode === 'ENOTFOUND') {
    console.error(`[MaxFlow] DNS resolution failed after ${retries} retries and fallback (code: ${errorCode})`);
  }
  throw lastError;
}

// Helper: Check if MaxFlow API cached_at is stale (older than 1 hour)
const MAXFLOW_API_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function isMaxFlowResponseStale(data: any): boolean {
  if (!data?.cached || !data?.cached_at) return false;
  const cachedAt = new Date(data.cached_at).getTime();
  const age = Date.now() - cachedAt;
  return age > MAXFLOW_API_STALE_THRESHOLD_MS;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const BUILD_VERSION = '2025-12-16T14:30:00Z';
  
  app.get('/api/version', (req, res) => {
    res.json({
      version: BUILD_VERSION,
      maxflowApiBase: 'https://maxflow.one/api/v1',
      timestamp: new Date().toISOString()
    });
  });

  // Sybil Detection: Submit browser fingerprint data
  app.post('/api/sybil/fingerprint', async (req, res) => {
    try {
      const { walletAddress, fingerprint } = req.body;
      
      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/i.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      
      // Log fingerprint event (always logs, not just first_seen)
      await logIpEvent(req, walletAddress, 'first_seen', fingerprint);
      
      res.json({ success: true });
    } catch (error) {
      console.error('[Sybil] Error logging fingerprint:', error);
      res.status(500).json({ error: 'Failed to log fingerprint' });
    }
  });

  // Batched dashboard endpoint - combines balance, transactions, and XP into single request
  // Reduces network round-trips for Home page initial load
  app.get('/api/dashboard/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      // Log IP event for sybil detection - only if no events exist yet for this wallet
      // This backfills old users who created wallets before IP tracking was added
      const hasExistingEvents = await storage.hasIpEventsForWallet(address);
      if (!hasExistingEvents) {
        logIpEvent(req, address, 'first_seen');
      }

      // OPTIMIZED: Use getAllBalances for single DB query + parallel transaction fetch
      const [
        allBalances,
        baseTransactions,
        celoTransactions,
        gnosisTransactions,
        arbitrumTransactions,
        xpBalance,
        maxflowScore,
        sybilStatus,
      ] = await Promise.all([
        storage.getAllBalances(address),
        storage.getTransactions(address, 8453),
        storage.getTransactions(address, 42220),
        storage.getTransactions(address, 100),
        storage.getTransactions(address, 42161),
        storage.getXpBalance(address),
        storage.getMaxFlowScore(address),
        storage.isWalletSuspicious(address),
      ]);

      // Merge and sort transactions
      const allTransactions = [
        ...baseTransactions.map(tx => ({ ...tx, chainId: 8453 })),
        ...celoTransactions.map(tx => ({ ...tx, chainId: 42220 })),
        ...gnosisTransactions.map(tx => ({ ...tx, chainId: 100 })),
        ...arbitrumTransactions.map(tx => ({ ...tx, chainId: 42161 })),
      ].sort((a, b) => {
        const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });

      // Calculate XP status
      const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
      let canClaim = true;
      let nextClaimTime: string | null = null;
      let timeUntilNextClaim: number | null = null;

      if (xpBalance?.lastClaimTime) {
        const timeSinceLastClaim = Date.now() - xpBalance.lastClaimTime.getTime();
        if (timeSinceLastClaim < CLAIM_COOLDOWN_MS) {
          canClaim = false;
          const nextTime = new Date(xpBalance.lastClaimTime.getTime() + CLAIM_COOLDOWN_MS);
          nextClaimTime = nextTime.toISOString();
          timeUntilNextClaim = CLAIM_COOLDOWN_MS - timeSinceLastClaim;
        }
      }

      // Guard against undefined xpBalance - ensure numeric fields default to 0
      const totalXpCenti = xpBalance?.totalXp ?? 0;
      const claimCount = xpBalance?.claimCount ?? 0;

      // If MaxFlow cache is stale, trigger background refresh server-side
      const maxflowStale = (maxflowScore as any)?._stale;
      if (maxflowStale) {
        console.log(`[Dashboard] MaxFlow cache stale for ${address}, triggering background refresh`);
        (async () => {
          try {
            const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${address}`);
            if (response.ok) {
              const data = await response.json();
              await storage.saveMaxFlowScore(address, data);
              console.log(`[Dashboard] Background MaxFlow refresh complete for ${address}`);
            }
          } catch (err) {
            console.error(`[Dashboard] Background MaxFlow refresh failed for ${address}:`, err);
          }
        })();
      }
      
      // Remove internal _stale flag from response
      const { _stale, ...maxflowData } = (maxflowScore as any) ?? {};

      res.json({
        balance: {
          balance: allBalances.balance,
          balanceMicro: allBalances.balanceMicro,
          decimals: allBalances.decimals,
          nonce: 0,
          chains: allBalances.chains,
        },
        transactions: allTransactions,
        xp: {
          totalXp: totalXpCenti / 100,
          claimCount,
          lastClaimTime: xpBalance?.lastClaimTime?.toISOString() ?? null,
          canClaim,
          nextClaimTime,
          timeUntilNextClaim,
        },
        maxflow: maxflowScore ? maxflowData : null,
        sybil: sybilStatus,
      });
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  app.get('/api/balance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;
      const forceRefresh = req.query.refresh === 'true';
      
      // If chainId provided, return single chain balance (legacy support)
      if (chainId !== undefined) {
        const balance = await storage.getBalance(address, chainId, forceRefresh);
        return res.json(balance);
      }
      
      // OPTIMIZED: Use getAllBalances which fetches all chains in ONE database query
      // and triggers only ONE background refresh per address
      const allBalances = await storage.getAllBalances(address, forceRefresh);
      
      res.json({
        balance: allBalances.balance,
        balanceMicro: allBalances.balanceMicro,
        decimals: allBalances.decimals,
        nonce: '', // Not critical for aggregated view
        transactions: [], // Will be fetched separately via /api/transactions
        chains: allBalances.chains,
      });
    } catch (error) {
      console.error('Error fetching balance:', error);
      res.status(500).json({ error: 'Failed to fetch balance' });
    }
  });

  app.get('/api/transactions/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;
      
      // If chainId provided, return single chain transactions (legacy support)
      if (chainId !== undefined) {
        const transactions = await storage.getTransactions(address, chainId);
        return res.json(transactions);
      }
      
      // Otherwise, fetch transactions from all chains in parallel
      const [baseTransactions, celoTransactions, gnosisTransactions, arbitrumTransactions] = await Promise.all([
        storage.getTransactions(address, 8453),
        storage.getTransactions(address, 42220),
        storage.getTransactions(address, 100),
        storage.getTransactions(address, 42161),
      ]);
      
      // Add chainId to each transaction and merge
      const baseTxsWithChain = baseTransactions.map(tx => ({ ...tx, chainId: 8453 }));
      const celoTxsWithChain = celoTransactions.map(tx => ({ ...tx, chainId: 42220 }));
      const gnosisTxsWithChain = gnosisTransactions.map(tx => ({ ...tx, chainId: 100 }));
      const arbitrumTxsWithChain = arbitrumTransactions.map(tx => ({ ...tx, chainId: 42161 }));
      
      // Merge and sort by timestamp (most recent first), with txHash as tiebreaker for deterministic ordering
      const allTransactions = [...baseTxsWithChain, ...celoTxsWithChain, ...gnosisTxsWithChain, ...arbitrumTxsWithChain]
        .sort((a, b) => {
          const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          if (timeDiff !== 0) return timeDiff;
          // Tiebreaker: use txHash for deterministic ordering
          return a.id.localeCompare(b.id);
        });
      
      res.json(allTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  app.post('/api/relay/transfer-3009', async (req, res) => {
    try {
      const validatedData = transferRequestSchema.parse(req.body);
      
      // Validate domain chainId matches request chainId
      if (validatedData.typedData.domain.chainId !== validatedData.chainId) {
        return res.status(400).json({ error: 'Chain ID mismatch between domain and request' });
      }
      
      // Validate domain parameters (name varies by network, version is always "2")
      // Celo: "USDC", Gnosis: "Bridged USDC (Gnosis)", Base/Arbitrum: "USD Coin"
      const getExpectedDomainName = (chainId: number): string => {
        if (chainId === 42220) return 'USDC';
        if (chainId === 100) return 'Bridged USDC (Gnosis)';
        return 'USD Coin';
      };
      const expectedName = getExpectedDomainName(validatedData.chainId);
      if (validatedData.typedData.domain.name !== expectedName ||
          validatedData.typedData.domain.version !== '2') {
        return res.status(400).json({ error: `Invalid domain parameters (expected name: "${expectedName}", version: "2")` });
      }
      
      const { from, to, value, validAfter, validBefore, nonce } = validatedData.typedData.message;
      
      if (!from || !to || !value || !validAfter || !validBefore || !nonce) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      if (!/^0x[a-fA-F0-9]{40}$/.test(from) || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
        return res.status(400).json({ error: 'Invalid address format' });
      }
      
      // Validate timestamps
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(validBefore) < now) {
        return res.status(400).json({ error: 'Authorization expired' });
      }
      
      if (parseInt(validAfter) > now) {
        return res.status(400).json({ error: 'Authorization not yet valid' });
      }
      
      console.log('[Facilitator] Processing online transfer:', {
        from,
        to,
        value,
        chainId: validatedData.chainId,
      });

      // Log IP event for sybil detection (sender activity)
      logIpEvent(req, from, 'usdc_redemption');
      
      const chainInfo = resolveChain(validatedData.chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${validatedData.chainId}` });
      }
      
      const chain = chainInfo.viemChain;
      const networkConfig = getNetworkConfig(chainInfo.networkKey);
      const facilitatorAccount = getFacilitatorAccount();
      
      // Create wallet client
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      // Extract v, r, s from signature using viem utilities
      const signature = validatedData.signature as Hex;
      const { r, s, v } = hexToSignature(signature);
      
      // Verify signature locally before submitting to blockchain
      const domain = {
        name: validatedData.typedData.domain.name,
        version: validatedData.typedData.domain.version,
        chainId: validatedData.typedData.domain.chainId,
        verifyingContract: validatedData.typedData.domain.verifyingContract as Address,
      };
      
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };
      
      const message = {
        from: from as Address,
        to: to as Address,
        value: BigInt(value),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as Hex,
      };
      
      // Recover the address from the signature
      const recoveredAddress = await recoverAddress({
        hash: hashTypedData({ domain, types, primaryType: 'TransferWithAuthorization', message }),
        signature,
      });
      
      console.log('[Facilitator] Signature verification:');
      console.log('  Expected signer (from):', from);
      console.log('  Recovered address:', recoveredAddress);
      console.log('  Signature components:', { v, r: r.slice(0, 10) + '...', s: s.slice(0, 10) + '...' });
      
      if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
        console.error('[Facilitator] Signature verification failed!');
        return res.status(400).json({ 
          error: 'Invalid signature: recovered address does not match from address',
          details: `Expected ${from}, got ${recoveredAddress}`
        });
      }
      
      console.log('[Facilitator] Signature verified locally ✓');
      console.log('[Facilitator] Submitting transferWithAuthorization to blockchain...');
      console.log('[Facilitator] Facilitator address:', facilitatorAccount.address);
      console.log('[Facilitator] USDC contract:', networkConfig.usdcAddress);
      console.log('[Facilitator] Domain:', domain);
      console.log('[Facilitator] Message:', { ...message, value: value, nonce: nonce.slice(0, 10) + '...' });
      
      // Submit transaction to blockchain
      const txHash = await walletClient.writeContract({
        address: networkConfig.usdcAddress as Address,
        abi: USDC_ABI,
        functionName: 'transferWithAuthorization',
        args: [
          from as Address,
          to as Address,
          BigInt(value),
          BigInt(validAfter),
          BigInt(validBefore),
          nonce as Hex,
          Number(v),
          r,
          s,
        ],
      });
      
      console.log('[Facilitator] Transaction submitted! Hash:', txHash);
      
      // Store transaction records (amounts in micro-USDC)
      await storage.addTransaction(
        from,
        validatedData.chainId,
        {
          id: randomUUID(),
          type: 'send',
          from,
          to,
          amount: value,
          timestamp: new Date().toISOString(),
          status: 'completed',
          txHash,
        }
      );
      
      await storage.addTransaction(
        to,
        validatedData.chainId,
        {
          id: randomUUID(),
          type: 'receive',
          from,
          to,
          amount: value,
          timestamp: new Date().toISOString(),
          status: 'completed',
          txHash,
        }
      );
      
      const response = transferResponseSchema.parse({
        txHash,
        status: 'submitted',
      });
      
      res.json(response);
    } catch (error: any) {
      console.error('[Facilitator] Error processing transfer:', error);
      res.status(400).json({ 
        error: error.message || 'Invalid transfer request',
        details: error.shortMessage || error.details || undefined
      });
    }
  });

  app.get('/api/exchange-rate/:currency', async (req, res) => {
    try {
      const { currency } = req.params;
      
      // Mock rates as fallback (old rates, used only if API fails)
      const fallbackRates: Record<string, number> = {
        'USD': 1.00,
        'EUR': 0.92,
        'GBP': 0.79,
        'JPY': 149.50,
        'ARS': 1000.00,
        'BRL': 4.97,
        'MXN': 17.20,
        'NGN': 1590.00,
        'KES': 144.00,
        'UGX': 3700.00,
        'TZS': 2500.00,
        'ETB': 57.00,
        'INR': 83.50,
        'CAD': 1.36,
        'AUD': 1.52,
      };

      // Check database cache first
      const cachedRate = await storage.getExchangeRate(currency);
      
      if (cachedRate !== null) {
        res.json({ currency: currency.toUpperCase(), rate: cachedRate });
        return;
      }

      // Cache miss - fetch fresh rates from fawazahmed0 Currency API
      let rate = fallbackRates[currency.toUpperCase()] || 1.00;

      try {
        console.log('[Exchange Rate] Fetching fresh rates from Currency API...');
        
        // Try primary CDN first, fallback to secondary
        const apiUrls = [
          'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
          'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
        ];
        
        let data = null;
        for (const apiUrl of apiUrls) {
          try {
            const apiResponse = await fetch(apiUrl);
            if (apiResponse.ok) {
              data = await apiResponse.json();
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        if (data && data.usd) {
          const fetchedRate = data.usd[currency.toLowerCase()];
          if (fetchedRate) {
            rate = fetchedRate;
            
            // Cache the fresh rate in database
            await storage.cacheExchangeRate(currency, rate);
            
            console.log(`[Exchange Rate] Fresh rate for ${currency} cached: ${rate}`);
          }
        } else {
          console.warn('[Exchange Rate] API returned unexpected format, using fallback rate');
        }
      } catch (apiError) {
        console.error('[Exchange Rate] Failed to fetch from API, using fallback rate:', apiError);
      }
      
      res.json({ currency: currency.toUpperCase(), rate });
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      res.status(500).json({ error: 'Failed to fetch exchange rate' });
    }
  });

  app.get('/api/balance-history/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = parseInt(req.query.chainId as string) || 42220;
      const days = parseInt(req.query.days as string) || 30;
      
      const history = await storage.getBalanceHistory(address, chainId, days);
      res.json(history);
    } catch (error) {
      console.error('Error fetching balance history:', error);
      res.status(500).json({ error: 'Failed to fetch balance history' });
    }
  });

  app.get('/api/inflation-rate/:currency', async (req, res) => {
    try {
      const { currency } = req.params;
      
      const inflationData = await storage.getInflationRate(currency);
      
      if (!inflationData) {
        return res.json({
          currency: currency.toUpperCase(),
          dailyRate: 0,
          monthlyRate: 0,
          annualRate: 0,
        });
      }
      
      res.json(inflationData);
    } catch (error) {
      console.error('Error calculating inflation rate:', error);
      res.status(500).json({ error: 'Failed to calculate inflation rate' });
    }
  });

  // ============================================
  // AAVE YIELD ENDPOINTS
  // ============================================

  // Get facilitator address for gasless operations
  app.get('/api/facilitator/address', async (_req, res) => {
    try {
      const facilitatorAccount = getFacilitatorAccount();
      res.json({ address: facilitatorAccount.address });
    } catch (error) {
      console.error('Error getting facilitator address:', error);
      res.status(500).json({ error: 'Failed to get facilitator address' });
    }
  });

  // ============================================
  // CIRCLES PROTOCOL ENDPOINTS  
  // ============================================

  const CIRCLES_HUB_V2 = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8' as Address;
  const CIRCLES_RPC = 'https://rpc.aboutcircles.com';

  const FACILITATOR_INVITER = '0xbf3E8C2f1191dC6e3cdbA3aD05626A5EEeF60731' as Address;

  const circlesHubAbi = [
    {
      name: 'inviteHuman',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: '_invitee', type: 'address' },
      ],
      outputs: [],
    },
    {
      name: 'registerHuman',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: '_inviter', type: 'address' },
        { name: '_metadataDigest', type: 'bytes32' },
      ],
      outputs: [{ type: 'address' }],
    },
    {
      name: 'isHuman',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: '_human', type: 'address' },
      ],
      outputs: [{ type: 'bool' }],
    },
    {
      name: 'avatars',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: '', type: 'address' },
      ],
      outputs: [{ type: 'address' }],
    },
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'account', type: 'address' },
        { name: 'id', type: 'uint256' },
      ],
      outputs: [{ type: 'uint256' }],
    },
    {
      name: 'isTrusted',
      type: 'function',
      stateMutability: 'view',
      inputs: [
        { name: 'truster', type: 'address' },
        { name: 'trustee', type: 'address' },
      ],
      outputs: [{ type: 'bool' }],
    },
    {
      name: 'trust',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'trustee', type: 'address' },
        { name: 'expiryTime', type: 'uint96' },
      ],
      outputs: [],
    },
  ] as const;

  const INVITATION_COST = 96n * 10n ** 18n; // 96 CRC in atto-CRC

  app.post('/api/circles/invite', async (req, res) => {
    try {
      const { inviteeAddress } = req.body;

      if (!inviteeAddress || !inviteeAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid invitee address' });
      }

      console.log('[Circles] Processing invite request for:', inviteeAddress);

      const facilitatorAccount = getFacilitatorAccount();
      
      const publicClient = createPublicClient({
        chain: gnosis,
        transport: http(CIRCLES_RPC),
      });

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain: gnosis,
        transport: http(CIRCLES_RPC),
      });

      // Check if the facilitator is registered as a Circles human
      const facilitatorAvatar = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'avatars',
        args: [facilitatorAccount.address],
      });

      if (facilitatorAvatar === '0x0000000000000000000000000000000000000000') {
        console.error('[Circles] Facilitator is not registered as a Circles avatar');
        return res.status(503).json({ 
          error: 'Service temporarily unavailable. Facilitator not registered with Circles.' 
        });
      }

      // Check if invitee is already registered
      const inviteeAvatar = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'avatars',
        args: [inviteeAddress as Address],
      });

      if (inviteeAvatar !== '0x0000000000000000000000000000000000000000') {
        console.log('[Circles] Invitee already registered:', inviteeAddress);
        return res.json({
          success: true,
          alreadyRegistered: true,
          message: 'User is already registered with Circles',
        });
      }

      console.log('[Circles] Sending invitation from facilitator:', facilitatorAccount.address);
      console.log('[Circles] To invitee:', inviteeAddress);

      // Call inviteHuman - this trusts the invitee and allows them to register
      const hash = await walletClient.writeContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'inviteHuman',
        args: [inviteeAddress as Address],
      });

      console.log('[Circles] Invite transaction submitted:', hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      console.log('[Circles] Invite transaction confirmed:', receipt.transactionHash);

      res.json({
        success: true,
        txHash: receipt.transactionHash,
        inviter: facilitatorAccount.address,
        invitee: inviteeAddress,
      });
    } catch (error: any) {
      console.error('[Circles] Error inviting user:', error);
      res.status(500).json({ 
        error: 'Failed to invite user to Circles',
        details: error.shortMessage || error.message,
      });
    }
  });

  app.post('/api/circles/register-facilitator', async (req, res) => {
    try {
      const facilitatorAccount = getFacilitatorAccount();
      
      console.log('[Circles] Registering facilitator as Circles avatar');
      console.log('[Circles] Facilitator address:', facilitatorAccount.address);
      console.log('[Circles] Inviter address:', FACILITATOR_INVITER);

      const publicClient = createPublicClient({
        chain: gnosis,
        transport: http(CIRCLES_RPC),
      });

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain: gnosis,
        transport: http(CIRCLES_RPC),
      });

      const existingAvatar = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'avatars',
        args: [facilitatorAccount.address],
      });

      if (existingAvatar !== '0x0000000000000000000000000000000000000000') {
        console.log('[Circles] Facilitator already registered:', existingAvatar);
        return res.json({
          success: true,
          alreadyRegistered: true,
          facilitatorAddress: facilitatorAccount.address,
          avatarAddress: existingAvatar,
        });
      }

      const metadataDigest = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

      const hash = await walletClient.writeContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'registerHuman',
        args: [FACILITATOR_INVITER, metadataDigest],
      });

      console.log('[Circles] Registration transaction submitted:', hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      console.log('[Circles] Registration confirmed:', receipt.transactionHash);

      res.json({
        success: true,
        txHash: receipt.transactionHash,
        facilitatorAddress: facilitatorAccount.address,
        inviter: FACILITATOR_INVITER,
      });
    } catch (error: any) {
      console.error('[Circles] Error registering facilitator:', error);
      res.status(500).json({ 
        error: 'Failed to register facilitator with Circles',
        details: error.shortMessage || error.message,
      });
    }
  });

  // Get community inviter status for Circles registration
  app.get('/api/circles/inviter-status', async (req, res) => {
    try {
      const userAddress = req.query.userAddress as string | undefined;
      
      const publicClient = createPublicClient({
        chain: gnosis,
        transport: http(CIRCLES_RPC),
      });

      // Check if inviter is a registered human
      const isHuman = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'isHuman',
        args: [FACILITATOR_INVITER],
      });

      if (!isHuman) {
        return res.json({
          inviterAddress: FACILITATOR_INVITER,
          isHuman: false,
          crcBalance: '0',
          crcBalanceFormatted: '0.00',
          crcRequired: '96',
          isReady: false,
          userTrusted: false,
          message: 'Community inviter is not a registered Circles human',
        });
      }

      // Get inviter's CRC balance (token ID is the address as uint256)
      const tokenId = BigInt(FACILITATOR_INVITER);
      const balance = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'balanceOf',
        args: [FACILITATOR_INVITER, tokenId],
      }) as bigint;

      const balanceFormatted = (Number(balance) / 1e18).toFixed(2);
      const isReady = balance >= INVITATION_COST;

      // Check if inviter already trusts the user (if provided)
      let userTrusted = false;
      if (userAddress && userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        userTrusted = await publicClient.readContract({
          address: CIRCLES_HUB_V2,
          abi: circlesHubAbi,
          functionName: 'isTrusted',
          args: [FACILITATOR_INVITER, userAddress as Address],
        }) as boolean;
      }

      // Calculate hours until ready (1 CRC per hour)
      const crcNeeded = Number(INVITATION_COST - balance) / 1e18;
      const hoursUntilReady = isReady ? 0 : Math.ceil(crcNeeded);

      res.json({
        inviterAddress: FACILITATOR_INVITER,
        isHuman: true,
        crcBalance: balance.toString(),
        crcBalanceFormatted: balanceFormatted,
        crcRequired: '96',
        isReady,
        userTrusted,
        hoursUntilReady,
        message: isReady 
          ? 'Community inviter is ready to invite new members'
          : `Community inviter needs ${crcNeeded.toFixed(1)} more CRC (~${hoursUntilReady} hours)`,
      });
    } catch (error: any) {
      console.error('[Circles] Error getting inviter status:', error);
      res.status(500).json({ 
        error: 'Failed to get inviter status',
        details: error.shortMessage || error.message,
      });
    }
  });

  // Request trust from community inviter (so user can register)
  app.post('/api/circles/request-trust', async (req, res) => {
    try {
      const { userAddress } = req.body;

      if (!userAddress || !userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid user address' });
      }

      console.log('[Circles] Requesting trust for user:', userAddress);

      // Note: This requires the community inviter's private key, which we don't have
      // The facilitator (Organization) can provide gas drips but can't invite
      // For now, return instructions for the user
      
      res.json({
        success: false,
        message: 'The community inviter must manually trust your address before you can register. Contact the inviter or find a Circles friend who can invite you.',
        inviterAddress: FACILITATOR_INVITER,
        userAddress,
      });
    } catch (error: any) {
      console.error('[Circles] Error requesting trust:', error);
      res.status(500).json({ 
        error: 'Failed to request trust',
        details: error.shortMessage || error.message,
      });
    }
  });

  // Validate a custom inviter for Circles registration
  app.post('/api/circles/validate-inviter', async (req, res) => {
    try {
      const { inviterAddress: rawInviterAddress, userAddress: rawUserAddress } = req.body;

      // Validate and checksum addresses using viem's getAddress
      let inviterAddress: Address;
      let userAddress: Address;
      
      try {
        inviterAddress = getAddress(rawInviterAddress) as Address;
      } catch {
        return res.status(400).json({ error: 'Invalid inviter address format', valid: false });
      }
      
      try {
        userAddress = getAddress(rawUserAddress) as Address;
      } catch {
        return res.status(400).json({ error: 'Invalid user address format', valid: false });
      }

      const publicClient = createPublicClient({
        chain: gnosis,
        transport: http(CIRCLES_RPC),
      });

      // Check if user is already registered
      const userAvatar = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'avatars',
        args: [userAddress],
      });

      if (userAvatar !== '0x0000000000000000000000000000000000000000') {
        return res.json({
          valid: false,
          error: 'You are already registered with Circles',
          alreadyRegistered: true,
        });
      }

      // Check if inviter is a registered human (not organization/group)
      const isHuman = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'isHuman',
        args: [inviterAddress],
      }) as boolean;

      if (!isHuman) {
        return res.json({
          valid: false,
          error: 'This address is not a registered Circles Human. Only Humans can invite new members.',
          isHuman: false,
        });
      }

      // Check if inviter trusts the user
      const trustsUser = await publicClient.readContract({
        address: CIRCLES_HUB_V2,
        abi: circlesHubAbi,
        functionName: 'isTrusted',
        args: [inviterAddress, userAddress],
      }) as boolean;

      if (!trustsUser) {
        return res.json({
          valid: false,
          error: 'This inviter has not trusted your address yet. Ask them to trust you first.',
          isTrusted: false,
        });
      }

      res.json({
        valid: true,
        inviterAddress,
        userAddress,
        isHuman: true,
        isTrusted: true,
      });
    } catch (error: any) {
      console.error('[Circles] Error validating inviter:', error);
      res.status(500).json({ 
        error: 'Failed to validate inviter',
        valid: false,
        details: error.shortMessage || error.message,
      });
    }
  });

  app.get('/api/aave/apy/:chainId', async (req, res) => {
    try {
      const chainId = parseInt(req.params.chainId);
      const network = getNetworkByChainId(chainId);
      
      if (!network || !network.aavePoolAddress) {
        return res.status(400).json({ error: 'Aave not supported on this network' });
      }

      const chainInfo = resolveChain(chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${chainId}` });
      }
      
      const publicClient = createPublicClient({
        chain: chainInfo.viemChain,
        transport: http(network.rpcUrl),
      });

      const reserveData = await publicClient.readContract({
        address: network.aavePoolAddress as Address,
        abi: AAVE_POOL_ABI,
        functionName: 'getReserveData',
        args: [network.usdcAddress as Address],
      }) as any;

      const currentLiquidityRate = reserveData.currentLiquidityRate;
      const apyPercent = rayToPercent(currentLiquidityRate);

      res.json({
        chainId,
        apy: apyPercent,
        apyFormatted: `${apyPercent.toFixed(2)}%`,
        aTokenAddress: reserveData.aTokenAddress,
      });
    } catch (error) {
      console.error('Error fetching Aave APY:', error);
      res.status(500).json({ error: 'Failed to fetch Aave APY' });
    }
  });

  app.get('/api/aave/balance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;

      const fetchAaveBalance = async (cId: number) => {
        const network = getNetworkByChainId(cId);
        if (!network || !network.aavePoolAddress || !network.aUsdcAddress) {
          return { chainId: cId, aUsdcBalance: '0', apy: 0 };
        }

        const chainInfo = resolveChain(cId);
        if (!chainInfo) {
          return { chainId: cId, aUsdcBalance: '0', apy: 0 };
        }
        
        const publicClient = createPublicClient({
          chain: chainInfo.viemChain,
          transport: http(network.rpcUrl),
        });

        const [balance, reserveData] = await Promise.all([
          publicClient.readContract({
            address: network.aUsdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
          }),
          publicClient.readContract({
            address: network.aavePoolAddress as Address,
            abi: AAVE_POOL_ABI,
            functionName: 'getReserveData',
            args: [network.usdcAddress as Address],
          }) as Promise<any>,
        ]);

        return {
          chainId: cId,
          aUsdcBalance: balance.toString(),
          apy: rayToPercent(reserveData.currentLiquidityRate),
        };
      };

      if (chainId !== undefined) {
        const result = await fetchAaveBalance(chainId);
        return res.json(result);
      }

      // Fetch from all chains
      const [baseResult, celoResult, gnosisResult, arbitrumResult] = await Promise.all([
        fetchAaveBalance(8453).catch(() => ({ chainId: 8453, aUsdcBalance: '0', apy: 0 })),
        fetchAaveBalance(42220).catch(() => ({ chainId: 42220, aUsdcBalance: '0', apy: 0 })),
        fetchAaveBalance(100).catch(() => ({ chainId: 100, aUsdcBalance: '0', apy: 0 })),
        fetchAaveBalance(42161).catch(() => ({ chainId: 42161, aUsdcBalance: '0', apy: 0 })),
      ]);

      const totalAUsdcMicro = BigInt(baseResult.aUsdcBalance) + BigInt(celoResult.aUsdcBalance) + BigInt(gnosisResult.aUsdcBalance) + BigInt(arbitrumResult.aUsdcBalance);

      // Cache aUSDC balances using negative chainIds to distinguish from regular USDC
      // Convention: -chainId = aUSDC balance for that chain
      await Promise.all([
        storage.cacheAUsdcBalance(address, 8453, baseResult.aUsdcBalance),
        storage.cacheAUsdcBalance(address, 42220, celoResult.aUsdcBalance),
        storage.cacheAUsdcBalance(address, 100, gnosisResult.aUsdcBalance),
        storage.cacheAUsdcBalance(address, 42161, arbitrumResult.aUsdcBalance),
      ]).catch(err => console.error('Error caching aUSDC balances:', err));

      res.json({
        totalAUsdcBalance: totalAUsdcMicro.toString(),
        chains: {
          base: baseResult,
          celo: celoResult,
          gnosis: gnosisResult,
          arbitrum: arbitrumResult,
        },
      });
    } catch (error) {
      console.error('Error fetching Aave balance:', error);
      res.status(500).json({ error: 'Failed to fetch Aave balance' });
    }
  });

  // Get interest earned per chain (current balance - net principal)
  app.get('/api/aave/interest-earned/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainIds = [8453, 42220, 100, 42161]; // Base, Celo, Gnosis, Arbitrum
      
      // Get net principal from tracked operations (always returns all 3 chains)
      const netPrincipals = await storage.getAaveNetPrincipal(address);
      
      // Get current aUSDC balances for all chains
      const fetchAaveBalance = async (chainId: number) => {
        try {
          const network = getNetworkByChainId(chainId);
          if (!network || !network.aavePoolAddress || !network.aUsdcAddress) {
            return { chainId, aUsdcBalance: '0' };
          }

          const chainInfo = resolveChain(chainId);
          if (!chainInfo) {
            return { chainId, aUsdcBalance: '0' };
          }
          
          const publicClient = createPublicClient({
            chain: chainInfo.viemChain,
            transport: http(network.rpcUrl),
          });

          const balance = await publicClient.readContract({
            address: network.aUsdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
          });

          return { chainId, aUsdcBalance: balance.toString() };
        } catch {
          return { chainId, aUsdcBalance: '0' };
        }
      };

      const [baseBalance, celoBalance, gnosisBalance, arbitrumBalance] = await Promise.all([
        fetchAaveBalance(8453),
        fetchAaveBalance(42220),
        fetchAaveBalance(100),
        fetchAaveBalance(42161),
      ]);

      const balances: Record<number, { chainId: number; aUsdcBalance: string }> = { 
        8453: baseBalance, 
        42220: celoBalance, 
        100: gnosisBalance,
        42161: arbitrumBalance 
      };
      
      // Build net principal map for quick lookup
      const netPrincipalMap = new Map(netPrincipals.map(np => [np.chainId, np]));
      
      // Calculate interest earned per chain (always return all 3 chains)
      const interestPerChain = chainIds.map(chainId => {
        const np = netPrincipalMap.get(chainId) || { 
          chainId, 
          netPrincipalMicro: '0', 
          trackingStarted: null 
        };
        const currentBalance = BigInt(balances[chainId]?.aUsdcBalance || '0');
        const netPrincipal = BigInt(np.netPrincipalMicro);
        
        // Interest = current balance - net principal (clamped to 0 minimum)
        let interestEarned = currentBalance - netPrincipal;
        if (interestEarned < 0n) interestEarned = 0n;
        
        return {
          chainId,
          currentBalanceMicro: currentBalance.toString(),
          netPrincipalMicro: np.netPrincipalMicro,
          interestEarnedMicro: interestEarned.toString(),
          trackingStarted: np.trackingStarted,
          hasTrackingData: np.trackingStarted !== null,
        };
      });

      // Calculate totals
      const totalInterestMicro = interestPerChain.reduce(
        (sum, c) => sum + BigInt(c.interestEarnedMicro), 
        0n
      );

      res.json({
        chains: interestPerChain,
        totalInterestEarnedMicro: totalInterestMicro.toString(),
      });
    } catch (error) {
      console.error('Error calculating interest earned:', error);
      // Return empty but valid response on error
      res.json({
        chains: [
          { chainId: 8453, currentBalanceMicro: '0', netPrincipalMicro: '0', interestEarnedMicro: '0', trackingStarted: null, hasTrackingData: false },
          { chainId: 42220, currentBalanceMicro: '0', netPrincipalMicro: '0', interestEarnedMicro: '0', trackingStarted: null, hasTrackingData: false },
          { chainId: 100, currentBalanceMicro: '0', netPrincipalMicro: '0', interestEarnedMicro: '0', trackingStarted: null, hasTrackingData: false },
          { chainId: 42161, currentBalanceMicro: '0', netPrincipalMicro: '0', interestEarnedMicro: '0', trackingStarted: null, hasTrackingData: false },
        ],
        totalInterestEarnedMicro: '0',
      });
    }
  });

  // Gasless Aave supply using EIP-3009 TransferWithAuthorization
  // Flow: User signs auth to transfer USDC to facilitator -> Facilitator receives USDC -> 
  //       Facilitator approves Aave -> Facilitator supplies on behalf of user
  // Now includes operation tracking for recovery and retry logic for refunds
  app.post('/api/aave/supply', async (req, res) => {
    let operationId: string | null = null;
    
    try {
      const { 
        chainId, 
        userAddress, 
        amount,
        // EIP-3009 authorization fields
        validAfter,
        validBefore,
        nonce,
        signature,
      } = req.body;

      console.log('[Aave Supply] Request received:', { chainId, userAddress, amount: amount?.slice(0, 10) + '...' });

      if (!chainId || !userAddress || !amount || !validAfter || !validBefore || !nonce || !signature) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          required: ['chainId', 'userAddress', 'amount', 'validAfter', 'validBefore', 'nonce', 'signature']
        });
      }

      const network = getNetworkByChainId(chainId);
      if (!network || !network.aavePoolAddress) {
        return res.status(400).json({ error: 'Aave not supported on this network' });
      }

      const chainInfo = resolveChain(chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${chainId}` });
      }

      // Create operation record for tracking/recovery
      const operation = await storage.createAaveOperation({
        userAddress,
        chainId,
        operationType: 'supply',
        amount,
        status: 'pending',
        step: 'transfer',
      });
      operationId = operation.id;
      console.log('[Aave Supply] Created operation record:', operationId);

      const chain = chainInfo.viemChain;
      const facilitatorAccount = getFacilitatorAccount();
      const facilitatorAddress = facilitatorAccount.address;

      console.log('[Aave Supply] Facilitator address:', facilitatorAddress);
      console.log('[Aave Supply] Network:', network.name, 'Chain ID:', chainId);

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(network.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(network.rpcUrl),
      });

      // Get the current nonce for proper transaction sequencing
      let currentNonce = await publicClient.getTransactionCount({
        address: facilitatorAddress,
      });
      console.log('[Aave Supply] Starting nonce:', currentNonce);

      // Parse and validate signature
      if (!signature || typeof signature !== 'string' || !signature.startsWith('0x')) {
        await storage.updateAaveOperation(operationId, { status: 'failed', errorMessage: 'Invalid signature format' });
        return res.status(400).json({ error: 'Invalid signature format' });
      }
      
      let signatureParts;
      try {
        signatureParts = hexToSignature(signature as Hex);
      } catch (e) {
        await storage.updateAaveOperation(operationId, { status: 'failed', errorMessage: 'Failed to parse signature' });
        return res.status(400).json({ error: 'Failed to parse signature' });
      }
      
      const { v, r, s } = signatureParts;
      
      if (v === undefined || r === undefined || s === undefined) {
        await storage.updateAaveOperation(operationId, { status: 'failed', errorMessage: 'Invalid signature components' });
        return res.status(400).json({ error: 'Invalid signature components' });
      }

      // Step 1: Execute transferWithAuthorization to receive USDC from user
      await storage.updateAaveOperation(operationId, { status: 'transferring', step: 'transfer' });
      console.log('[Aave Supply] Step 1: Executing transferWithAuthorization with nonce:', currentNonce);
      
      const transferHash = await walletClient.writeContract({
        address: network.usdcAddress as Address,
        abi: USDC_ABI,
        functionName: 'transferWithAuthorization',
        nonce: currentNonce,
        args: [
          userAddress as Address,
          facilitatorAddress,
          BigInt(amount),
          BigInt(validAfter),
          BigInt(validBefore),
          nonce as Hex,
          Number(v),
          r,
          s,
        ],
      });
      currentNonce++; // Increment for next transaction

      console.log('[Aave Supply] Transfer tx hash:', transferHash);
      await storage.updateAaveOperation(operationId, { transferTxHash: transferHash });
      
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
      
      if (transferReceipt.status !== 'success') {
        await storage.updateAaveOperation(operationId, { 
          status: 'failed', 
          errorMessage: 'Transfer authorization failed - funds still with user'
        });
        return res.status(400).json({ error: 'Transfer authorization failed' });
      }
      console.log('[Aave Supply] Transfer confirmed');

      // Helper to refund USDC to user with retry logic (up to 3 attempts with exponential backoff)
      const refundUserWithRetry = async (reason: string, maxRetries = 3): Promise<{ success: boolean; txHash?: string }> => {
        console.log(`[Aave Supply] Refunding user due to: ${reason}`);
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[Aave Supply] Refund attempt ${attempt}/${maxRetries}, nonce: ${currentNonce}`);
          
          try {
            const refundHash = await walletClient.writeContract({
              address: network.usdcAddress as Address,
              abi: ERC20_ABI,
              functionName: 'transfer',
              nonce: currentNonce,
              args: [userAddress as Address, BigInt(amount)],
            });
            currentNonce++;
            console.log('[Aave Supply] Refund tx hash:', refundHash);
            
            const receipt = await publicClient.waitForTransactionReceipt({ hash: refundHash });
            
            if (receipt.status === 'success') {
              console.log('[Aave Supply] Refund completed successfully');
              await storage.updateAaveOperation(operationId!, { 
                status: 'refunded',
                refundTxHash: refundHash,
                errorMessage: reason,
                retryCount: attempt,
                resolvedAt: new Date(),
                resolvedBy: 'auto'
              });
              return { success: true, txHash: refundHash };
            }
          } catch (refundError) {
            console.error(`[Aave Supply] Refund attempt ${attempt} failed:`, refundError);
            
            // Wait with exponential backoff before retry (2s, 4s, 8s)
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 1000;
              console.log(`[Aave Supply] Waiting ${backoffMs}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              
              // Re-fetch nonce in case it changed
              currentNonce = await publicClient.getTransactionCount({ address: facilitatorAddress });
            }
          }
        }
        
        // All retries failed - log for manual recovery
        console.error('[Aave Supply] CRITICAL: All refund attempts failed!');
        await storage.updateAaveOperation(operationId!, { 
          status: 'refund_failed',
          errorMessage: `${reason} - REFUND FAILED AFTER ${maxRetries} ATTEMPTS`,
          retryCount: maxRetries
        });
        return { success: false };
      };

      // Step 2: Approve Aave Pool to spend the received USDC
      await storage.updateAaveOperation(operationId, { status: 'approving', step: 'approve' });
      console.log('[Aave Supply] Step 2: Approving Aave Pool with nonce:', currentNonce);
      
      let approveHash;
      try {
        approveHash = await walletClient.writeContract({
          address: network.usdcAddress as Address,
          abi: ERC20_ABI,
          functionName: 'approve',
          nonce: currentNonce,
          args: [network.aavePoolAddress as Address, BigInt(amount)],
        });
        currentNonce++; // Increment for next transaction
        await storage.updateAaveOperation(operationId, { approveTxHash: approveHash });
      } catch (approveError) {
        console.error('[Aave Supply] Approve transaction failed:', approveError);
        const refundResult = await refundUserWithRetry('Approval transaction failed');
        return res.status(400).json({ 
          error: 'Approval failed', 
          refunded: refundResult.success,
          refundTxHash: refundResult.txHash,
          operationId,
          refundMessage: refundResult.success ? 'USDC has been returned to your wallet' : 'CRITICAL: Could not refund - contact support'
        });
      }

      console.log('[Aave Supply] Approve tx hash:', approveHash);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      
      if (approveReceipt.status !== 'success') {
        const refundResult = await refundUserWithRetry('Approval transaction reverted');
        return res.status(400).json({ 
          error: 'Approval failed',
          refunded: refundResult.success,
          refundTxHash: refundResult.txHash,
          operationId,
          refundMessage: refundResult.success ? 'USDC has been returned to your wallet' : 'CRITICAL: Could not refund - contact support'
        });
      }
      console.log('[Aave Supply] Approval confirmed');

      // Wait for state propagation across L2 nodes before supplying
      console.log('[Aave Supply] Waiting for state propagation...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Step 3: Supply to Aave on behalf of user (user receives aTokens)
      await storage.updateAaveOperation(operationId, { status: 'supplying', step: 'supply' });
      console.log('[Aave Supply] Step 3: Supplying to Aave with nonce:', currentNonce);
      
      let supplyHash;
      try {
        supplyHash = await walletClient.writeContract({
          address: network.aavePoolAddress as Address,
          abi: AAVE_POOL_ABI,
          functionName: 'supply',
          nonce: currentNonce,
          args: [
            network.usdcAddress as Address,
            BigInt(amount),
            userAddress as Address, // onBehalfOf: user receives aTokens
            0, // referral code
          ],
        });
        await storage.updateAaveOperation(operationId, { supplyTxHash: supplyHash });
      } catch (supplyError) {
        console.error('[Aave Supply] Supply transaction failed:', supplyError);
        const refundResult = await refundUserWithRetry('Supply transaction failed');
        return res.status(400).json({ 
          error: 'Supply failed',
          refunded: refundResult.success,
          refundTxHash: refundResult.txHash,
          operationId,
          refundMessage: refundResult.success ? 'USDC has been returned to your wallet' : 'CRITICAL: Could not refund - contact support'
        });
      }

      console.log('[Aave Supply] Supply tx hash:', supplyHash);
      const supplyReceipt = await publicClient.waitForTransactionReceipt({ hash: supplyHash });

      if (supplyReceipt.status !== 'success') {
        const refundResult = await refundUserWithRetry('Supply transaction reverted');
        return res.status(400).json({ 
          error: 'Supply failed',
          refunded: refundResult.success,
          refundTxHash: refundResult.txHash,
          operationId,
          refundMessage: refundResult.success ? 'USDC has been returned to your wallet' : 'CRITICAL: Could not refund - contact support'
        });
      }
      
      // Success! Mark operation as completed
      await storage.updateAaveOperation(operationId, { 
        status: 'completed',
        resolvedAt: new Date(),
        resolvedBy: 'auto'
      });
      console.log('[Aave Supply] Supply confirmed! User now has aTokens');

      // Update net deposits for Pool interest tracking (Celo only)
      if (chainId === 42220) {
        const normalizedAddr = userAddress.toLowerCase();
        const depositAmount = BigInt(amount);
        const existingSnapshot = await storage.getYieldSnapshot(normalizedAddr);
        const currentNetDeposits = BigInt(existingSnapshot?.netDeposits || '0');
        const newNetDeposits = currentNetDeposits + depositAmount;
        
        // Fetch actual on-chain aUSDC balance for accurate yield tracking
        try {
          const actualAusdcBalance = await publicClient.readContract({
            address: network.aUsdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [userAddress as Address],
          }) as bigint;
          
          await storage.upsertYieldSnapshot(normalizedAddr, {
            netDeposits: newNetDeposits.toString(),
            lastAusdcBalance: actualAusdcBalance.toString(),
          });
          
          // Cache aUSDC balance for Traction page visibility
          await storage.cacheAUsdcBalance(normalizedAddr, chainId, actualAusdcBalance.toString());
          
          console.log(`[Aave Supply] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}, actual aUSDC: ${actualAusdcBalance.toString()}`);
        } catch (balanceError) {
          console.error('[Aave Supply] Failed to fetch balance for snapshot, updating netDeposits only:', balanceError);
          await storage.upsertYieldSnapshot(normalizedAddr, {
            netDeposits: newNetDeposits.toString(),
          });
        }
      }

      res.json({
        success: true,
        operationId,
        txHash: supplyHash,
        transferTxHash: transferHash,
        approveTxHash: approveHash,
        blockNumber: supplyReceipt.blockNumber.toString(),
        amount,
        chainId,
      });
    } catch (error) {
      console.error('[Aave Supply] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update operation with error if we have an ID
      if (operationId) {
        await storage.updateAaveOperation(operationId, { 
          status: 'failed', 
          errorMessage 
        });
      }
      
      // Parse revert reason if available
      if (errorMessage.includes('execution reverted')) {
        return res.status(400).json({ 
          error: 'Transaction reverted',
          details: errorMessage,
          operationId,
          hint: 'Check if the authorization signature is valid and not expired'
        });
      }
      
      res.status(500).json({ error: 'Failed to supply to Aave', details: errorMessage, operationId });
    }
  });

  app.post('/api/aave/withdraw', async (req, res) => {
    let operationId: string | null = null;
    
    try {
      const { chainId, userAddress, amount } = req.body;

      console.log('[Aave Withdraw] Request received:', { chainId, userAddress, amount: amount?.slice(0, 10) + '...' });

      if (!chainId || !userAddress || !amount) {
        return res.status(400).json({ error: 'Missing required fields: chainId, userAddress, amount' });
      }

      const network = getNetworkByChainId(chainId);
      if (!network || !network.aavePoolAddress) {
        return res.status(400).json({ error: 'Aave not supported on this network' });
      }

      const chainInfo = resolveChain(chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${chainId}` });
      }

      // Create operation record for tracking/analytics
      const operation = await storage.createAaveOperation({
        userAddress,
        chainId,
        operationType: 'withdraw',
        amount,
        status: 'pending',
        step: 'withdraw',
      });
      operationId = operation.id;
      console.log('[Aave Withdraw] Created operation record:', operationId);

      const chain = chainInfo.viemChain;
      const facilitatorAccount = getFacilitatorAccount();

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(network.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(network.rpcUrl),
      });

      // Update status to withdrawing
      await storage.updateAaveOperation(operationId, { status: 'withdrawing', step: 'withdraw' });

      // Note: Withdrawing requires the user to have aTokens
      // The facilitator cannot withdraw on behalf of users without delegation
      // This is a simplified implementation - real version needs delegation approval
      const hash = await walletClient.writeContract({
        address: network.aavePoolAddress as Address,
        abi: AAVE_POOL_ABI,
        functionName: 'withdraw',
        args: [
          network.usdcAddress as Address,
          BigInt(amount),
          userAddress as Address,
        ],
      });

      console.log('[Aave Withdraw] Withdraw tx hash:', hash);
      await storage.updateAaveOperation(operationId, { withdrawTxHash: hash });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        await storage.updateAaveOperation(operationId, {
          status: 'failed',
          errorMessage: 'Withdraw transaction failed',
        });
        return res.status(400).json({ error: 'Withdraw transaction failed', operationId });
      }

      // Update net deposits for Pool interest tracking (Celo only)
      if (chainId === 42220) {
        const normalizedAddr = userAddress.toLowerCase();
        const withdrawAmount = BigInt(amount);
        const existingSnapshot = await storage.getYieldSnapshot(normalizedAddr);
        const currentNetDeposits = BigInt(existingSnapshot?.netDeposits || '0');
        // Reduce netDeposits, but don't go below 0
        const newNetDeposits = currentNetDeposits > withdrawAmount 
          ? currentNetDeposits - withdrawAmount 
          : 0n;
        
        // Fetch actual on-chain aUSDC balance for accurate yield tracking
        try {
          const actualAusdcBalance = await publicClient.readContract({
            address: network.aUsdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [userAddress as Address],
          }) as bigint;
          
          await storage.upsertYieldSnapshot(normalizedAddr, {
            netDeposits: newNetDeposits.toString(),
            lastAusdcBalance: actualAusdcBalance.toString(),
          });
          
          // Cache aUSDC balance for Traction page visibility
          await storage.cacheAUsdcBalance(normalizedAddr, chainId, actualAusdcBalance.toString());
          
          console.log(`[Aave Withdraw] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}, actual aUSDC: ${actualAusdcBalance.toString()}`);
        } catch (balanceError) {
          console.error('[Aave Withdraw] Failed to fetch balance for snapshot, updating netDeposits only:', balanceError);
          await storage.upsertYieldSnapshot(normalizedAddr, {
            netDeposits: newNetDeposits.toString(),
          });
        }
      }

      // Mark operation as completed
      await storage.updateAaveOperation(operationId, {
        status: 'completed',
        resolvedAt: new Date(),
      });
      console.log('[Aave Withdraw] Operation completed successfully:', operationId);

      res.json({
        success: true,
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        amount,
        chainId,
        operationId,
      });
    } catch (error) {
      console.error('[Aave Withdraw] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update operation with error if we have an ID
      if (operationId) {
        await storage.updateAaveOperation(operationId, { 
          status: 'failed', 
          errorMessage 
        });
      }
      
      res.status(500).json({ error: 'Failed to withdraw from Aave', details: errorMessage, operationId });
    }
  });

  // Record a client-side withdrawal (for tracking purposes when withdrawal happens directly on-chain)
  app.post('/api/aave/record-withdraw', async (req, res) => {
    try {
      const { chainId, userAddress, amount, txHash } = req.body;

      console.log('[Aave Record Withdraw] Request received:', { chainId, userAddress, amount: amount?.slice(0, 10) + '...', txHash });

      if (!chainId || !userAddress || !amount || !txHash) {
        return res.status(400).json({ error: 'Missing required fields: chainId, userAddress, amount, txHash' });
      }

      if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid userAddress format' });
      }

      if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
        return res.status(400).json({ error: 'Invalid txHash format' });
      }

      // Validate amount is a valid non-negative integer string (micro-USDC)
      const amountStr = String(amount).trim();
      if (!/^\d+$/.test(amountStr)) {
        return res.status(400).json({ error: 'Invalid amount format: must be a non-negative integer string (micro-USDC)' });
      }

      let amountBigInt: bigint;
      try {
        amountBigInt = BigInt(amountStr);
        if (amountBigInt < 0n) {
          return res.status(400).json({ error: 'Invalid amount: must be non-negative' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid amount format: could not parse as integer' });
      }

      const network = getNetworkByChainId(chainId);
      if (!network || !network.aavePoolAddress) {
        return res.status(400).json({ error: 'Aave not supported on this network' });
      }

      // Create operation record for tracking/analytics - already completed since it happened client-side
      const operation = await storage.createAaveOperation({
        userAddress,
        chainId,
        operationType: 'withdraw',
        amount,
        status: 'completed',
        step: 'completed',
      });
      
      // Update with txHash and completion time
      await storage.updateAaveOperation(operation.id, {
        withdrawTxHash: txHash,
        resolvedAt: new Date(),
      });
      
      console.log('[Aave Record Withdraw] Created operation record:', operation.id);

      // Update net deposits for Pool interest tracking (Celo only)
      if (chainId === 42220) {
        const normalizedAddr = userAddress.toLowerCase();
        const existingSnapshot = await storage.getYieldSnapshot(normalizedAddr);
        const currentNetDeposits = BigInt(existingSnapshot?.netDeposits || '0');
        // Reduce netDeposits, but don't go below 0 (use pre-validated amountBigInt)
        const newNetDeposits = currentNetDeposits > amountBigInt 
          ? currentNetDeposits - amountBigInt 
          : 0n;
        
        // Fetch actual on-chain aUSDC balance for accurate yield tracking
        const chainInfo = resolveChain(chainId);
        if (chainInfo) {
          const publicClient = createPublicClient({
            chain: chainInfo.viemChain,
            transport: http(network.rpcUrl),
          });
          const actualAusdcBalance = await publicClient.readContract({
            address: network.aUsdcAddress as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [userAddress as Address],
          }) as bigint;
          
          await storage.upsertYieldSnapshot(normalizedAddr, {
            netDeposits: newNetDeposits.toString(),
            lastAusdcBalance: actualAusdcBalance.toString(),
          });
          console.log(`[Aave Record Withdraw] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}, actual aUSDC: ${actualAusdcBalance.toString()}`);
        } else {
          await storage.upsertYieldSnapshot(normalizedAddr, {
            netDeposits: newNetDeposits.toString(),
          });
          console.log(`[Aave Record Withdraw] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}`);
        }
      }

      console.log('[Aave Record Withdraw] Operation recorded successfully:', operation.id);

      res.json({
        success: true,
        operationId: operation.id,
        message: 'Withdrawal recorded successfully',
      });
    } catch (error) {
      console.error('[Aave Record Withdraw] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'Failed to record withdrawal', details: errorMessage });
    }
  });

  // GAS DRIP ENDPOINTS
  // Minimum gas thresholds for transactions (should cover Aave operations)
  const GAS_THRESHOLDS: Record<number, bigint> = {
    8453: BigInt('50000000000000'), // 0.00005 ETH for Base (~$0.15)
    42220: BigInt('10000000000000000'), // 0.01 CELO for Celo (Aave needs ~0.0075 CELO)
    100: BigInt('1000000000000000'), // 0.001 xDAI for Gnosis (~$0.001, very cheap gas)
  };

  // Gas drip amounts (enough for 1-2 Aave transactions)
  // Aave withdrawals need ~250k gas, at 30 gwei that's 0.0075 CELO
  const GAS_DRIP_AMOUNTS: Record<number, bigint> = {
    8453: BigInt('100000000000000'), // 0.0001 ETH for Base
    42220: BigInt('15000000000000000'), // 0.015 CELO for Celo (enough for Aave operations)
    100: BigInt('5000000000000000'), // 0.005 xDAI for Gnosis (enough for multiple Aave operations)
  };

  // Check user's native gas balance
  app.get('/api/gas-balance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;

      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid address' });
      }

      const fetchGasBalance = async (cId: number) => {
        const network = getNetworkByChainId(cId);
        if (!network) {
          return { chainId: cId, balance: '0', hasEnoughGas: false };
        }

        const chainInfo = resolveChain(cId);
        if (!chainInfo) {
          return { chainId: cId, balance: '0', hasEnoughGas: false };
        }
        
        const publicClient = createPublicClient({
          chain: chainInfo.viemChain,
          transport: http(network.rpcUrl),
        });

        const balance = await publicClient.getBalance({ address: address as Address });
        const threshold = GAS_THRESHOLDS[cId as keyof typeof GAS_THRESHOLDS] || BigInt(0);
        
        return {
          chainId: cId,
          balance: balance.toString(),
          balanceFormatted: cId === 8453 
            ? `${(Number(balance) / 1e18).toFixed(6)} ETH`
            : cId === 100
              ? `${(Number(balance) / 1e18).toFixed(6)} xDAI`
              : `${(Number(balance) / 1e18).toFixed(4)} CELO`,
          hasEnoughGas: balance >= threshold,
          threshold: threshold.toString(),
        };
      };

      if (chainId) {
        const result = await fetchGasBalance(chainId);
        return res.json(result);
      }

      // Fetch from all chains
      const [baseResult, celoResult] = await Promise.all([
        fetchGasBalance(8453).catch(() => ({ chainId: 8453, balance: '0', hasEnoughGas: false })),
        fetchGasBalance(42220).catch(() => ({ chainId: 42220, balance: '0', hasEnoughGas: false })),
      ]);

      res.json({
        chains: {
          base: baseResult,
          celo: celoResult,
        },
      });
    } catch (error) {
      console.error('Error fetching gas balance:', error);
      res.status(500).json({ error: 'Failed to fetch gas balance' });
    }
  });

  // Drip gas to user if they don't have enough
  app.post('/api/gas-drip', async (req, res) => {
    try {
      const { address, chainId } = req.body;

      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid address' });
      }

      if (!chainId || ![8453, 42220, 100, 42161].includes(chainId)) {
        return res.status(400).json({ error: 'Invalid chainId. Must be 8453 (Base), 42220 (Celo), 100 (Gnosis), or 42161 (Arbitrum)' });
      }

      const network = getNetworkByChainId(chainId);
      if (!network) {
        return res.status(400).json({ error: 'Network not supported' });
      }

      const chainInfo = resolveChain(chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${chainId}` });
      }

      const chain = chainInfo.viemChain;
      const facilitatorAccount = getFacilitatorAccount();

      const publicClient = createPublicClient({
        chain,
        transport: http(network.rpcUrl),
      });

      // Check user's current gas balance
      const userBalance = await publicClient.getBalance({ address: address as Address });
      const threshold = GAS_THRESHOLDS[chainId as keyof typeof GAS_THRESHOLDS];

      if (userBalance >= threshold) {
        return res.json({
          success: true,
          alreadyHasGas: true,
          balance: userBalance.toString(),
          message: 'User already has sufficient gas',
        });
      }

      // Check for recent drips (rate limiting - 1 per 6 hours per chain)
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentDrips = await storage.getRecentGasDrips(address, chainId, sixHoursAgo);
      
      if (recentDrips.length > 0) {
        const lastDrip = recentDrips[0];
        const nextDripTime = new Date(lastDrip.createdAt.getTime() + 6 * 60 * 60 * 1000);
        return res.status(429).json({
          error: 'Rate limited. You can request gas again in 6 hours.',
          lastDripAt: lastDrip.createdAt.toISOString(),
          nextDripAvailable: nextDripTime.toISOString(),
        });
      }

      const dripAmount = GAS_DRIP_AMOUNTS[chainId as keyof typeof GAS_DRIP_AMOUNTS];

      // Check facilitator has enough gas
      const facilitatorBalance = await publicClient.getBalance({ address: facilitatorAccount.address });
      if (facilitatorBalance < dripAmount * 2n) { // Keep buffer for facilitator's own transactions
        console.error(`Facilitator low on gas for chain ${chainId}:`, facilitatorBalance.toString());
        return res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
      }

      // Create drip record before sending
      const dripRecord = await storage.createGasDrip({
        address,
        chainId,
        amount: dripAmount.toString(),
        status: 'pending',
      });

      // Send gas to user
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(network.rpcUrl),
      });

      try {
        const hash = await walletClient.sendTransaction({
          to: address as Address,
          value: dripAmount,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Update drip record with success
        await storage.updateGasDrip(dripRecord.id, {
          status: 'completed',
          txHash: hash,
        });

        res.json({
          success: true,
          txHash: hash,
          amount: dripAmount.toString(),
          amountFormatted: chainId === 8453 
            ? `${(Number(dripAmount) / 1e18).toFixed(6)} ETH`
            : `${(Number(dripAmount) / 1e18).toFixed(4)} CELO`,
          chainId,
        });
      } catch (txError) {
        // Update drip record with failure
        await storage.updateGasDrip(dripRecord.id, {
          status: 'failed',
        });
        throw txError;
      }
    } catch (error) {
      console.error('Error dripping gas:', error);
      res.status(500).json({ error: 'Failed to drip gas' });
    }
  });

  // Clear cache for a specific address (user-facing refresh)
  app.post('/api/refresh/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
        return res.status(400).json({ error: 'Invalid address' });
      }
      
      await storage.clearCacheForAddress(address);
      
      res.json({ 
        success: true, 
        message: 'Cache cleared successfully',
        address 
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  app.get('/api/authorization/:nonce', async (req, res) => {
    try {
      const { nonce } = req.params;
      const chainId = parseInt(req.query.chainId as string) || 8453;
      
      const authorization = await storage.getAuthorization(nonce, chainId);
      
      if (!authorization) {
        return res.status(404).json({ error: 'Authorization not found' });
      }
      
      res.json(authorization);
    } catch (error) {
      console.error('Error fetching authorization:', error);
      res.status(500).json({ error: 'Failed to fetch authorization' });
    }
  });

  app.get('/api/authorizations/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = parseInt(req.query.chainId as string) || 8453;
      
      const authorizations = await storage.getAuthorizationsByAddress(address, chainId);
      res.json(authorizations);
    } catch (error) {
      console.error('Error fetching authorizations:', error);
      res.status(500).json({ error: 'Failed to fetch authorizations' });
    }
  });

  app.post('/api/relay/submit-authorization', async (req, res) => {
    try {
      const validatedData = submitAuthorizationSchema.parse(req.body);
      const { authorization } = validatedData;
      
      const { domain, message, signature } = authorization;
      const { from, to, value, validAfter, validBefore, nonce } = message;
      
      // Get chainId from domain (both Base and Celo use standard chainId format)
      if (!domain.chainId) {
        return res.status(400).json({ error: 'Missing chainId in domain' });
      }
      const chainId = domain.chainId;
      
      const existingAuth = await storage.getAuthorization(nonce, chainId);
      if (existingAuth && existingAuth.status === 'used') {
        return res.status(400).json({ error: 'Authorization already used' });
      }
      
      const now = Math.floor(Date.now() / 1000);
      if (parseInt(validBefore) < now) {
        return res.status(400).json({ error: 'Authorization expired' });
      }
      
      if (parseInt(validAfter) > now) {
        return res.status(400).json({ error: 'Authorization not yet valid' });
      }
      
      if (!/^0x[a-fA-F0-9]{40}$/.test(from) || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
        return res.status(400).json({ error: 'Invalid address format' });
      }
      
      console.log('[Facilitator] Processing authorization:', {
        from,
        to,
        value,
        nonce,
        chainId,
        mode: 'offline',
      });
      
      const chainInfo = resolveChain(chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${chainId}` });
      }
      
      const chain = chainInfo.viemChain;
      const networkConfig = getNetworkConfig(chainInfo.networkKey);
      const facilitatorAccount = getFacilitatorAccount();
      
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      // Extract v, r, s from signature using viem utilities
      const signatureHex = signature as Hex;
      const { r, s, v } = hexToSignature(signatureHex);
      
      // Verify signature locally before submitting to blockchain
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      };
      
      const messageForVerify = {
        from: from as Address,
        to: to as Address,
        value: BigInt(value),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: nonce as Hex,
      };
      
      const domainForVerify = {
        name: domain.name,
        version: domain.version,
        chainId: domain.chainId,
        verifyingContract: domain.verifyingContract as Address,
      };
      
      // Recover the address from the signature
      const recoveredAddress = await recoverAddress({
        hash: hashTypedData({ domain: domainForVerify, types, primaryType: 'TransferWithAuthorization', message: messageForVerify }),
        signature: signatureHex,
      });
      
      console.log('[Facilitator] Signature verification (offline mode):');
      console.log('  Expected signer (from):', from);
      console.log('  Recovered address:', recoveredAddress);
      console.log('  Signature components:', { v, r: r.slice(0, 10) + '...', s: s.slice(0, 10) + '...' });
      
      if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
        console.error('[Facilitator] Signature verification failed!');
        return res.status(400).json({ 
          error: 'Invalid signature: recovered address does not match from address',
          details: `Expected ${from}, got ${recoveredAddress}`
        });
      }
      
      console.log('[Facilitator] Signature verified locally ✓');
      console.log('[Facilitator] Submitting transferWithAuthorization to blockchain (anyone can execute)...');
      console.log('[Facilitator] Facilitator address:', facilitatorAccount.address);
      console.log('[Facilitator] USDC contract:', networkConfig.usdcAddress);
      console.log('[Facilitator] Domain:', domainForVerify);
      console.log('[Facilitator] Message:', { ...messageForVerify, value: value, nonce: nonce.slice(0, 10) + '...' });
      
      const txHash = await walletClient.writeContract({
        address: networkConfig.usdcAddress as Address,
        abi: USDC_ABI,
        functionName: 'transferWithAuthorization',
        args: [
          from as Address,
          to as Address,
          BigInt(value),
          BigInt(validAfter),
          BigInt(validBefore),
          nonce as Hex,
          Number(v),
          r,
          s,
        ],
      });
      
      console.log('[Facilitator] Transaction submitted! Hash:', txHash);
      
      const auth: Authorization = {
        id: randomUUID(),
        chainId,
        nonce,
        from,
        to,
        value,
        validAfter,
        validBefore,
        signature,
        status: 'used',
        createdAt: new Date().toISOString(),
        usedAt: new Date().toISOString(),
        txHash,
      };
      
      await storage.saveAuthorization(auth);
      
      await storage.addTransaction(
        from,
        chainId,
        {
          id: randomUUID(),
          type: 'send',
          from,
          to,
          amount: value,
          timestamp: new Date().toISOString(),
          status: 'completed',
          txHash,
        }
      );
      
      await storage.addTransaction(
        to,
        chainId,
        {
          id: randomUUID(),
          type: 'receive',
          from,
          to,
          amount: value,
          timestamp: new Date().toISOString(),
          status: 'completed',
          txHash,
        }
      );
      
      const response = transferResponseSchema.parse({
        txHash,
        status: 'submitted',
      });
      
      res.json(response);
    } catch (error: any) {
      console.error('[Facilitator] Error submitting authorization:', error);
      res.status(400).json({ 
        error: error.message || 'Invalid authorization',
        details: error.shortMessage || error.details || undefined
      });
    }
  });

  // Debug endpoint to see raw MaxFlow API response (for troubleshooting production issues)
  app.get('/api/debug/maxflow/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const url = `${MAXFLOW_API_BASE}/score/${address}`;
      
      console.log(`[MaxFlow Debug] Testing URL: ${url}`);
      
      const startTime = Date.now();
      const response = await fetchMaxFlow(url);
      const elapsed = Date.now() - startTime;
      
      // Extract rate limit headers
      const rateLimitHeaders: Record<string, string | null> = {
        'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
        'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
        'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
        'retry-after': response.headers.get('retry-after'),
      };
      
      const responseText = await response.text();
      let responseBody: any;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }
      
      res.json({
        debug: true,
        request: {
          url,
          headers: MAXFLOW_HEADERS_BASE,
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          elapsedMs: elapsed,
          rateLimitHeaders,
          body: responseBody,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Capture detailed error information including underlying cause
      const errorDetails: any = {
        debug: true,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      };
      
      // Check for underlying cause (common in fetch failures)
      if (error && typeof error === 'object' && 'cause' in error) {
        const cause = (error as any).cause;
        errorDetails.cause = {
          message: cause?.message,
          code: cause?.code,
          errno: cause?.errno,
          syscall: cause?.syscall,
          address: cause?.address,
          port: cause?.port,
        };
      }
      
      res.json(errorDetails);
    }
  });

  app.get('/api/maxflow/score/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      // Stale-while-revalidate: Return cached data immediately (even if stale)
      // If stale, trigger background refresh without blocking the response
      const cachedScore = await storage.getMaxFlowScore(address);
      
      if (cachedScore) {
        // If cache is stale, trigger background refresh (don't await)
        if ((cachedScore as any)._stale) {
          console.log(`[MaxFlow API] Returning stale cache for ${address}, triggering background refresh`);
          res.setHeader('X-Cache-Status', 'stale-revalidating');
          
          // Background refresh - fire and forget
          (async () => {
            try {
              console.log(`[MaxFlow API] Background refresh for ${address}`);
              const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${address}`);
              if (response.ok) {
                const data = await response.json();
                await storage.saveMaxFlowScore(address, data);
                console.log(`[MaxFlow API] Background refresh complete for ${address}`);
              }
            } catch (err) {
              console.error(`[MaxFlow API] Background refresh failed for ${address}:`, err);
            }
          })();
        } else {
          res.setHeader('X-Cache-Status', 'hit');
        }
        
        // Return cached data immediately (remove internal _stale flag from response)
        const { _stale, ...scoreData } = cachedScore as any;
        return res.json(scoreData);
      }
      
      // Cache miss - must fetch from MaxFlow API (blocking)
      console.log(`[MaxFlow API] Cache miss, fetching score for ${address}`);
      let response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${address}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MaxFlow API] Error response (${response.status}): ${errorText}`);
        return res.status(response.status).json({ error: 'Failed to fetch MaxFlow score' });
      }
      
      let data = await response.json();
      
      // Save to cache
      await storage.saveMaxFlowScore(address, data);
      
      res.setHeader('X-Cache-Status', 'miss');
      res.json(data);
    } catch (error: any) {
      // Check if this is a DNS error (all retries and fallback exhausted)
      const dnsFailure = isDnsError(error);
      
      if (dnsFailure) {
        console.error('[MaxFlow API] All endpoints failed (DNS), attempting to return stale cache');
        
        // Try to get ANY cached data, even if stale
        const staleCache = await storage.getMaxFlowScoreRaw(req.params.address);
        if (staleCache) {
          console.log('[MaxFlow API] Returning stale cached data (200 OK) due to DNS failure');
          res.setHeader('X-Cache-Status', 'stale-dns-fallback');
          return res.status(200).json(staleCache);
        }
      }
      
      console.error('[MaxFlow API] Exception fetching MaxFlow score:', error);
      
      // Return structured error with retry guidance
      res.setHeader('Retry-After', '60');
      res.status(503).json({ 
        error: 'MaxFlow service temporarily unavailable',
        retryAfter: 60,
        isDnsError: dnsFailure,
      });
    }
  });

  // Combined epoch + nonce endpoint (new v1 API)
  app.get('/api/maxflow/nonce/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/vouch/nonce/${address}`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch nonce' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching nonce:', error);
      res.status(500).json({ error: 'Failed to fetch nonce' });
    }
  });

  // Vouch status check
  app.get('/api/maxflow/vouch-status', async (req, res) => {
    try {
      const { endorser, endorsee } = req.query;
      
      if (!endorser || !endorsee) {
        return res.status(400).json({ error: 'Missing endorser or endorsee parameter' });
      }
      
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/vouch-status?endorser=${endorser}&endorsee=${endorsee}`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch vouch status' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching vouch status:', error);
      res.status(500).json({ error: 'Failed to fetch vouch status' });
    }
  });

  // Submit vouch (flat request body format for v1 API)
  app.post('/api/maxflow/vouch', async (req, res) => {
    try {
      console.log('[MaxFlow API] Vouch request:', JSON.stringify(req.body, null, 2));
      
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/vouch`, {
        method: 'POST',
        body: JSON.stringify(req.body),
      });
      
      console.log('[MaxFlow API] Vouch response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[MaxFlow API] Vouch error response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          return res.status(response.status).json(errorData);
        } catch {
          return res.status(response.status).json({ message: errorText || 'Failed to submit vouch' });
        }
      }
      
      const data = await response.json();
      console.log('[MaxFlow API] Vouch success:', JSON.stringify(data, null, 2));
      
      // Cache the endorsee's fresh score from the response (API now returns it directly)
      const endorseeAddress = req.body.endorsee;
      if (endorseeAddress && data.endorseeLocalHealth !== undefined) {
        console.log(`[MaxFlow API] Caching fresh score for vouchee ${endorseeAddress}: ${data.endorseeLocalHealth}`);
        
        // Load existing cached score (raw - bypasses staleness check) to preserve vouch_counts and activity
        const existingScore = await storage.getMaxFlowScoreRaw(endorseeAddress);
        
        if (existingScore) {
          // Update just the local_health while preserving other fields
          await storage.saveMaxFlowScore(endorseeAddress, {
            ...existingScore,
            address: endorseeAddress.toLowerCase(),
            local_health: data.endorseeLocalHealth,
            cached: false,
            cached_at: new Date().toISOString(),
          });
        } else {
          // No existing cache - fetch full score in background to get complete metadata
          console.log(`[MaxFlow API] No existing cache for ${endorseeAddress}, fetching full score in background`);
          (async () => {
            try {
              const scoreResponse = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${endorseeAddress}`);
              if (scoreResponse.ok) {
                const scoreData = await scoreResponse.json();
                // Update with fresh local_health from vouch response
                scoreData.local_health = data.endorseeLocalHealth;
                scoreData.cached_at = new Date().toISOString();
                await storage.saveMaxFlowScore(endorseeAddress, scoreData);
                console.log(`[MaxFlow API] Cached full score for new vouchee ${endorseeAddress}`);
              }
            } catch (err) {
              console.error(`[MaxFlow API] Failed to fetch full score for vouchee:`, err);
            }
          })();
        }
      }
      
      res.json(data);
    } catch (error) {
      console.error('Error submitting vouch:', error);
      res.status(500).json({ error: 'Failed to submit vouch' });
    }
  });

  // Get revocation info (endorsement ID needed for revoke)
  app.get('/api/maxflow/revoke/info', async (req, res) => {
    try {
      const { endorser, endorsee } = req.query;
      
      if (!endorser || !endorsee) {
        return res.status(400).json({ error: 'Missing endorser or endorsee parameter' });
      }
      
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/revoke/info?endorser=${endorser}&endorsee=${endorsee}`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch revoke info' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching revoke info:', error);
      res.status(500).json({ error: 'Failed to fetch revoke info' });
    }
  });

  // Submit revocation
  app.post('/api/maxflow/revoke', async (req, res) => {
    try {
      console.log('[MaxFlow API] Revoke request:', JSON.stringify(req.body, null, 2));
      
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/revoke`, {
        method: 'POST',
        body: JSON.stringify(req.body),
      });
      
      console.log('[MaxFlow API] Revoke response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[MaxFlow API] Revoke error response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          return res.status(response.status).json(errorData);
        } catch {
          return res.status(response.status).json({ message: errorText || 'Failed to revoke vouch' });
        }
      }
      
      const data = await response.json();
      console.log('[MaxFlow API] Revoke success:', JSON.stringify(data, null, 2));
      res.json(data);
    } catch (error) {
      console.error('Error revoking vouch:', error);
      res.status(500).json({ error: 'Failed to revoke vouch' });
    }
  });

  // List endorsements (with optional filtering)
  app.get('/api/maxflow/endorsements', async (req, res) => {
    try {
      const { endorser, endorsee, limit, offset } = req.query;
      const params = new URLSearchParams();
      if (endorser) params.append('endorser', endorser as string);
      if (endorsee) params.append('endorsee', endorsee as string);
      if (limit) params.append('limit', limit as string);
      if (offset) params.append('offset', offset as string);
      
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/endorsements?${params.toString()}`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch endorsements' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching endorsements:', error);
      res.status(500).json({ error: 'Failed to fetch endorsements' });
    }
  });

  // List endorsements with expiration status
  app.get('/api/maxflow/endorsements/with-status', async (req, res) => {
    try {
      const { endorser, endorsee, limit } = req.query;
      const params = new URLSearchParams();
      if (endorser) params.append('endorser', endorser as string);
      if (endorsee) params.append('endorsee', endorsee as string);
      if (limit) params.append('limit', limit as string);
      
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/endorsements/with-status?${params.toString()}`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch endorsements with status' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching endorsements with status:', error);
      res.status(500).json({ error: 'Failed to fetch endorsements with status' });
    }
  });

  // Get user profile (display name)
  app.get('/api/maxflow/user/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/user/${address}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: 'Profile not found' });
        }
        return res.status(response.status).json({ error: 'Failed to fetch user profile' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      // Don't send WWW-Authenticate header - let the frontend custom login form handle auth
      return res.status(401).json({ error: 'Authentication required' });
    }

    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      console.error('[Admin] ADMIN_USERNAME or ADMIN_PASSWORD not configured');
      return res.status(500).json({ error: 'Admin authentication not configured' });
    }

    if (username !== expectedUsername || password !== expectedPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    next();
  }

  app.post('/api/admin/backfill-balances/:address', adminAuthMiddleware, async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = parseInt(req.query.chainId as string) || 42220;
      
      const result = await storage.backfillBalanceHistory(address, chainId);
      
      res.json({
        snapshotsCreated: result.snapshotsCreated,
        finalBalance: result.finalBalance,
      });
    } catch (error) {
      console.error('Error backfilling balance history:', error);
      res.status(500).json({ error: 'Failed to backfill balance history' });
    }
  });

  app.post('/api/admin/backfill-exchange-rates', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await storage.backfillExchangeRates();
      
      res.json({
        ratesAdded: result.ratesAdded,
        currencies: result.currencies,
      });
    } catch (error) {
      console.error('Error backfilling exchange rates:', error);
      res.status(500).json({ error: 'Failed to backfill exchange rates' });
    }
  });

  app.post('/api/admin/clear-caches', adminAuthMiddleware, async (req, res) => {
    try {
      await storage.clearAllCaches();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing caches:', error);
      res.status(500).json({ error: 'Failed to clear caches' });
    }
  });

  app.post('/api/admin/clear-cached-balances', adminAuthMiddleware, async (req, res) => {
    try {
      await storage.clearCachedBalances();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing cached balances:', error);
      res.status(500).json({ error: 'Failed to clear cached balances' });
    }
  });

  app.post('/api/admin/clear-balance-history', adminAuthMiddleware, async (req, res) => {
    try {
      await storage.clearBalanceHistory();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing balance history:', error);
      res.status(500).json({ error: 'Failed to clear balance history' });
    }
  });

  app.post('/api/admin/clear-transactions-and-balances', adminAuthMiddleware, async (req, res) => {
    try {
      await storage.clearTransactionsAndBalances();
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing transactions and balances:', error);
      res.status(500).json({ error: 'Failed to clear transactions and balances' });
    }
  });

  app.post('/api/admin/backfill-all-wallets', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await storage.backfillAllWallets();
      
      res.json({
        walletsProcessed: result.walletsProcessed,
        totalSnapshots: result.totalSnapshots,
        errors: result.errors,
      });
    } catch (error) {
      console.error('Error backfilling all wallets:', error);
      res.status(500).json({ error: 'Failed to backfill all wallets' });
    }
  });

  app.post('/api/admin/refetch-maxflow-scores', adminAuthMiddleware, async (req, res) => {
    try {
      const wallets = await storage.getAllWalletsWithDetails();
      
      console.log(`[Admin] Fetching all MaxFlow scores via /scores/cached for ${wallets.length} wallets`);
      
      // Use the bulk cached scores endpoint - returns { count, scores: [...] }
      const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/scores/cached`);
      
      if (!response.ok) {
        throw new Error(`Bulk MaxFlow API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[Admin] Bulk response: count=${data.count}, scores array length=${data.scores?.length || 0}`);
      
      let updated = 0;
      let notFound = 0;
      const errors: string[] = [];
      
      // Build a map of address -> score data from the scores array
      const scoresMap = new Map<string, any>();
      if (data.scores && Array.isArray(data.scores)) {
        for (const score of data.scores) {
          if (score.address) {
            scoresMap.set(score.address.toLowerCase(), score);
          }
        }
      }
      
      console.log(`[Admin] Built scoresMap with ${scoresMap.size} entries from API`);
      
      // Save scores for our wallets
      for (const wallet of wallets) {
        const score = scoresMap.get(wallet.address.toLowerCase());
        if (score) {
          try {
            await storage.saveMaxFlowScore(wallet.address, score);
            updated++;
          } catch (err: any) {
            errors.push(`${wallet.address}: ${err.message}`);
          }
        } else {
          notFound++;
        }
      }
      
      console.log(`[Admin] MaxFlow bulk refetch complete: ${updated} updated, ${notFound} not found in graph`);
      
      res.json({
        walletsProcessed: wallets.length,
        scoresUpdated: updated,
        notInGraph: notFound,
        totalInGraph: data.count || 0,
        errors: errors.slice(0, 10),
      });
    } catch (error) {
      console.error('Error refetching MaxFlow scores:', error);
      res.status(500).json({ error: 'Failed to refetch MaxFlow scores' });
    }
  });

  app.post('/api/admin/prune-old-data', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await storage.pruneOldBalanceHistory();
      
      res.json({
        deletedSnapshots: result.deletedSnapshots,
      });
    } catch (error) {
      console.error('Error pruning old data:', error);
      res.status(500).json({ error: 'Failed to prune old data' });
    }
  });

  app.post('/api/admin/migrate-to-micro-usdc', adminAuthMiddleware, async (req, res) => {
    try {
      const result = await storage.migrateToMicroUsdc();
      
      res.json({
        migratedTransactions: result.migratedTransactions,
        migratedBalances: result.migratedBalances,
      });
    } catch (error) {
      console.error('Error migrating to micro-USDC:', error);
      res.status(500).json({ error: 'Failed to migrate to micro-USDC' });
    }
  });

  // Airdrop Preview - Get eligible wallets (0 balance, lastSeen < 7 days)
  app.get('/api/admin/airdrop/preview', adminAuthMiddleware, async (req, res) => {
    try {
      const eligibleWallets = await storage.getEligibleAirdropWallets();
      
      res.json({
        count: eligibleWallets.length,
        wallets: eligibleWallets,
      });
    } catch (error) {
      console.error('Error previewing airdrop:', error);
      res.status(500).json({ error: 'Failed to preview airdrop' });
    }
  });

  // Airdrop Execute - Send USDC from facilitator to eligible wallets
  app.post('/api/admin/airdrop/execute', adminAuthMiddleware, async (req, res) => {
    try {
      const { amountUsdc, chainId = 42220 } = req.body; // Default to Celo
      
      if (!amountUsdc || isNaN(parseFloat(amountUsdc)) || parseFloat(amountUsdc) <= 0) {
        return res.status(400).json({ error: 'Invalid amount. Must be a positive number.' });
      }
      
      // Parse amount with precision - convert string to micro-USDC using string manipulation
      // to avoid floating point precision issues (e.g., "0.1" -> "100000")
      const amountStr = String(amountUsdc);
      
      // Reject scientific notation (e.g., 7e-7) - must be standard decimal format
      if (amountStr.includes('e') || amountStr.includes('E')) {
        return res.status(400).json({ error: 'Amount must be in standard decimal format (not scientific notation).' });
      }
      
      const [intPart, decPart = ''] = amountStr.split('.');
      
      // Validate integer and decimal parts are numeric
      if (!/^\d+$/.test(intPart) || (decPart && !/^\d+$/.test(decPart))) {
        return res.status(400).json({ error: 'Invalid amount format.' });
      }
      
      // Reject amounts with more than 6 decimal places
      if (decPart.length > 6) {
        return res.status(400).json({ error: 'Amount cannot have more than 6 decimal places.' });
      }
      
      const paddedDecimal = decPart.padEnd(6, '0');
      const amountMicroUsdc = BigInt(intPart + paddedDecimal);
      const amount = Number(amountMicroUsdc) / 1000000; // For display purposes only
      
      const eligibleWallets = await storage.getEligibleAirdropWallets();
      
      if (eligibleWallets.length === 0) {
        return res.json({ 
          success: true, 
          message: 'No eligible wallets found',
          sent: 0,
          failed: 0,
          results: [] 
        });
      }
      
      const facilitatorAccount = getFacilitatorAccount();
      const chainInfo = resolveChain(chainId);
      
      if (!chainInfo) {
        return res.status(400).json({ error: 'Invalid chain ID' });
      }
      
      const chain = chainInfo.viemChain;
      const networkConfig = getNetworkConfig(chainInfo.networkKey);
      
      const publicClient = createPublicClient({
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      const ERC20_TRANSFER_ABI = [
        {
          name: 'transfer',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ] as const;
      
      const results: Array<{ address: string; txHash?: string; error?: string }> = [];
      let sent = 0;
      let failed = 0;
      
      for (const wallet of eligibleWallets) {
        try {
          const txHash = await walletClient.writeContract({
            address: networkConfig.usdcAddress as Address,
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [wallet.address as Address, amountMicroUsdc],
          });
          
          console.log(`[Airdrop] Sent ${amount} USDC to ${wallet.address}: ${txHash}`);
          
          // Wait for transaction confirmation before sending next one to prevent nonce conflicts
          await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
          
          results.push({ address: wallet.address, txHash });
          sent++;
          
          console.log(`[Airdrop] Confirmed: ${txHash}`);
        } catch (error: any) {
          results.push({ address: wallet.address, error: error.message });
          failed++;
          console.error(`[Airdrop] Failed to send to ${wallet.address}:`, error.message);
        }
      }
      
      res.json({
        success: true,
        message: `Airdrop complete. Sent to ${sent} wallets, ${failed} failed.`,
        sent,
        failed,
        amountPerWallet: amount,
        totalSent: sent * amount,
        chainId,
        results,
      });
    } catch (error) {
      console.error('Error executing airdrop:', error);
      res.status(500).json({ error: 'Failed to execute airdrop' });
    }
  });

  app.get('/api/admin/stats', adminAuthMiddleware, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  app.get('/api/admin/wallets', adminAuthMiddleware, async (req, res) => {
    try {
      const wallets = await storage.getAllWalletsWithDetails();
      res.json(wallets);
    } catch (error) {
      console.error('Error fetching wallet details:', error);
      res.status(500).json({ error: 'Failed to fetch wallet details' });
    }
  });

  app.get('/api/admin/wallets-scored-no-balance', adminAuthMiddleware, async (req, res) => {
    try {
      const wallets = await storage.getWalletsWithScoreNoBalance();
      res.json(wallets);
    } catch (error) {
      console.error('Error fetching wallets with score but no balance:', error);
      res.status(500).json({ error: 'Failed to fetch wallets with score but no balance' });
    }
  });

  app.get('/api/admin/health', adminAuthMiddleware, async (req, res) => {
    try {
      const health = {
        maxflowApi: await checkMaxFlowHealth(),
        frankfurterApi: await checkFrankfurterHealth(),
        baseRpc: await checkRpcHealth(8453),
        celoRpc: await checkRpcHealth(42220),
      };
      
      res.json(health);
    } catch (error) {
      console.error('Error checking API health:', error);
      res.status(500).json({ error: 'Failed to check API health' });
    }
  });

  app.get('/api/admin/recent-activity', adminAuthMiddleware, async (req, res) => {
    try {
      const activity = await storage.getRecentActivity();
      res.json(activity);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
  });

  // Aave Operations Admin Endpoints
  app.get('/api/admin/aave-operations', adminAuthMiddleware, async (req, res) => {
    try {
      const { status } = req.query;
      let operations;
      
      if (status === 'failed') {
        operations = await storage.getFailedAaveOperations();
      } else if (status === 'pending') {
        operations = await storage.getPendingAaveOperations();
      } else {
        // Get both failed and pending by default
        const [failed, pending] = await Promise.all([
          storage.getFailedAaveOperations(),
          storage.getPendingAaveOperations(),
        ]);
        operations = [...failed, ...pending].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      
      res.json({
        count: operations.length,
        operations: operations.map(op => {
          const chainInfo = resolveChain(op.chainId);
          return {
            ...op,
            amountFormatted: (parseFloat(op.amount) / 1000000).toFixed(2) + ' USDC',
            chainName: chainInfo?.name || `Chain ${op.chainId}`,
          };
        }),
      });
    } catch (error) {
      console.error('Error fetching Aave operations:', error);
      res.status(500).json({ error: 'Failed to fetch Aave operations' });
    }
  });

  app.get('/api/admin/aave-operations/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const operation = await storage.getAaveOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ error: 'Operation not found' });
      }
      const opChainInfo = resolveChain(operation.chainId);
      res.json({
        ...operation,
        amountFormatted: (parseFloat(operation.amount) / 1000000).toFixed(2) + ' USDC',
        chainName: opChainInfo?.name || `Chain ${operation.chainId}`,
      });
    } catch (error) {
      console.error('Error fetching Aave operation:', error);
      res.status(500).json({ error: 'Failed to fetch Aave operation' });
    }
  });

  // Manual refund endpoint for stuck deposits
  app.post('/api/admin/aave-operations/:id/refund', adminAuthMiddleware, async (req, res) => {
    try {
      const operation = await storage.getAaveOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ error: 'Operation not found' });
      }
      
      if (operation.status === 'completed' || operation.status === 'refunded') {
        return res.status(400).json({ error: 'Operation already resolved', status: operation.status });
      }
      
      // Only allow refund if transfer completed (funds are with facilitator)
      if (!operation.transferTxHash) {
        return res.status(400).json({ 
          error: 'Cannot refund - transfer not completed. Funds still with user.',
          status: operation.status
        });
      }

      const network = getNetworkByChainId(operation.chainId);
      if (!network) {
        return res.status(400).json({ error: 'Invalid chain ID' });
      }

      const chainInfo = resolveChain(operation.chainId);
      if (!chainInfo) {
        return res.status(400).json({ error: `Unsupported chain: ${operation.chainId}` });
      }

      const chain = chainInfo.viemChain;
      const facilitatorAccount = getFacilitatorAccount();

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(network.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(network.rpcUrl),
      });

      console.log('[Admin Refund] Processing manual refund for operation:', operation.id);
      console.log('[Admin Refund] User:', operation.userAddress, 'Amount:', operation.amount);

      const refundHash = await walletClient.writeContract({
        address: network.usdcAddress as Address,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [operation.userAddress as Address, BigInt(operation.amount)],
      });

      console.log('[Admin Refund] Refund tx hash:', refundHash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: refundHash });

      if (receipt.status === 'success') {
        await storage.updateAaveOperation(operation.id, {
          status: 'refunded',
          refundTxHash: refundHash,
          resolvedAt: new Date(),
          resolvedBy: 'admin',
        });

        res.json({
          success: true,
          refundTxHash: refundHash,
          message: 'USDC successfully refunded to user',
        });
      } else {
        res.status(500).json({ error: 'Refund transaction failed', txHash: refundHash });
      }
    } catch (error) {
      console.error('Error processing manual refund:', error);
      res.status(500).json({ 
        error: 'Failed to process refund', 
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Mark operation as resolved (for cases where refund was done manually outside the system)
  app.post('/api/admin/aave-operations/:id/resolve', adminAuthMiddleware, async (req, res) => {
    try {
      const { status, notes } = req.body;
      const operation = await storage.getAaveOperation(req.params.id);
      
      if (!operation) {
        return res.status(404).json({ error: 'Operation not found' });
      }
      
      await storage.updateAaveOperation(operation.id, {
        status: status || 'refunded',
        errorMessage: notes || operation.errorMessage,
        resolvedAt: new Date(),
        resolvedBy: 'admin_manual',
      });

      res.json({ success: true, message: 'Operation marked as resolved' });
    } catch (error) {
      console.error('Error resolving operation:', error);
      res.status(500).json({ error: 'Failed to resolve operation' });
    }
  });

  async function checkMaxFlowHealth(): Promise<boolean> {
    const healthCheckUrl = `${MAXFLOW_API_BASE}/vouch/nonce/0x0000000000000000000000000000000000000000`;
    console.log(`[MaxFlow Health] Checking URL: ${healthCheckUrl}`);
    console.log(`[MaxFlow Health] MAXFLOW_API_BASE resolved to: ${MAXFLOW_API_BASE}`);
    
    try {
      // Use fetchMaxFlow for consistent headers
      const response = await fetchMaxFlow(healthCheckUrl);
      console.log(`[MaxFlow Health] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read response body');
        console.log(`[MaxFlow Health] Response body: ${errorText.substring(0, 200)}`);
      }
      
      return response.ok;
    } catch (error) {
      console.error(`[MaxFlow Health] Error:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  async function checkFrankfurterHealth(): Promise<boolean> {
    try {
      const response = await fetch('https://api.frankfurter.dev/v1/latest?base=USD', {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function checkRpcHealth(chainId: number): Promise<boolean> {
    try {
      const chainInfo = resolveChain(chainId);
      if (!chainInfo) return false;
      
      const config = getNetworkConfig(chainInfo.networkKey);
      const client = createPublicClient({
        chain: chainInfo.viemChain,
        transport: http(config.rpcUrl),
      });
      
      await client.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  // ===== POOL (Prize-Linked Savings) ENDPOINTS =====

  // Helper to get current ISO week info
  function getCurrentWeekInfo() {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    
    // Calculate week start (Monday) and end (Sunday)
    const dayOfWeek = now.getDay() || 7; // Sunday = 7
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    return {
      weekNumber,
      year: now.getFullYear(),
      weekStart,
      weekEnd,
      now,
    };
  }

  // Generate a short referral code from address
  function generateReferralCode(address: string): string {
    return address.slice(2, 10).toUpperCase();
  }

  // Get or create current week's draw
  async function getOrCreateCurrentDraw() {
    const { weekNumber, year, weekStart, weekEnd } = getCurrentWeekInfo();
    
    let draw = await storage.getPoolDraw(weekNumber, year);
    if (!draw) {
      draw = await storage.createPoolDraw({
        weekNumber,
        year,
        weekStart,
        weekEnd,
      });
    }
    return draw;
  }

  // Fetch current Celo APY for pool calculations
  async function getCeloApy(): Promise<number> {
    try {
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aavePoolAddress) return 0;

      const client = createPublicClient({
        chain: celo,
        transport: http(celoNetwork.rpcUrl),
      });

      const reserveData = await client.readContract({
        address: celoNetwork.aavePoolAddress as Address,
        abi: AAVE_POOL_ABI,
        functionName: 'getReserveData',
        args: [celoNetwork.usdcAddress as Address],
      }) as any;

      return rayToPercent(reserveData.currentLiquidityRate);
    } catch (error) {
      console.error('[Pool] Error fetching Celo APY:', error);
      return 0;
    }
  }

  // Get facilitator's aUSDC balance on Celo (this is the sponsor pool - anyone can deposit to sponsor)
  async function getFacilitatorAusdcBalance(): Promise<bigint> {
    try {
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aUsdcAddress) {
        console.error('[Pool] Celo aUSDC address not configured');
        return 0n;
      }

      const facilitatorAccount = getFacilitatorAccount();
      const client = createPublicClient({
        chain: celo,
        transport: http(celoNetwork.rpcUrl),
      });

      const balance = await client.readContract({
        address: celoNetwork.aUsdcAddress as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [facilitatorAccount.address],
      }) as bigint;

      console.log('[Pool] Facilitator aUSDC balance:', balance.toString(), `($${(Number(balance) / 1_000_000).toFixed(2)})`);
      return balance;
    } catch (error) {
      console.error('[Pool] Error fetching facilitator aUSDC balance:', error);
      return 0n;
    }
  }

  // Calculate ACTUAL interest earned by a user from Aave
  // Formula: interest = currentAaveBalance - netDeposits (tracked in database)
  // Note: On-chain scaledBalance × liquidityIndex equals balanceOf, so we must track deposits
  interface AaveUserInterest {
    totalBalance: bigint;      // balanceOf (principal + interest)
    scaledBalance: bigint;     // scaledBalanceOf (principal normalized)
    principal: bigint;         // netDeposits from database (actual deposits - withdrawals)
    interest: bigint;          // totalBalance - netDeposits (actual earned yield)
    liquidityIndex: bigint;    // Current liquidity index from Pool
  }
  
  async function getAaveUserInterest(userAddress: string): Promise<AaveUserInterest | null> {
    try {
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aavePoolAddress || !celoNetwork?.aUsdcAddress) {
        console.error('[Pool] Celo Aave addresses not configured');
        return null;
      }

      const client = createPublicClient({
        chain: celo,
        transport: http(celoNetwork.rpcUrl),
      });

      const normalizedAddress = getAddress(userAddress);
      const aUsdcAddress = celoNetwork.aUsdcAddress as Address;
      const poolAddress = celoNetwork.aavePoolAddress as Address;
      const usdcAddress = celoNetwork.usdcAddress as Address;

      // Fetch all data in parallel: balanceOf, scaledBalanceOf, and reserveData (for liquidityIndex)
      const [totalBalance, scaledBalance, reserveData] = await Promise.all([
        client.readContract({
          address: aUsdcAddress,
          abi: ATOKEN_ABI,
          functionName: 'balanceOf',
          args: [normalizedAddress],
        }) as Promise<bigint>,
        client.readContract({
          address: aUsdcAddress,
          abi: ATOKEN_ABI,
          functionName: 'scaledBalanceOf',
          args: [normalizedAddress],
        }) as Promise<bigint>,
        client.readContract({
          address: poolAddress,
          abi: AAVE_POOL_ABI,
          functionName: 'getReserveData',
          args: [usdcAddress],
        }) as Promise<any>,
      ]);

      // liquidityIndex is in RAY (1e27 precision)
      const liquidityIndex = BigInt(reserveData.liquidityIndex.toString());

      // Get netDeposits from database (actual deposits - withdrawals)
      const normalizedAddr = userAddress.toLowerCase();
      const snapshot = await storage.getYieldSnapshot(normalizedAddr);
      let netDeposits = BigInt(snapshot?.netDeposits || '0');
      
      // Auto-initialize: if user has aUSDC but netDeposits is 0, 
      // set netDeposits = currentBalance (assumes 0 interest baseline)
      // This self-heals after database resets or when existing snapshots have netDeposits=0
      if (totalBalance > 0n && netDeposits === 0n) {
        console.log(`[Pool] Auto-initializing netDeposits for ${normalizedAddr}: ${totalBalance.toString()} (current aUSDC balance)`);
        await storage.upsertYieldSnapshot(normalizedAddr, {
          netDeposits: totalBalance.toString(),
          lastAusdcBalance: totalBalance.toString(),
        });
        netDeposits = totalBalance; // Use current balance as baseline (0 interest)
      }

      // interest = currentBalance - netDeposits
      // Guard against negative values (e.g., if user withdrew and netDeposits is stale)
      const interest = totalBalance > netDeposits ? totalBalance - netDeposits : 0n;

      return {
        totalBalance,
        scaledBalance,
        principal: netDeposits, // Use netDeposits as "principal"
        interest,
        liquidityIndex,
      };
    } catch (error) {
      console.error('[Pool] Error fetching Aave user interest:', error);
      return null;
    }
  }

  // Get actual interest for multiple users in batch (more efficient)
  // Uses netDeposits from database to calculate real interest
  async function getAaveUsersInterest(userAddresses: string[]): Promise<Map<string, AaveUserInterest>> {
    const results = new Map<string, AaveUserInterest>();
    
    if (userAddresses.length === 0) return results;

    try {
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aavePoolAddress || !celoNetwork?.aUsdcAddress) {
        return results;
      }

      const client = createPublicClient({
        chain: celo,
        transport: http(celoNetwork.rpcUrl),
      });

      const aUsdcAddress = celoNetwork.aUsdcAddress as Address;
      const poolAddress = celoNetwork.aavePoolAddress as Address;
      const usdcAddress = celoNetwork.usdcAddress as Address;

      // Fetch liquidityIndex once (it's the same for all users)
      const reserveData = await client.readContract({
        address: poolAddress,
        abi: AAVE_POOL_ABI,
        functionName: 'getReserveData',
        args: [usdcAddress],
      }) as any;
      
      const liquidityIndex = BigInt(reserveData.liquidityIndex.toString());

      // Batch fetch balances for all users
      const balancePromises = userAddresses.map(async (addr) => {
        try {
          const normalizedAddress = getAddress(addr);
          const normalizedAddr = addr.toLowerCase();
          
          const [totalBalance, scaledBalance, snapshot] = await Promise.all([
            client.readContract({
              address: aUsdcAddress,
              abi: ATOKEN_ABI,
              functionName: 'balanceOf',
              args: [normalizedAddress],
            }) as Promise<bigint>,
            client.readContract({
              address: aUsdcAddress,
              abi: ATOKEN_ABI,
              functionName: 'scaledBalanceOf',
              args: [normalizedAddress],
            }) as Promise<bigint>,
            storage.getYieldSnapshot(normalizedAddr),
          ]);

          // Use netDeposits from database as principal
          let netDeposits = BigInt(snapshot?.netDeposits || '0');
          
          // Auto-initialize if user has aUSDC but netDeposits is 0
          // This handles both new users and existing snapshots with netDeposits=0
          if (totalBalance > 0n && netDeposits === 0n) {
            console.log(`[Pool] Batch: Auto-initializing netDeposits for ${normalizedAddr}: ${totalBalance.toString()} (current aUSDC balance)`);
            await storage.upsertYieldSnapshot(normalizedAddr, {
              netDeposits: totalBalance.toString(),
              lastAusdcBalance: totalBalance.toString(),
            });
            netDeposits = totalBalance;
          }
          
          // interest = currentBalance - netDeposits
          const interest = totalBalance > netDeposits ? totalBalance - netDeposits : 0n;

          return {
            address: normalizedAddr,
            data: {
              totalBalance,
              scaledBalance,
              principal: netDeposits,
              interest,
              liquidityIndex,
            },
          };
        } catch (e) {
          console.error(`[Pool] Error fetching interest for ${addr}:`, e);
          return null;
        }
      });

      const balanceResults = await Promise.all(balancePromises);
      
      for (const result of balanceResults) {
        if (result) {
          results.set(result.address, result.data);
        }
      }
    } catch (error) {
      console.error('[Pool] Error in batch interest fetch:', error);
    }

    return results;
  }

  // Calculate ACTUAL pool from all opted-in users using real Aave interest data
  // Uses database-tracked deposits/withdrawals to determine principal
  async function calculateActualPool(): Promise<{
    totalYield: string;
    totalYieldFormatted: string;
    participantData: Array<{
      address: string;
      totalBalance: string;
      principal: string;
      totalAccruedInterest: string;
      weeklyYield: string; // This week's yield (total accrued if first week, or delta from snapshot)
      optInPercent: number;
      contribution: string; // weeklyYield × opt-in%
      isFirstWeek: boolean;
    }>;
  }> {
    try {
      const snapshotsWithOptIn = await storage.getYieldSnapshotsWithOptIn();

      if (snapshotsWithOptIn.length === 0) {
        return {
          totalYield: '0',
          totalYieldFormatted: '0.00',
          participantData: [],
        };
      }

      // Get actual interest for all opted-in users
      const addresses = snapshotsWithOptIn.map(s => s.walletAddress);
      const interestMap = await getAaveUsersInterest(addresses);

      let totalContributions = 0n;
      const participantData: Array<{
        address: string;
        totalBalance: string;
        principal: string;
        totalAccruedInterest: string;
        weeklyYield: string;
        optInPercent: number;
        contribution: string;
        isFirstWeek: boolean;
      }> = [];

      for (const snapshot of snapshotsWithOptIn) {
        const addr = snapshot.walletAddress.toLowerCase();
        const interestData = interestMap.get(addr);
        
        if (!interestData) continue;

        const totalAccrued = interestData.interest;
        const snapshotYieldValue = BigInt(snapshot.snapshotYield || '0');
        const isFirstWeek = snapshot.isFirstWeek ?? true;
        
        // Calculate weekly yield:
        // - First week: use total accrued interest
        // - Subsequent weeks: current accrued - snapshot (what's earned since last draw)
        let weeklyYield: bigint;
        if (isFirstWeek) {
          weeklyYield = totalAccrued;
        } else {
          // Weekly yield = current total accrued - accrued at last snapshot
          weeklyYield = totalAccrued > snapshotYieldValue ? totalAccrued - snapshotYieldValue : 0n;
        }
        
        if (weeklyYield <= 0n) continue;

        // Contribution = weekly yield × opt-in%
        const contribution = (weeklyYield * BigInt(snapshot.optInPercent)) / 100n;
        
        if (contribution > 0n) {
          totalContributions += contribution;
          participantData.push({
            address: snapshot.walletAddress,
            totalBalance: interestData.totalBalance.toString(),
            principal: interestData.principal.toString(),
            totalAccruedInterest: totalAccrued.toString(),
            weeklyYield: weeklyYield.toString(),
            optInPercent: snapshot.optInPercent,
            contribution: contribution.toString(),
            isFirstWeek,
          });
        }
      }

      return {
        totalYield: totalContributions.toString(),
        totalYieldFormatted: (Number(totalContributions) / 1_000_000).toFixed(4),
        participantData,
      };
    } catch (error) {
      console.error('[Pool] Error calculating actual pool:', error);
      return {
        totalYield: '0',
        totalYieldFormatted: '0.00',
        participantData: [],
      };
    }
  }

  // Get pool status (current pool, your tickets, countdown)
  app.get('/api/pool/status/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();
      
      const draw = await getOrCreateCurrentDraw();
      const settings = await storage.getPoolSettings(normalizedAddress);
      const referrals = await storage.getReferralsByReferrer(normalizedAddress);
      const userSnapshot = await storage.getYieldSnapshot(normalizedAddress);
      
      // Get referral code (generate if doesn't exist)
      const referralCode = generateReferralCode(normalizedAddress);
      
      // Calculate time until draw (end of week)
      const { weekEnd, now, weekNumber, year } = getCurrentWeekInfo();
      const msUntilDraw = weekEnd.getTime() - now.getTime();
      const hoursUntilDraw = Math.floor(msUntilDraw / (1000 * 60 * 60));
      const minutesUntilDraw = Math.floor((msUntilDraw % (1000 * 60 * 60)) / (1000 * 60));
      
      // Calculate ACTUAL pool from real Aave interest data (using scaledBalanceOf)
      const actualPoolData = await calculateActualPool();
      
      // Get actual participant count (all users with opt-in > 0, regardless of yield collection)
      const actualParticipantCount = await storage.getOptedInParticipantCount();
      
      // Fetch user's ACTUAL interest data from Aave (principal vs interest)
      const userInterestData = await getAaveUserInterest(normalizedAddress);
      const aUsdcBalance = userInterestData?.totalBalance.toString() || '0';
      const userPrincipal = userInterestData?.principal.toString() || '0';
      const userTotalAccruedInterest = userInterestData?.interest || 0n;
      
      // === WEEKLY YIELD CALCULATION ===
      // First week: use total accrued interest
      // Subsequent weeks: current accrued - snapshot (what's earned since last draw)
      const isFirstWeek = userSnapshot?.isFirstWeek ?? true;
      const snapshotYield = BigInt(userSnapshot?.snapshotYield || '0');
      
      let userWeeklyYield: bigint;
      if (isFirstWeek) {
        userWeeklyYield = userTotalAccruedInterest;
      } else {
        userWeeklyYield = userTotalAccruedInterest > snapshotYield 
          ? userTotalAccruedInterest - snapshotYield 
          : 0n;
      }
      
      // === ACTUAL YIELD APPROACH ===
      // Tickets are calculated from: weekly yield × opt-in% + referral bonuses
      
      // 1. Get all referrals to build referee -> referrer map
      const allReferrals = await storage.getAllReferrals();
      const refereeToReferrer = new Map<string, string>();
      for (const ref of allReferrals) {
        refereeToReferrer.set(ref.refereeAddress.toLowerCase(), ref.referrerAddress.toLowerCase());
      }
      
      // 2. Build contribution map from actual pool data (already uses weekly yields)
      const contributionMap = new Map<string, bigint>();
      for (const participant of actualPoolData.participantData) {
        contributionMap.set(participant.address.toLowerCase(), BigInt(participant.contribution));
      }
      
      // 3. Calculate user's contribution (weekly yield × opt-in%)
      const userOptIn = settings?.optInPercent ?? 0;
      const userContribution = userOptIn > 0 && userWeeklyYield > 0n
        ? (userWeeklyYield * BigInt(userOptIn)) / 100n
        : 0n;
      
      // Add/update user in contribution map
      if (userContribution > 0n) {
        contributionMap.set(normalizedAddress, userContribution);
      }
      
      // 4. Calculate referral bonuses (10% of referee's contribution goes to referrer)
      const referralBonusMap = new Map<string, bigint>();
      for (const [participantAddr, contribution] of contributionMap) {
        const referrerAddr = refereeToReferrer.get(participantAddr);
        if (referrerAddr && contribution > 0n) {
          const bonus = contribution / 10n; // 10%
          referralBonusMap.set(referrerAddr, (referralBonusMap.get(referrerAddr) || 0n) + bonus);
        }
      }
      
      // 5. Collect all unique participant addresses
      const allParticipants = new Set<string>();
      for (const addr of contributionMap.keys()) allParticipants.add(addr);
      for (const addr of referralBonusMap.keys()) allParticipants.add(addr);
      
      // 6. Calculate POOL TOTAL tickets
      let poolTotalTickets = 0n;
      for (const addr of allParticipants) {
        const contribution = contributionMap.get(addr) || 0n;
        const referralBonus = referralBonusMap.get(addr) || 0n;
        poolTotalTickets += contribution + referralBonus;
      }
      
      // 7. Calculate USER's tickets
      const userReferralBonus = referralBonusMap.get(normalizedAddress) || 0n;
      const userTotalTickets = userContribution + userReferralBonus;
      
      // 8. Calculate odds
      const oddsValue = poolTotalTickets > 0n && userTotalTickets > 0n
        ? Number((userTotalTickets * 10000n) / poolTotalTickets) / 100 // 2 decimal precision
        : 0;
      const odds = oddsValue.toFixed(2);
      
      // === APY-based ESTIMATED yield until week end ===
      // Projected additional yield = principal × (APY/100) × (remainingDays/365)
      const principalNum = Number(userPrincipal) / 1_000_000; // in USDC
      const remainingMs = msUntilDraw > 0 ? msUntilDraw : 0;
      const remainingDays = remainingMs / (1000 * 60 * 60 * 24);
      
      // Fetch current APY (cached)
      let estimatedAdditionalYield = 0;
      let currentApy = 0;
      try {
        const celoNetwork = getNetworkByChainId(42220);
        if (celoNetwork?.aavePoolAddress && celoNetwork?.usdcAddress) {
          const client = createPublicClient({
            chain: celo,
            transport: http('https://forno.celo.org'),
          });
          const reserveData = await client.readContract({
            address: celoNetwork.aavePoolAddress as `0x${string}`,
            abi: AAVE_POOL_ABI,
            functionName: 'getReserveData',
            args: [celoNetwork.usdcAddress as `0x${string}`],
          }) as any;
          const liquidityRateRay = BigInt(reserveData.currentLiquidityRate);
          currentApy = Number(liquidityRateRay) / 1e25; // Ray to percentage
          
          // Estimated yield until week end
          estimatedAdditionalYield = principalNum * (currentApy / 100) * (remainingDays / 365);
        }
      } catch (e) {
        console.error('[Pool] Error fetching APY for projection:', e);
      }
      
      // Estimated total yield at week end = current weekly yield + projected additional
      const userWeeklyYieldNum = Number(userWeeklyYield) / 1_000_000;
      const estimatedTotalYieldAtWeekEnd = userWeeklyYieldNum + estimatedAdditionalYield;
      const estimatedContribution = estimatedTotalYieldAtWeekEnd * (userOptIn / 100);
      
      // === Pool values ===
      // Sponsor pool = facilitator's on-chain aUSDC balance (anyone can deposit to sponsor)
      const facilitatorBalance = await getFacilitatorAusdcBalance();
      const sponsoredPoolNum = Number(facilitatorBalance);
      const totalYieldNum = Number(actualPoolData.totalYield);
      const totalPool = sponsoredPoolNum + totalYieldNum;
      
      res.json({
        draw: {
          id: draw.id,
          weekNumber: draw.weekNumber,
          year: draw.year,
          status: draw.status,
          totalPool: totalPool.toString(), // Current pool (sponsored + actual yield so far)
          totalPoolFormatted: (totalPool / 1_000_000).toFixed(2),
          sponsoredPool: facilitatorBalance.toString(), // On-chain aUSDC in facilitator wallet
          sponsoredPoolFormatted: (sponsoredPoolNum / 1_000_000).toFixed(2),
          totalTickets: poolTotalTickets.toString(), // Total tickets from actual yields
          participantCount: actualParticipantCount,
          // Actual yield data
          actualYieldFromParticipants: actualPoolData.totalYield,
          actualYieldFromParticipantsFormatted: actualPoolData.totalYieldFormatted,
          currentApy: currentApy.toFixed(2),
        },
        user: {
          optInPercent: settings?.optInPercent ?? 0,
          facilitatorApproved: settings?.facilitatorApproved ?? false,
          approvalTxHash: settings?.approvalTxHash ?? null,
          isFirstWeek, // Indicates if this is user's first week in the pool
          // ACTUAL values (from Aave)
          totalAccruedInterest: userTotalAccruedInterest.toString(), // Total interest ever earned
          totalAccruedInterestFormatted: (Number(userTotalAccruedInterest) / 1_000_000).toFixed(4),
          weeklyYield: userWeeklyYield.toString(), // This week's yield (actual)
          weeklyYieldFormatted: (Number(userWeeklyYield) / 1_000_000).toFixed(4),
          yieldContribution: userContribution.toString(), // weeklyYield × opt-in%
          yieldContributionFormatted: (Number(userContribution) / 1_000_000).toFixed(4),
          referralBonus: userReferralBonus.toString(), // Referral bonus tickets
          referralBonusFormatted: (Number(userReferralBonus) / 1_000_000).toFixed(4),
          totalTickets: userTotalTickets.toString(), // Total tickets
          totalTicketsFormatted: (Number(userTotalTickets) / 1_000_000).toFixed(4),
          odds, // Odds based on actual yields
          aUsdcBalance,
          aUsdcBalanceFormatted: (Number(aUsdcBalance) / 1_000_000).toFixed(2),
          principal: userPrincipal, // User's principal (effective, adjusted for external withdrawals)
          principalFormatted: (Number(userPrincipal) / 1_000_000).toFixed(2),
          // ESTIMATED values (APY-based projections)
          estimatedAdditionalYield: (estimatedAdditionalYield * 1_000_000).toFixed(0),
          estimatedAdditionalYieldFormatted: estimatedAdditionalYield.toFixed(4),
          estimatedTotalYieldAtWeekEnd: (estimatedTotalYieldAtWeekEnd * 1_000_000).toFixed(0),
          estimatedTotalYieldAtWeekEndFormatted: estimatedTotalYieldAtWeekEnd.toFixed(4),
          estimatedContribution: (estimatedContribution * 1_000_000).toFixed(0),
          estimatedContributionFormatted: estimatedContribution.toFixed(4),
        },
        referral: {
          code: referralCode,
          activeReferrals: referrals.length,
          referralsList: referrals.map((r: { refereeAddress: string; createdAt: Date }) => ({
            address: r.refereeAddress,
            createdAt: r.createdAt,
          })),
        },
        countdown: {
          hoursUntilDraw,
          minutesUntilDraw,
          drawTime: weekEnd.toISOString(),
        },
      });
    } catch (error) {
      console.error('[Pool] Error getting status:', error);
      res.status(500).json({ error: 'Failed to get pool status' });
    }
  });

  // Set opt-in percentage
  // NOTE: This endpoint now ONLY saves the opt-in percentage.
  // All yield calculations are estimates until the weekly draw.
  // Final ticket amounts are computed at draw time from live balances.
  app.post('/api/pool/opt-in', async (req, res) => {
    try {
      const { address, optInPercent } = req.body;
      
      if (typeof optInPercent !== 'number' || optInPercent < 0 || optInPercent > 100) {
        return res.status(400).json({ error: 'optInPercent must be between 0 and 100' });
      }
      
      const normalizedAddress = address.toLowerCase();
      const roundedOptIn = Math.round(optInPercent);
      
      // Simply save the opt-in percentage - no yield collection
      await storage.upsertPoolSettings(normalizedAddress, roundedOptIn);
      
      console.log(`[Pool] Updated opt-in for ${normalizedAddress}: ${roundedOptIn}%`);
      
      res.json({ 
        success: true, 
        optInPercent: roundedOptIn,
      });
    } catch (error) {
      console.error('[Pool] Error setting opt-in:', error);
      res.status(500).json({ error: 'Failed to set opt-in percentage' });
    }
  });

  // Get facilitator address for pool yield collection
  // Users need this to approve the facilitator to collect their aUSDC yields
  app.get('/api/pool/facilitator', async (req, res) => {
    try {
      const facilitatorAccount = getFacilitatorAccount();
      const celoNetwork = getNetworkByChainId(42220);
      
      res.json({
        facilitatorAddress: facilitatorAccount.address,
        aUsdcAddress: celoNetwork?.aUsdcAddress || null,
        chainId: 42220, // Celo only for pool
      });
    } catch (error) {
      console.error('[Pool] Error getting facilitator:', error);
      res.status(500).json({ error: 'Failed to get facilitator info' });
    }
  });

  // Check on-chain allowance for facilitator
  app.get('/api/pool/allowance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = getAddress(address);
      const facilitatorAccount = getFacilitatorAccount();
      
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aUsdcAddress) {
        return res.status(500).json({ error: 'Celo aUSDC address not configured' });
      }
      
      const client = createPublicClient({
        chain: celo,
        transport: http('https://forno.celo.org'),
      });
      
      const allowance = await client.readContract({
        address: getAddress(celoNetwork.aUsdcAddress),
        abi: [{
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
          ],
          name: 'allowance',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'allowance',
        args: [normalizedAddress, facilitatorAccount.address],
      });
      
      const allowanceNum = Number(allowance.toString());
      const hasApproval = allowanceNum > 0;
      
      res.json({
        allowance: allowance.toString(),
        allowanceFormatted: (allowanceNum / 1_000_000).toFixed(2),
        hasApproval,
        facilitatorAddress: facilitatorAccount.address,
      });
    } catch (error) {
      console.error('[Pool] Error checking allowance:', error);
      res.status(500).json({ error: 'Failed to check allowance' });
    }
  });

  // Record facilitator approval after user signs approve tx
  app.post('/api/pool/record-approval', async (req, res) => {
    try {
      const { address, txHash } = req.body;
      
      if (!address || !txHash) {
        return res.status(400).json({ error: 'Address and txHash are required' });
      }
      
      const normalizedAddress = address.toLowerCase();
      
      // Ensure user has pool settings before recording approval
      const settings = await storage.getPoolSettings(normalizedAddress);
      if (!settings) {
        // Create default settings with 0% opt-in
        await storage.upsertPoolSettings(normalizedAddress, 0);
      }
      
      // Update approval status
      await storage.updateFacilitatorApproval(normalizedAddress, true, txHash);
      
      console.log(`[Pool] Recorded facilitator approval for ${normalizedAddress}: tx=${txHash}`);
      
      res.json({
        success: true,
        facilitatorApproved: true,
        approvalTxHash: txHash,
      });
    } catch (error) {
      console.error('[Pool] Error recording approval:', error);
      res.status(500).json({ error: 'Failed to record approval' });
    }
  });

  // Get referral code
  app.get('/api/pool/referral-code/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();
      const code = generateReferralCode(normalizedAddress);
      
      res.json({
        code,
        link: `${req.protocol}://${req.get('host')}/pool?ref=${code}`,
      });
    } catch (error) {
      console.error('[Pool] Error getting referral code:', error);
      res.status(500).json({ error: 'Failed to get referral code' });
    }
  });

  // Apply referral code
  app.post('/api/pool/apply-referral', async (req, res) => {
    try {
      const { address, referralCode } = req.body;
      const normalizedAddress = address.toLowerCase();
      
      // Check if already referred
      const existingReferral = await storage.getReferralByReferee(normalizedAddress);
      if (existingReferral) {
        return res.status(400).json({ 
          error: 'You have already been referred',
          referrerAddress: existingReferral.referrerAddress,
        });
      }
      
      // Find referrer by code (code is first 8 chars of address)
      const referrerAddress = await storage.findAddressByReferralCode(referralCode.toLowerCase());
      if (!referrerAddress) {
        return res.status(404).json({ error: 'Invalid referral code' });
      }
      
      // Can't refer yourself
      if (referrerAddress.toLowerCase() === normalizedAddress) {
        return res.status(400).json({ error: 'Cannot refer yourself' });
      }
      
      // Create referral
      await storage.createReferral({
        referrerAddress: referrerAddress.toLowerCase(),
        refereeAddress: normalizedAddress,
        referralCode: referralCode.toUpperCase(),
      });
      
      res.json({ 
        success: true,
        referrerAddress: referrerAddress.toLowerCase(),
      });
    } catch (error) {
      console.error('[Pool] Error applying referral:', error);
      res.status(500).json({ error: 'Failed to apply referral code' });
    }
  });

  // Get pool history (past draws)
  app.get('/api/pool/history', async (req, res) => {
    try {
      const draws = await storage.getPoolDrawHistory(10);
      
      res.json({
        draws: draws.map(d => ({
          id: d.id,
          weekNumber: d.weekNumber,
          year: d.year,
          totalPool: d.totalPool,
          totalPoolFormatted: (Number(d.totalPool) / 1_000_000).toFixed(2),
          participantCount: d.participantCount,
          winnerAddress: d.winnerAddress,
          status: d.status,
          drawnAt: d.drawnAt,
        })),
      });
    } catch (error) {
      console.error('[Pool] Error getting history:', error);
      res.status(500).json({ error: 'Failed to get pool history' });
    }
  });

  // Contribute yield to pool (called when user earns yield with opt-in > 0)
  app.post('/api/pool/contribute', async (req, res) => {
    try {
      const { address, yieldAmount } = req.body; // yieldAmount in micro-USDC
      const normalizedAddress = address.toLowerCase();
      
      // Get user's opt-in percentage
      const settings = await storage.getPoolSettings(normalizedAddress);
      if (!settings || settings.optInPercent === 0) {
        return res.json({ success: true, contributed: '0', message: 'User not opted in' });
      }
      
      const draw = await getOrCreateCurrentDraw();
      
      // Calculate contribution based on opt-in percentage
      const yieldBigInt = BigInt(yieldAmount);
      const contribution = (yieldBigInt * BigInt(settings.optInPercent)) / 100n;
      
      if (contribution === 0n) {
        return res.json({ success: true, contributed: '0', message: 'Contribution too small' });
      }
      
      // Update user's contribution
      await storage.addPoolContribution(draw.id, normalizedAddress, contribution.toString());
      
      // Update referrer's bonus tickets (10% of this contribution)
      const referral = await storage.getReferralByReferee(normalizedAddress);
      if (referral) {
        const referrerBonus = contribution / 10n; // 10% bonus
        if (referrerBonus > 0n) {
          await storage.addReferralBonus(draw.id, referral.referrerAddress, referrerBonus.toString());
        }
      }
      
      // Update draw totals
      await storage.updateDrawTotals(draw.id);
      
      res.json({ 
        success: true, 
        contributed: contribution.toString(),
        contributedFormatted: (Number(contribution) / 1_000_000).toFixed(4),
      });
    } catch (error) {
      console.error('[Pool] Error contributing:', error);
      res.status(500).json({ error: 'Failed to contribute to pool' });
    }
  });

  // Prepare contribution - returns ACTUAL interest earned and contribution preview
  // Uses Aave's scaledBalanceOf for accurate principal vs interest calculation
  // No actual transfer happens here - transfers only occur at weekly draw
  app.post('/api/pool/prepare-contribution', async (req, res) => {
    try {
      const { address, optInPercent } = req.body;
      
      if (!address) {
        return res.status(400).json({ error: 'Address required' });
      }
      if (typeof optInPercent !== 'number' || optInPercent < 0 || optInPercent > 100) {
        return res.status(400).json({ error: 'optInPercent must be between 0 and 100' });
      }
      
      const normalizedAddress = address.toLowerCase();
      
      // Check if user has existing pool settings
      const existingSettings = await storage.getPoolSettings(normalizedAddress);
      const isFirstTime = !existingSettings;
      
      // Fetch ACTUAL interest data from Aave (balance - net deposits from database)
      const interestData = await getAaveUserInterest(normalizedAddress);
      
      if (!interestData) {
        return res.status(500).json({ error: 'Could not fetch Aave data' });
      }
      
      const totalBalance = interestData.totalBalance;
      const principal = interestData.principal;
      const actualInterest = interestData.interest;
      
      // Calculate contribution based on actual interest and opt-in percentage
      const contribution = optInPercent > 0 && actualInterest > 0n
        ? (actualInterest * BigInt(Math.round(optInPercent))) / 100n
        : 0n;
      const keep = actualInterest - contribution;
      
      res.json({
        success: true,
        isFirstTime,
        // Balance breakdown
        totalBalance: totalBalance.toString(),
        totalBalanceFormatted: (Number(totalBalance) / 1_000_000).toFixed(2),
        principal: principal.toString(),
        principalFormatted: (Number(principal) / 1_000_000).toFixed(2),
        // ACTUAL interest earned (not estimated)
        actualInterest: actualInterest.toString(),
        actualInterestFormatted: (Number(actualInterest) / 1_000_000).toFixed(4),
        optInPercent: Math.round(optInPercent),
        // Contribution preview
        contribution: contribution.toString(),
        contributionFormatted: (Number(contribution) / 1_000_000).toFixed(4),
        keep: keep.toString(),
        keepFormatted: (Number(keep) / 1_000_000).toFixed(4),
        message: isFirstTime
          ? (totalBalance > 0n 
              ? 'Set your yield contribution. Your actual earned interest will be collected at the weekly draw.'
              : 'Deposit USDC to Aave on Celo to start earning interest for the pool.')
          : 'Update your yield contribution percentage.',
      });
    } catch (error: unknown) {
      console.error('[Pool] Error preparing contribution:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: errorMessage.slice(0, 200) });
    }
  });

  // Submit signed yield contribution - executes permit + transferFrom
  app.post('/api/pool/submit-contribution', async (req, res) => {
    try {
      const { address, optInPercent, contributionAmount, deadline, signature } = req.body;
      
      if (!address || !signature || !contributionAmount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const normalizedAddress = address.toLowerCase();
      const userAddress = getAddress(normalizedAddress);
      const contributionBigInt = BigInt(contributionAmount);
      
      if (contributionBigInt === 0n) {
        return res.status(400).json({ error: 'Contribution amount must be greater than 0' });
      }
      
      // Get Celo aUSDC config
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aUsdcAddress) {
        return res.status(500).json({ error: 'Celo aUSDC not configured' });
      }
      
      const CELO_AUSDC_ADDRESS = getAddress(celoNetwork.aUsdcAddress);
      const facilitatorAccount = getFacilitatorAccount();
      
      // Extract v, r, s from signature
      const sig = signature as Hex;
      const { r, s, v } = hexToSignature(sig);
      
      // Create wallet client for facilitator
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain: celo,
        transport: http('https://forno.celo.org'),
      });
      
      const publicClient = createPublicClient({
        chain: celo,
        transport: http('https://forno.celo.org'),
      });
      
      console.log('[Pool] Executing permit + transferFrom:', {
        owner: userAddress,
        spender: facilitatorAccount.address,
        amount: contributionAmount,
        deadline,
      });
      
      // Step 1: Execute permit to approve facilitator
      const permitHash = await walletClient.writeContract({
        address: CELO_AUSDC_ADDRESS,
        abi: AUSDC_PERMIT_ABI,
        functionName: 'permit',
        args: [
          userAddress,
          facilitatorAccount.address,
          contributionBigInt,
          BigInt(deadline),
          Number(v),
          r,
          s,
        ],
      });
      
      console.log('[Pool] Permit tx hash:', permitHash);
      
      // Wait for permit to be mined
      await publicClient.waitForTransactionReceipt({ hash: permitHash });
      
      // Step 2: Execute transferFrom to move aUSDC to facilitator (pool vault)
      const transferHash = await walletClient.writeContract({
        address: CELO_AUSDC_ADDRESS,
        abi: AUSDC_PERMIT_ABI,
        functionName: 'transferFrom',
        args: [
          userAddress,
          facilitatorAccount.address,
          contributionBigInt,
        ],
      });
      
      console.log('[Pool] TransferFrom tx hash:', transferHash);
      
      // Wait for transfer to be mined
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
      
      if (transferReceipt.status !== 'success') {
        throw new Error('Transfer transaction failed');
      }
      
      // Update database records
      const roundedOptIn = Math.round(optInPercent);
      await storage.upsertPoolSettings(normalizedAddress, roundedOptIn);
      
      // Get or create current draw
      const draw = await getOrCreateCurrentDraw();
      
      // Add contribution to pool
      await storage.addPoolContribution(draw.id, normalizedAddress, contributionAmount);
      
      // Update referrer's bonus tickets (10%)
      const referral = await storage.getReferralByReferee(normalizedAddress);
      if (referral) {
        const referrerBonus = contributionBigInt / 10n;
        if (referrerBonus > 0n) {
          await storage.addReferralBonus(draw.id, referral.referrerAddress, referrerBonus.toString());
        }
      }
      
      // Update draw totals
      await storage.updateDrawTotals(draw.id);
      
      // Update yield snapshot with new balance
      const newBalance = await publicClient.readContract({
        address: CELO_AUSDC_ADDRESS,
        abi: AUSDC_PERMIT_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      });
      
      const existingSnapshot = await storage.getYieldSnapshot(normalizedAddress);
      const newTotalCollected = existingSnapshot 
        ? (BigInt(existingSnapshot.totalYieldCollected || '0') + contributionBigInt).toString()
        : contributionAmount;
        
      await storage.upsertYieldSnapshot(normalizedAddress, {
        lastAusdcBalance: newBalance.toString(),
        lastCollectedAt: new Date(),
        totalYieldCollected: newTotalCollected,
      });
      
      console.log(`[Pool] On-chain yield contribution complete: ${normalizedAddress} contributed ${contributionAmount}`);
      
      res.json({
        success: true,
        permitTxHash: permitHash,
        transferTxHash: transferHash,
        contributionAmount,
        contributionAmountFormatted: (Number(contributionAmount) / 1_000_000).toFixed(6),
        optInPercent: roundedOptIn,
      });
    } catch (error: unknown) {
      console.error('[Pool] Error submitting contribution:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const shortError = errorMessage.includes('revert') 
        ? 'Transaction reverted - permit may be invalid or expired'
        : errorMessage.slice(0, 200);
      res.status(500).json({ error: shortError });
    }
  });

  // Admin: Run weekly draw with on-chain yield collection
  // Uses shared executePoolDraw function for consistent behavior with scheduler
  app.post('/api/admin/pool/draw', adminAuthMiddleware, async (req, res) => {
    try {
      const { weekNumber, year, dryRun = false } = req.body;
      
      const result = await executePoolDraw(weekNumber, year, dryRun);
      
      if (!result.success && result.error) {
        if (result.error === 'Draw not found') {
          return res.status(404).json({ error: result.error });
        }
        if (result.error === 'Draw already completed') {
          return res.status(400).json({ error: result.error });
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error('[Pool] Error running draw:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to run draw';
      res.status(500).json({ error: errorMsg });
    }
  });

  // Admin: Collect yield from all opted-in users (called periodically)
  // MVP model: Snapshots track aUSDC balance growth (yield), contributions recorded in DB
  // On-chain transfers only happen at draw time when winner is paid
  app.post('/api/admin/pool/collect-yield', adminAuthMiddleware, async (req, res) => {
    try {
      // Celo aUSDC (Aave V3) from shared networks config
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aUsdcAddress) {
        return res.status(500).json({ error: 'Celo aUSDC address not configured' });
      }
      const CELO_AUSDC_ADDRESS = getAddress(celoNetwork.aUsdcAddress);
      
      // Get all users with yield snapshots and opt-in > 0
      const snapshotsWithOptIn = await storage.getYieldSnapshotsWithOptIn();
      
      if (snapshotsWithOptIn.length === 0) {
        return res.json({
          success: true,
          message: 'No users with opt-in and snapshots',
          collected: 0,
          users: 0,
        });
      }
      
      const draw = await getOrCreateCurrentDraw();
      let totalYieldCollected = 0n;
      let usersProcessed = 0;
      let usersSkipped = 0;
      const results: any[] = [];
      
      // Create client once for all reads
      const client = createPublicClient({
        chain: celo,
        transport: http(),
      });
      
      // Get aUSDC balance for each user and calculate yield
      for (const snapshot of snapshotsWithOptIn) {
        try {
          // Safety check: Skip users without a valid initial snapshot
          // This prevents treating their entire principal as yield
          if (!snapshot.lastAusdcBalance || snapshot.lastAusdcBalance === '0') {
            console.log(`[Pool] Skipping ${snapshot.walletAddress}: no initial snapshot balance`);
            usersSkipped++;
            results.push({
              address: snapshot.walletAddress,
              skipped: true,
              reason: 'No initial snapshot balance - user needs to re-initialize',
            });
            continue;
          }
          
          // Verify opt-in is still valid
          if (!snapshot.optInPercent || snapshot.optInPercent === 0) {
            console.log(`[Pool] Skipping ${snapshot.walletAddress}: opt-in is 0`);
            usersSkipped++;
            continue;
          }
          
          // Fetch current aUSDC balance from Celo
          const userAddress = getAddress(snapshot.walletAddress);
          const currentBalance = await client.readContract({
            address: CELO_AUSDC_ADDRESS,
            abi: [{
              inputs: [{ name: 'account', type: 'address' }],
              name: 'balanceOf',
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
              type: 'function',
            }],
            functionName: 'balanceOf',
            args: [userAddress],
          });
          
          const currentBalanceBigInt = BigInt(currentBalance.toString());
          const lastBalanceBigInt = BigInt(snapshot.lastAusdcBalance);
          
          // Calculate yield (current - last snapshot)
          // Only positive yield counts (ignore withdrawals or no change)
          // This is the key protection: we only count GROWTH, never principal
          let yieldEarned = 0n;
          if (currentBalanceBigInt > lastBalanceBigInt) {
            yieldEarned = currentBalanceBigInt - lastBalanceBigInt;
          }
          
          // Calculate contribution based on opt-in percentage
          const contribution = (yieldEarned * BigInt(snapshot.optInPercent)) / 100n;
          
          if (contribution > 0n) {
            // Add to pool (database record only - no on-chain transfer in MVP)
            await storage.addPoolContribution(draw.id, snapshot.walletAddress, contribution.toString());
            
            // Update referrer's bonus tickets (10%)
            const referral = await storage.getReferralByReferee(snapshot.walletAddress);
            if (referral) {
              const referrerBonus = contribution / 10n;
              if (referrerBonus > 0n) {
                await storage.addReferralBonus(draw.id, referral.referrerAddress, referrerBonus.toString());
              }
            }
            
            totalYieldCollected += contribution;
          }
          
          // Update snapshot with current balance for next collection cycle
          const newTotalCollected = (BigInt(snapshot.totalYieldCollected) + contribution).toString();
          await storage.upsertYieldSnapshot(snapshot.walletAddress, {
            lastAusdcBalance: currentBalanceBigInt.toString(),
            lastCollectedAt: new Date(),
            totalYieldCollected: newTotalCollected,
          });
          
          usersProcessed++;
          results.push({
            address: snapshot.walletAddress,
            previousBalance: snapshot.lastAusdcBalance,
            currentBalance: currentBalanceBigInt.toString(),
            yieldEarned: yieldEarned.toString(),
            yieldEarnedFormatted: (Number(yieldEarned) / 1_000_000).toFixed(6),
            contribution: contribution.toString(),
            contributionFormatted: (Number(contribution) / 1_000_000).toFixed(6),
            optInPercent: snapshot.optInPercent,
          });
        } catch (userError) {
          console.error(`[Pool] Error collecting yield for ${snapshot.walletAddress}:`, userError);
          results.push({
            address: snapshot.walletAddress,
            error: (userError as Error).message,
          });
        }
      }
      
      // Update draw totals
      await storage.updateDrawTotals(draw.id);
      
      res.json({
        success: true,
        draw: {
          id: draw.id,
          weekNumber: draw.weekNumber,
          year: draw.year,
        },
        collected: totalYieldCollected.toString(),
        collectedFormatted: (Number(totalYieldCollected) / 1_000_000).toFixed(4),
        usersProcessed,
        usersSkipped,
        results,
        note: 'MVP model: contributions recorded in database. On-chain transfers executed at draw payout.',
      });
    } catch (error) {
      console.error('[Pool] Error collecting yield:', error);
      res.status(500).json({ error: 'Failed to collect yield' });
    }
  });

  // Initialize yield snapshot (user calls this when opting in)
  app.post('/api/pool/init-snapshot', async (req, res) => {
    try {
      const { address } = req.body;
      const normalizedAddress = address.toLowerCase();
      
      // Celo aUSDC (Aave V3) from shared networks config
      const celoNetwork = getNetworkByChainId(42220);
      if (!celoNetwork?.aUsdcAddress) {
        return res.status(500).json({ error: 'Celo aUSDC address not configured' });
      }
      const CELO_AUSDC_ADDRESS = getAddress(celoNetwork.aUsdcAddress);
      const userAddress = getAddress(address);
      
      // Get current aUSDC balance on Celo
      const client = createPublicClient({
        chain: celo,
        transport: http(),
      });
      
      const currentBalance = await client.readContract({
        address: CELO_AUSDC_ADDRESS,
        abi: [{
          inputs: [{ name: 'account', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'balanceOf',
        args: [userAddress],
      });
      
      // Create or update snapshot
      await storage.upsertYieldSnapshot(normalizedAddress, {
        lastAusdcBalance: currentBalance.toString(),
        lastCollectedAt: new Date(),
      });
      
      res.json({
        success: true,
        snapshot: {
          address: normalizedAddress,
          balance: currentBalance.toString(),
          balanceFormatted: (Number(currentBalance) / 1_000_000).toFixed(4),
        },
      });
    } catch (error) {
      console.error('[Pool] Error initializing snapshot:', error);
      res.status(500).json({ error: 'Failed to initialize yield snapshot' });
    }
  });

  // Get user's yield snapshot
  app.get('/api/pool/snapshot/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();
      
      const snapshot = await storage.getYieldSnapshot(normalizedAddress);
      
      if (!snapshot) {
        return res.json({
          hasSnapshot: false,
          snapshot: null,
        });
      }
      
      res.json({
        hasSnapshot: true,
        snapshot: {
          lastAusdcBalance: snapshot.lastAusdcBalance,
          lastAusdcBalanceFormatted: (Number(snapshot.lastAusdcBalance) / 1_000_000).toFixed(4),
          lastCollectedAt: snapshot.lastCollectedAt,
          totalYieldCollected: snapshot.totalYieldCollected,
          totalYieldCollectedFormatted: (Number(snapshot.totalYieldCollected) / 1_000_000).toFixed(4),
        },
      });
    } catch (error) {
      console.error('[Pool] Error getting snapshot:', error);
      res.status(500).json({ error: 'Failed to get yield snapshot' });
    }
  });

  // Admin: Get pool stats
  app.get('/api/admin/pool/stats', adminAuthMiddleware, async (req, res) => {
    try {
      const draw = await getOrCreateCurrentDraw();
      const allSettings = await storage.getAllPoolSettings();
      const totalOptedIn = allSettings.filter(s => s.optInPercent > 0).length;
      const avgOptIn = allSettings.length > 0 
        ? allSettings.reduce((sum, s) => sum + s.optInPercent, 0) / allSettings.length 
        : 0;
      
      res.json({
        currentDraw: {
          id: draw.id,
          weekNumber: draw.weekNumber,
          year: draw.year,
          status: draw.status,
          totalPool: draw.totalPool,
          totalPoolFormatted: (Number(draw.totalPool) / 1_000_000).toFixed(2),
          participantCount: draw.participantCount,
        },
        stats: {
          totalUsersOptedIn: totalOptedIn,
          averageOptInPercent: avgOptIn.toFixed(1),
          totalRegisteredUsers: allSettings.length,
        },
      });
    } catch (error) {
      console.error('[Pool] Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get pool stats' });
    }
  });

  // Admin: Get pool scheduler status
  app.get('/api/admin/pool/scheduler', adminAuthMiddleware, async (req, res) => {
    try {
      const status = await getSchedulerStatus();
      res.json({
        scheduler: {
          ...status,
          drawSchedule: 'Sunday 00:00 UTC (weekly)',
          checkInterval: 'Every hour',
        },
      });
    } catch (error) {
      console.error('[Pool] Error getting scheduler status:', error);
      res.status(500).json({ error: 'Failed to get scheduler status' });
    }
  });

  // ===== ANALYTICS DASHBOARD ENDPOINTS =====

  // Get comprehensive analytics overview
  app.get('/api/admin/analytics/overview', adminAuthMiddleware, async (req, res) => {
    try {
      const overview = await storage.getAnalyticsOverview();
      res.json(overview);
    } catch (error) {
      console.error('[Analytics] Error getting overview:', error);
      res.status(500).json({ error: 'Failed to get analytics overview' });
    }
  });

  // Get wallet growth over time
  app.get('/api/admin/analytics/wallet-growth', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const growth = await storage.getWalletGrowth(days);
      res.json(growth);
    } catch (error) {
      console.error('[Analytics] Error getting wallet growth:', error);
      res.status(500).json({ error: 'Failed to get wallet growth' });
    }
  });

  // Get transaction volume over time
  app.get('/api/admin/analytics/transaction-volume', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const volume = await storage.getTransactionVolume(days);
      res.json(volume);
    } catch (error) {
      console.error('[Analytics] Error getting transaction volume:', error);
      res.status(500).json({ error: 'Failed to get transaction volume' });
    }
  });

  // Get per-chain breakdown
  app.get('/api/admin/analytics/chain-breakdown', adminAuthMiddleware, async (req, res) => {
    try {
      const breakdown = await storage.getChainBreakdown();
      res.json(breakdown);
    } catch (error) {
      console.error('[Analytics] Error getting chain breakdown:', error);
      res.status(500).json({ error: 'Failed to get chain breakdown' });
    }
  });

  // Get pool analytics
  app.get('/api/admin/analytics/pool', adminAuthMiddleware, async (req, res) => {
    try {
      const poolAnalytics = await storage.getPoolAnalytics();
      res.json(poolAnalytics);
    } catch (error) {
      console.error('[Analytics] Error getting pool analytics:', error);
      res.status(500).json({ error: 'Failed to get pool analytics' });
    }
  });

  // Get Aave/yield analytics
  app.get('/api/admin/analytics/aave', adminAuthMiddleware, async (req, res) => {
    try {
      const aaveAnalytics = await storage.getAaveAnalytics();
      res.json(aaveAnalytics);
    } catch (error) {
      console.error('[Analytics] Error getting Aave analytics:', error);
      res.status(500).json({ error: 'Failed to get Aave analytics' });
    }
  });

  // Get facilitator analytics
  app.get('/api/admin/analytics/facilitator', adminAuthMiddleware, async (req, res) => {
    try {
      const facilitatorAnalytics = await storage.getFacilitatorAnalytics();
      res.json(facilitatorAnalytics);
    } catch (error) {
      console.error('[Analytics] Error getting facilitator analytics:', error);
      res.status(500).json({ error: 'Failed to get facilitator analytics' });
    }
  });

  // Get MaxFlow analytics
  app.get('/api/admin/analytics/maxflow', adminAuthMiddleware, async (req, res) => {
    try {
      const maxflowAnalytics = await storage.getMaxFlowAnalytics();
      res.json(maxflowAnalytics);
    } catch (error) {
      console.error('[Analytics] Error getting MaxFlow analytics:', error);
      res.status(500).json({ error: 'Failed to get MaxFlow analytics' });
    }
  });

  // Get GoodDollar analytics
  app.get('/api/admin/analytics/gooddollar', adminAuthMiddleware, async (req, res) => {
    try {
      const gdAnalytics = await storage.getGoodDollarAnalytics();
      res.json(gdAnalytics);
    } catch (error) {
      console.error('[Analytics] Error getting GoodDollar analytics:', error);
      res.status(500).json({ error: 'Failed to get GoodDollar analytics' });
    }
  });

  // Get XP analytics
  app.get('/api/admin/analytics/xp', adminAuthMiddleware, async (req, res) => {
    try {
      const xpAnalytics = await storage.getXpAnalytics();
      res.json(xpAnalytics);
    } catch (error) {
      console.error('[Analytics] Error getting XP analytics:', error);
      res.status(500).json({ error: 'Failed to get XP analytics' });
    }
  });

  // Get cumulative wallet growth
  app.get('/api/admin/analytics/cumulative-growth', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const growth = await storage.getCumulativeWalletGrowth(days);
      res.json(growth);
    } catch (error) {
      console.error('[Analytics] Error getting cumulative growth:', error);
      res.status(500).json({ error: 'Failed to get cumulative growth' });
    }
  });

  // Get active vs inactive wallets
  app.get('/api/admin/analytics/active-inactive', adminAuthMiddleware, async (req, res) => {
    try {
      const data = await storage.getActiveVsInactiveWallets();
      res.json(data);
    } catch (error) {
      console.error('[Analytics] Error getting active/inactive:', error);
      res.status(500).json({ error: 'Failed to get active/inactive data' });
    }
  });

  // Get transaction trends (count and avg size)
  app.get('/api/admin/analytics/transaction-trends', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const trends = await storage.getTransactionTrends(days);
      res.json(trends);
    } catch (error) {
      console.error('[Analytics] Error getting transaction trends:', error);
      res.status(500).json({ error: 'Failed to get transaction trends' });
    }
  });

  // Get TVL over time
  app.get('/api/admin/analytics/tvl', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const tvl = await storage.getTVLOverTime(days);
      res.json(tvl);
    } catch (error) {
      console.error('[Analytics] Error getting TVL:', error);
      res.status(500).json({ error: 'Failed to get TVL data' });
    }
  });

  // Get balance distribution
  app.get('/api/admin/analytics/balance-distribution', adminAuthMiddleware, async (req, res) => {
    try {
      const distribution = await storage.getBalanceDistribution();
      res.json(distribution);
    } catch (error) {
      console.error('[Analytics] Error getting balance distribution:', error);
      res.status(500).json({ error: 'Failed to get balance distribution' });
    }
  });

  // Get chain usage over time
  app.get('/api/admin/analytics/chain-usage', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const usage = await storage.getChainUsageOverTime(days);
      res.json(usage);
    } catch (error) {
      console.error('[Analytics] Error getting chain usage:', error);
      res.status(500).json({ error: 'Failed to get chain usage data' });
    }
  });

  // Get DAU/WAU
  app.get('/api/admin/analytics/dau-wau', adminAuthMiddleware, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const data = await storage.getDAUWAU(days);
      res.json(data);
    } catch (error) {
      console.error('[Analytics] Error getting DAU/WAU:', error);
      res.status(500).json({ error: 'Failed to get DAU/WAU data' });
    }
  });

  // Get feature adoption rates
  app.get('/api/admin/analytics/feature-adoption', adminAuthMiddleware, async (req, res) => {
    try {
      const rates = await storage.getFeatureAdoptionRates();
      res.json(rates);
    } catch (error) {
      console.error('[Analytics] Error getting feature adoption:', error);
      res.status(500).json({ error: 'Failed to get feature adoption data' });
    }
  });

  // Get conversion funnels
  app.get('/api/admin/analytics/funnels', adminAuthMiddleware, async (req, res) => {
    try {
      const funnels = await storage.getConversionFunnels();
      res.json(funnels);
    } catch (error) {
      console.error('[Analytics] Error getting funnels:', error);
      res.status(500).json({ error: 'Failed to get funnel data' });
    }
  });

  // =============================================
  // Sybil Detection Endpoints
  // =============================================

  // Get IP analytics summary
  app.get('/api/admin/analytics/sybil', adminAuthMiddleware, async (req, res) => {
    try {
      const summary = await storage.getIpAnalyticsSummary();
      res.json(summary);
    } catch (error) {
      console.error('[Sybil] Error getting analytics summary:', error);
      res.status(500).json({ error: 'Failed to get sybil analytics' });
    }
  });

  // Get suspicious IP patterns (multiple wallets from same IP)
  app.get('/api/admin/analytics/sybil/suspicious', adminAuthMiddleware, async (req, res) => {
    try {
      const minWallets = parseInt(req.query.minWallets as string) || 2;
      const patterns = await storage.getSuspiciousIpPatterns(minWallets);
      res.json(patterns);
    } catch (error) {
      console.error('[Sybil] Error getting suspicious patterns:', error);
      res.status(500).json({ error: 'Failed to get suspicious IP patterns' });
    }
  });

  // Get IP events for a specific wallet (for investigating a flagged wallet)
  app.get('/api/admin/analytics/sybil/wallet/:address', adminAuthMiddleware, async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      const events = await storage.getIpEventsForWallet(address);
      res.json(events);
    } catch (error) {
      console.error('[Sybil] Error getting wallet IP events:', error);
      res.status(500).json({ error: 'Failed to get wallet IP events' });
    }
  });

  // Get wallet fingerprint details with score breakdown
  app.get('/api/admin/analytics/sybil/fingerprint/:address', adminAuthMiddleware, async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      const details = await storage.getWalletFingerprintDetails(address);
      res.json(details);
    } catch (error) {
      console.error('[Sybil] Error getting wallet fingerprint details:', error);
      res.status(500).json({ error: 'Failed to get wallet fingerprint details' });
    }
  });

  // Get wallets grouped by storage token (alternative to IP grouping)
  app.get('/api/admin/analytics/sybil/tokens', adminAuthMiddleware, async (req, res) => {
    try {
      const minWallets = parseInt(req.query.minWallets as string) || 2;
      const patterns = await storage.getSuspiciousStorageTokenPatterns(minWallets);
      res.json(patterns);
    } catch (error) {
      console.error('[Sybil] Error getting storage token patterns:', error);
      res.status(500).json({ error: 'Failed to get storage token patterns' });
    }
  });

  // Get all flagged wallets with their scores and matching signals
  app.get('/api/admin/analytics/sybil/flagged', adminAuthMiddleware, async (req, res) => {
    try {
      const flagged = await storage.getAllFlaggedWalletsWithScores();
      res.json(flagged);
    } catch (error) {
      console.error('[Sybil] Error getting flagged wallets:', error);
      res.status(500).json({ error: 'Failed to get flagged wallets' });
    }
  });

  // Sync GoodDollar claims from blockchain
  // Fetches G$ token transfers from CeloScan where FROM = UBI contract (claim events)
  app.post('/api/admin/gooddollar/sync-claims', adminAuthMiddleware, async (req, res) => {
    try {
      const { walletAddress } = req.body;

      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      console.log(`[GoodDollar Sync] Starting claim sync for ${walletAddress}`);

      // GoodDollar contract addresses on Celo
      const GD_TOKEN = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A';
      const UBI_CONTRACT = '0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1';
      const CELO_CHAIN_ID = 42220;

      // Try Etherscan v2 unified API first
      const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
      let transfers: any[] = [];

      if (etherscanApiKey) {
        const url = `https://api.etherscan.io/v2/api?chainid=${CELO_CHAIN_ID}&module=account&action=tokentx&contractaddress=${GD_TOKEN}&address=${walletAddress}&sort=desc&apikey=${etherscanApiKey}`;
        
        try {
          console.log('[GoodDollar Sync] Fetching from Etherscan v2 API...');
          const response = await fetch(url);
          const data = await response.json();

          if (data.status === '1' && Array.isArray(data.result)) {
            transfers = data.result;
            console.log(`[GoodDollar Sync] Found ${transfers.length} G$ transfers from Etherscan v2`);
          } else {
            console.log('[GoodDollar Sync] Etherscan v2 returned no results, trying CeloScan fallback');
          }
        } catch (error) {
          console.log('[GoodDollar Sync] Etherscan v2 failed, trying CeloScan fallback');
        }
      }

      // Fallback to CeloScan direct API
      if (transfers.length === 0) {
        const celoscanApiKey = process.env.CELOSCAN_API_KEY;
        if (celoscanApiKey) {
          const url = `https://api.celoscan.io/api?module=account&action=tokentx&contractaddress=${GD_TOKEN}&address=${walletAddress}&sort=desc&apikey=${celoscanApiKey}`;
          
          try {
            console.log('[GoodDollar Sync] Fetching from CeloScan API...');
            const response = await fetch(url);
            const data = await response.json();

            if (data.status === '1' && Array.isArray(data.result)) {
              transfers = data.result;
              console.log(`[GoodDollar Sync] Found ${transfers.length} G$ transfers from CeloScan`);
            }
          } catch (error) {
            console.error('[GoodDollar Sync] CeloScan request failed:', error);
          }
        } else {
          console.log('[GoodDollar Sync] No CELOSCAN_API_KEY available');
        }
      }

      if (transfers.length === 0) {
        return res.json({
          success: true,
          message: 'No G$ transfers found',
          claims: [],
          inserted: 0,
          skipped: 0,
        });
      }

      // Filter for claim events: transfers FROM the UBI contract TO the wallet
      const claimTransfers = transfers.filter((tx: any) => 
        tx.from?.toLowerCase() === UBI_CONTRACT.toLowerCase() &&
        tx.to?.toLowerCase() === walletAddress.toLowerCase()
      );

      console.log(`[GoodDollar Sync] Found ${claimTransfers.length} claim transfers (from UBI contract)`);

      if (claimTransfers.length === 0) {
        return res.json({
          success: true,
          message: 'No claim transfers found',
          claims: [],
          inserted: 0,
          skipped: 0,
        });
      }

      // Convert transfers to claim records
      // G$ has 18 decimals
      const claims = claimTransfers.map((tx: any) => {
        const timestamp = parseInt(tx.timeStamp) * 1000;
        const claimDate = new Date(timestamp);
        
        // Calculate claimedDay (days since GoodDollar epoch - January 1, 2020)
        const epochStart = new Date('2020-01-01T00:00:00Z').getTime();
        const claimedDay = Math.floor((timestamp - epochStart) / (24 * 60 * 60 * 1000));

        // Format amount (G$ has 18 decimals)
        const rawAmount = tx.value || '0';
        const amountBigInt = BigInt(rawAmount);
        const wholePart = amountBigInt / BigInt(10 ** 18);
        const fractionalPart = amountBigInt % BigInt(10 ** 18);
        const fractionalStr = fractionalPart.toString().padStart(18, '0').slice(0, 2);
        const amountFormatted = `${wholePart}.${fractionalStr}`;

        return {
          walletAddress: walletAddress.toLowerCase(),
          txHash: tx.hash,
          amount: rawAmount,
          amountFormatted,
          claimedDay,
          gasDripTxHash: null,
        };
      });

      // Sync to database (upsert with deduplication by txHash)
      const result = await storage.syncGoodDollarClaims(claims);

      console.log(`[GoodDollar Sync] Sync complete: ${result.inserted} inserted, ${result.skipped} skipped (duplicates)`);

      res.json({
        success: true,
        message: `Synced ${result.inserted} new claims, ${result.skipped} already existed`,
        claims: claims.map(c => ({
          txHash: c.txHash,
          amountFormatted: c.amountFormatted,
          claimedDay: c.claimedDay,
        })),
        inserted: result.inserted,
        skipped: result.skipped,
      });
    } catch (error) {
      console.error('[GoodDollar Sync] Error syncing claims:', error);
      res.status(500).json({ error: 'Failed to sync claims from blockchain' });
    }
  });

  // Donate to prize pool (admin can add funds)
  // Donations increase the prize pool but do NOT add tickets - they're pure sponsorship
  app.post('/api/admin/pool/donate', adminAuthMiddleware, async (req, res) => {
    try {
      const { amount } = req.body; // Amount in micro-USDC
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid donation amount' });
      }

      const draw = await getOrCreateCurrentDraw();
      const currentSponsored = BigInt(draw.sponsoredPool || '0');
      const newSponsored = (currentSponsored + BigInt(amount)).toString();
      const totalPrizePool = (BigInt(draw.totalPool) + BigInt(newSponsored)).toString();
      
      // Update only the sponsored pool - no tickets added for donations
      await db
        .update(poolDraws)
        .set({ 
          sponsoredPool: newSponsored,
        })
        .where(eq(poolDraws.id, draw.id));

      res.json({
        success: true,
        donated: amount,
        donatedFormatted: (Number(amount) / 1_000_000).toFixed(2),
        newSponsoredPool: newSponsored,
        newSponsoredPoolFormatted: (Number(newSponsored) / 1_000_000).toFixed(2),
        totalPrizePool,
        totalPrizePoolFormatted: (Number(totalPrizePool) / 1_000_000).toFixed(2),
      });
    } catch (error) {
      console.error('[Pool] Error processing donation:', error);
      res.status(500).json({ error: 'Failed to process donation' });
    }
  });

  // ============================================
  // GOODDOLLAR UBI ENDPOINTS
  // ============================================

  // Sync GoodDollar identity status from frontend
  app.post('/api/gooddollar/sync-identity', async (req, res) => {
    try {
      const { 
        walletAddress, 
        isWhitelisted, 
        whitelistedRoot,
        lastAuthenticated,
        authenticationPeriod,
        expiresAt,
        isExpired,
        daysUntilExpiry
      } = req.body;

      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const identity = await storage.upsertGoodDollarIdentity({
        walletAddress,
        isWhitelisted: isWhitelisted ?? false,
        whitelistedRoot: whitelistedRoot ?? null,
        lastAuthenticated: lastAuthenticated ? new Date(lastAuthenticated) : null,
        authenticationPeriod: authenticationPeriod ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isExpired: isExpired ?? false,
        daysUntilExpiry: daysUntilExpiry ?? null,
      });

      res.json({ 
        success: true, 
        identity: {
          walletAddress: identity.walletAddress,
          isWhitelisted: identity.isWhitelisted,
          isExpired: identity.isExpired,
        }
      });
    } catch (error) {
      console.error('[GoodDollar] Error syncing identity:', error);
      res.status(500).json({ error: 'Failed to sync identity' });
    }
  });

  // Record a GoodDollar claim
  app.post('/api/gooddollar/record-claim', async (req, res) => {
    try {
      const { 
        walletAddress, 
        txHash, 
        amount, 
        amountFormatted, 
        claimedDay,
        gasDripTxHash
      } = req.body;

      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return res.status(400).json({ error: 'Invalid transaction hash' });
      }

      if (!amount || !amountFormatted) {
        return res.status(400).json({ error: 'Missing amount data' });
      }

      if (typeof claimedDay !== 'number') {
        return res.status(400).json({ error: 'Invalid claimed day' });
      }

      const claim = await storage.recordGoodDollarClaim({
        walletAddress,
        txHash,
        amount,
        amountFormatted,
        claimedDay,
        gasDripTxHash: gasDripTxHash ?? null,
      });

      res.json({ 
        success: true, 
        claim: {
          id: claim.id,
          walletAddress: claim.walletAddress,
          txHash: claim.txHash,
          amountFormatted: claim.amountFormatted,
          claimedDay: claim.claimedDay,
          createdAt: claim.createdAt,
        }
      });
    } catch (error: any) {
      // Handle duplicate txHash gracefully
      if (error.code === '23505' || error.message?.includes('duplicate key')) {
        return res.status(409).json({ error: 'Claim already recorded' });
      }
      console.error('[GoodDollar] Error recording claim:', error);
      res.status(500).json({ error: 'Failed to record claim' });
    }
  });

  // Get claim history for a wallet
  app.get('/api/gooddollar/claims/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 30;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const claims = await storage.getGoodDollarClaimHistory(address, limit);

      res.json({ 
        claims: claims.map(c => ({
          id: c.id,
          txHash: c.txHash,
          amount: c.amount,
          amountFormatted: c.amountFormatted,
          claimedDay: c.claimedDay,
          createdAt: c.createdAt,
        }))
      });
    } catch (error) {
      console.error('[GoodDollar] Error fetching claim history:', error);
      res.status(500).json({ error: 'Failed to fetch claim history' });
    }
  });

  // Get identity status from database
  app.get('/api/gooddollar/identity/:address', async (req, res) => {
    try {
      const { address } = req.params;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const identity = await storage.getGoodDollarIdentity(address);

      if (!identity) {
        return res.json({ found: false, identity: null });
      }

      res.json({ 
        found: true,
        identity: {
          walletAddress: identity.walletAddress,
          isWhitelisted: identity.isWhitelisted,
          whitelistedRoot: identity.whitelistedRoot,
          lastAuthenticated: identity.lastAuthenticated,
          authenticationPeriod: identity.authenticationPeriod,
          expiresAt: identity.expiresAt,
          isExpired: identity.isExpired,
          daysUntilExpiry: identity.daysUntilExpiry,
          updatedAt: identity.updatedAt,
        }
      });
    } catch (error) {
      console.error('[GoodDollar] Error fetching identity:', error);
      res.status(500).json({ error: 'Failed to fetch identity' });
    }
  });

  // ===== XP SYSTEM ENDPOINTS =====
  // XP is stored as "centi-XP" (multiplied by 100) for 2 decimal precision
  // e.g., 2.45 XP is stored as 245 in the database
  // API responses convert back to decimal format for display

  app.get('/api/xp/:address', async (req, res) => {
    try {
      const { address } = req.params;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const xpBalance = await storage.getXpBalance(address);
      
      const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
      let canClaim = true;
      let nextClaimTime: string | null = null;
      let timeUntilNextClaim: number | null = null;

      if (xpBalance?.lastClaimTime) {
        const timeSinceLastClaim = Date.now() - xpBalance.lastClaimTime.getTime();
        if (timeSinceLastClaim < CLAIM_COOLDOWN_MS) {
          canClaim = false;
          const nextTime = new Date(xpBalance.lastClaimTime.getTime() + CLAIM_COOLDOWN_MS);
          nextClaimTime = nextTime.toISOString();
          timeUntilNextClaim = CLAIM_COOLDOWN_MS - timeSinceLastClaim;
        }
      }

      // Convert centi-XP to decimal for display (divide by 100)
      const totalXpCenti = xpBalance?.totalXp || 0;
      res.json({
        totalXp: totalXpCenti / 100,
        claimCount: xpBalance?.claimCount || 0,
        lastClaimTime: xpBalance?.lastClaimTime?.toISOString() || null,
        canClaim,
        nextClaimTime,
        timeUntilNextClaim,
      });
    } catch (error) {
      console.error('[XP] Error fetching XP balance:', error);
      res.status(500).json({ error: 'Failed to fetch XP balance' });
    }
  });

  app.post('/api/xp/claim', async (req, res) => {
    try {
      const { address } = req.body;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      // Check 24-hour cooldown
      const xpBalance = await storage.getXpBalance(address);
      const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

      if (xpBalance?.lastClaimTime) {
        const timeSinceLastClaim = Date.now() - xpBalance.lastClaimTime.getTime();
        if (timeSinceLastClaim < CLAIM_COOLDOWN_MS) {
          const nextTime = new Date(xpBalance.lastClaimTime.getTime() + CLAIM_COOLDOWN_MS);
          return res.status(429).json({ 
            error: 'Claim cooldown active',
            nextClaimTime: nextTime.toISOString(),
            timeUntilNextClaim: CLAIM_COOLDOWN_MS - timeSinceLastClaim,
          });
        }
      }

      // First check cached score
      let scoreData = await storage.getMaxFlowScore(address);
      let rawSignal = scoreData?.local_health || 0;

      // If no cached score or zero signal, try fetching fresh from MaxFlow API
      if (rawSignal === 0) {
        console.log(`[XP Claim] No cached score for ${address}, fetching fresh from MaxFlow API`);
        try {
          const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${address}`);
          if (response.ok) {
            const freshData = await response.json();
            rawSignal = freshData?.local_health || 0;
            if (rawSignal > 0) {
              // Save the fresh score to cache
              await storage.saveMaxFlowScore(address, freshData);
              console.log(`[XP Claim] Fresh MaxFlow score for ${address}: ${rawSignal}`);
            }
          }
        } catch (fetchError) {
          console.error(`[XP Claim] Failed to fetch fresh MaxFlow score:`, fetchError);
          // Continue with zero signal - user truly has no score
        }
      }

      // Calculate XP using blended formula: (signal²/100 + √signal) / 2
      // This balances high score rewards with accessibility for newcomers
      const squared = (rawSignal * rawSignal) / 100;
      const sqrtScore = Math.sqrt(rawSignal);
      const xpDecimal = (squared + sqrtScore) / 2;
      const xpCenti = Math.round(xpDecimal * 100); // stored as centi-XP

      if (xpCenti === 0) {
        return res.status(400).json({ 
          error: 'Cannot claim XP with zero signal',
          message: 'Build your trust network to earn XP',
        });
      }

      const claim = await storage.claimXp(address, xpCenti, Math.round(rawSignal));

      // Log IP event for sybil detection
      logIpEvent(req, address, 'xp_claim');

      // Return XP as decimal for display
      res.json({
        success: true,
        xpEarned: xpCenti / 100,
        claim: {
          id: claim.id,
          xpAmount: claim.xpAmount / 100,
          maxFlowSignal: claim.maxFlowSignal,
          claimedAt: claim.claimedAt,
        },
      });
    } catch (error) {
      console.error('[XP] Error claiming XP:', error);
      res.status(500).json({ error: 'Failed to claim XP' });
    }
  });

  app.get('/api/xp/history/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const claims = await storage.getXpClaimHistory(address, limit);

      // Convert centi-XP to decimal for display
      res.json({
        claims: claims.map(c => ({
          id: c.id,
          xpAmount: c.xpAmount / 100,
          maxFlowSignal: c.maxFlowSignal,
          claimedAt: c.claimedAt,
        })),
      });
    } catch (error) {
      console.error('[XP] Error fetching XP history:', error);
      res.status(500).json({ error: 'Failed to fetch XP history' });
    }
  });

  // ===== XP REDEMPTION: Exchange 100 XP for 1 USDC deposited to Aave on Celo =====
  // Requires: Face verification + max 1 per day
  
  // Status endpoint to check eligibility
  app.get('/api/xp/usdc-daily-status/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      
      const normalizedAddress = address.toLowerCase();
      const today = new Date().toISOString().split('T')[0];
      
      // Check face verification status
      const faceVerification = await storage.getFaceVerification(normalizedAddress);
      const faceVerified = faceVerification?.status === 'verified';
      
      // Check if already redeemed today
      const dailyRedemption = await storage.getUsdcDailyRedemption(normalizedAddress, today);
      const alreadyRedeemedToday = (dailyRedemption?.count ?? 0) > 0;
      
      const eligible = faceVerified && !alreadyRedeemedToday;
      
      res.json({
        eligible,
        faceVerified,
        alreadyRedeemedToday,
        dailyLimit: 1,
        remaining: alreadyRedeemedToday ? 0 : 1,
      });
    } catch (error) {
      console.error('[USDC Status] Error:', error);
      res.status(500).json({ error: 'Failed to check USDC redemption status' });
    }
  });
  
  app.post('/api/xp/redeem', async (req, res) => {
    try {
      const { address } = req.body;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const normalizedAddress = address.toLowerCase();

      // Log IP event for sybil detection
      logIpEvent(req, normalizedAddress, 'usdc_redemption');

      // === NEW: Check face verification ===
      const faceVerification = await storage.getFaceVerification(normalizedAddress);
      if (!faceVerification || faceVerification.status !== 'verified') {
        return res.status(403).json({ 
          error: 'Face verification required',
          message: 'Complete Face Check in the MaxFlow tab to redeem USDC',
        });
      }
      
      // === NEW: Check daily limit (max 1 per day) ===
      const today = new Date().toISOString().split('T')[0];
      const dailyRedemption = await storage.getUsdcDailyRedemption(normalizedAddress, today);
      if (dailyRedemption && dailyRedemption.count > 0) {
        return res.status(403).json({ 
          error: 'Daily limit reached',
          message: 'You can only redeem 1 USDC per day. Try again tomorrow.',
        });
      }

      // Check XP balance (100 XP = 10000 centi-XP)
      const XP_REQUIRED = 10000; // 100 XP in centi-XP
      const USDC_AMOUNT = '1000000'; // 1 USDC in micro-USDC (6 decimals)
      
      const xpBalance = await storage.getXpBalance(normalizedAddress);
      
      if (!xpBalance || xpBalance.totalXp < XP_REQUIRED) {
        return res.status(400).json({ 
          error: 'Insufficient XP',
          required: 100,
          current: (xpBalance?.totalXp || 0) / 100,
        });
      }

      // Deduct XP first (atomic operation)
      const deductResult = await storage.deductXp(normalizedAddress, XP_REQUIRED);
      
      if (!deductResult.success) {
        return res.status(400).json({ error: 'Failed to deduct XP' });
      }

      console.log(`[XP Redeem] Deducted 100 XP from ${normalizedAddress}, transferring 1 aUSDC on Celo`);

      // Transfer aUSDC directly to user on Celo (facilitator already has aUSDC)
      const CELO_CHAIN_ID = 42220;
      const network = getNetworkByChainId(CELO_CHAIN_ID);
      
      if (!network || !network.aUsdcAddress) {
        await storage.refundXp(normalizedAddress, XP_REQUIRED);
        return res.status(500).json({ error: 'aUSDC not configured on Celo' });
      }

      const chainInfo = resolveChain(CELO_CHAIN_ID);
      if (!chainInfo) {
        await storage.refundXp(normalizedAddress, XP_REQUIRED);
        return res.status(500).json({ error: 'Chain configuration not found' });
      }

      const facilitatorAccount = getFacilitatorAccount();
      const chain = chainInfo.viemChain;

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(network.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(network.rpcUrl),
      });

      // Check facilitator's aUSDC balance first
      const facilitatorAUsdcBalance = await publicClient.readContract({
        address: network.aUsdcAddress as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [facilitatorAccount.address],
      });

      console.log(`[XP Redeem] Facilitator aUSDC balance: ${facilitatorAUsdcBalance} (need ${USDC_AMOUNT})`);

      if (facilitatorAUsdcBalance < BigInt(USDC_AMOUNT)) {
        await storage.refundXp(normalizedAddress, XP_REQUIRED);
        console.error('[XP Redeem] Insufficient aUSDC in facilitator wallet');
        return res.status(503).json({ 
          error: 'Redemption temporarily unavailable - please try again later',
          details: 'Facilitator needs to be topped up with aUSDC',
        });
      }

      console.log(`[XP Redeem] Facilitator ${facilitatorAccount.address} transferring aUSDC to ${address}`);

      // Transfer aUSDC directly to user
      let transferHash;
      try {
        transferHash = await walletClient.writeContract({
          address: network.aUsdcAddress as Address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [address as Address, BigInt(USDC_AMOUNT)],
        });
      } catch (transferError) {
        console.error('[XP Redeem] Transfer failed:', transferError);
        await storage.refundXp(normalizedAddress, XP_REQUIRED);
        return res.status(500).json({ error: 'Failed to transfer aUSDC' });
      }

      console.log(`[XP Redeem] Transfer tx: ${transferHash}`);
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });

      if (transferReceipt.status !== 'success') {
        await storage.refundXp(normalizedAddress, XP_REQUIRED);
        return res.status(500).json({ error: 'Transfer transaction failed' });
      }

      // Update net deposits for Pool interest tracking
      const depositAmount = BigInt(USDC_AMOUNT);
      const existingSnapshot = await storage.getYieldSnapshot(normalizedAddress);
      const currentNetDeposits = BigInt(existingSnapshot?.netDeposits || '0');
      const newNetDeposits = currentNetDeposits + depositAmount;
      
      // Fetch actual on-chain aUSDC balance after transfer for accurate yield tracking
      try {
        const actualAusdcBalance = await publicClient.readContract({
          address: network.aUsdcAddress as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as Address],
        }) as bigint;
        
        console.log(`[XP Redeem] User's actual aUSDC balance after transfer: ${actualAusdcBalance}`);
        
        await storage.upsertYieldSnapshot(normalizedAddress, {
          netDeposits: newNetDeposits.toString(),
          lastAusdcBalance: actualAusdcBalance.toString(),
        });
        
        // Cache aUSDC balance for Traction page visibility (Celo = chainId 42220)
        await storage.cacheAUsdcBalance(normalizedAddress, 42220, actualAusdcBalance.toString());
      } catch (balanceError) {
        console.error('[XP Redeem] Failed to fetch balance for snapshot, updating netDeposits only:', balanceError);
        await storage.upsertYieldSnapshot(normalizedAddress, {
          netDeposits: newNetDeposits.toString(),
        });
      }

      console.log(`[XP Redeem] Success! 100 XP → 1 aUSDC transferred to ${address}`);

      // Record the redemption for daily limit tracking
      await storage.recordUsdcRedemption(normalizedAddress);

      res.json({
        success: true,
        xpDeducted: 100,
        usdcDeposited: '1.00',
        newXpBalance: deductResult.newBalance / 100,
        transferTxHash: transferHash,
      });
    } catch (error) {
      console.error('[XP Redeem] Error:', error);
      res.status(500).json({ error: 'Failed to redeem XP' });
    }
  });

  // ===== XP EXCHANGE: Get SENADOR with XP (1 XP = 1 SENADOR) =====
  const SENADOR_TOKEN_ADDRESS = '0xc48d80f75bef8723226dcac5e61304df7277d2a2' as Address;
  const SENADOR_DECIMALS = 18;
  
  app.post('/api/xp/redeem-senador', async (req, res) => {
    try {
      const { address, xpAmount } = req.body;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      // Log IP event for sybil detection
      logIpEvent(req, address.toLowerCase(), 'usdc_redemption');

      const parsedXp = parseFloat(xpAmount);
      if (isNaN(parsedXp) || parsedXp < 1) {
        return res.status(400).json({ error: 'Minimum 1 XP required' });
      }
      
      // Reject fractional XP - must be a whole number
      if (!Number.isInteger(parsedXp) || parsedXp <= 0) {
        return res.status(400).json({ error: 'XP amount must be a positive whole number' });
      }
      
      const xpToSpend = parsedXp;

      const normalizedAddress = address.toLowerCase();
      
      // XP stored as centi-XP (100 centi-XP = 1 XP)
      const xpCentiRequired = Math.floor(xpToSpend * 100);
      
      // Check XP balance
      const xpBalance = await storage.getXpBalance(normalizedAddress);
      
      if (!xpBalance || xpBalance.totalXp < xpCentiRequired) {
        return res.status(400).json({ 
          error: 'Insufficient XP',
          required: xpToSpend,
          current: (xpBalance?.totalXp || 0) / 100,
        });
      }

      // Deduct XP first (atomic operation)
      const deductResult = await storage.deductXp(normalizedAddress, xpCentiRequired);
      
      if (!deductResult.success) {
        return res.status(400).json({ error: 'Failed to deduct XP' });
      }

      console.log(`[XP → SENADOR] Deducted ${xpToSpend} XP from ${normalizedAddress}, transferring ${xpToSpend} SENADOR`);

      // Transfer SENADOR tokens from facilitator to user
      const CELO_CHAIN_ID = 42220;
      const network = getNetworkByChainId(CELO_CHAIN_ID);
      
      if (!network) {
        await storage.refundXp(normalizedAddress, xpCentiRequired);
        return res.status(500).json({ error: 'Celo network not configured' });
      }

      const chainInfo = resolveChain(CELO_CHAIN_ID);
      if (!chainInfo) {
        await storage.refundXp(normalizedAddress, xpCentiRequired);
        return res.status(500).json({ error: 'Chain configuration not found' });
      }

      const facilitatorAccount = getFacilitatorAccount();
      const chain = chainInfo.viemChain;

      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(network.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(network.rpcUrl),
      });

      // Calculate SENADOR amount: 1 XP = 1 SENADOR (18 decimals)
      const senadorAmount = BigInt(Math.floor(xpToSpend * 1e18));

      // Check facilitator's SENADOR balance
      const facilitatorSenadorBalance = await publicClient.readContract({
        address: SENADOR_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [facilitatorAccount.address],
      });

      console.log(`[XP → SENADOR] Facilitator SENADOR balance: ${facilitatorSenadorBalance} (need ${senadorAmount})`);

      if (facilitatorSenadorBalance < senadorAmount) {
        console.error('[XP → SENADOR] Insufficient SENADOR in facilitator wallet');
        await storage.refundXp(normalizedAddress, xpCentiRequired);
        return res.status(500).json({ 
          error: 'Insufficient SENADOR in facilitator wallet',
          available: (Number(facilitatorSenadorBalance) / 1e18).toFixed(2),
        });
      }

      console.log(`[XP → SENADOR] Facilitator ${facilitatorAccount.address} transferring SENADOR to ${address}`);

      // Transfer SENADOR to user
      let transferHash;
      try {
        transferHash = await walletClient.writeContract({
          address: SENADOR_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [address as Address, senadorAmount],
        });
      } catch (transferError) {
        console.error('[XP → SENADOR] Transfer failed:', transferError);
        await storage.refundXp(normalizedAddress, xpCentiRequired);
        return res.status(500).json({ error: 'Failed to transfer SENADOR' });
      }

      console.log(`[XP → SENADOR] Transfer tx: ${transferHash}`);
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });

      if (transferReceipt.status !== 'success') {
        console.error('[XP → SENADOR] Transaction failed:', transferReceipt);
        await storage.refundXp(normalizedAddress, xpCentiRequired);
        return res.status(500).json({ error: 'SENADOR transfer transaction failed' });
      }

      console.log(`[XP → SENADOR] Success! ${xpToSpend} XP → ${xpToSpend} SENADOR transferred to ${address}`);

      res.json({
        success: true,
        xpDeducted: xpToSpend,
        senadorReceived: xpToSpend.toFixed(2),
        newXpBalance: deductResult.newBalance / 100,
        transferTxHash: transferHash,
      });
    } catch (error) {
      console.error('[XP → SENADOR] Error:', error);
      res.status(500).json({ error: 'Failed to exchange XP for SENADOR' });
    }
  });

  // Celo RPC endpoints with parallel racing for SENADOR balance
  const CELO_RPCS = [
    'https://forno.celo.org',
    'https://1rpc.io/celo',
    'https://celo.drpc.org',
    'https://rpc.ankr.com/celo',
  ];

  // In-memory cache for SENADOR balances (60 second TTL)
  const senadorBalanceCache = new Map<string, { balance: string; balanceFormatted: string; timestamp: number }>();
  const SENADOR_CACHE_TTL = 60000; // 60 seconds

  // Endpoint to get SENADOR balance for a user
  app.get('/api/senador/balance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const normalizedAddress = address.toLowerCase();
      
      // Check cache first
      const cached = senadorBalanceCache.get(normalizedAddress);
      if (cached && (Date.now() - cached.timestamp) < SENADOR_CACHE_TTL) {
        console.log(`[SENADOR Balance] Cache hit for ${address}`);
        return res.json({
          balance: cached.balance,
          balanceFormatted: cached.balanceFormatted,
          decimals: 18,
        });
      }

      const chainInfo = resolveChain(42220);
      if (!chainInfo) {
        return res.status(500).json({ error: 'Chain configuration not found' });
      }

      try {
        // Race all RPCs in parallel with 800ms timeout per host using viem's native timeout
        const rpcPromises = CELO_RPCS.map((rpcUrl) => {
          const publicClient = createPublicClient({
            chain: chainInfo.viemChain,
            transport: http(rpcUrl, { timeout: 800 }),
          });

          return publicClient.readContract({
            address: SENADOR_TOKEN_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
          }) as Promise<bigint>;
        });

        // First successful RPC wins
        const balance = await Promise.any(rpcPromises);

        const balanceFormatted = (Number(balance) / 1e18).toFixed(2);
        
        // Cache the result
        senadorBalanceCache.set(normalizedAddress, {
          balance: balance.toString(),
          balanceFormatted,
          timestamp: Date.now(),
        });
        
        console.log(`[SENADOR Balance] ${address}: ${balanceFormatted} SENADOR (racing)`);

        return res.json({
          balance: balance.toString(),
          balanceFormatted,
          decimals: 18,
        });
      } catch (aggregateError) {
        // All RPCs failed or timed out
        console.error('[SENADOR Balance] All RPCs failed:', aggregateError);
        
        // Return stale cache if available
        if (cached) {
          console.log(`[SENADOR Balance] Returning stale cache for ${address}`);
          return res.json({
            balance: cached.balance,
            balanceFormatted: cached.balanceFormatted,
            decimals: 18,
          });
        }
        
        res.status(500).json({ 
          error: 'Failed to fetch SENADOR balance from all RPC endpoints',
          balance: '0',
          balanceFormatted: '0.00',
          decimals: 18,
        });
      }
    } catch (error) {
      console.error('[SENADOR Balance] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch SENADOR balance',
        balance: '0',
        balanceFormatted: '0.00', 
        decimals: 18,
      });
    }
  });

  // Endpoint to get SENADOR price from Uniswap V4 pool on Celo
  // Pool ID: 0x18878177bcd26098bc8c20f8ff6dd4ebd5ce41c3879ba349e323d21307f22546
  // Uniswap V4 StateView contract on Celo: 0xbc21f8720babf4b20d195ee5c6e99c52b76f2bfb
  const UNISWAP_V4_STATE_VIEW = '0xbc21f8720babf4b20d195ee5c6e99c52b76f2bfb' as Address;
  const SENADOR_POOL_ID = '0x18878177bcd26098bc8c20f8ff6dd4ebd5ce41c3879ba349e323d21307f22546' as `0x${string}`;
  
  // Pool tokens: SENADOR/USDC (native USDC on Celo)
  // SENADOR has 18 decimals, USDC has 6 decimals
  const USDC_CELO_ADDRESS = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as Address;
  const SENADOR_DECIMALS_PRICE = 18;
  const USDC_DECIMALS = 6;
  
  // StateView ABI for getSlot0 - returns sqrtPriceX96, tick, protocolFee, lpFee
  const STATE_VIEW_ABI = [
    {
      name: 'getSlot0',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'poolId', type: 'bytes32' }],
      outputs: [
        { name: 'sqrtPriceX96', type: 'uint160' },
        { name: 'tick', type: 'int24' },
        { name: 'protocolFee', type: 'uint24' },
        { name: 'lpFee', type: 'uint24' },
      ],
    },
  ] as const;
  
  // Cache for SENADOR price (5 minutes)
  let senadorPriceCache: { price: number; priceFormatted: string; updatedAt: Date } | null = null;
  const SENADOR_PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  app.get('/api/senador/price', async (_req, res) => {
    try {
      // Check cache first
      if (senadorPriceCache && (Date.now() - senadorPriceCache.updatedAt.getTime()) < SENADOR_PRICE_CACHE_TTL) {
        console.log('[SENADOR Price] Returning cached price:', senadorPriceCache.priceFormatted);
        return res.json({
          price: senadorPriceCache.price,
          priceFormatted: senadorPriceCache.priceFormatted,
          source: 'uniswap_v4_cache',
          cachedAt: senadorPriceCache.updatedAt.toISOString(),
        });
      }
      
      const CELO_CHAIN_ID = 42220;
      const network = getNetworkByChainId(CELO_CHAIN_ID);
      
      if (!network) {
        return res.json({ price: 0, priceFormatted: 'N/A', source: 'network_unavailable' });
      }

      const chainInfo = resolveChain(CELO_CHAIN_ID);
      if (!chainInfo) {
        return res.json({ price: 0, priceFormatted: 'N/A', source: 'chain_unavailable' });
      }

      const publicClient = createPublicClient({
        chain: chainInfo.viemChain,
        transport: http(network.rpcUrl),
      });

      // Read pool slot0 from StateView contract
      const [sqrtPriceX96, tick] = await publicClient.readContract({
        address: UNISWAP_V4_STATE_VIEW,
        abi: STATE_VIEW_ABI,
        functionName: 'getSlot0',
        args: [SENADOR_POOL_ID],
      });

      console.log(`[SENADOR Price] sqrtPriceX96: ${sqrtPriceX96}, tick: ${tick}`);

      // Convert sqrtPriceX96 to price
      // Formula: price = (sqrtPriceX96 / 2^96)^2
      // This gives price of token1 in terms of token0
      const Q96 = BigInt(2) ** BigInt(96);
      const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
      const rawPrice = sqrtPrice * sqrtPrice;
      
      // Adjust for decimals: price * 10^(decimals0 - decimals1)
      // Token ordering in Uniswap: token0 < token1 by address (lexicographic)
      // SENADOR: 0xc48d80f75bef8723226dcac5e61304df7277d2a2
      // USDC: 0xcebA9300f2b948710d2653dD7B07f33A8B32118C
      // Comparing: 0xc48... < 0xceb... so SENADOR is token0, USDC is token1
      // sqrtPriceX96 gives price of token1 in terms of token0
      // So rawPrice = USDC per SENADOR (what we want - price of SENADOR in USDC)
      
      // Apply decimal adjustment: rawPrice * 10^(decimals0 - decimals1) = rawPrice * 10^(18-6) = rawPrice * 10^12
      const finalPrice = rawPrice * Math.pow(10, SENADOR_DECIMALS_PRICE - USDC_DECIMALS);
      
      console.log(`[SENADOR Price] Raw price: ${rawPrice}, Adjusted (SENADOR in USDC): ${finalPrice}`);

      // Update cache
      senadorPriceCache = {
        price: finalPrice,
        priceFormatted: finalPrice < 0.01 ? finalPrice.toFixed(6) : finalPrice.toFixed(4),
        updatedAt: new Date(),
      };

      res.json({
        price: finalPrice,
        priceFormatted: senadorPriceCache.priceFormatted,
        source: 'uniswap_v4',
        sqrtPriceX96: sqrtPriceX96.toString(),
        tick,
      });
    } catch (error) {
      console.error('[SENADOR Price] Error:', error);
      
      // Return cached price if available, even if stale
      if (senadorPriceCache) {
        return res.json({
          price: senadorPriceCache.price,
          priceFormatted: senadorPriceCache.priceFormatted,
          source: 'uniswap_v4_stale_cache',
          cachedAt: senadorPriceCache.updatedAt.toISOString(),
        });
      }
      
      res.json({
        price: 0,
        priceFormatted: 'N/A',
        source: 'error',
      });
    }
  });

  // ===== XP EXCHANGE: Buy XP with G$ (10 G$ = 1 XP) =====
  // Requirements: Face verified + GoodDollar verified + Max 1000 G$ per day
  const GD_DAILY_LIMIT = BigInt(1000) * BigInt(1e18); // 1000 G$ in raw units (18 decimals)
  
  app.post('/api/xp/exchange-gd', async (req, res) => {
    try {
      const { address, gdAmount, txHash } = req.body;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      if (!gdAmount || typeof gdAmount !== 'string') {
        return res.status(400).json({ error: 'Invalid G$ amount' });
      }

      if (!txHash || typeof txHash !== 'string') {
        return res.status(400).json({ error: 'Transaction hash required' });
      }

      const normalizedAddress = address.toLowerCase();

      // === VERIFICATION CHECKS ===
      
      // 1. Check face verification status
      const faceVerification = await storage.getFaceVerification(normalizedAddress);
      if (!faceVerification || faceVerification.status !== 'verified') {
        return res.status(403).json({ 
          error: 'Face verification required',
          code: 'FACE_NOT_VERIFIED',
          message: 'You must complete Face Check to exchange G$ for XP',
        });
      }
      
      // 2. Check GoodDollar identity verification
      const gdIdentity = await storage.getGoodDollarIdentity(normalizedAddress);
      if (!gdIdentity || !gdIdentity.isWhitelisted) {
        return res.status(403).json({ 
          error: 'GoodDollar verification required',
          code: 'GD_NOT_VERIFIED',
          message: 'You must verify your GoodDollar identity to exchange G$ for XP',
        });
      }
      
      // === AMOUNT VALIDATION ===
      
      // G$ has 18 decimals, so we expect gdAmount in raw units (e.g., "10000000000000000000" = 10 G$)
      // Exchange rate: 10 G$ = 1 XP = 100 centi-XP
      const gdRaw = BigInt(gdAmount);
      const oneGd = BigInt(1e18);
      const minGdRaw = BigInt(10) * oneGd; // 10 G$ minimum
      
      if (gdRaw < minGdRaw) {
        return res.status(400).json({ 
          error: 'Minimum exchange is 10 G$ for 1 XP',
          minGdRequired: '10.00',
        });
      }
      
      // === DAILY LIMIT CHECK ===
      
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dailySpending = await storage.getGdDailySpending(normalizedAddress, today);
      const currentDailySpent = dailySpending?.gdSpent ?? BigInt(0);
      const remainingDaily = GD_DAILY_LIMIT - currentDailySpent;
      
      if (gdRaw > remainingDaily) {
        const remainingFormatted = Number(remainingDaily) / 1e18;
        const spentFormatted = Number(currentDailySpent) / 1e18;
        return res.status(400).json({ 
          error: 'Daily limit exceeded',
          code: 'DAILY_LIMIT_EXCEEDED',
          message: `Daily limit is 1000 G$. You have spent ${spentFormatted.toFixed(2)} G$ today. Remaining: ${remainingFormatted.toFixed(2)} G$`,
          dailyLimit: 1000,
          spent: spentFormatted,
          remaining: remainingFormatted,
        });
      }

      // Calculate XP: 10 G$ = 1 XP, stored as centi-XP (×100)
      // gdRaw / 1e18 = G$ in display units
      // G$ / 10 = XP in display units
      // XP * 100 = centi-XP
      // So: xpCenti = (gdRaw / 1e18) / 10 * 100 = gdRaw / 1e17
      const xpCenti = Number(gdRaw / BigInt(1e17));
      const gdFormatted = (Number(gdRaw) / 1e18).toFixed(2); // For logging

      console.log(`[XP Exchange] Processing ${gdFormatted} G$ → ${xpCenti / 100} XP for ${normalizedAddress} (tx: ${txHash})`);

      // Credit XP to user
      const result = await storage.creditXpFromGdExchange(normalizedAddress, xpCenti, gdFormatted);

      if (!result.success) {
        return res.status(500).json({ error: 'Failed to credit XP' });
      }
      
      // Record daily spending
      await storage.recordGdSpending(normalizedAddress, gdRaw, xpCenti);
      
      const newDailyTotal = currentDailySpent + gdRaw;
      const newRemainingDaily = Number(GD_DAILY_LIMIT - newDailyTotal) / 1e18;

      res.json({
        success: true,
        gdExchanged: gdFormatted,
        xpReceived: xpCenti / 100,
        newXpBalance: result.newBalance / 100,
        txHash,
        dailySpent: Number(newDailyTotal) / 1e18,
        dailyRemaining: newRemainingDaily,
      });
    } catch (error) {
      console.error('[XP Exchange] Error:', error);
      res.status(500).json({ error: 'Failed to exchange G$ for XP' });
    }
  });
  
  // Get G$ daily spending status for a wallet
  app.get('/api/xp/gd-daily-status/:address', async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      
      const normalizedAddress = address.toLowerCase();
      const today = new Date().toISOString().split('T')[0];
      
      // Get verification statuses
      const faceVerification = await storage.getFaceVerification(normalizedAddress);
      const gdIdentity = await storage.getGoodDollarIdentity(normalizedAddress);
      const dailySpending = await storage.getGdDailySpending(normalizedAddress, today);
      
      const dailyLimitGd = 1000;
      const spentGd = dailySpending ? Number(dailySpending.gdSpent) / 1e18 : 0;
      const remainingGd = dailyLimitGd - spentGd;
      
      res.json({
        faceVerified: faceVerification?.status === 'verified',
        gdVerified: gdIdentity?.isWhitelisted ?? false,
        eligible: (faceVerification?.status === 'verified') && (gdIdentity?.isWhitelisted ?? false),
        dailyLimit: dailyLimitGd,
        spent: spentGd,
        remaining: Math.max(0, remainingGd),
        date: today,
      });
    } catch (error) {
      console.error('[XP Exchange] Error getting daily status:', error);
      res.status(500).json({ error: 'Failed to get daily status' });
    }
  });

  // ===== FACE VERIFICATION ENDPOINTS =====
  
  // Get face verification status for a wallet
  app.get('/api/face-verification/:address', async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      
      const verification = await storage.getFaceVerification(address);
      
      if (!verification) {
        return res.json({ 
          verified: false,
          status: null,
        });
      }
      
      res.json({
        verified: verification.status === 'verified',
        status: verification.status,
        isDuplicate: verification.status === 'duplicate',
        duplicateOf: verification.duplicateOf,
        challengesPassed: JSON.parse(verification.challengesPassed || '[]'),
        createdAt: verification.createdAt,
      });
    } catch (error) {
      console.error('[FaceVerification] Error getting status:', error);
      res.status(500).json({ error: 'Failed to get verification status' });
    }
  });

  // Rate limiter for face verification (5 attempts per 10 minutes per IP)
  const faceVerificationRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
  const FACE_VERIFICATION_RATE_LIMIT = 5;
  const FACE_VERIFICATION_RATE_WINDOW = 10 * 60 * 1000; // 10 minutes
  
  // Submit face verification
  app.post('/api/face-verification/submit', async (req, res) => {
    try {
      const { walletAddress, embeddingHash, embedding, storageToken, challengesPassed, qualityMetrics } = req.body;
      const userAgent = req.get('user-agent') || undefined;
      const processingStartTime = Date.now();
      
      // Rate limiting by IP
      const clientIp = getClientIp(req);
      const now = Date.now();
      const rateLimit = faceVerificationRateLimits.get(clientIp);
      
      if (rateLimit) {
        if (now < rateLimit.resetAt) {
          if (rateLimit.count >= FACE_VERIFICATION_RATE_LIMIT) {
            const retryAfter = Math.ceil((rateLimit.resetAt - now) / 1000);
            return res.status(429).json({
              error: 'Too many verification attempts',
              retryAfter,
              message: `Please wait ${Math.ceil(retryAfter / 60)} minutes before trying again`,
            });
          }
          rateLimit.count++;
        } else {
          faceVerificationRateLimits.set(clientIp, { count: 1, resetAt: now + FACE_VERIFICATION_RATE_WINDOW });
        }
      } else {
        faceVerificationRateLimits.set(clientIp, { count: 1, resetAt: now + FACE_VERIFICATION_RATE_WINDOW });
      }
      
      // Cleanup old entries periodically
      if (Math.random() < 0.1) {
        for (const [ip, limit] of faceVerificationRateLimits.entries()) {
          if (now > limit.resetAt) {
            faceVerificationRateLimits.delete(ip);
          }
        }
      }
      
      if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      
      if (!embeddingHash || typeof embeddingHash !== 'string') {
        return res.status(400).json({ error: 'Invalid embedding hash' });
      }
      
      if (!challengesPassed || !Array.isArray(challengesPassed) || challengesPassed.length === 0) {
        return res.status(400).json({ error: 'No challenges completed' });
      }
      
      // Validate quality metrics - reject 'unknown' values
      if (qualityMetrics) {
        const requiredFields = ['faceSize', 'centered', 'noOcclusion'];
        const hasUnknown = requiredFields.some(field => 
          qualityMetrics[field] === 'unknown' || qualityMetrics[field] === undefined
        );
        if (hasUnknown) {
          console.warn(`[FaceVerification] Rejected: quality metrics contain 'unknown' values`, qualityMetrics);
          return res.status(400).json({ 
            error: 'Face detection quality too low',
            message: 'Please ensure good lighting and center your face in the frame',
            qualityMetrics,
          });
        }
      } else {
        console.warn(`[FaceVerification] Rejected: no quality metrics provided`);
        return res.status(400).json({ 
          error: 'Quality metrics required',
          message: 'Face detection did not complete properly',
        });
      }
      
      const normalizedAddress = walletAddress.toLowerCase();
      
      // Check for existing verification
      const existingVerification = await storage.getFaceVerification(normalizedAddress);
      if (existingVerification) {
        return res.json({
          success: true,
          alreadyVerified: true,
          status: existingVerification.status,
          isDuplicate: existingVerification.status === 'duplicate',
        });
      }
      
      // STEP 1: Fast path - exact hash match (catches identical embeddings)
      const exactDuplicate = await storage.findDuplicateFace(embeddingHash, normalizedAddress);
      
      // Get IP hash for sybil tracking
      const ipHash = getClientIp(req);
      
      // If exact duplicate found, reject immediately
      if (exactDuplicate) {
        await storage.createFaceVerification({
          walletAddress: normalizedAddress,
          embeddingHash,
          embedding: Array.isArray(embedding) ? embedding : undefined,
          storageToken: storageToken || undefined,
          challengesPassed,
          ipHash: ipHash ? await hashIp(ipHash) : undefined,
          status: 'duplicate',
          duplicateOf: exactDuplicate.walletAddress,
          similarityScore: 1.0,
        });
        
        console.warn(`[FaceVerification] Exact duplicate rejected: ${normalizedAddress} matches ${exactDuplicate.walletAddress}`);
        
        return res.status(409).json({
          error: 'This face has already been verified with another wallet',
          isDuplicate: true,
          duplicateOf: exactDuplicate.walletAddress.slice(0, 6) + '...' + exactDuplicate.walletAddress.slice(-4),
        });
      }
      
      // STEP 2: Fuzzy match - cosine similarity on embeddings (catches same person with variations)
      // DATA GATHERING PHASE - No blocking, just logging and sybil points
      // - > 0.97: Mark as duplicate in DB (for tracking) but still allow verification
      // - < 0.97: Mark as verified
      const DUPLICATE_THRESHOLD = 0.97; // Above this = mark as duplicate (but don't block)
      
      // Pass request start time to prevent self-race conditions
      const requestStartTime = new Date();
      let similarFace: { match: any; similarity: number } | null = null;
      if (Array.isArray(embedding) && embedding.length > 0) {
        console.log(`[FaceVerification] Checking fuzzy match for ${normalizedAddress}, embedding length: ${embedding.length}`);
        // Use 0.80 threshold to catch all potential matches for logging
        similarFace = await storage.findSimilarFace(embedding, normalizedAddress, 0.80, requestStartTime);
      } else {
        console.warn(`[FaceVerification] No embedding provided for ${normalizedAddress}, skipping fuzzy match`);
      }
      
      // Hash IP for comparison
      const hashedIp = ipHash ? await hashIp(ipHash) : undefined;
      
      // Determine status and log suspicious patterns (but never block)
      let status: 'verified' | 'duplicate' = 'verified';
      let duplicateOf: string | undefined;
      let matchSimilarity: number | undefined;
      
      if (similarFace) {
        const similarity = similarFace.similarity;
        const matchWallet = similarFace.match.walletAddress;
        matchSimilarity = similarity;
        
        // Check if same device (matching IP hash or storage token)
        const sameDevice = (hashedIp && similarFace.match.ipHash === hashedIp) || 
                          (storageToken && similarFace.match.storageToken === storageToken);
        
        console.log(`[FaceVerification] Match found: ${(similarity * 100).toFixed(1)}% similarity, sameDevice: ${sameDevice}, matchWallet: ${matchWallet.slice(0, 8)}...`);
        
        // Mark as duplicate if above threshold (but still allow verification)
        if (similarity >= DUPLICATE_THRESHOLD) {
          status = 'duplicate';
          duplicateOf = matchWallet;
          console.warn(`[FaceVerification] HIGH similarity (${(similarity * 100).toFixed(1)}%) - marking as duplicate but allowing: ${normalizedAddress} matches ${matchWallet}`);
        }
        
        // Log sybil warning for any suspicious pattern (same device OR high similarity)
        if (sameDevice || similarity >= 0.90) {
          try {
            await storage.logIpEvent({
              walletAddress: normalizedAddress,
              ipHash: hashedIp || 'unknown',
              eventType: 'face_similarity_warning',
              storageToken: storageToken || undefined,
              userAgent: req.get('user-agent') || undefined,
            });
            console.log(`[FaceVerification] Logged sybil warning: ${normalizedAddress} (${Math.round(similarity * 100)}% similar to ${matchWallet.slice(0, 8)}, sameDevice: ${sameDevice})`);
          } catch (logError) {
            console.error('[FaceVerification] Error logging sybil warning:', logError);
          }
        }
      }
      
      // Calculate processing time
      const processingTimeMs = Date.now() - processingStartTime;
      
      // Create verification record - ALWAYS allow through (data gathering phase)
      const verification = await storage.createFaceVerification({
        walletAddress: normalizedAddress,
        embeddingHash,
        embedding: Array.isArray(embedding) ? embedding : undefined,
        storageToken: storageToken || undefined,
        challengesPassed,
        ipHash: hashedIp,
        status,
        duplicateOf,
        similarityScore: matchSimilarity,
        qualityMetrics: qualityMetrics ? JSON.stringify(qualityMetrics) : undefined,
        userAgent,
        processingTimeMs,
        matchedWalletScore: similarFace ? JSON.stringify([{ wallet: similarFace.match.walletAddress, score: similarFace.similarity }]) : undefined,
      });
      
      // Award XP only for verified faces (not duplicates)
      // NOTE: Texture analysis is in DATA GATHERING mode - spoof detection logged but never blocks XP
      // Set TEXTURE_ANALYSIS_BLOCKING=true to enable XP blocking based on texture analysis
      let xpAwarded = 0;
      let xpSkipReason: string | undefined;
      
      // Check if texture analysis detected a spoof (for logging only unless blocking enabled)
      const isLikelySpoof = qualityMetrics?.isLikelySpoof === true || qualityMetrics?.isLikelySpoof === 'true';
      const textureBlockingEnabled = process.env.TEXTURE_ANALYSIS_BLOCKING === 'true';
      const shouldBlockForSpoof = isLikelySpoof && textureBlockingEnabled;
      
      // Log texture analysis results for tuning (regardless of blocking status)
      if (isLikelySpoof) {
        console.log(`[FaceVerification] Texture analysis flagged spoof: ${normalizedAddress} (moire: ${qualityMetrics?.moireScore?.toFixed(3)}, variance: ${qualityMetrics?.textureVariance?.toFixed(3)}, confidence: ${qualityMetrics?.textureConfidence?.toFixed(2)}) - blocking: ${textureBlockingEnabled}`);
      }
      
      if (status === 'verified' && !shouldBlockForSpoof) {
        try {
          await storage.claimXp(normalizedAddress, 12000, 0); // 120 XP bonus
          xpAwarded = 120;
          console.log(`[FaceVerification] Awarded 120 XP to ${normalizedAddress}`);
        } catch (xpError) {
          console.error('[FaceVerification] Error awarding XP:', xpError);
        }
      } else if (shouldBlockForSpoof) {
        xpSkipReason = 'spoof_detected';
        console.log(`[FaceVerification] Blocked XP for likely spoof: ${normalizedAddress}`);
      } else {
        xpSkipReason = 'duplicate';
        console.log(`[FaceVerification] Skipping XP for duplicate face: ${normalizedAddress}`);
      }
      
      res.json({
        success: true,
        verified: true,
        isDuplicate: status === 'duplicate',
        isLikelySpoof,
        status: verification.status,
        xpAwarded,
        xpSkipReason,
        similarityScore: matchSimilarity ? Math.round(matchSimilarity * 100) : undefined,
      });
    } catch (error) {
      console.error('[FaceVerification] Error submitting:', error);
      res.status(500).json({ error: 'Failed to submit verification' });
    }
  });

  // Admin: Get face verification stats
  app.get('/api/admin/face-verification/stats', adminAuthMiddleware, async (req, res) => {
    try {
      const stats = await storage.getFaceVerificationStats();
      res.json(stats);
    } catch (error) {
      console.error('[FaceVerification] Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });
  
  // Admin: Get detailed diagnostic data for recent face verifications
  app.get('/api/admin/face-verification/diagnostics', adminAuthMiddleware, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const diagnostics = await storage.getFaceVerificationDiagnostics(limit);
      res.json(diagnostics);
    } catch (error) {
      console.error('[FaceVerification] Error getting diagnostics:', error);
      res.status(500).json({ error: 'Failed to get diagnostics' });
    }
  });

  // ===== STELLAR METRICS HELPER =====
  // Stellar wallet (nanopaystellar.replit.app) is a SEPARATE application with its own database.
  // storage.getGlobalStats() only queries the EVM database (wallets, cachedTransactions tables).
  // This helper fetches from the Stellar wallet's public API and merges into combined stats.
  // Cache Stellar metrics for 1 hour to avoid excessive API calls.
  let stellarMetricsCache: { data: any; timestamp: number } | null = null;
  const STELLAR_CACHE_TTL = 60 * 60 * 1000; // 1 hour
  const STELLAR_WALLET_URL = process.env.VITE_STELLAR_WALLET_URL || 'https://nanopaystellar.replit.app';

  async function getStellarMetrics(): Promise<{
    userCount: number;
    transactionCount: number;
    totalXpClaimed: number;
    currentApy: number;
    xlmSponsored: number;
    xlmSponsoredUsd: number;
    cachedAt: string;
  } | null> {
    // Check cache - return cached data if fresh
    if (stellarMetricsCache && Date.now() - stellarMetricsCache.timestamp < STELLAR_CACHE_TTL) {
      return { ...stellarMetricsCache.data, cachedAt: new Date(stellarMetricsCache.timestamp).toISOString() };
    }

    try {
      // Fetch Stellar metrics and XLM price in parallel
      const [metricsResponse, priceResponse] = await Promise.all([
        fetch(`${STELLAR_WALLET_URL}/api/public/metrics`),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd'),
      ]);

      if (!metricsResponse.ok) {
        console.error('[Stellar] Failed to fetch metrics:', metricsResponse.status);
        // Return stale cache if available (better than nothing), otherwise null
        if (stellarMetricsCache) {
          console.warn('[Stellar] Using stale cache from:', new Date(stellarMetricsCache.timestamp).toISOString());
          return { ...stellarMetricsCache.data, cachedAt: new Date(stellarMetricsCache.timestamp).toISOString() };
        }
        return null;
      }

      const metrics = await metricsResponse.json();
      let xlmPrice = 0.10; // Fallback price

      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        xlmPrice = priceData?.stellar?.usd || 0.10;
      }

      const now = Date.now();
      const result = {
        userCount: metrics.userCount || 0,
        transactionCount: metrics.transactionCount || 0,
        totalXpClaimed: metrics.totalXpClaimed || 0,
        currentApy: metrics.currentApy || 0,
        xlmSponsored: metrics.xlmSponsored || 0,
        xlmSponsoredUsd: (metrics.xlmSponsored || 0) * xlmPrice,
        cachedAt: new Date(now).toISOString(),
      };

      stellarMetricsCache = { data: result, timestamp: now };
      console.log('[Stellar] Fetched and cached metrics:', result);
      return result;
    } catch (error) {
      console.error('[Stellar] Error fetching metrics:', error);
      // Return stale cache if available
      if (stellarMetricsCache) {
        console.warn('[Stellar] Using stale cache due to error, from:', new Date(stellarMetricsCache.timestamp).toISOString());
        return { ...stellarMetricsCache.data, cachedAt: new Date(stellarMetricsCache.timestamp).toISOString() };
      }
      return null;
    }
  }

  // ===== GLOBAL STATS ENDPOINT (PUBLIC) =====
  // Returns combined metrics from both EVM wallet (this app) and Stellar wallet (separate app).
  // storage.getGlobalStats() = EVM-only data (wallets/cachedTransactions tables in THIS database)
  // getStellarMetrics() = Stellar-only data (from nanopaystellar.replit.app's separate database)
  // No double-counting: each source is independent and additive.
  app.get('/api/stats/global', async (req, res) => {
    try {
      const [stats, stellarMetrics] = await Promise.all([
        storage.getGlobalStats(),
        getStellarMetrics(),
      ]);

      // Combine EVM stats with Stellar stats (two separate systems, no overlap)
      const combinedStats = {
        ...stats,
        // Total across both EVM and Stellar wallets
        totalUsers: stats.totalUsers + (stellarMetrics?.userCount || 0),
        totalTransfers: stats.totalTransfers + (stellarMetrics?.transactionCount || 0),
        totalXp: stats.totalXp + (stellarMetrics?.totalXpClaimed || 0),
        // Gas sponsorship: EVM native gas + XLM sponsored (converted to USD)
        gasSponsoredUsd: stats.gasSponsoredUsd + (stellarMetrics?.xlmSponsoredUsd || 0),
        // Stellar-specific fields for detailed breakdown
        stellar: stellarMetrics,
      };

      res.json(combinedStats);
    } catch (error) {
      console.error('[Stats] Error fetching global stats:', error);
      res.status(500).json({ error: 'Failed to fetch global stats' });
    }
  });

  // ===== GAS SCAN ENDPOINT (ADMIN) =====
  app.post('/api/admin/gas-scan', async (req, res) => {
    try {
      const { runGasScanAndUpdate } = await import('./gasScanner');
      const newTotal = await runGasScanAndUpdate(storage);
      const lastRun = await storage.getGlobalSetting('gas_scan_last_run');
      res.json({ 
        success: true, 
        totalGasSponsoredUsd: newTotal,
        lastRun,
      });
    } catch (error) {
      console.error('[GasScan] Error running gas scan:', error);
      res.status(500).json({ error: 'Failed to run gas scan' });
    }
  });

  // ===== DELETE FACE VERIFICATIONS WITHOUT EMBEDDINGS (ADMIN) =====
  app.delete('/api/admin/face-verifications/without-embeddings', adminAuthMiddleware, async (_req, res) => {
    try {
      const result = await storage.deleteFaceVerificationsWithoutEmbeddings();
      res.json({ 
        success: true, 
        deleted: result.deleted,
        message: `Deleted ${result.deleted} face verification records without embeddings`
      });
    } catch (error) {
      console.error('[Admin] Error deleting face verifications without embeddings:', error);
      res.status(500).json({ error: 'Failed to delete face verifications' });
    }
  });

  // ===== DELETE ALL FACE VERIFICATIONS (ADMIN) =====
  app.delete('/api/admin/face-verifications/all', adminAuthMiddleware, async (_req, res) => {
    try {
      const result = await storage.deleteAllFaceVerifications();
      res.json({ 
        success: true, 
        deleted: result.deleted,
        message: `Deleted all ${result.deleted} face verification records`
      });
    } catch (error) {
      console.error('[Admin] Error deleting all face verifications:', error);
      res.status(500).json({ error: 'Failed to delete face verifications' });
    }
  });

  // ===== TRACTION DASHBOARD ENDPOINT (PUBLIC) =====
  app.get('/api/traction/users', async (_req, res) => {
    try {
      const walletsData = await storage.getAllWalletsWithDetails();
      
      // Enrich with G$ balance and XP data
      const enrichedData = await Promise.all(walletsData.map(async (wallet) => {
        // Get G$ balance
        const gdBalance = await storage.getGdBalance(wallet.address);
        
        // Get XP balance
        const xpBalance = await storage.getXpBalance(wallet.address);
        
        return {
          ...wallet,
          gdBalance: gdBalance?.balance || '0',
          gdBalanceFormatted: gdBalance?.balanceFormatted || '0',
          xpBalance: xpBalance?.totalXp || 0,
          xpClaimCount: xpBalance?.claimCount || 0,
        };
      }));
      
      res.json({
        users: enrichedData,
        totalCount: enrichedData.length,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Traction] Error fetching user data:', error);
      res.status(500).json({ error: 'Failed to fetch traction data' });
    }
  });

  // ===== TRACTION SYNC GOODDOLLAR IDENTITY ENDPOINT =====
  const GOODDOLLAR_IDENTITY_ADDRESS = '0xC361A6E67822a0EDc17D899227dd9FC50BD62F42' as Address;
  const GOODDOLLAR_IDENTITY_ABI = [
    {
      name: 'isWhitelisted',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ type: 'bool' }],
    },
    {
      name: 'getWhitelistedRoot',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'whitelisted', type: 'address' }],
    },
    {
      name: 'lastAuthenticated',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    },
    {
      name: 'authenticationPeriod',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'uint256' }],
    },
  ] as const;

  app.post('/api/traction/sync-gooddollar', async (_req, res) => {
    try {
      console.log('[Traction] Starting GoodDollar identity sync...');
      
      const celoClient = createPublicClient({
        chain: celo,
        transport: http('https://forno.celo.org'),
      });
      
      // GoodDollar token on Celo (2 decimals)
      const GD_TOKEN_ADDRESS = '0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A' as Address;
      const ERC20_BALANCE_ABI = [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
      }] as const;
      
      const walletsData = await storage.getAllWalletsWithDetails();
      const addresses = walletsData.map(w => w.address);
      
      if (addresses.length === 0) {
        console.log('[Traction] No wallets to sync');
        return res.json({
          success: true,
          synced: 0,
          verified: 0,
          errors: 0,
          totalAddresses: 0,
        });
      }
      
      console.log(`[Traction] Syncing GoodDollar for ${addresses.length} addresses`);
      
      const authPeriodBigInt = await celoClient.readContract({
        address: GOODDOLLAR_IDENTITY_ADDRESS,
        abi: GOODDOLLAR_IDENTITY_ABI,
        functionName: 'authenticationPeriod',
      });
      const authPeriodDays = Number(authPeriodBigInt);
      
      let synced = 0;
      let updated = 0;
      let balancesSynced = 0;
      let errors = 0;
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      
      const batchSize = 10;
      for (let i = 0; i < addresses.length; i += batchSize) {
        const batch = addresses.slice(i, i + batchSize);
        
        const results = await Promise.all(batch.map(async (address) => {
          try {
            const [isWhitelisted, whitelistedRoot, lastAuthenticatedBigInt, gdBalanceBigInt] = await Promise.all([
              celoClient.readContract({
                address: GOODDOLLAR_IDENTITY_ADDRESS,
                abi: GOODDOLLAR_IDENTITY_ABI,
                functionName: 'isWhitelisted',
                args: [address as Address],
              }),
              celoClient.readContract({
                address: GOODDOLLAR_IDENTITY_ADDRESS,
                abi: GOODDOLLAR_IDENTITY_ABI,
                functionName: 'getWhitelistedRoot',
                args: [address as Address],
              }),
              celoClient.readContract({
                address: GOODDOLLAR_IDENTITY_ADDRESS,
                abi: GOODDOLLAR_IDENTITY_ABI,
                functionName: 'lastAuthenticated',
                args: [address as Address],
              }),
              celoClient.readContract({
                address: GD_TOKEN_ADDRESS,
                abi: ERC20_BALANCE_ABI,
                functionName: 'balanceOf',
                args: [address as Address],
              }),
            ]);
            
            // G$ has 18 decimals - use BigInt-safe formatting
            const gdBalance = gdBalanceBigInt.toString();
            const divisor = 10n ** 18n;
            const wholePart = gdBalanceBigInt / divisor;
            const fractionalPart = gdBalanceBigInt % divisor;
            // Show 2 decimal places for display
            const fractionalDisplay = (fractionalPart * 100n / divisor).toString().padStart(2, '0');
            const gdBalanceFormatted = `${wholePart.toString()}.${fractionalDisplay}`;
            
            const lastAuthSeconds = Number(lastAuthenticatedBigInt);
            const lastAuthenticated = lastAuthSeconds > 0 ? new Date(lastAuthSeconds * 1000) : null;
            
            let expiresAt: Date | null = null;
            let isExpired = false;
            let daysUntilExpiry: number | null = null;
            
            if (lastAuthenticated && authPeriodDays > 0) {
              expiresAt = new Date(lastAuthenticated.getTime() + authPeriodDays * 24 * 60 * 60 * 1000);
              isExpired = new Date() > expiresAt;
              daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
              if (daysUntilExpiry < 0) daysUntilExpiry = 0;
            }
            
            return {
              address,
              data: {
                walletAddress: address,
                isWhitelisted,
                whitelistedRoot: whitelistedRoot !== zeroAddress ? whitelistedRoot : null,
                lastAuthenticated,
                authenticationPeriod: authPeriodDays,
                expiresAt,
                isExpired,
                daysUntilExpiry,
              },
              gdBalance,
              gdBalanceFormatted,
            };
          } catch (error) {
            console.error(`[Traction] Error fetching GoodDollar for ${address}:`, error);
            return { address, data: null, gdBalance: null, gdBalanceFormatted: null };
          }
        }));
        
        for (const result of results) {
          if (result.data) {
            await storage.upsertGoodDollarIdentity(result.data);
            synced++;
            if (result.data.isWhitelisted) {
              updated++;
            }
          } else {
            errors++;
          }
          
          // Save G$ balance
          if (result.gdBalance !== null) {
            await storage.upsertGdBalance(result.address, result.gdBalance, result.gdBalanceFormatted!, 18);
            balancesSynced++;
          }
        }
      }
      
      console.log(`[Traction] GoodDollar sync complete: ${synced} synced, ${updated} verified, ${balancesSynced} balances, ${errors} errors`);
      
      res.json({
        success: true,
        synced,
        verified: updated,
        balancesSynced,
        errors,
        totalAddresses: addresses.length,
      });
    } catch (error) {
      console.error('[Traction] Error syncing GoodDollar:', error);
      res.status(500).json({ error: 'Failed to sync GoodDollar identities' });
    }
  });

  // ============================================
  // AI CHAT ENDPOINT
  // ============================================
  
  const XP_COST_PER_MESSAGE = 100; // 1.00 XP per AI message (stored as centi-XP)
  
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message, walletAddress, conversationHistory } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }
      
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'Wallet address is required' });
      }
      
      // Check XP balance
      const xpBalance = await storage.getXpBalance(walletAddress);
      const currentXp = xpBalance?.totalXp ?? 0;
      
      if (currentXp < XP_COST_PER_MESSAGE) {
        return res.status(402).json({ 
          error: 'Insufficient XP balance',
          required: XP_COST_PER_MESSAGE / 100,
          current: currentXp / 100,
        });
      }
      
      // Deduct XP before making the API call
      const deductResult = await storage.deductXp(walletAddress, XP_COST_PER_MESSAGE);
      
      if (!deductResult.success) {
        return res.status(402).json({ 
          error: 'Failed to deduct XP',
          required: XP_COST_PER_MESSAGE / 100,
          current: currentXp / 100,
        });
      }
      
      // Call OpenAI API via Replit AI Integrations
      const openaiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      
      if (!openaiBaseUrl || !openaiApiKey) {
        // Refund XP if API not configured
        await storage.refundXp(walletAddress, XP_COST_PER_MESSAGE);
        return res.status(500).json({ error: 'AI service not configured' });
      }
      
      // Build messages array with system prompt and conversation history
      const systemPrompt = `You are a helpful, knowledgeable AI assistant dedicated to democratizing access to information and education. You help people learn, explore ideas, and access knowledge that can improve their lives.

You are especially committed to serving people in developing countries and vulnerable communities who may not have had easy access to quality education or information. Be warm, patient, encouraging, and clear in your explanations.

You can help with:
- Education: math, science, history, languages, writing, and any academic subject
- Practical knowledge: health, nutrition, agriculture, business, finance, legal rights
- Skills development: job skills, entrepreneurship, technology, digital literacy
- Personal growth: problem-solving, critical thinking, creativity
- General curiosity: answer any question thoughtfully and accurately

Always:
- Explain concepts clearly, adapting to the user's level of understanding
- Provide actionable, practical advice when helpful
- Encourage learning and curiosity
- Be honest about limitations and uncertainties
- Respect cultural contexts and diverse perspectives

You are accessed through nanoPay, a crypto wallet app, but your purpose extends far beyond crypto - you're here to be a gateway to knowledge and opportunity for everyone.`;

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      
      // Add conversation history if provided
      if (Array.isArray(conversationHistory)) {
        for (const msg of conversationHistory.slice(-10)) { // Last 10 messages for context
          if (msg.role && msg.content) {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
      }
      
      // Add current user message
      messages.push({ role: 'user', content: message });
      
      try {
        const openaiResponse = await fetch(`${openaiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            max_tokens: 500,
            temperature: 0.7,
          }),
        });
        
        if (!openaiResponse.ok) {
          const errorText = await openaiResponse.text();
          console.error('[AI Chat] OpenAI API error:', openaiResponse.status, errorText);
          // Refund XP on API error
          await storage.refundXp(walletAddress, XP_COST_PER_MESSAGE);
          return res.status(500).json({ error: 'AI service error' });
        }
        
        const data = await openaiResponse.json();
        const assistantMessage = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
        
        console.log(`[AI Chat] Successful response for ${walletAddress.slice(0, 10)}... (${XP_COST_PER_MESSAGE / 100} XP deducted)`);
        
        res.json({
          message: assistantMessage,
          xpDeducted: XP_COST_PER_MESSAGE / 100,
          newBalance: deductResult.newBalance / 100,
        });
      } catch (apiError) {
        console.error('[AI Chat] Fetch error:', apiError);
        // Refund XP on network error
        await storage.refundXp(walletAddress, XP_COST_PER_MESSAGE);
        return res.status(500).json({ error: 'Failed to reach AI service' });
      }
    } catch (error) {
      console.error('[AI Chat] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get saved AI conversation
  app.get('/api/ai/conversation/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      const conversation = await storage.getAiConversation(address);
      
      if (!conversation) {
        return res.json({ messages: [] });
      }
      
      const messages = JSON.parse(conversation.messages);
      res.json({ 
        messages,
        updatedAt: conversation.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error('[AI Conversation] Error getting conversation:', error);
      res.status(500).json({ error: 'Failed to get conversation' });
    }
  });

  // Save AI conversation
  app.post('/api/ai/conversation', async (req, res) => {
    try {
      const { walletAddress, messages } = req.body;
      
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'Wallet address is required' });
      }
      
      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages must be an array' });
      }
      
      await storage.saveAiConversation(walletAddress, messages);
      res.json({ success: true });
    } catch (error) {
      console.error('[AI Conversation] Error saving conversation:', error);
      res.status(500).json({ error: 'Failed to save conversation' });
    }
  });

  // Clear AI conversation
  app.delete('/api/ai/conversation/:address', async (req, res) => {
    try {
      const { address } = req.params;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      await storage.clearAiConversation(address);
      res.json({ success: true });
    } catch (error) {
      console.error('[AI Conversation] Error clearing conversation:', error);
      res.status(500).json({ error: 'Failed to clear conversation' });
    }
  });

  // =============================================
  // Public API v1 - Flagged Wallets for MaxFlow
  // =============================================
  // Rate limiting: in-memory tracker for public API
  const publicApiRateLimits: Map<string, { count: number; resetAt: number }> = new Map();
  const PUBLIC_API_RATE_LIMIT = 60; // requests per minute
  const PUBLIC_API_RATE_WINDOW = 60 * 1000; // 1 minute in ms

  // Cache for flagged wallets (updated every 5 minutes)
  let flaggedWalletsCache: {
    data: Array<{ wallet: string; score: number; matchCount: number; signals: string[]; clusterSize: number; isExempt: boolean; exemptReason: string | null }>;
    generatedAt: Date;
  } | null = null;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  app.get('/api/public/v1/flagged-wallets', async (req, res) => {
    try {
      // API key authentication (optional - if SYBIL_API_KEY is set, require it)
      const requiredApiKey = process.env.SYBIL_API_KEY;
      if (requiredApiKey) {
        const providedKey = req.headers['x-api-key'] as string;
        if (!providedKey || providedKey !== requiredApiKey) {
          return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Valid x-api-key header required'
          });
        }
      }

      // Rate limiting by IP
      const clientIp = getClientIp(req);
      const now = Date.now();
      const rateLimit = publicApiRateLimits.get(clientIp);
      
      if (rateLimit) {
        if (now < rateLimit.resetAt) {
          if (rateLimit.count >= PUBLIC_API_RATE_LIMIT) {
            const retryAfter = Math.ceil((rateLimit.resetAt - now) / 1000);
            res.setHeader('X-RateLimit-Limit', PUBLIC_API_RATE_LIMIT.toString());
            res.setHeader('X-RateLimit-Remaining', '0');
            res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000).toString());
            res.setHeader('Retry-After', retryAfter.toString());
            return res.status(429).json({
              error: 'Rate limit exceeded',
              retryAfter,
              limit: PUBLIC_API_RATE_LIMIT,
              window: '1 minute'
            });
          }
          rateLimit.count++;
        } else {
          publicApiRateLimits.set(clientIp, { count: 1, resetAt: now + PUBLIC_API_RATE_WINDOW });
        }
      } else {
        publicApiRateLimits.set(clientIp, { count: 1, resetAt: now + PUBLIC_API_RATE_WINDOW });
      }

      // Clean up old rate limit entries periodically
      if (Math.random() < 0.1) { // 10% chance to clean up
        for (const [ip, limit] of publicApiRateLimits.entries()) {
          if (now > limit.resetAt) {
            publicApiRateLimits.delete(ip);
          }
        }
      }

      // Check cache
      if (flaggedWalletsCache && (now - flaggedWalletsCache.generatedAt.getTime()) < CACHE_TTL) {
        const rateLimitEntry = publicApiRateLimits.get(clientIp);
        const remaining = Math.max(0, PUBLIC_API_RATE_LIMIT - (rateLimitEntry?.count || 0));
        const resetAt = rateLimitEntry?.resetAt || (now + PUBLIC_API_RATE_WINDOW);
        
        res.setHeader('X-RateLimit-Limit', PUBLIC_API_RATE_LIMIT.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
        
        // Filter to only non-exempt wallets for the public API
        const actuallyFlagged = flaggedWalletsCache.data.filter(w => !w.isExempt);
        console.log(`[Public API] Flagged wallets requested by ${clientIp} (cached), returning ${actuallyFlagged.length} wallets`);
        
        return res.json({
          flagged: actuallyFlagged.map(w => ({
            address: w.wallet,
            score: w.score,
            signals: w.signals,
            matchCount: w.matchCount,
            clusterSize: w.clusterSize
          })),
          total: actuallyFlagged.length,
          threshold: 5,
          generatedAt: flaggedWalletsCache.generatedAt.toISOString(),
          cached: true,
          exemptionRules: {
            gooddollarVerified: 'Wallets with GoodDollar face verification are exempt',
            smallCluster: 'Wallets in clusters of 3 or fewer are exempt (allows for lost wallet recovery)'
          }
        });
      }

      // Fetch fresh data
      const flagged = await storage.getAllFlaggedWalletsWithScores();
      flaggedWalletsCache = {
        data: flagged,
        generatedAt: new Date()
      };

      const rateLimitEntryFresh = publicApiRateLimits.get(clientIp);
      const remainingFresh = Math.max(0, PUBLIC_API_RATE_LIMIT - (rateLimitEntryFresh?.count || 0));
      const resetAtFresh = rateLimitEntryFresh?.resetAt || (now + PUBLIC_API_RATE_WINDOW);
      
      res.setHeader('X-RateLimit-Limit', PUBLIC_API_RATE_LIMIT.toString());
      res.setHeader('X-RateLimit-Remaining', remainingFresh.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetAtFresh / 1000).toString());
      res.setHeader('Cache-Control', 'public, max-age=300');

      // Filter to only non-exempt wallets for the public API
      const actuallyFlagged = flagged.filter(w => !w.isExempt);
      console.log(`[Public API] Flagged wallets requested by ${clientIp}, returning ${actuallyFlagged.length} wallets (${flagged.length - actuallyFlagged.length} exempt)`);

      res.json({
        flagged: actuallyFlagged.map(w => ({
          address: w.wallet,
          score: w.score,
          signals: w.signals,
          matchCount: w.matchCount,
          clusterSize: w.clusterSize
        })),
        total: actuallyFlagged.length,
        threshold: 5,
        generatedAt: flaggedWalletsCache.generatedAt.toISOString(),
        cached: false,
        exemptionRules: {
          gooddollarVerified: 'Wallets with GoodDollar face verification are exempt',
          smallCluster: 'Wallets in clusters of 3 or fewer are exempt (allows for lost wallet recovery)'
        }
      });
    } catch (error) {
      console.error('[Public API] Error getting flagged wallets:', error);
      res.status(500).json({ error: 'Failed to get flagged wallets' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
