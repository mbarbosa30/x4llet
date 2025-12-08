import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { transferRequestSchema, transferResponseSchema, paymentRequestSchema, submitAuthorizationSchema, authorizationSchema, type Authorization, aaveOperations, poolDraws } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getNetworkConfig, getNetworkByChainId } from "@shared/networks";
import { AAVE_POOL_ABI, ATOKEN_ABI, ERC20_ABI, rayToPercent } from "@shared/aave";
import { createPublicClient, createWalletClient, http, type Address, type Hex, hexToSignature, recoverAddress, hashTypedData, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, celo, gnosis } from 'viem/chains';
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
    default:
      return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const BUILD_VERSION = '2025-12-08T10:30:00Z';
  
  app.get('/api/version', (req, res) => {
    res.json({
      version: BUILD_VERSION,
      maxflowApiBase: 'https://maxflow.one/api/v1',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/balance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = req.query.chainId ? parseInt(req.query.chainId as string) : undefined;
      
      // If chainId provided, return single chain balance (legacy support)
      if (chainId !== undefined) {
        const balance = await storage.getBalance(address, chainId);
        return res.json(balance);
      }
      
      // Otherwise, fetch balances from all chains in parallel
      const [baseBalance, celoBalance, gnosisBalance] = await Promise.all([
        storage.getBalance(address, 8453),
        storage.getBalance(address, 42220),
        storage.getBalance(address, 100),
      ]);
      
      // Calculate total balance (sum of micro-USDC) - keep as BigInt for precision
      const totalMicroUsdc = BigInt(baseBalance.balanceMicro) + BigInt(celoBalance.balanceMicro) + BigInt(gnosisBalance.balanceMicro);
      
      // Format total for display using BigInt division to preserve precision
      // Add 5000 for rounding to nearest cent (0.005 USDC = 5000 micro-USDC)
      const roundedMicroUsdc = totalMicroUsdc + 5000n;
      const integerPart = roundedMicroUsdc / 1000000n;
      const fractionalPart = (roundedMicroUsdc % 1000000n) / 10000n; // Get cents
      const totalFormatted = `${integerPart}.${fractionalPart.toString().padStart(2, '0')}`;
      
      res.json({
        balance: totalFormatted,
        balanceMicro: totalMicroUsdc.toString(),
        decimals: 6,
        nonce: baseBalance.nonce, // Use Base nonce (not critical for aggregated view)
        transactions: [], // Will be fetched separately via /api/transactions
        chains: {
          base: {
            chainId: 8453,
            balance: baseBalance.balance,
            balanceMicro: baseBalance.balanceMicro,
          },
          celo: {
            chainId: 42220,
            balance: celoBalance.balance,
            balanceMicro: celoBalance.balanceMicro,
          },
          gnosis: {
            chainId: 100,
            balance: gnosisBalance.balance,
            balanceMicro: gnosisBalance.balanceMicro,
          },
        },
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
      const [baseTransactions, celoTransactions, gnosisTransactions] = await Promise.all([
        storage.getTransactions(address, 8453),
        storage.getTransactions(address, 42220),
        storage.getTransactions(address, 100),
      ]);
      
      // Add chainId to each transaction and merge
      const baseTxsWithChain = baseTransactions.map(tx => ({ ...tx, chainId: 8453 }));
      const celoTxsWithChain = celoTransactions.map(tx => ({ ...tx, chainId: 42220 }));
      const gnosisTxsWithChain = gnosisTransactions.map(tx => ({ ...tx, chainId: 100 }));
      
      // Merge and sort by timestamp (most recent first), with txHash as tiebreaker for deterministic ordering
      const allTransactions = [...baseTxsWithChain, ...celoTxsWithChain, ...gnosisTxsWithChain]
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
      // Base and Gnosis use "USD Coin" (Circle's native/bridged standard), Celo uses "USDC"
      const expectedName = validatedData.chainId === 42220 ? 'USDC' : 'USD Coin';
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
      const [baseResult, celoResult, gnosisResult] = await Promise.all([
        fetchAaveBalance(8453).catch(() => ({ chainId: 8453, aUsdcBalance: '0', apy: 0 })),
        fetchAaveBalance(42220).catch(() => ({ chainId: 42220, aUsdcBalance: '0', apy: 0 })),
        fetchAaveBalance(100).catch(() => ({ chainId: 100, aUsdcBalance: '0', apy: 0 })),
      ]);

      const totalAUsdcMicro = BigInt(baseResult.aUsdcBalance) + BigInt(celoResult.aUsdcBalance) + BigInt(gnosisResult.aUsdcBalance);

      // Cache aUSDC balances using negative chainIds to distinguish from regular USDC
      // Convention: -chainId = aUSDC balance for that chain
      await Promise.all([
        storage.cacheAUsdcBalance(address, 8453, baseResult.aUsdcBalance),
        storage.cacheAUsdcBalance(address, 42220, celoResult.aUsdcBalance),
        storage.cacheAUsdcBalance(address, 100, gnosisResult.aUsdcBalance),
      ]).catch(err => console.error('Error caching aUSDC balances:', err));

      res.json({
        totalAUsdcBalance: totalAUsdcMicro.toString(),
        chains: {
          base: baseResult,
          celo: celoResult,
          gnosis: gnosisResult,
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
      const chainIds = [8453, 42220, 100]; // Base, Celo, Gnosis
      
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

      const [baseBalance, celoBalance, gnosisBalance] = await Promise.all([
        fetchAaveBalance(8453),
        fetchAaveBalance(42220),
        fetchAaveBalance(100),
      ]);

      const balances: Record<number, { chainId: number; aUsdcBalance: string }> = { 
        8453: baseBalance, 
        42220: celoBalance, 
        100: gnosisBalance 
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
        
        await storage.upsertYieldSnapshot(normalizedAddr, {
          netDeposits: newNetDeposits.toString(),
          lastAusdcBalance: (currentNetDeposits + depositAmount).toString(), // approximate
        });
        console.log(`[Aave Supply] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}`);
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
        
        await storage.upsertYieldSnapshot(normalizedAddr, {
          netDeposits: newNetDeposits.toString(),
        });
        console.log(`[Aave Withdraw] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}`);
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
        
        await storage.upsertYieldSnapshot(normalizedAddr, {
          netDeposits: newNetDeposits.toString(),
        });
        console.log(`[Aave Record Withdraw] Updated netDeposits for ${normalizedAddr}: ${newNetDeposits.toString()}`);
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

      if (!chainId || ![8453, 42220, 100].includes(chainId)) {
        return res.status(400).json({ error: 'Invalid chainId. Must be 8453 (Base), 42220 (Celo), or 100 (Gnosis)' });
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

      // Check for recent drips (rate limiting - 1 per day per chain)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentDrips = await storage.getRecentGasDrips(address, chainId, oneDayAgo);
      
      if (recentDrips.length > 0) {
        const lastDrip = recentDrips[0];
        const nextDripTime = new Date(lastDrip.createdAt.getTime() + 24 * 60 * 60 * 1000);
        return res.status(429).json({
          error: 'Rate limited. You can request gas again in 24 hours.',
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
      
      // Check cache first (returns fresh data only, not stale)
      const cachedScore = await storage.getMaxFlowScore(address);
      if (cachedScore) {
        return res.json(cachedScore);
      }
      
      // Cache miss - fetch from MaxFlow API v1
      console.log(`[MaxFlow API] Cache miss, fetching score for ${address}`);
      console.log(`[MaxFlow API] Fetching from URL: ${MAXFLOW_API_BASE}/score/${address}`);
      let response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${address}`);
      
      console.log(`[MaxFlow API] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MaxFlow API] Error response (${response.status}): ${errorText}`);
        return res.status(response.status).json({ error: 'Failed to fetch MaxFlow score' });
      }
      
      let data = await response.json();
      
      // If API returns stale cached data (>1 hour old), force refresh
      if (isMaxFlowResponseStale(data)) {
        console.log(`[MaxFlow API] Response stale (cached_at: ${data.cached_at}), forcing refresh for ${address}`);
        response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${address}?force_refresh=true`);
        if (response.ok) {
          data = await response.json();
        }
      }
      
      console.log(`[MaxFlow API] Score response for ${address}:`, JSON.stringify(data, null, 2));
      
      // Save to cache
      await storage.saveMaxFlowScore(address, data);
      
      res.json(data);
    } catch (error: any) {
      // Check if this is a DNS error (all retries and fallback exhausted)
      const dnsFailure = isDnsError(error);
      
      if (dnsFailure) {
        console.error('[MaxFlow API] All endpoints failed (DNS), attempting to return stale cache');
        
        // Try to get ANY cached data, even if stale
        const staleCache = await storage.getMaxFlowScore(req.params.address);
        if (staleCache) {
          console.log('[MaxFlow API] Returning stale cached data (200 OK) due to DNS failure');
          res.setHeader('X-Cache-Status', 'stale-dns-fallback');
          res.setHeader('Warning', '110 - "Response is Stale"'); // RFC 7234
          // Return 200 OK so clients use the data, with metadata indicating staleness
          return res.status(200).json({
            ...staleCache,
            _stale: true,
            _reason: 'Temporary network issue - using cached data',
          });
        }
      }
      
      console.error('[MaxFlow API] Exception fetching MaxFlow score:', error);
      console.error('[MaxFlow API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
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
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
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
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
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
      
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const wallet of wallets) {
        try {
          // Always force refresh from MaxFlow API to get truly fresh scores
          const response = await fetchMaxFlow(`${MAXFLOW_API_BASE}/score/${wallet.address}?force_refresh=true`);
          
          if (response.ok) {
            const data = await response.json();
            await storage.saveMaxFlowScore(wallet.address, data);
            updated++;
          } else {
            failed++;
            if (response.status !== 404) {
              errors.push(`${wallet.address}: HTTP ${response.status}`);
            }
          }
        } catch (error: any) {
          failed++;
          errors.push(`${wallet.address}: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      res.json({
        walletsProcessed: wallets.length,
        scoresUpdated: updated,
        failed,
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

  app.get('/api/xp/:address', async (req, res) => {
    try {
      const { address } = req.params;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const xpBalance = await storage.getXpBalance(address);
      
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

      res.json({
        totalXp: xpBalance?.totalXp || 0,
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

      const scoreData = await storage.getMaxFlowScore(address);
      const rawSignal = scoreData?.local_health || 0;
      const xpAmount = Math.round(Math.sqrt(rawSignal));

      if (xpAmount === 0) {
        return res.status(400).json({ 
          error: 'Cannot claim XP with zero signal',
          message: 'Build your trust network to earn XP',
        });
      }

      const claim = await storage.claimXp(address, xpAmount, Math.round(rawSignal));

      res.json({
        success: true,
        xpEarned: xpAmount,
        claim: {
          id: claim.id,
          xpAmount: claim.xpAmount,
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

      res.json({
        claims: claims.map(c => ({
          id: c.id,
          xpAmount: c.xpAmount,
          maxFlowSignal: c.maxFlowSignal,
          claimedAt: c.claimedAt,
        })),
      });
    } catch (error) {
      console.error('[XP] Error fetching XP history:', error);
      res.status(500).json({ error: 'Failed to fetch XP history' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
