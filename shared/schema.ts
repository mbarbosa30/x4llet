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
  withdrawTxHash: text("withdraw_tx_hash"), // Facilitator's withdraw tx
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
  autoLockMinutes?: number; // 0 = lock on tab close, 5/15/30 = idle timeout
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

// XP System Tables

export const xpBalances = pgTable("xp_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  totalXp: integer("total_xp").notNull().default(0),
  totalXpSpent: integer("total_xp_spent").notNull().default(0), // Cumulative XP spent (USDC redemption, SENADOR, AI chat)
  pendingFaceXp: integer("pending_face_xp").notNull().default(0), // XP pending until user vouches someone
  lastClaimTime: timestamp("last_claim_time"),
  claimCount: integer("claim_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const xpClaims = pgTable("xp_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  xpAmount: integer("xp_amount").notNull(),
  maxFlowSignal: integer("maxflow_signal").notNull(),
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),
});

export type XpBalance = typeof xpBalances.$inferSelect;
export type XpClaim = typeof xpClaims.$inferSelect;

// XP Action Configuration - Defines action-based XP rewards
export const xpActions = pgTable("xp_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actionType: text("action_type").notNull().unique(), // e.g., 'face_verification', 'first_transfer_received', 'savings_3_days'
  xpAmount: integer("xp_amount").notNull(), // XP reward in centi-XP (e.g., 5000 = 50 XP)
  description: text("description").notNull(),
  isOneTime: boolean("is_one_time").notNull().default(true), // Can only be earned once per user
  isActive: boolean("is_active").notNull().default(true), // Can be toggled on/off
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// XP Action Completions - Tracks which actions each user has completed
export const xpActionCompletions = pgTable("xp_action_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  actionType: text("action_type").notNull(),
  xpAwarded: integer("xp_awarded").notNull(), // Centi-XP awarded at time of completion
  metadata: text("metadata"), // JSON: optional context like txHash, chainId, etc.
  completedAt: timestamp("completed_at").notNull().defaultNow(),
}, (table) => ({
  walletActionUnique: unique().on(table.walletAddress, table.actionType),
}));

export type XpAction = typeof xpActions.$inferSelect;
export type XpActionCompletion = typeof xpActionCompletions.$inferSelect;

export const insertXpActionSchema = createInsertSchema(xpActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertXpAction = z.infer<typeof insertXpActionSchema>;

// Global Settings table for cached metrics and configuration
export const globalSettings = pgTable("global_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GlobalSetting = typeof globalSettings.$inferSelect;

// AI Chat Conversations table
export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  messages: text("messages").notNull().default('[]'), // JSON array of {role, content, timestamp}
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AiConversation = typeof aiConversations.$inferSelect;

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Sybil Detection - IP Events Table with Browser Fingerprinting
export const ipEvents = pgTable("ip_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  ipHash: text("ip_hash").notNull(), // SHA-256 hash of IP + stable salt
  networkPrefix: text("network_prefix"), // /24 network for geo patterns (e.g., "192.168.1")
  eventType: text("event_type").notNull(), // 'first_seen', 'xp_claim', 'usdc_redemption', 'airdrop', 'fingerprint'
  // Browser fingerprint signals
  userAgent: text("user_agent"), // Full browser User-Agent string
  screenResolution: text("screen_resolution"), // e.g., "1920x1080@2" (width x height @ pixel ratio)
  timezone: text("timezone"), // e.g., "America/New_York"
  language: text("language"), // e.g., "en-US"
  platform: text("platform"), // e.g., "MacIntel", "Win32", "Linux x86_64"
  hardwareConcurrency: integer("hardware_concurrency"), // CPU core count
  deviceMemory: integer("device_memory"), // RAM in GB (if available)
  storageToken: text("storage_token"), // Persistent UUID stored in IndexedDB
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type IpEvent = typeof ipEvents.$inferSelect;

export const insertIpEventSchema = createInsertSchema(ipEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertIpEvent = z.infer<typeof insertIpEventSchema>;

// Face Verification table for liveness check and sybil detection
export const faceVerifications = pgTable("face_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  embeddingHash: text("embedding_hash").notNull(), // SHA-256 hash of face embedding for privacy
  embedding: text("embedding"), // Raw face embedding as JSON array for fuzzy matching
  storageToken: text("storage_token"), // Device fingerprint token
  challengesPassed: text("challenges_passed").notNull(), // JSON array of passed challenges
  status: text("status").notNull().default('verified'), // 'verified', 'needs_review', 'duplicate', 'failed'
  duplicateOf: text("duplicate_of"), // If this face matches another wallet, store it here
  similarityScore: text("similarity_score"), // If duplicate, store the similarity score
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // Optional expiration for re-verification
  // Diagnostic fields for quality analysis
  qualityMetrics: text("quality_metrics"), // JSON: { faceSize, centering, landmarkCount, detectionConfidence }
  userAgent: text("user_agent"), // Browser/device info
  processingTimeMs: integer("processing_time_ms"), // Time taken for similarity search
  matchedWalletScore: text("matched_wallet_score"), // JSON array of all similar faces found with scores
});

export type FaceVerification = typeof faceVerifications.$inferSelect;

export const insertFaceVerificationSchema = createInsertSchema(faceVerifications).omit({
  id: true,
  createdAt: true,
});
export type InsertFaceVerification = z.infer<typeof insertFaceVerificationSchema>;

// Face Verification Attempts - tracks attempts per wallet for rate limiting (max 3 per week)
export const faceVerificationAttempts = pgTable("face_verification_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  success: boolean("success").notNull().default(false), // Whether verification succeeded
  failureReason: text("failure_reason"), // 'duplicate', 'quality', 'liveness', etc.
  ipHash: text("ip_hash"),
  storageToken: text("storage_token"), // Device fingerprint
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FaceVerificationAttempt = typeof faceVerificationAttempts.$inferSelect;

// Daily G$ to XP exchange tracking (1000 G$ per day limit)
export const gdDailySpending = pgTable("gd_daily_spending", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format for easy daily tracking
  gdSpent: text("gd_spent").notNull().default('0'), // Amount spent in raw units (18 decimals)
  xpEarned: integer("xp_earned").notNull().default(0), // XP earned in centi-XP
  txHash: text("tx_hash"), // On-chain tx hash of G$ transfer to facilitator
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  walletDateUnique: unique().on(table.walletAddress, table.date),
}));

export type GdDailySpending = typeof gdDailySpending.$inferSelect;

// Daily USDC redemption tracking (max 1 per day, requires face verification)
export const usdcDailyRedemptions = pgTable("usdc_daily_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format for easy daily tracking
  redemptionCount: integer("redemption_count").notNull().default(1),
  xpSpent: integer("xp_spent").notNull().default(10000), // 100 XP in centi-XP
  usdcReceived: text("usdc_received").notNull().default('1000000'), // 1 USDC in micro-USDC
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  walletDateUnique: unique().on(table.walletAddress, table.date),
}));

export type UsdcDailyRedemption = typeof usdcDailyRedemptions.$inferSelect;

// SENADOR redemption tracking (XP → SENADOR exchanges)
export const senadorRedemptions = pgTable("senador_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull(),
  xpSpent: integer("xp_spent").notNull(), // XP spent in centi-XP
  senadorReceived: text("senador_received").notNull(), // SENADOR received in raw units (18 decimals)
  txHash: text("tx_hash"), // On-chain tx hash of SENADOR transfer from facilitator
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SenadorRedemption = typeof senadorRedemptions.$inferSelect;

// Unified Sybil Confidence Scores
// Combines all signals into a weighted confidence score with graduated tiers
export const sybilScores = pgTable("sybil_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  // Computed score (0-100, higher = more likely sybil)
  score: integer("score").notNull().default(0),
  // Tier classification based on score
  tier: text("tier").notNull().default('clear'), // 'clear' (0-29), 'warn' (30-59), 'limit' (60-79), 'block' (80-100)
  // Signal breakdown (JSON object with each signal's contribution)
  signalBreakdown: text("signal_breakdown").notNull().default('{}'),
  // Top reason codes for this score
  reasonCodes: text("reason_codes").notNull().default('[]'), // JSON array of reason strings
  // Trust offsets that reduced the score
  trustOffsets: text("trust_offsets").notNull().default('{}'),
  // XP multiplier based on tier (1.0 for clear, 0.5 for warn, 0.167 for limit, 0 for block)
  xpMultiplier: text("xp_multiplier").notNull().default('1.0'),
  // Manual override by admin
  manualOverride: boolean("manual_override").notNull().default(false),
  manualTier: text("manual_tier"), // If overridden, the admin-set tier
  manualReason: text("manual_reason"), // Admin notes for override
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SybilScore = typeof sybilScores.$inferSelect;

export const insertSybilScoreSchema = createInsertSchema(sybilScores).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSybilScore = z.infer<typeof insertSybilScoreSchema>;
