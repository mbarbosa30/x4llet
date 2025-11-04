# Lightweight Crypto Wallet PWA

## Overview

A minimalist Progressive Web App (PWA) for managing cryptocurrency wallets with gasless USDC transfers. The application prioritizes performance, accessibility, and offline-first functionality, targeting users in low-bandwidth environments. It supports wallet creation with local key storage, encrypted cloud backups, and gasless transactions using EIP-3009 authorization on Base and Celo networks.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript
- Vite for build tooling and development
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management
- Shadcn UI components built on Radix UI primitives
- Tailwind CSS for utility-first styling

**Design Philosophy:**
The frontend follows a performance-first approach optimized for low-bandwidth environments. The design system uses system fonts to avoid external font loading, minimal animations, and a constrained color palette. All screens follow a fixed header + scrollable content + optional fixed footer pattern with a max-width of 448px for one-handed mobile use.

**State Management:**
- Local-first architecture using IndexedDB for wallet key storage
- Session-based password management for wallet unlocking
- TanStack Query for API data caching and synchronization
- User preferences (currency, language, network) stored in IndexedDB

**Routing Structure:**
- `/` - Create wallet (entry point)
- `/unlock` - Unlock existing wallet with password
- `/restore` - Restore wallet from encrypted backup
- `/home` - Main dashboard with balance and transactions
- `/send` - Send USDC with numeric keypad (online and offline modes)
- `/receive` - Receive USDC with QR code and Payment Request generation
- `/settings` - User preferences and wallet management

**Key Components:**
- `AddressDisplay` - Truncated address with copy-to-clipboard
- `BalanceCard` - Primary balance display with fiat conversion
- `NumericKeypad` - Touch-optimized number input for amounts
- `QRCodeDisplay` - Canvas-based QR code generation
- `TransactionList` - Activity feed with send/receive indicators

### Backend Architecture

**Technology Stack:**
- Express.js server with TypeScript
- Drizzle ORM for database interactions
- PostgreSQL via Neon serverless adapter
- Session-based middleware with logging

**API Endpoints:**
- `GET /api/balance/:address?chainId=<chainId>` - Fetch real blockchain USDC balance using viem RPC calls, plus complete on-chain transaction history
- `GET /api/transactions/:address?chainId=<chainId>` - Retrieve complete on-chain transaction history from block explorer APIs (BaseScan/CeloScan)
- `POST /api/relay/transfer-3009` - Relay gasless EIP-3009 transfers (currently mock implementation)
- `POST /api/relay/submit-authorization` - **Production facilitator endpoint** for offline payment completion

**Transaction History:**
The backend fetches complete USDC transaction history from blockchain explorers:
- Base network: BaseScan API (`api.basescan.org`) with ERC20 token transfer endpoint
- Celo network: CeloScan API (`api.celoscan.io`) with ERC20 token transfer endpoint
- Shows all USDC transfers (both sent and received), not just wallet-initiated transactions
- Requires `BASESCAN_API_KEY` and `CELOSCAN_API_KEY` environment secrets

**BigInt Precision Handling:**
All USDC amount conversions use BigInt arithmetic to prevent precision loss with large values:
- USDC uses 6 decimals (1 USDC = 1,000,000 units)
- `formatUsdcAmount()` helper converts raw blockchain values to human-readable strings
- Rounds to nearest cent by adding 5,000 units (0.005 USDC) before division
- Preserves full precision for amounts exceeding JavaScript's MAX_SAFE_INTEGER (9,007,199 USDC)
- TypeScript target set to ES2020 to support BigInt literals

**Facilitator Pattern (X402):**
The backend implements a production-ready EIP-3009 facilitator that enables true offline payments:

1. **Payment Request Generation** (Receiver creates):
   - Receiver generates Payment Request QR containing: `{chainId, token, to, amount, ttl, facilitatorUrl}`
   - Payer scans this QR in offline mode

2. **Offline Authorization Signing** (Payer signs):
   - Payer's device creates EIP-712 `ReceiveWithAuthorization` message with all parameters
   - Signs locally using their private key (works completely offline)
   - Generates Authorization QR containing: `{domain, message, signature}`

3. **Facilitator Submission** (Receiver claims):
   - Receiver scans Authorization QR (can be done offline, submitted when online)
   - Facilitator validates signature, checks expiration and nonce uniqueness
   - Facilitator submits `receiveWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` to USDC contract
   - Facilitator pays gas fees in native tokens (CELO or ETH)
   - Transaction executes atomically - funds transfer only if signature is valid

**Facilitator Wallet:**
- Managed via `FACILITATOR_PRIVATE_KEY` environment secret
- Address: `0x2c696E742e07d92D9ae574865267C54B13930363`
- Funded with ~5 CELO for gas fees on Celo mainnet
- Uses `receiveWithAuthorization` (safer than `transferWithAuthorization` - prevents front-running as only payee can submit)

**Data Storage:**
Currently using in-memory storage with mock data for development. Schema defined with Drizzle ORM includes:
- `users` table with username/password (authentication scaffold)
- TypeScript interfaces for `Wallet`, `Balance`, `Transaction`, and `UserPreferences`

The application is designed to support PostgreSQL through the existing Drizzle configuration, enabling persistent storage when the database is provisioned.

### Cryptographic Architecture

**Wallet Generation:**
- Uses viem's `generatePrivateKey()` to create secp256k1 private keys
- Derives Ethereum addresses using `privateKeyToAccount()`
- User chooses their own password (minimum 8 characters, must include uppercase, lowercase, and number)

**Key Storage:**
- Private keys encrypted using WebCrypto API (AES-GCM with PBKDF2 key derivation)
- Encrypted keys stored in IndexedDB under `wallet_encrypted_key`
- User-chosen password used as encryption key (100,000 PBKDF2 iterations)
- Session-based password caching to avoid repeated password prompts
- **Important**: Password is unrecoverable - no "forgot password" option exists

**Transaction Signing:**
- EIP-712 typed data signing for gasless transfers
- Signature format compatible with USDC's EIP-3009 implementation
- Cryptographically secure nonce generation using `crypto.getRandomValues()`
- Support for offline authorization QR creation (payer signs without network)
- Payment Request / Authorization QR flow for offline payments

### Network Configuration

**Supported Chains:**
- Base (chainId: 8453) - USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Celo (chainId: 42220) - USDC at `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (Circle native USDC)

**Default Network:**
The application defaults to Celo network for all new users and operations. User can switch networks in Settings.

**Network Switching:**
User-selectable network preference stored in IndexedDB. All balance queries and transactions route through the selected network's RPC endpoint and USDC contract address.

### PWA Features

**Offline-First Design:**
- Service worker for asset caching (configured but not yet implemented)
- Request queuing for offline transaction submission
- IndexedDB for local data persistence
- Manifest file with mobile app metadata

**Mobile Optimizations:**
- Viewport configuration prevents zoom on iOS
- Apple mobile web app capable meta tags
- Safe area padding for notched devices
- Touch-optimized UI with minimum 44px touch targets

## External Dependencies

### Blockchain Infrastructure

**Viem** - Ethereum library for wallet operations, account derivation, and transaction signing. Chosen for its TypeScript-first design and tree-shakeable architecture.

**Network RPC Providers:**
- Base: `https://mainnet.base.org`
- Celo: `https://forno.celo.org`

**USDC Smart Contracts:**
The application relies on native USDC implementations supporting EIP-3009 (`transferWithAuthorization`). Bridged or wrapped USDC variants without this interface are not supported.

### UI Component Libraries

**Radix UI** - Headless component primitives providing accessible, unstyled UI components including dialogs, dropdowns, tooltips, and form controls. Enables accessible interactions without prescribing visual design.

**Shadcn UI** - Pre-styled components built on Radix UI, customized for the project's minimal design system. Components live in the codebase for full control over styling.

**Lucide React** - Icon library providing consistent, minimal SVG icons.

**QRCode** - Canvas-based QR code generation library for receive addresses and payment links.

### Development Tools

**Drizzle Kit** - Database migration and schema management. Currently configured for PostgreSQL but not actively managing migrations (using in-memory storage during development).

**Neon Serverless** - PostgreSQL adapter designed for edge and serverless environments, enabling connection pooling and instant cold starts.

**date-fns** - Lightweight date formatting library for transaction timestamps.

**idb-keyval** - Simple IndexedDB wrapper providing Promise-based key-value storage for encrypted wallet keys and preferences.

### Build & Development

**Vite** - Build tool providing instant HMR, optimized production builds, and TypeScript support. Configured with Replit-specific plugins for development banners and error overlays.

**Tailwind CSS** - Utility-first CSS framework with custom design tokens matching the minimal design guidelines.

**TypeScript** - Strict typing across client, server, and shared modules with path aliases for clean imports.