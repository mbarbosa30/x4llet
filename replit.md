# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) for managing cryptocurrency wallets, focusing on gasless USDC transfers. It aims to be performant, accessible, and offline-first for low-bandwidth environments. Key features include secure local key storage with encrypted cloud backups, gasless transactions on Base, Celo, Gnosis, and Arbitrum via EIP-3009, and network signal scoring for anti-sybil measures and reputation building. The project's ambition is to deliver a robust and efficient crypto wallet.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
Built with React 18, TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, and Tailwind CSS. It features a mobile-optimized PWA design, utilizing IndexedDB for local key storage and TanStack Query for API data caching. It supports multi-chain balance aggregation, merged transaction history, and currency auto-detection. The UI uses a Brutalist design refresh with a cream background, 0px border radius, and hard offset shadows.

### Backend
Uses Express.js (TypeScript), Drizzle ORM, and PostgreSQL (via Neon serverless adapter). It provides APIs for multi-chain balance and transaction history, and a production-ready EIP-3009 facilitator for gasless USDC transfers across supported networks. Transaction history is primarily sourced from Etherscan v2 API. All USDC amounts are handled with BigInt for precision.

### Cryptographic Architecture
Wallet generation uses `viem` for secp256k1 private keys, encrypted with WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB. EIP-712 typed data signing enables gasless transfers. Session persistence stores the DEK in sessionStorage, with configurable auto-lock timers. WebAuthn passkey support is integrated for biometric unlock using a Data Encryption Key (DEK) pattern.

### Data Storage
A PostgreSQL database with Drizzle ORM caches user data, wallets, authorizations, and blockchain data (balances, transactions, MaxFlow scores, exchange rates). USDC amounts are standardized to micro-USDC integers.

### Network Configuration
Supports Base (chainId: 8453), Celo (chainId: 42220), Gnosis (chainId: 100), and Arbitrum (chainId: 42161), with full gasless support for native USDC and USDC.e where applicable via EIP-3009.

### PWA Features
Designed as an offline-first PWA with a service worker for asset caching, IndexedDB for local data, and a manifest file. Includes mobile optimizations and dynamic cache naming for versioning.

### UI/UX Decisions
The UI features a unified fixed header and bottom navigation. The Trust Hub (MaxFlow Page) includes a two-tab interface for MaxFlow (score, Face Check, vouch, XP/USDC/SENADOR redemption) and GoodDollar (identity verification, G$ claiming, G$ → XP exchange). Multi-chain UX includes aggregated USDC balances, chain badges, and network auto-selection. A Pool (Prize-Linked Savings) feature allows users to opt-in a percentage of their Aave savings yield for weekly prize pools. Face verification uses face-api.js for neural network embeddings and MediaPipe for liveness detection.

### Pool Scheduler
The pool prize draw scheduler runs at Sunday 00:00 UTC and executes draws for the **previous week** (the week that just ended), not the current week. This ensures all yield contributions for the completed week are properly counted. Tickets are based on YIELD only (not principal) - calculated as `interest = totalBalance - netDeposits`. After each draw, yield snapshots are updated so the next week's calculation starts fresh. Admin can manually trigger draws for any week via `/api/admin/pool/draw` with `weekNumber` and `year` parameters.

## External Dependencies

### Blockchain Infrastructure
- **Viem**: Ethereum library for wallet operations.
- **Network RPC Providers**: `https://mainnet.base.org`, `https://forno.celo.org`, `https://rpc.gnosischain.com`, `https://arb1.arbitrum.io/rpc`.
- **USDC Smart Contracts**: Native USDC (Base, Celo) and USDC.e (Gnosis) implementations.

### External APIs
- **MaxFlow API**: For network signal scoring.
- **fawazahmed0 Currency API**: For exchange rates.
- **Etherscan v2 unified API**: Primary source for transaction history.
- **CoinGecko**: For native token prices.

### UI Component Libraries
- **Radix UI**: Headless component primitives.
- **Shadcn UI**: Pre-styled components.
- **Lucide React**: Icon library.
- **QRCode**: Canvas-based QR code generation.
- **face-api.js**: For face recognition and liveness detection.
- **MediaPipe Face Landmarker**: For liveness detection.

### Development Tools
- **Drizzle Kit**: Database migration and schema management.
- **Neon Serverless**: PostgreSQL adapter.