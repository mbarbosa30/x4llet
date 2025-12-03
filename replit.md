# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) for managing cryptocurrency wallets, focusing on gasless USDC transfers. It prioritizes performance, accessibility, and offline functionality, especially in low-bandwidth environments. Key features include local key storage with encrypted cloud backups, gasless transactions via EIP-3009 on Base and Celo, and network signal scoring for anti-sybil and reputation building. The project aims to provide a robust, accessible, and efficient crypto wallet solution.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
Built with React 18, TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, and Tailwind CSS. It features a performance-first, mobile-optimized design with a fixed header/footer and content limited to 448px. State management uses IndexedDB for local key storage and TanStack Query for API data caching. It supports multi-chain balance aggregation and merged transaction history with chain badges.

### Backend
Developed using Express.js (TypeScript), Drizzle ORM, and PostgreSQL (via Neon serverless adapter). It provides APIs for multi-chain balance and transaction history. A production-ready EIP-3009 facilitator handles gasless USDC transfers on Base and Celo. Transaction history is retrieved using the Etherscan v2 unified API. All USDC amounts are handled with BigInt for precision. An admin dashboard is available for backfill operations, cache management, database statistics, and API health checks. A `resolveChain()` helper function ensures consistent viem chain resolution.

### Cryptographic Architecture
Wallet generation uses `viem` for secp256k1 private key creation. Private keys are encrypted with WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB, protected by a user-defined password. EIP-712 typed data signing is used for gasless transfers, compatible with USDC's EIP-3009, handling domain differences across networks.

### Data Storage
A PostgreSQL database with Drizzle ORM is used for intelligent caching. Tables store user data, wallets, authorizations, and cached blockchain data (balances, transactions, balance history, MaxFlow scores, exchange rates). USDC amounts are standardized to micro-USDC integers (6 decimals). Balance history uses automatic per-chain and aggregated snapshots.

### Network Configuration
The application supports Base (chainId: 8453), Celo (chainId: 42220), and Gnosis (chainId: 100). Users can switch networks via the Settings page. Full support is available for Celo and Base, with partial support for Gnosis (balance display and Aave earn, but no gasless sends/deposits due to USDC.e not implementing EIP-3009 `transferWithAuthorization()`).

### PWA Features
Designed as an offline-first PWA with a service worker for asset caching, IndexedDB for local data, and a manifest file. Includes mobile optimizations like viewport configuration, Apple mobile web app meta tags, safe area padding, and a touch-optimized UI.

### UI/UX Decisions
Features a unified fixed header and bottom navigation. The header displays branding, MaxFlow score, and QR/Scan icons. Bottom navigation provides access to Signal, Wallet, and Settings. The "Reputation" page was renamed to "Signal". Multi-chain UX includes aggregated USDC balance display, chain badges for transactions, auto-selection of the chain with the highest USDC balance on the Send page, and network selection on the Receive page.

## External Dependencies

### Blockchain Infrastructure
- **Viem**: Ethereum library for wallet operations.
- **Network RPC Providers**: `https://mainnet.base.org` for Base, `https://forno.celo.org` for Celo.
- **USDC Smart Contracts**: Native USDC implementations supporting EIP-3009.

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