import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transferRequestSchema, transferResponseSchema } from "@shared/schema";
import { randomUUID } from "crypto";

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

  const httpServer = createServer(app);
  return httpServer;
}
