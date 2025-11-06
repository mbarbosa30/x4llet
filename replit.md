# offPay - Lightweight Crypto Wallet PWA

## Overview
offPay is a minimalist Progressive Web App (PWA) for managing cryptocurrency wallets with gasless USDC transfers. It prioritizes performance, accessibility, and offline-first functionality for users in low-bandwidth environments. Key capabilities include wallet creation with local key storage, encrypted cloud backups, and gasless transactions using EIP-3009 authorization on Base and Celo networks. The project aims to provide a robust and accessible crypto wallet solution with a focus on usability and efficiency.

## Recent Changes (November 6, 2025)
- **Fixed navigation flickering**: Moved header and bottom navigation to App.tsx layout level to eliminate flickering during page transitions. Header and BottomNav are now rendered once at the app level for all protected routes, preventing unmount/remount cycles that caused visual disruption.
- **Dark theme contrast improvement**: Adjusted primary blue color in dark mode from HSL(214 95% 36%) to HSL(214 90% 50%) for significantly better contrast against the dark background (7% lightness), improving readability and accessibility.
- **Unified header and navigation**: Implemented fixed header and bottom navigation across all pages. Top header shows "offPay" branding, MaxFlow score badge, refresh and scan buttons consistently on Home, Signal, and Settings pages. Fixed positioning with proper z-index ensures header stays visible while scrolling. Bottom navigation bar provides mobile-first navigation with Signal (left), Wallet (middle), and Settings (right), including safe-area padding for devices with notches.
- **Improved header icons**: Separated QR code functionality into two distinct actions - QR icon now shows your receive QR code, while new scan icon (ScanLine) opens the scanner to scan payment requests. This makes the UI more intuitive and provides quick access to receiving funds.
- **Signal page content**: Simplified zero-state messaging to be clearer and more impactful. Added emphasis on the dilution effect - "who you vouch for affects your own score" - to help users understand the economic cost of indiscriminate vouching.
- **MaxFlow score caching**: Implemented intelligent database caching for MaxFlow scores with 5-minute TTL in `cached_maxflow_scores` table. Cache-first strategy reduces response time by 82-84% (from ~1400ms to ~230ms) for cached requests, improves offline functionality, and reduces load on MaxFlow API servers.
- **MaxFlow API proxy**: Implemented backend proxy routes for all MaxFlow API calls to resolve CORS issues. Frontend now calls `/api/maxflow/*` which proxies to `https://maxflow.one/api/*`. This enables vouching functionality to work properly in browsers.
- **Settings version refresh**: Made version number clickable in Settings page - clicking triggers hard refresh with cache-busting query parameter to load latest deployed version
- **Landing page messaging**: Updated bullet points to explicitly mention local key storage ("Keys stored locally, encrypted on your device"), x402 protocol ("Gasless transfers powered by x402"), and max flow computation ("Build network signal through max flow computation")
- **Reputation → Signal rename**: Renamed "Reputation" page to "Signal" to accurately reflect MaxFlow's flow-driven network health computation (not a trust score or community ranking)
- **Signal page description**: Updated from "community endorsements" to "MaxFlow measures your trust network health through flow-driven computation"
- **Theme toggle**: Added light/dark mode toggle in Settings page with localStorage persistence

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend uses React 18 with TypeScript, Vite, Wouter for routing, TanStack Query for server state, Shadcn UI (built on Radix UI) for components, and Tailwind CSS for styling. It follows a performance-first, mobile-optimized design with a fixed header/footer and scrollable content within a max-width of 448px. State management utilizes IndexedDB for local-first key storage and TanStack Query for API data caching.

### Backend Architecture
The backend is built with Express.js (TypeScript), Drizzle ORM, and PostgreSQL (via Neon serverless adapter). It provides APIs for balance and transaction history, and crucially, implements a production-ready EIP-3009 facilitator for gasless USDC transfers (both online and offline). Transaction history is fetched using the Etherscan v2 unified API, supporting 60+ EVM chains. All USDC amount conversions use BigInt for precision. The facilitator pattern enables relaying `transferWithAuthorization` calls, with the facilitator covering gas fees.

### Cryptographic Architecture
Wallet generation uses `viem` to create secp256k1 private keys. Private keys are encrypted using WebCrypto API (AES-GCM with PBKDF2) and stored in IndexedDB, protected by a user-chosen password (unrecoverable). EIP-712 typed data signing is used for gasless transfers, compatible with USDC's EIP-3009. The application correctly handles EIP-712 domain differences for "USDC" vs. "USD Coin" across Base and Celo networks.

### Data Storage
A PostgreSQL database with Drizzle ORM is used for intelligent caching. Tables include `users`, `wallets`, `authorizations`, `cached_balances` (30s TTL), `cached_transactions` (permanent), `cached_maxflow_scores` (5min TTL), and `exchange_rates` (5min TTL). This caching strategy significantly reduces blockchain RPC calls and external API requests, improving performance and enabling offline balance display.

### Network Configuration
The application supports Base (chainId: 8453) and Celo (chainId: 42220) networks, defaulting to Celo. Users can switch networks in settings.

### PWA Features
The application is designed as an offline-first PWA with a service worker for asset caching (planned), IndexedDB for local data, and a manifest file. It includes mobile optimizations such as viewport configuration, Apple mobile web app meta tags, safe area padding, and touch-optimized UI.

## External Dependencies

### Blockchain Infrastructure
- **Viem**: Ethereum library for wallet operations, account derivation, and transaction signing.
- **Network RPC Providers**: `https://mainnet.base.org` for Base, `https://forno.celo.org` for Celo.
- **USDC Smart Contracts**: Relies on native USDC implementations supporting EIP-3009.

### UI Component Libraries
- **Radix UI**: Headless component primitives for accessible UI.
- **Shadcn UI**: Pre-styled components built on Radix UI.
- **Lucide React**: Icon library.
- **QRCode**: Canvas-based QR code generation.

### Development Tools
- **Drizzle Kit**: Database migration and schema management.
- **Neon Serverless**: PostgreSQL adapter.
- **date-fns**: Lightweight date formatting.
- **idb-keyval**: Promise-based IndexedDB wrapper.

### Build & Development
- **Vite**: Build tool for HMR and optimized builds.
- **Tailwind CSS**: Utility-first CSS framework.
- **TypeScript**: Strict typing across the codebase.