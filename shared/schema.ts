import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, unique, boolean } from "drizzle-orm/pg-core";
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
}, (table) => ({
  nonceChainIdUnique: unique().on(table.nonce, table.chainId),
}));

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
});

export const cachedBalances = pgTable("cached_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  chainId: integer("chain_id").notNull(),
  balance: text("balance").notNull(),
  decimals: integer("decimals").notNull().default(6),
  nonce: text("nonce").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  addressChainIdUnique: unique().on(table.address, table.chainId),
}));

export const cachedTransactions = pgTable("cached_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  txHash: text("tx_hash").notNull().unique(),
  chainId: integer("chain_id").notNull(),
  type: text("type").notNull(),
  from: text("from").notNull(),
  to: text("to").notNull(),
  amount: text("amount").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  currency: text("currency").notNull(),
  rate: text("rate").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  currencyDateUnique: unique().on(table.currency, table.date),
}));

export const balanceHistory = pgTable("balance_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  chainId: integer("chain_id").notNull(),
  balance: text("balance").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const cachedMaxflowScores = pgTable("cached_maxflow_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  scoreData: text("score_data").notNull(), // JSON stringified MaxFlow score response
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gasDrips = pgTable("gas_drips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  chainId: integer("chain_id").notNull(),
  amount: text("amount").notNull(), // Amount in wei
  txHash: text("tx_hash"),
  status: text("status").notNull().default('pending'), // pending, completed, failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aaveOperations = pgTable("aave_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userAddress: text("user_address").notNull(),
  chainId: integer("chain_id").notNull(),
  operationType: text("operation_type").notNull(), // 'supply' or 'withdraw'
  amount: text("amount").notNull(), // Amount in micro-USDC
  status: text("status").notNull().default('pending'), // pending, transferring, approving, supplying, completed, failed, refunded, refund_failed
  step: text("step"), // Current step: 'transfer', 'approve', 'supply', 'withdraw'
  transferTxHash: text("transfer_tx_hash"), // User's transfer to facilitator
  approveTxHash: text("approve_tx_hash"), // Facilitator's approve tx
  supplyTxHash: text("supply_tx_hash"), // Facilitator's supply tx
  refundTxHash: text("refund_tx_hash"), // Refund tx if failed
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"), // 'auto' or admin username
});

export type AaveOperation = typeof aaveOperations.$inferSelect;

// Pool (Prize-Linked Savings) Tables

export const poolSettings = pgTable("pool_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  optInPercent: integer("opt_in_percent").notNull().default(0), // 0-100
  facilitatorApproved: boolean("facilitator_approved").notNull().default(false), // Has approved facilitator to collect yield
  approvalTxHash: text("approval_tx_hash"), // Tx hash of the approval/permit
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerAddress: text("referrer_address").notNull(),
  refereeAddress: text("referee_address").notNull().unique(), // Each address can only be referred once
  referralCode: text("referral_code").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const poolDraws = pgTable("pool_draws", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weekNumber: integer("week_number").notNull(), // ISO week number
  year: integer("year").notNull(),
  weekStart: timestamp("week_start").notNull(),
  weekEnd: timestamp("week_end").notNull(),
  totalPool: text("total_pool").notNull().default('0'), // Total yield in micro-USDC (participant contributions)
  totalTickets: text("total_tickets").notNull().default('0'), // Total tickets (from participants only)
  sponsoredPool: text("sponsored_pool").notNull().default('0'), // Donated/sponsored funds (no tickets)
  participantCount: integer("participant_count").notNull().default(0),
  winnerAddress: text("winner_address"),
  winnerTickets: text("winner_tickets"),
  status: text("status").notNull().default('active'), // active, drawing, completed
  drawnAt: timestamp("drawn_at"),
  winningNumber: text("winning_number"), // For transparency
}, (table) => ({
  weekYearUnique: unique().on(table.weekNumber, table.year),
}));

export const poolContributions = pgTable("pool_contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  drawId: varchar("draw_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  yieldContributed: text("yield_contributed").notNull().default('0'), // micro-USDC
  referralBonusTickets: text("referral_bonus_tickets").notNull().default('0'), // 10% of referrals' yield
  totalTickets: text("total_tickets").notNull().default('0'), // yieldContributed + referralBonusTickets
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  drawWalletUnique: unique().on(table.drawId, table.walletAddress),
}));

export const poolYieldSnapshots = pgTable("pool_yield_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  chainId: integer("chain_id").notNull().default(42220), // Celo only for now
  // Net deposits tracking: total deposited - total withdrawn
  // Interest = currentAaveBalance - netDeposits
  netDeposits: text("net_deposits").notNull().default('0'), // micro-USDC (deposits - withdrawals)
  // Snapshot of accrued yield at last draw
  // First week: no snapshot, use full accrued yield for tickets
  // Subsequent weeks: tickets = (currentAccrued - snapshotYield) × optIn%
  snapshotYield: text("snapshot_yield").notNull().default('0'), // Accrued yield at last snapshot (micro-USDC)
  weekNumber: integer("week_number"), // Week when snapshot was taken
  year: integer("year"), // Year when snapshot was taken
  isFirstWeek: boolean("is_first_week").notNull().default(true), // First week uses total accrued, not delta
  // Lifetime tracking
  lastAusdcBalance: text("last_ausdc_balance").notNull().default('0'), // micro-aUSDC
  lastCollectedAt: timestamp("last_collected_at").notNull().defaultNow(),
  totalYieldCollected: text("total_yield_collected").notNull().default('0'), // micro-USDC lifetime
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PoolSettings = typeof poolSettings.$inferSelect;
export type PoolDraw = typeof poolDraws.$inferSelect;
export type PoolContribution = typeof poolContributions.$inferSelect;
export type PoolYieldSnapshot = typeof poolYieldSnapshots.$inferSelect;
export type Referral = typeof referrals.$inferSelect;

export const insertPoolSettingsSchema = createInsertSchema(poolSettings).omit({ 
  id: true, 
  updatedAt: true, 
  facilitatorApproved: true, 
  approvalTxHash: true 
});
export type InsertPoolSettings = z.infer<typeof insertPoolSettingsSchema>;

// GoodDollar UBI Tables

export const gooddollarIdentities = pgTable("gooddollar_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  isWhitelisted: boolean("is_whitelisted").notNull().default(false),
  whitelistedRoot: text("whitelisted_root"), // Root address if linked
  lastAuthenticated: timestamp("last_authenticated"), // When they last verified
  authenticationPeriod: integer("authentication_period"), // Days before expiry
  expiresAt: timestamp("expires_at"), // When identity expires
  isExpired: boolean("is_expired").notNull().default(false),
  daysUntilExpiry: integer("days_until_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const gooddollarClaims = pgTable("gooddollar_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  amount: text("amount").notNull(), // Raw BigInt string from contract
  amountFormatted: text("amount_formatted").notNull(), // Human-readable
  claimedDay: integer("claimed_day").notNull(), // GoodDollar day number
  gasDripTxHash: text("gas_drip_tx_hash"), // If gas drip was needed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cachedGdBalances = pgTable("cached_gd_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull().unique(),
  balance: text("balance").notNull(), // Raw BigInt string
  balanceFormatted: text("balance_formatted").notNull(), // Human-readable
  decimals: integer("decimals").notNull().default(2),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GoodDollarIdentity = typeof gooddollarIdentities.$inferSelect;
export type GoodDollarClaim = typeof gooddollarClaims.$inferSelect;
export type CachedGdBalance = typeof cachedGdBalances.$inferSelect;

export const insertGoodDollarIdentitySchema = createInsertSchema(gooddollarIdentities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGoodDollarIdentity = z.infer<typeof insertGoodDollarIdentitySchema>;

export const insertGoodDollarClaimSchema = createInsertSchema(gooddollarClaims).omit({
  id: true,
  createdAt: true,
});
export type InsertGoodDollarClaim = z.infer<typeof insertGoodDollarClaimSchema>;

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true, createdAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;

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
  earnMode?: boolean;
}

export const balanceResponseSchema = z.object({
  balance: z.string(), // Display format (e.g., "5.12")
  balanceMicro: z.string(), // Canonical micro-USDC integer (e.g., "5120000")
  decimals: z.number(),
  nonce: z.string(),
  transactions: z.array(z.object({
    id: z.string(),
    type: z.enum(['send', 'receive']),
    from: z.string(),
    to: z.string(),
    amount: z.string(), // micro-USDC integer (e.g., "1000000" = 1 USDC)
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
      salt: z.string().optional(), // Legacy field, not used
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
    salt: z.string().optional(), // Legacy field, not used
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
});

export type SubmitAuthorization = z.infer<typeof submitAuthorizationSchema>;
