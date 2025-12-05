# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) for managing cryptocurrency wallets, focusing on gasless USDC transfers. It prioritizes performance, accessibility, and offline functionality, especially in low-bandwidth environments. Key features include local key storage with encrypted cloud backups, gasless transactions via EIP-3009 on Base, Celo, and Gnosis, and network signal scoring for anti-sybil and reputation building. The project aims to provide a robust, accessible, and efficient crypto wallet solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
Built with React 18, TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, and Tailwind CSS. It features a performance-first, mobile-optimized design with a fixed header/footer and content limited to 448px. State management uses IndexedDB for local key storage and TanStack Query for API data caching. It supports multi-chain balance aggregation and merged transaction history with chain badges.

### Backend
Developed using Express.js (TypeScript), Drizzle ORM, and PostgreSQL (via Neon serverless adapter). It provides APIs for multi-chain balance and transaction history. A production-ready EIP-3009 facilitator handles gasless USDC transfers on Base, Celo, and Gnosis. Transaction history is retrieved using the Etherscan v2 unified API with fallback to chain-specific APIs (BaseScan, CeloScan, GnosisScan). All USDC amounts are handled with BigInt for precision. An admin dashboard is available for backfill operations, cache management, database statistics, and API health checks. A `resolveChain()` helper function ensures consistent viem chain resolution.

### Cryptographic Architecture
Wallet generation uses `viem` for secp256k1 private key creation. Private keys are encrypted with WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB, protected by a user-defined password. EIP-712 typed data signing is used for gasless transfers, compatible with USDC's EIP-3009, handling domain differences across networks.

**WebAuthn Passkey Support**: The wallet supports WebAuthn passkeys for biometric unlock (Face ID, fingerprint). Architecture uses a Data Encryption Key (DEK) pattern with PRF extension for secure key derivation:
- DEK encrypts the private key (AES-GCM)
- DEK is wrapped twice: (1) by passkey PRF-derived key, (2) by password-derived key (PBKDF2)
- PRF (Pseudo-Random Function) extension: wrapping key derived inside authenticator, never stored
- HKDF with domain separation: salt includes `nanoPay:{rpId}:{credentialId}` for cross-context isolation
- On unlock: prefer passkey unwrap, fall back to password
- Recovery code/password remains canonical backup for new device onboarding
- Stored data: credentialId, rpId, prfSalt (input), wrappedDek (output encrypted with PRF-derived key)
- Platform authenticator required (UV=required, residentKey=required)
- PRF extension required for enrollment; unsupported platforms fall back to password-only
- Automatic migration: legacy insecure passkey data purged on first check, re-enrollment required
- Passkey enrollment available in Settings > Security after wallet is unlocked

### Data Storage
A PostgreSQL database with Drizzle ORM is used for intelligent caching. Tables store user data, wallets, authorizations, and cached blockchain data (balances, transactions, balance history, MaxFlow scores, exchange rates). USDC amounts are standardized to micro-USDC integers (6 decimals). Balance history uses automatic per-chain and aggregated snapshots.

### Network Configuration
The application supports Base (chainId: 8453), Celo (chainId: 42220), and Gnosis (chainId: 100). Users can switch networks via the Settings page. Full gasless support is available for all three chains:
- **Base**: Native USDC (Circle), EIP-3009 domain name "USD Coin"
- **Celo**: Native USDC (Circle), EIP-3009 domain name "USDC"
- **Gnosis**: USDC.e (Circle Bridged USDC Standard), EIP-3009 domain name "USD Coin", address 0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0

Note: Gnosis USDC.e follows Circle's Bridged USDC Standard (identical to FiatTokenV2), which includes full EIP-3009 `transferWithAuthorization()` support. This is different from legacy bridged tokens.

### PWA Features
Designed as an offline-first PWA with a service worker for asset caching, IndexedDB for local data, and a manifest file. Includes mobile optimizations like viewport configuration, Apple mobile web app meta tags, safe area padding, and a touch-optimized UI.

### UI/UX Decisions
Features a unified fixed header and bottom navigation. The header displays branding and QR/Scan icons. Bottom navigation provides access to Signal, Wallet, and Settings.

**Trust Hub (Signal Page)**: The Signal page serves as a Trust Hub with tabbed interface for sybil-resistant identity systems:
- **MaxFlow Tab**: Network signal scoring via max-flow computation, vouch submission with EIP-712 signing
- **Circles Tab**: Full Circles Protocol integration on Gnosis Chain - avatar registration, CRC minting, trust/untrust management, and CRC transfers. All operations use the x402 facilitator for xDAI gas drips.
- **GoodDollar Tab**: Face verification integration for UBI claiming. Uses SDK-compatible flow with signed messages (login + identifier), lz-string compression, and redirect to GoodID (https://goodid.gooddollar.org). Identity and claim status checked on Celo chain.
- Smart default tab selection based on user data (Circles avatar, MaxFlow score, or GoodDollar identity)

**Circles Facilitator & Registration**: The x402 facilitator (0x2c696E742e07d92D9ae574865267C54B13930363) is registered as a Circles V2 **Organization** named "nanoPay" (tx: 0x49dcc114f788948e1598260928c88e3755a239c50ddf1f107321e5f74a5880da). Organizations can receive CRC, provide xDAI gas drips, and be trusted by the community, but cannot mint personal CRC tokens.

**Circles Registration Flow**:
- Community inviter (0xbf3E8C2f1191dC6e3cdbA3aD05626A5EEeF60731) is a registered Human who can invite new users
- After Nov 2024, inviting burns 96 CRC from the inviter as spam prevention
- `/api/circles/inviter-status` endpoint shows CRC balance progress toward 96 CRC threshold
- Users can also use their own inviter (a Circles Human friend) via `/api/circles/validate-inviter`
- Validation checks: user not already registered, inviter is a registered Human, inviter trusts the user
- The facilitator Organization provides gas drips but cannot invite (only Humans can invite)

Multi-chain UX includes aggregated USDC balance display, chain badges for transactions, auto-selection of the chain with the highest USDC balance on the Send page, and network selection on the Receive page.

**Pool (Prize-Linked Savings)**: Weekly prize pool where users opt-in a percentage (0-100%) of their Aave savings yield on Celo. Tickets are earned based on yield contributed plus 10% of referrals' contributions. Features include:
- `/pool` page with opt-in slider, pool stats, countdown to weekly draw, and past winners
- Referral system: 8-character codes derived from wallet address, 10% bonus tickets from referrals' yield
- Database tables: `pool_settings` (user opt-in %, facilitator approval status), `pool_draws` (weekly draws), `pool_contributions` (per-draw tickets), `referrals` (referrer-referee links with unique constraint)
- Admin endpoint `/api/admin/pool/draw` for executing weekly draws with on-chain yield collection and prize transfer
- Dry run mode supported via `dryRun: true` parameter

**Pool Architecture - Estimation-Only Model (Celo-Only)**:
- All values displayed are **estimates** until the weekly draw when final tickets are calculated
- Tickets computed at draw time: `live aUSDC balance × APY/52 × opt-in%` + referral bonuses
- No mid-week transfers; all calculations are from live on-chain balances
- Celo aUSDC address: 0xFF8309b9e99bfd2D4021bc71a362aBD93dBd4785 (from shared/networks.ts)
- **Sponsored Pool**: Donations increase prize pool but do NOT add tickets. Stored separately in `sponsoredPool` column.

**Facilitator Authorization Flow**:
- Users must authorize the facilitator to collect their weekly yield before participating in draws
- Authorization is a one-time ERC-20 `approve()` transaction for limited amount ($10,000 - covers ~1 year of yield)
- UI shows authorization status in Pool page with "Authorize Collection" button for unapproved users
- Database tracks: `facilitatorApproved` (boolean), `approvalTxHash` (tx hash of approval)
- API endpoints:
  - `GET /api/pool/facilitator` - Returns facilitator address and aUSDC address
  - `GET /api/pool/allowance/:address` - Checks on-chain allowance for facilitator
  - `POST /api/pool/record-approval` - Records approval after user signs tx

**Weekly Draw Execution Flow**:
1. Admin triggers draw via `/api/admin/pool/draw` with `weekNumber` and `year`
2. System fetches all opted-in users with facilitator approval
3. For each participant: reads live aUSDC balance, calculates weekly yield, checks allowance
4. Referral bonuses calculated (10% of referee's yield → referrer's tickets)
5. Weighted random selection picks winner
6. Facilitator executes `transferFrom` for each participant's yield portion
7. Total collected yield + sponsored pool transferred to winner's wallet
8. Draw marked complete with winner address, tx hashes, and final totals

## External Dependencies

### Blockchain Infrastructure
- **Viem**: Ethereum library for wallet operations.
- **Network RPC Providers**: `https://mainnet.base.org` for Base, `https://forno.celo.org` for Celo, `https://rpc.gnosischain.com` for Gnosis.
- **USDC Smart Contracts**: Native USDC (Base, Celo) and USDC.e (Gnosis) implementations supporting EIP-3009.

### External APIs
- **MaxFlow API**: For network signal scoring.
- **fawazahmed0 Currency API**: For exchange rates.
- **Etherscan v2 unified API**: Primary source for transaction history across EVM chains, with fallback to chain-specific APIs.

### UI Component Libraries
- **Radix UI**: Headless component primitives.
- **Shadcn UI**: Pre-styled components built on Radix UI.
- **Lucide React**: Icon library.
- **QRCode**: Canvas-based QR code generation.

### Development Tools
- **Drizzle Kit**: Database migration and schema management.
- **Neon Serverless**: PostgreSQL adapter.