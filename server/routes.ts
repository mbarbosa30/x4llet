import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transferRequestSchema, transferResponseSchema, paymentRequestSchema, submitAuthorizationSchema, authorizationSchema, type Authorization } from "@shared/schema";
import { randomUUID } from "crypto";
import { getNetworkConfig } from "@shared/networks";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, celo } from 'viem/chains';

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

function getFacilitatorAccount() {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('FACILITATOR_PRIVATE_KEY not set');
  }
  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(formattedKey as Hex);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get('/api/balance/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = parseInt(req.query.chainId as string) || 8453;
      
      const balance = await storage.getBalance(address, chainId);
      res.json(balance);
    } catch (error) {
      console.error('Error fetching balance:', error);
      res.status(500).json({ error: 'Failed to fetch balance' });
    }
  });

  app.get('/api/transactions/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const chainId = parseInt(req.query.chainId as string) || 8453;
      
      const transactions = await storage.getTransactions(address, chainId);
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  app.post('/api/relay/transfer-3009', async (req, res) => {
    try {
      const validatedData = transferRequestSchema.parse(req.body);
      
      if (validatedData.chainId !== validatedData.typedData.domain.chainId) {
        return res.status(400).json({ error: 'Chain ID mismatch' });
      }
      
      const expectedDomain = {
        name: 'USD Coin',
        version: '2',
        chainId: validatedData.chainId,
      };
      
      if (validatedData.typedData.domain.name !== expectedDomain.name ||
          validatedData.typedData.domain.version !== expectedDomain.version ||
          validatedData.typedData.domain.chainId !== expectedDomain.chainId) {
        return res.status(400).json({ error: 'Invalid domain parameters' });
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
      
      // Get network configuration
      const chain = validatedData.chainId === 8453 ? base : celo;
      const networkConfig = getNetworkConfig(validatedData.chainId === 8453 ? 'base' : 'celo');
      const facilitatorAccount = getFacilitatorAccount();
      
      // Create wallet client
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      // Extract v, r, s from signature
      const signature = validatedData.signature;
      const [v, r, s] = [
        parseInt(signature.slice(130, 132), 16),
        signature.slice(0, 66) as Hex,
        `0x${signature.slice(66, 130)}` as Hex,
      ];
      
      console.log('[Facilitator] Submitting transferWithAuthorization to blockchain...');
      console.log('[Facilitator] Facilitator address:', facilitatorAccount.address);
      console.log('[Facilitator] USDC contract:', networkConfig.usdcAddress);
      
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
          v,
          r,
          s,
        ],
      });
      
      console.log('[Facilitator] Transaction submitted! Hash:', txHash);
      
      // Store transaction records
      await storage.addTransaction(
        from,
        validatedData.chainId,
        {
          id: randomUUID(),
          type: 'send',
          from,
          to,
          amount: (parseInt(value) / 1000000).toFixed(2),
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
          amount: (parseInt(value) / 1000000).toFixed(2),
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

  // Cache for exchange rates (1 hour TTL)
  let exchangeRateCache: { rates: Record<string, number>; timestamp: number } | null = null;
  const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

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
        'NGN': 1500.00,
        'KES': 129.00,
      };

      let rates = fallbackRates;

      // Check if we have cached rates that are still fresh
      const now = Date.now();
      const cacheIsValid = exchangeRateCache && (now - exchangeRateCache.timestamp) < CACHE_DURATION;

      if (cacheIsValid && exchangeRateCache) {
        console.log('[Exchange Rate] Using cached rates');
        rates = exchangeRateCache.rates;
      } else {
        // Fetch fresh rates from ExchangeRate-API (open endpoint, no auth required)
        try {
          console.log('[Exchange Rate] Fetching fresh rates from ExchangeRate-API...');
          const apiResponse = await fetch('https://open.er-api.com/v6/latest/USD');
          
          if (!apiResponse.ok) {
            console.warn(`[Exchange Rate] API returned status ${apiResponse.status}, using fallback rates`);
          } else {
            const data = await apiResponse.json();
            
            if (data.result === 'success' && data.rates) {
              rates = { USD: 1.00, ...data.rates };
              
              // Cache the fresh rates
              exchangeRateCache = {
                rates,
                timestamp: now,
              };
              
              console.log('[Exchange Rate] Fresh rates cached successfully');
            } else {
              console.warn('[Exchange Rate] API returned unexpected format, using fallback rates');
            }
          }
        } catch (apiError) {
          console.error('[Exchange Rate] Failed to fetch from API, using fallback rates:', apiError);
        }
      }
      
      const rate = rates[currency.toUpperCase()] || 1.00;
      
      res.json({ currency: currency.toUpperCase(), rate });
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      res.status(500).json({ error: 'Failed to fetch exchange rate' });
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
      const { authorization, useReceiveWith } = validatedData;
      
      const { domain, message, signature } = authorization;
      const { from, to, value, validAfter, validBefore, nonce } = message;
      
      const existingAuth = await storage.getAuthorization(nonce, domain.chainId);
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
        chainId: domain.chainId,
        useReceiveWith,
      });
      
      const chain = domain.chainId === 8453 ? base : celo;
      const networkConfig = getNetworkConfig(domain.chainId === 8453 ? 'base' : 'celo');
      const facilitatorAccount = getFacilitatorAccount();
      
      const walletClient = createWalletClient({
        account: facilitatorAccount,
        chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      const [v, r, s] = [
        parseInt(signature.slice(130, 132), 16),
        signature.slice(0, 66) as Hex,
        `0x${signature.slice(66, 130)}` as Hex,
      ];
      
      console.log('[Facilitator] Submitting receiveWithAuthorization to blockchain...');
      console.log('[Facilitator] Facilitator address:', facilitatorAccount.address);
      console.log('[Facilitator] USDC contract:', networkConfig.usdcAddress);
      
      const txHash = await walletClient.writeContract({
        address: networkConfig.usdcAddress as Address,
        abi: USDC_ABI,
        functionName: 'receiveWithAuthorization',
        args: [
          from as Address,
          to as Address,
          BigInt(value),
          BigInt(validAfter),
          BigInt(validBefore),
          nonce as Hex,
          v,
          r,
          s,
        ],
      });
      
      console.log('[Facilitator] Transaction submitted! Hash:', txHash);
      
      const auth: Authorization = {
        id: randomUUID(),
        chainId: domain.chainId,
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
        domain.chainId,
        {
          id: randomUUID(),
          type: 'send',
          from,
          to,
          amount: (parseInt(value) / 1000000).toFixed(2),
          timestamp: new Date().toISOString(),
          status: 'completed',
          txHash,
        }
      );
      
      await storage.addTransaction(
        to,
        domain.chainId,
        {
          id: randomUUID(),
          type: 'receive',
          from,
          to,
          amount: (parseInt(value) / 1000000).toFixed(2),
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

  const httpServer = createServer(app);
  return httpServer;
}
