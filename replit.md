# nanoPay - Lightweight Crypto Wallet PWA

## Overview
nanoPay is a minimalist Progressive Web App (PWA) for managing cryptocurrency wallets with gasless USDC transfers. It prioritizes performance, accessibility, and offline-first functionality for users in low-bandwidth environments. Key capabilities include wallet creation with local key storage, encrypted cloud backups, and gasless transactions using EIP-3009 authorization on Base and Celo networks. The project aims to provide a robust and accessible crypto wallet solution with a focus on usability and efficiency.

## Recent Changes (November 7, 2025)
- **Production Migration Tools**: Created comprehensive migration tooling for converting USDC amounts from 2-decimal string format to micro-USDC integers (6 decimals). Added granular admin controls: "Clear Cached Balances" and "Clear Balance History" buttons in admin dashboard with confirmation dialogs. Implemented SQL migration script (`migrations/001_convert_amounts_to_micro_usdc.sql`) with pre/post validation queries, automatic backup, precision enforcement (NUMERIC→BIGINT→TEXT), and rollback procedures. Created operator runbook (`migrations/MIGRATION_RUNBOOK.md`) documenting step-by-step production migration with checklists, validation criteria, troubleshooting guide, and success criteria. Migration strategy: SQL migration for `cached_transactions` (permanent data), admin dashboard clearing for `cached_balances` and `balance_history` (derivative data that auto-regenerates).
- **USDC Precision Standardization**: Standardized all USDC amount storage to micro-USDC integers throughout the system. All amounts stored as 6-decimal blockchain format (e.g., "1000000" = 1 USDC, "10000" = 0.01 USDC). Frontend `formatAmount()` helper divides by 1e6 for display only. Balance history reconstruction and exchange rate calculations updated to handle micro-USDC format. This ensures full precision for financial calculations and eliminates floating-point drift.
- **Admin Dashboard Enhancements**: Implemented comprehensive admin dashboard at `/admin` route with HTTP Basic Auth security. Features include: one-time backfill operations for balance history reconstruction from cached transactions, 90-day historical exchange rate backfill from Frankfurter API, granular cache clearing (all caches, balances only, or history only), database statistics, API health checks (MaxFlow, Frankfurter, Base/Celo RPC), recent transaction activity, and data pruning tools. All admin endpoints protected by `adminAuthMiddleware` requiring ADMIN_USERNAME and ADMIN_PASSWORD environment secrets. Dashboard automatically refreshes stats after destructive operations and clears password from memory after login.
- **Balance History & Exchange Rates**: Created `balance_history` table with automatic snapshots on each balance check, and modified `exchange_rates` schema with (currency, date) unique constraint for daily accumulation. Balance reconstruction logic works backwards from current on-chain balance, replaying transactions in reverse to calculate historical snapshots. Exchange rate backfill fetches 90 days of historical data from Frankfurter API for available currencies (EUR, GBP, JPY, BRL, MXN). Exchange rate insertion now uses `onConflictDoUpdate` to surface errors instead of silent failures.

## Recent Changes (November 6, 2025)
- **Removed timestamp from MaxFlow vouching**: Updated EIP-712 signature to use simplified 4-field endorsement (endorser, endorsee, epoch, nonce) instead of 5 fields, matching the latest MaxFlow API changes. This eliminates clock synchronization issues while maintaining security through nonce + epoch replay protection.
- **App renamed from offPay to nanoPay**: Updated all references across UI components (AppHeader, Landing, Signal, InstallPrompt), HTML metadata, PWA manifest, service worker cache names, and documentation (replit.md, design_guidelines.md, DEPLOYMENT.md). The new name better reflects the lightweight, minimalist nature of the wallet while maintaining clarity about its payment functionality.
- **Fixed MaxFlow vouch API integration**: Corrected vouching implementation to match official MaxFlow API specification. Changed EIP-712 field from `endorsed` to `endorsee`, restructured request body to include `sig` and `chainId` inside endorsement object (not outside), and convert BigInt values (epoch, nonce, timestamp) to strings when sending to API. This fixes the "Failed to submit vouch" error.
- **Fixed MaxFlow epoch field name bug**: Corrected MaxFlowEpoch interface to use `epochId` (not `id`) to match actual API response from `GET /api/epoch/current`. Updated Signal.tsx to use `epoch.epochId` when fetching nonce and creating endorsement. This fixes the "failed to fetch nonce" error that prevented vouching from working.
- **Removed redundant Settings options**: Removed "Export Backup" and "Restore from Code" buttons from Settings page as wallet restoration should only happen during initial setup, not while a wallet is active.
- **Fixed MaxFlow vouch functionality**: Corrected TypeScript interfaces to match actual MaxFlow API responses. Updated MaxFlowScore to use vouchCount and details fields (flowComponent, redundancyComponent, vouchQualityFactor) instead of incorrect metrics structure. Updated Signal page to display score breakdown with correct API fields.
- **Landing page messaging update**: Updated subtitle from "Your lightweight crypto wallet" to "Crypto wallet with built-in network strength" to emphasize the MaxFlow integration. Added explanatory paragraph after CTAs that describes the dual value proposition: USDC payments + network signal scoring for anti-sybil and reputation building, designed for low-bandwidth/offline environments.
- **Fixed bottom navigation scrolling issues**: Refactored BottomNav to use a stable fixed height (4rem content + safe-area padding) instead of dynamic sizing. Buttons now use min-h-12 instead of h-full to prevent resizing during scroll. All pages (Home, Signal, Settings) now use consistent bottom padding calc(4rem + env(safe-area-inset-bottom)). This eliminates the sizing/styling changes that occurred during scroll on mobile browsers.
- **Fixed navigation flickering**: Moved header and bottom navigation to App.tsx layout level to eliminate flickering during page transitions. Header and BottomNav are now rendered once at the app level for all protected routes, preventing unmount/remount cycles that caused visual disruption.
- **Dark theme contrast improvement**: Adjusted primary blue color in dark mode from HSL(214 95% 36%) to HSL(214 90% 50%) for significantly better contrast against the dark background (7% lightness), improving readability and accessibility.
- **Unified header and navigation**: Implemented fixed header and bottom navigation across all pages. Top header shows "nanoPay" branding, MaxFlow score badge, refresh and scan buttons consistently on Home, Signal, and Settings pages. Fixed positioning with proper z-index ensures header stays visible while scrolling. Bottom navigation bar provides mobile-first navigation with Signal (left), Wallet (middle), and Settings (right), including safe-area padding for devices with notches.
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