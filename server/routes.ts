import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transferRequestSchema, transferResponseSchema, paymentRequestSchema, submitAuthorizationSchema, authorizationSchema, type Authorization } from "@shared/schema";
import { randomUUID } from "crypto";
import { getNetworkConfig } from "@shared/networks";

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
      
      const { from, to, value } = validatedData.typedData.message;
      
      if (!from || !to || !value) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      if (!/^0x[a-fA-F0-9]{40}$/.test(from) || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
        return res.status(400).json({ error: 'Invalid address format' });
      }
      
      console.log('Processing transfer:', {
        from,
        to,
        amount: value,
        chainId: validatedData.chainId,
      });
      
      const txHash = `0x${randomUUID().replace(/-/g, '')}`;
      
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
    } catch (error) {
      console.error('Error processing transfer:', error);
      res.status(400).json({ error: 'Invalid transfer request' });
    }
  });

  app.get('/api/exchange-rate/:currency', async (req, res) => {
    try {
      const { currency } = req.params;
      
      const rates: Record<string, number> = {
        'USD': 1.00,
        'EUR': 0.92,
        'GBP': 0.79,
        'JPY': 149.50,
        'ARS': 350.00,
        'BRL': 4.97,
        'MXN': 17.20,
      };
      
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
      
      if (domain.chainId !== message.from.length) {
        const existingAuth = await storage.getAuthorization(nonce, domain.chainId);
        if (existingAuth && existingAuth.status === 'used') {
          return res.status(400).json({ error: 'Authorization already used' });
        }
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
      
      console.log('Submitting authorization:', {
        from,
        to,
        value,
        nonce,
        useReceiveWith,
      });
      
      const txHash = `0x${randomUUID().replace(/-/g, '')}`;
      
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
    } catch (error) {
      console.error('Error submitting authorization:', error);
      res.status(400).json({ error: 'Invalid authorization' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
