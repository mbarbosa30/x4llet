import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const authorizations = pgTable("authorizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chainId: integer("chain_id").notNull(),
  nonce: text("nonce").notNull(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  value: text("value").notNull(),
  validAfter: text("valid_after").notNull(),
  validBefore: text("valid_before").notNull(),
  signature: text("signature").notNull(),
  status: text("status").notNull().default('pending'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedAt: timestamp("used_at"),
  txHash: text("tx_hash"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export interface Wallet {
  address: string;
  publicKey: string;
  createdAt: string;
}

export interface Balance {
  balance: string;
  decimals: number;
  nonce: string;
}

export interface Transaction {
  id: string;
  type: 'send' | 'receive';
  from: string;
  to: string;
  amount: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
}

export interface UserPreferences {
  currency: string;
  language: string;
  network: 'base' | 'celo';
}

export const balanceResponseSchema = z.object({
  balance: z.string(),
  decimals: z.number(),
  nonce: z.string(),
  transactions: z.array(z.object({
    id: z.string(),
    type: z.enum(['send', 'receive']),
    from: z.string(),
    to: z.string(),
    amount: z.string(),
    timestamp: z.string(),
    status: z.enum(['pending', 'completed', 'failed']),
    txHash: z.string().optional(),
  })),
});

export type BalanceResponse = z.infer<typeof balanceResponseSchema>;

export const transferRequestSchema = z.object({
  chainId: z.number(),
  token: z.string(),
  typedData: z.object({
    domain: z.object({
      name: z.string(),
      version: z.string(),
      chainId: z.number(),
      verifyingContract: z.string(),
    }),
    types: z.record(z.array(z.object({
      name: z.string(),
      type: z.string(),
    }))),
    message: z.object({
      from: z.string(),
      to: z.string(),
      value: z.string(),
      validAfter: z.string(),
      validBefore: z.string(),
      nonce: z.string(),
    }),
  }),
  signature: z.string(),
});

export type TransferRequest = z.infer<typeof transferRequestSchema>;

export const transferResponseSchema = z.object({
  txHash: z.string(),
  status: z.enum(['submitted', 'pending', 'completed', 'failed']),
});

export type TransferResponse = z.infer<typeof transferResponseSchema>;

export const paymentRequestSchema = z.object({
  v: z.number().default(1),
  chainId: z.number(),
  token: z.string(),
  to: z.string(),
  amount: z.string(),
  decimals: z.number().default(6),
  ttl: z.number(),
  facilitatorUrl: z.string(),
  ref: z.string().optional(),
  description: z.string().optional(),
});

export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

export const authorizationSchema = z.object({
  id: z.string(),
  chainId: z.number(),
  nonce: z.string(),
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  signature: z.string(),
  status: z.enum(['pending', 'used', 'cancelled', 'expired']),
  createdAt: z.string(),
  usedAt: z.string().optional(),
  txHash: z.string().optional(),
});

export type Authorization = z.infer<typeof authorizationSchema>;

export const authorizationQRSchema = z.object({
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number(),
    verifyingContract: z.string(),
  }),
  message: z.object({
    from: z.string(),
    to: z.string(),
    value: z.string(),
    validAfter: z.string(),
    validBefore: z.string(),
    nonce: z.string(),
  }),
  signature: z.string(),
});

export type AuthorizationQR = z.infer<typeof authorizationQRSchema>;

export const submitAuthorizationSchema = z.object({
  authorization: authorizationQRSchema,
  useReceiveWith: z.boolean().default(true),
});

export type SubmitAuthorization = z.infer<typeof submitAuthorizationSchema>;
