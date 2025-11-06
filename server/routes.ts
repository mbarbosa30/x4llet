import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transferRequestSchema, transferResponseSchema, paymentRequestSchema, submitAuthorizationSchema, authorizationSchema, type Authorization } from "@shared/schema";
import { randomUUID } from "crypto";
import { getNetworkConfig } from "@shared/networks";
import { createPublicClient, createWalletClient, http, type Address, type Hex, hexToSignature, recoverAddress, hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, celo } from 'viem/chains';

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
      
      // Validate domain chainId matches request chainId
      if (validatedData.typedData.domain.chainId !== validatedData.chainId) {
        return res.status(400).json({ error: 'Chain ID mismatch between domain and request' });
      }
      
      // Validate domain parameters (name varies by network, version is always "2")
      const expectedName = validatedData.chainId === 8453 ? 'USD Coin' : 'USDC';
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
      
      // Store transaction records
      await storage.addTransaction(
        from,
        validatedData.chainId,
        {
          id: randomUUID(),
          type: 'send',
          from,
          to,
          amount: (parseInt(value) / 1000000).toFixed(6),
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
          amount: (parseInt(value) / 1000000).toFixed(6),
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
        'NGN': 1500.00,
        'KES': 129.00,
      };

      // Check database cache first
      const cachedRate = await storage.getExchangeRate(currency);
      
      if (cachedRate !== null) {
        res.json({ currency: currency.toUpperCase(), rate: cachedRate });
        return;
      }

      // Cache miss - fetch fresh rates from ExchangeRate-API
      let rate = fallbackRates[currency.toUpperCase()] || 1.00;

      try {
        console.log('[Exchange Rate] Fetching fresh rates from ExchangeRate-API...');
        const apiResponse = await fetch('https://open.er-api.com/v6/latest/USD');
        
        if (!apiResponse.ok) {
          console.warn(`[Exchange Rate] API returned status ${apiResponse.status}, using fallback rate`);
        } else {
          const data = await apiResponse.json();
          
          if (data.result === 'success' && data.rates) {
            const fetchedRate = data.rates[currency.toUpperCase()];
            if (fetchedRate) {
              rate = fetchedRate;
              
              // Cache the fresh rate in database
              await storage.cacheExchangeRate(currency, rate);
              
              console.log(`[Exchange Rate] Fresh rate for ${currency} cached: ${rate}`);
            }
          } else {
            console.warn('[Exchange Rate] API returned unexpected format, using fallback rate');
          }
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
      
      const chain = chainId === 8453 ? base : celo;
      const networkConfig = getNetworkConfig(chainId === 8453 ? 'base' : 'celo');
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
          amount: (parseInt(value) / 1000000).toFixed(6),
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
          amount: (parseInt(value) / 1000000).toFixed(6),
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

  // MaxFlow API Proxy Routes (to avoid CORS issues)
  app.get('/api/maxflow/score/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const response = await fetch(`https://maxflow.one/api/ego/${address}/score`);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch MaxFlow score' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching MaxFlow score:', error);
      res.status(500).json({ error: 'Failed to fetch MaxFlow score' });
    }
  });

  app.get('/api/maxflow/epoch/current', async (req, res) => {
    try {
      const response = await fetch('https://maxflow.one/api/epoch/current');
      
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch current epoch' });
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error fetching current epoch:', error);
      res.status(500).json({ error: 'Failed to fetch current epoch' });
    }
  });

  app.get('/api/maxflow/nonce/:address/:epoch', async (req, res) => {
    try {
      const { address, epoch } = req.params;
      const response = await fetch(`https://maxflow.one/api/nonce/${address}/${epoch}`);
      
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

  app.post('/api/maxflow/vouch', async (req, res) => {
    try {
      const response = await fetch('https://maxflow.one/api/vouch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req.body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to submit vouch' }));
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error submitting vouch:', error);
      res.status(500).json({ error: 'Failed to submit vouch' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
