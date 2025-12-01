# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) designed for managing cryptocurrency wallets with a focus on gasless USDC transfers. It prioritizes performance, accessibility, and offline-first functionality for users, especially in low-bandwidth environments. Key features include local key storage with encrypted cloud backups, and gasless transactions utilizing EIP-3009 authorization on Base and Celo networks. The project aims to deliver a robust and accessible crypto wallet solution emphasizing usability and efficiency, and incorporates network signal scoring for anti-sybil and reputation building.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with React 18, TypeScript, Vite, Wouter for routing, TanStack Query for server state management, Shadcn UI (Radix UI-based) for components, and Tailwind CSS for styling. It features a performance-first, mobile-optimized design with a fixed header/footer and content limited to a max-width of 448px. State management leverages IndexedDB for local key storage and TanStack Query for API data caching. Dark mode contrast has been improved for better readability. Multi-chain balance aggregation displays total USDC across Base and Celo networks with per-chain breakdown, and transactions are merged chronologically with chain badges.

### Backend Architecture
The backend uses Express.js (TypeScript), Drizzle ORM, and PostgreSQL (via Neon serverless adapter). It provides APIs for balance and transaction history with multi-chain aggregation support. When called without a chainId parameter, balance and transaction endpoints fetch data from both Base and Celo in parallel, returning aggregated totals with per-chain breakdowns. The production-ready EIP-3009 facilitator handles gasless USDC transfers on both networks. Transaction history is retrieved using the Etherscan v2 unified API, supporting over 60 EVM chains. All USDC amounts are handled with BigInt for precision to avoid floating-point errors. Balance formatting uses BigInt division to maintain precision for large amounts. Transaction merging uses deterministic timestamp-based sorting with txHash as tiebreaker. An admin dashboard with HTTP Basic Auth is available for backfill operations, cache management, database statistics, and API health checks.

### Cryptographic Architecture
Wallet generation employs `viem` for secp256k1 private key creation. Private keys are encrypted with WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB, protected by a user-defined password. EIP-712 typed data signing is used for gasless transfers, compatible with USDC's EIP-3009. The application correctly handles EIP-712 domain differences for "USDC" vs. "USD Coin" across different networks.

### Data Storage
A PostgreSQL database managed with Drizzle ORM is used for intelligent caching. Tables include `users`, `wallets`, `authorizations`, `cached_balances`, `cached_transactions`, `balance_history`, `cached_maxflow_scores`, and `exchange_rates`. This caching strategy reduces blockchain RPC calls and external API requests, enhancing performance and enabling offline balance display. USDC amounts are standardized to micro-USDC integers (6 decimals) for precision throughout all tables—cached balances, transactions, and balance history all store amounts as micro-USDC integers (not decimal strings). Balance history uses automatic snapshots: per-chain snapshots are saved when balances are fetched (chainId 8453 for Base, 42220 for Celo), and aggregated snapshots (chainId 0) representing the total balance across all chains are saved simultaneously using forward-fill logic to ensure accurate historical totals. Historical exchange rates are fetched and stored for inflation animation.

### Network Configuration
The application supports Base (chainId: 8453) and Celo (chainId: 42220) networks, with Celo as the default. Users can switch networks via the Settings page.

**Network Support Status:**
- **Celo (42220)**: ✅ Fully operational. Facilitator has 4.9 CELO for gas fees.
- **Base (8453)**: ✅ Fully operational. Facilitator has 0.001 ETH for gas fees (~100+ transactions).

**Facilitator Wallet:** `0x2c696E742e07d92D9ae574865267C54B13930363`
- Monitor Base ETH balance and top up when below 0.0005 ETH to maintain service availability.

### PWA Features
The application is designed as an offline-first PWA, featuring a service worker for asset caching, IndexedDB for local data, and a manifest file. It includes mobile optimizations like viewport configuration, Apple mobile web app meta tags, safe area padding, and a touch-optimized UI.

### UI/UX Decisions
The application features a unified fixed header and bottom navigation across all pages. The header displays branding, MaxFlow score, and distinct QR (receive) and Scan (send) icons. The bottom navigation provides mobile-first access to Signal, Wallet, and Settings. The "Reputation" page was renamed to "Signal" to better reflect MaxFlow's network health computation.

**Multi-Chain UX:**
- Home page displays aggregated USDC balance from both Base and Celo with per-chain breakdown (e.g., "$15.00 USDC" with "$10.00 Base + $5.00 Celo" below)
- Transaction list shows chain badges (Base/Celo) for each transaction
- Send page auto-selects the chain with the highest USDC balance on first load, with manual network toggle available in header
- Receive page allows network selection to specify which chain to receive payments on
- Explorer links dynamically use the correct block explorer (Basescan/Celoscan) based on transaction's chainId

## External Dependencies

### Blockchain Infrastructure
- **Viem**: Ethereum library for wallet operations and transaction signing.
- **Network RPC Providers**: `https://mainnet.base.org` for Base, `https://forno.celo.org` for Celo.
- **USDC Smart Contracts**: Native USDC implementations supporting EIP-3009.

### External APIs
- **MaxFlow API**: For network signal scoring and vouching (proxied via backend).
- **fawazahmed0 Currency API**: For exchange rates (with dual CDN fallback).
- **Etherscan v2 unified API**: Primary source for fetching transaction history across EVM chains. Falls back to chain-specific APIs (BaseScan, CeloScan) when unified API rate limits are hit.

### UI Component Libraries
- **Radix UI**: Headless component primitives.
- **Shadcn UI**: Pre-styled components built on Radix UI.
- **Lucide React**: Icon library.
- **QRCode**: Canvas-based QR code generation.

### Development Tools
- **Drizzle Kit**: Database migration and schema management.
- **Neon Serverless**: PostgreSQL adapter.
- **date-fns**: Date formatting.
- **idb-keyval**: Promise-based IndexedDB wrapper.

### Build & Development
- **Vite**: Build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **TypeScript**: Strict typing.

### Aave V3 Integration (Earn Mode)
**Status:** Phase 1 (Informational UI) - Complete. Phase 2 (Supply/Withdraw Operations) - Pending.

**Current Implementation:**
- Settings page has Earn Mode toggle with live APY display from Aave protocol
- Home page shows earning indicator when Aave balance exists
- Send page shows insufficient balance warning with Aave fund info
- Backend endpoints for APY, balance checking, and placeholder supply/withdraw

**Architecture:**
- Aave V3 Pool addresses: Base (`0xA238Dd80C259a72E81d7e4664a9801593F98d1c5`), Celo (`0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402`)
- aUSDC tokens: Base (`0x4e65fE4DbA92790696d040aC24Aa414708F5c0AB`), Celo (`0xFF8309b9e99bfd2D4021bc71a362aBD93dBd4785`)
- Users receive aUSDC (interest-bearing) when depositing USDC
- Gas drip model: Facilitator sends small gas amounts (0.001 CELO or 0.0001 ETH) with 24-hour cooldown per chain

**Operation Tracking & Recovery:**
- All Aave supply operations are tracked in `aave_operations` database table
- Tracks status through steps: pending → transferring → approving → supplying → completed
- Automatic refund with retry logic (3 attempts, exponential backoff) if any step fails after transfer
- Failed refunds are logged with status `refund_failed` for manual recovery
- Admin endpoints for viewing stuck operations (`GET /api/admin/aave-operations`)
- Admin can manually refund (`POST /api/admin/aave-operations/:id/refund`) or resolve (`POST /api/admin/aave-operations/:id/resolve`)

**Phase 2 Requirements (Not Yet Implemented):**
1. Auto-withdraw orchestration in Send flow when liquid USDC is insufficient
2. Background sync for accrued interest display

## Future Vision: Savings-Backed Pay Later

### Core Concept
Turn yield into credit without creating debt. Users lock savings in Aave, then spend their future yield on purchases today. Principal stays invested, only yield gets redirected to payments.

**The Disruption:**
- Traditional BNPL: "Borrow $100, pay back $115 over 4 months (debt + interest to Klarna/Affirm)"
- nanoPay: "Your $1,000 savings earns $60/year. Spend that $60 now. Your $1,000 never moves."

No debt. No credit check. No interest payments. Just your own money working for you before you receive it.

### Key Formulas (from PRD)
- **Spendable Limit**: `0.8 × Locked + 0.7 × (APY × Locked × Tenor) + TopUps - Outstanding`
- **Health Ratio**: `(0.8 × Locked + YieldAccrued + TopUps) / Outstanding`
- Health badges: OK ≥1.10, Attention 1.05–1.10, Action <1.05

### Example Math
- $1,000 locked @ 6% APY over 1 year
- Spendable = 0.8 × $1,000 + 0.7 × ($60) = $800 + $42 = **$842**
- User can make $842 in purchases while keeping $1,000 invested

### Repayment Waterfall
1. **Yield first**: Accrued yield from Aave pays off purchases
2. **Top-ups second**: Optional user contributions
3. **Principal last**: Capped amount at maturity (only if needed)

### Merchant Settlement
- **Instant**: Sell payment commitment (pcNFT) to settlement pool at 1.5% discount
- **Hold to maturity**: Guaranteed on-chain claim backed by locked savings

### Smart Contracts (Future)
1. **SavingsVault.sol**: Wraps Aave, tracks locked/unlocked, handles yield accounting and settlement
2. **PaymentCommitment.sol (pcNFT)**: ERC-721 representing payment claim {buyer, merchant, amount, maturity, principalCap}
3. **InstantSettlementPool.sol**: LPs buy pcNFTs for immediate merchant liquidity

### Wallet UI (Future)
- `/paylater` page: Summary strip (Spendable, Locked, Outstanding, Health), active purchases list, lock slider
- Home card: "Spendable: $X • Outstanding: $Y"
- Checkout pay sheet: "Pay now" vs "Pay later" tabs with 3 adjustment levers

## Future Vision: Yield Endowment for Communities

### Core Concept
Partners (NGOs, foundations, sponsors) deposit capital ($1M+), and only the yield flows to eligible community members weekly, weighted by MaxFlow trust scores.

**Sustainable Aid**: Principal never moves. Only realized yield gets distributed. Funds concentrate where the network has real confidence.

### Distribution Formula
```
Weekly Budget = Harvested Yield (EMA-smoothed, 80% distributed, 20% buffer)
Per-wallet allocation = Floor + Trust-weighted share
Trust weight = normalize(MaxFlow score) × (1 - dilution) × (1 + redundancy)
```

### Example Numbers
- Partner deposits $1M @ 6% APY = $60k/year = ~$1,154/week
- 2,000 eligible users (MaxFlow score ≥ threshold)
- Floor (40%): ~$0.23 each guaranteed
- Trust-weighted remainder: Top scores get $0.70–$1.20, median $0.30–$0.50

### "Help Anyone" Features
- **Boost next claim**: Donate to increase someone's weekly allocation
- **Top-up Pay Later**: Donate directly to reduce someone's outstanding balance

### Smart Contracts (Future)
1. **PartnerYieldVault**: Tracks principal baseline, weekly harvest of realized yield
2. **ClaimsTreasury**: Receives harvested USDC + donations
3. **ClaimManager**: Merkle-based weekly claims with cooldown, gasless via relayer

### Wallet UI (Future)
- `/claim` page: "Claim weekly" button, next timer, expiry countdown
- `/help` page: Choose beneficiary, boost their claim or top-up their Pay Later
- Transparency card: "This week: Budget $1,154 • Eligible 2,000 • Median claim $0.42"

### Safeguards
- Anti-sybil: MaxFlow threshold, haircuts for low-redundancy clusters, new wallet warm-up
- Smoothing: EMA APY, 20% buffer for APY dips
- Fairness: 30-50% floor, per-wallet cap (≤ 0.5-1.0% of budget)
- Partner controls: Pause, withdraw principal, cap weekly spend, community scoping