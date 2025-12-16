# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) designed for managing cryptocurrency wallets, with a primary focus on gasless USDC transfers. It aims to provide a performant, accessible, and offline-first solution for low-bandwidth environments. Key capabilities include secure local key storage with encrypted cloud backups, gasless transactions on Base, Celo, and Gnosis via EIP-3009, and network signal scoring for anti-sybil and reputation building. The project's ambition is to deliver a robust and efficient crypto wallet.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
- **2025-12-16**: Improved fuzzy face matching - Lowered similarity threshold from 0.88 to 0.75, added embedding normalization (unit vectors) before cosine comparison for more accurate matching. Added detailed logging to track similarity scores for debugging. Note: Legacy face verification records without embeddings can only use exact hash matching; new verifications will have full fuzzy matching support.
- **2025-12-16**: MaxFlow page restructured into MaxFlow and GoodDollar tabs. MaxFlow tab contains: score display, Face Check (non-GD users), vouch section, XP claim, USDC redemption (100 XP = 1 USDC), SENADOR exchange. GoodDollar tab contains: identity verification, G$ balance, claim G$ with countdown, buy XP with G$ (10 G$ = 1 XP). Circles page removed (link added to FAQs instead). Tab state persists via localStorage with URL query param support (`?tab=maxflow` or `?tab=gooddollar`).
- **2025-12-16**: Face Check liveness verification - Added client-side face verification using MediaPipe Face Landmarker (CDN-loaded). Collapsible card in MaxFlow page with blink and head turn challenges. Face embeddings hashed (SHA-256) for privacy and stored in `face_verifications` table. Awards 120 XP on successful verification. Duplicate face detection feeds into sybil scoring (+3 points for same face on different devices). API endpoints: `GET /api/face-verification/:address`, `POST /api/face-verification/submit`.
- **2025-12-16**: Sybil detection exemptions - Added two automatic exemptions to reduce false positives: (1) GoodDollar verified wallets are never flagged (proven humans via face verification), (2) Small clusters (≤3 wallets per device) are exempt (allows for lost wallet recovery and experimentation). Public API `/api/public/v1/flagged-wallets` now only returns actually flagged wallets (not exempt ones), with `clusterSize` field and `exemptionRules` documentation. Admin panel shows both flagged and exempt wallets with color-coded status.
- **2025-12-16**: Public Sybil API - Added `/api/public/v1/flagged-wallets` endpoint for MaxFlow integration. Returns all flagged wallets with scores, signals, and match counts. Features optional API key auth (SYBIL_API_KEY env var), rate limiting (60 req/min), and 5-minute caching. Threshold set to ≥5 points (requires stronger signal combinations like IP+Token+UA).
- **2025-12-13**: GoodDollar claim fix - Fixed checkEntitlement contract calls (using `args: [address]` for address-parameter overload instead of `account:`), fixed lastClaimed timestamp interpretation (converts Unix timestamp to day number using periodStart), and updated BUILD_VERSION for cache invalidation.
- **2025-12-09**: Gas scanner implementation - tracks facilitator gas costs across all chains (Base, Celo, Gnosis, Arbitrum) using Etherscan v2 API. Fetches native token prices from CoinGecko, converts to USD, and displays "Gas Sponsored" metric on landing page. Runs hourly via scheduler with incremental block tracking per chain.
- **2025-12-09**: Brutalist UI design refresh - cream background (#F4F4F1), 0px border radius, hard offset shadows (4px 4px black), IBM Plex Mono for labels. Created responsive desktop landing page with hero section, phone mockup, feature highlights. Simplified BalanceCard with cleaner styling and chain breakdown. Increased touch targets in BottomNav (icons to h-5).
- **2025-12-09**: Performance optimizations via code splitting - lazy-loaded Admin, Dashboard, HowItWorks, Faqs, Context pages using React.lazy(). QRScanner component also lazy-loaded in Send, MaxFlow, and Claim pages to reduce initial bundle size for regular wallet users.
- **2025-12-09**: Added session persistence - wallet stays unlocked across page refreshes. DEK stored in sessionStorage with configurable auto-lock timer (5/15/30/60 min or tab close). UX/security trade-off documented: sessionStorage cleared on tab close, idle timeout limits exposure, device lock is primary security layer.
- **2025-12-08**: Fixed service worker caching issue causing blank pages for returning users. Service worker now fetches version from `/api/version` endpoint to dynamically name caches, uses network-first strategy for JS/CSS assets, and prompts users to reload when updates are available.
- **2025-12-08**: Added Arbitrum network support (chainId: 42161) with native USDC and Aave V3 integration. Includes balance fetching, transaction history, and gasless transfers via EIP-3009.
- **2025-12-08**: Fixed GoodDollar claim recording bug - corrected apiRequest function calls to use proper (method, url, data) signature instead of (url, options).

## Deployment Requirements
**Important**: Before each deployment, update `BUILD_VERSION` in `server/routes.ts` (line ~142) to a new timestamp. This triggers cache invalidation for returning users, ensuring they receive fresh assets instead of stale cached bundles.

## System Architecture

### Frontend
The frontend is built with React 18, TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, and Tailwind CSS. It features a mobile-optimized PWA design with a fixed header/footer and content limited to 448px. State management utilizes IndexedDB for local key storage and TanStack Query for API data caching. It supports multi-chain balance aggregation, merged transaction history, and currency auto-detection via IP geolocation or browser locale.

### Backend
The backend uses Express.js (TypeScript), Drizzle ORM, and PostgreSQL (via Neon serverless adapter). It provides APIs for multi-chain balance and transaction history, and a production-ready EIP-3009 facilitator for gasless USDC transfers on Base, Celo, and Gnosis. Transaction history is retrieved using Etherscan v2 unified API with chain-specific fallbacks. All USDC amounts are handled with BigInt for precision.

### Cryptographic Architecture
Wallet generation uses `viem` for secp256k1 private keys, encrypted with WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB. EIP-712 typed data signing enables gasless transfers. Session persistence stores the DEK in sessionStorage (UX/security trade-off: survives page refreshes until tab close or idle timeout; XSS risk accepted, device lock is primary protection). WebAuthn passkey support is integrated for biometric unlock, using a Data Encryption Key (DEK) pattern with PRF extension for secure key derivation. Auto-lock timer (configurable: 5/15/30/60 min or tab-close) clears session on inactivity.

### Data Storage
A PostgreSQL database with Drizzle ORM is used for intelligent caching of user data, wallets, authorizations, and blockchain data (balances, transactions, MaxFlow scores, exchange rates). USDC amounts are standardized to micro-USDC integers.

### Network Configuration
The application supports Base (chainId: 8453), Celo (chainId: 42220), Gnosis (chainId: 100), and Arbitrum (chainId: 42161), with full gasless support for native USDC and USDC.e where applicable via EIP-3009.

### PWA Features
Designed as an offline-first PWA with a service worker for asset caching, IndexedDB for local data, and a manifest file. Includes mobile optimizations like viewport configuration and Apple mobile web app meta tags.

### UI/UX Decisions
The UI features a unified fixed header and bottom navigation with sections for Signal, Wallet, and Settings.
- **Trust Hub (MaxFlow Page)**: Two-tab interface: MaxFlow tab (score display, Face Check for non-GD users, vouch section, XP claim, USDC/SENADOR redemption) and GoodDollar tab (identity verification, G$ claiming, G$ → XP exchange). Circles Protocol support deprecated (link in FAQs to circles.garden).
- **Multi-chain UX**: Aggregated USDC balance, chain badges for transactions, and auto-selection of networks.
- **Pool (Prize-Linked Savings)**: A feature for weekly prize pools where users can opt-in a percentage of their Aave savings yield on Celo. It includes a referral system, facilitator authorization flow, and an automated weekly draw execution with a scheduler. The architecture tracks `netDeposits` to accurately calculate interest, and features a sponsored pool for donations.

## External Dependencies

### Blockchain Infrastructure
- **Viem**: Ethereum library for wallet operations.
- **Network RPC Providers**: `https://mainnet.base.org`, `https://forno.celo.org`, `https://rpc.gnosischain.com`, `https://arb1.arbitrum.io/rpc`.
- **USDC Smart Contracts**: Native USDC (Base, Celo) and USDC.e (Gnosis) implementations.

### External APIs
- **MaxFlow API**: For network signal scoring, with DNS resilience and fallback domains.
- **fawazahmed0 Currency API**: For exchange rates.
- **Etherscan v2 unified API**: Primary source for transaction history.

### UI Component Libraries
- **Radix UI**: Headless component primitives.
- **Shadcn UI**: Pre-styled components.
- **Lucide React**: Icon library.
- **QRCode**: Canvas-based QR code generation.

### Development Tools
- **Drizzle Kit**: Database migration and schema management.
- **Neon Serverless**: PostgreSQL adapter.