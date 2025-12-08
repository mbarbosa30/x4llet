# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) designed for managing cryptocurrency wallets, with a primary focus on gasless USDC transfers. It aims to provide a performant, accessible, and offline-first solution for low-bandwidth environments. Key capabilities include secure local key storage with encrypted cloud backups, gasless transactions on Base, Celo, and Gnosis via EIP-3009, and network signal scoring for anti-sybil and reputation building. The project's ambition is to deliver a robust and efficient crypto wallet.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
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
Wallet generation uses `viem` for secp256k1 private keys, encrypted with WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB. EIP-712 typed data signing enables gasless transfers. A session security model ensures passwords are never stored persistently and are cleared on page unload. WebAuthn passkey support is integrated for biometric unlock, using a Data Encryption Key (DEK) pattern with PRF extension for secure key derivation.

### Data Storage
A PostgreSQL database with Drizzle ORM is used for intelligent caching of user data, wallets, authorizations, and blockchain data (balances, transactions, MaxFlow scores, exchange rates). USDC amounts are standardized to micro-USDC integers.

### Network Configuration
The application supports Base (chainId: 8453), Celo (chainId: 42220), Gnosis (chainId: 100), and Arbitrum (chainId: 42161), with full gasless support for native USDC and USDC.e where applicable via EIP-3009.

### PWA Features
Designed as an offline-first PWA with a service worker for asset caching, IndexedDB for local data, and a manifest file. Includes mobile optimizations like viewport configuration and Apple mobile web app meta tags.

### UI/UX Decisions
The UI features a unified fixed header and bottom navigation with sections for Signal, Wallet, and Settings.
- **Trust Hub (Signal Page)**: A tabbed interface for sybil-resistant identity systems, including MaxFlow scoring, Circles Protocol integration (avatar registration, CRC minting, trust management, xDAI gas drips via facilitator), and GoodDollar face verification for UBI claiming.
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