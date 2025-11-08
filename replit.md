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
A PostgreSQL database managed with Drizzle ORM is used for intelligent caching. Tables include `users`, `wallets`, `authorizations`, `cached_balances`, `cached_transactions`, `cached_maxflow_scores`, and `exchange_rates`. This caching strategy reduces blockchain RPC calls and external API requests, enhancing performance and enabling offline balance display. USDC amounts are standardized to micro-USDC integers (6 decimals) for precision. Balance history is generated through automatic snapshots and historical exchange rates are fetched and stored.

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
- **Etherscan v2 unified API**: For fetching transaction history across EVM chains.

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