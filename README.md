# nanoPay

A lightweight crypto wallet for gasless USDC transfers. Built for people who need to move money without paying fees, even on slow connections.

![nanoPay](https://nanopay.replit.app/og-image.png)

## The Problem

Sending money across borders shouldn't cost 10% in fees. Traditional remittance services and even most crypto wallets charge transaction fees that eat into the money people are trying to send home. And if you're on a 2G connection? Good luck.

## What nanoPay Does

**Zero gas fees** — We sponsor transaction costs on Base, Celo, Gnosis, and Arbitrum using EIP-3009 meta-transactions. You sign, we pay.

**Works offline** — Generate payment requests and pre-sign transfers without internet. QR codes handle the rest.

**Trust, not just identity** — Our Signal score reflects who vouches for you and who you vouch for. Build reputation through real relationships, not just KYC.

**Earn while you save** — Deposit USDC into Aave directly from the wallet. Your savings generate yield while staying accessible.

## Features

- **Multi-chain USDC** — Aggregated balance across 4 networks
- **Gasless transfers** — EIP-3009 authorizations, zero cost to users
- **PWA** — Install on any phone, no app store needed
- **Face verification** — Liveness detection for sybil resistance
- **XP rewards** — Earn points through vouching and verification
- **Prize pool** — Opt-in savings lottery with weekly draws
- **Offline payments** — Pre-signed transactions via QR codes
- **AI assistant** — Built-in help for crypto questions (1 XP per message)
- **GoodDollar integration** — Claim G$ UBI and exchange for XP

## Supported Networks

| Network | Chain ID | Token | Status |
|---------|----------|-------|--------|
| Base | 8453 | Native USDC | Full gasless support |
| Celo | 42220 | Native USDC | Full gasless support |
| Gnosis | 100 | USDC.e (bridged) | Full gasless support |
| Arbitrum | 42161 | Native USDC | Full gasless support |

## Try It

**Live app**: [nanopay.replit.app](https://nanopay.replit.app)

Create a wallet, receive some USDC on Base/Celo/Gnosis/Arbitrum, and send it to someone. No gas needed.

## Technical Approach

This isn't a scaffold project. It's a production wallet handling real money.

- **Frontend**: React + TypeScript + Vite, optimized for low-bandwidth (272KB gzipped)
- **Backend**: Express + Drizzle ORM + PostgreSQL
- **Crypto**: viem for wallet operations, WebCrypto for local key encryption
- **Auth**: Passkey support via WebAuthn with PRF extension for key derivation
- **Gasless**: EIP-3009 facilitator pattern — users sign typed data, backend submits transactions

The wallet generates keys locally using WebCrypto, encrypts them with a user password (AES-GCM + PBKDF2), and stores them in IndexedDB. Private keys never leave the device unencrypted.

## Development

### Prerequisites
- Node.js 20+
- PostgreSQL database (Neon recommended)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@host/db

# Blockchain (required for gasless transfers)
FACILITATOR_PRIVATE_KEY=0x...     # Wallet that pays gas
ETHERSCAN_API_KEY=your_key        # For transaction history

# External APIs
MAXFLOW_API_KEY=your_key          # Trust network scoring
OPENAI_API_KEY=your_key           # AI chat feature

# Optional
IP_SALT_SECRET=random_string      # Sybil detection salt
```

### Commands

```bash
npm run dev          # Start dev server (frontend + backend)
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio for database
npx tsc --noEmit     # Type check without building
```

## Architecture

```
client/               React frontend (PWA)
├── src/pages/        Route components
├── src/hooks/        Custom hooks (useWallet, useBalance, useXp)
├── src/lib/          Utilities (wallet, maxflow, gooddollar)
└── src/components/   UI components (shadcn-based)

server/               Express backend
├── routes.ts         API endpoints (~9000 lines)
├── storage.ts        Database interface (DatabaseStorage class)
├── db.ts             Drizzle + Neon connection
└── facilitator/      Gasless transaction handlers

shared/               Shared types
└── schema.ts         Drizzle schema + Zod validation
```

## API Endpoints

### Public
| Endpoint | Description |
|----------|-------------|
| `GET /api/balance/:chain/:address` | Get USDC balance for chain |
| `GET /api/transactions/:address` | Get transaction history |
| `GET /api/maxflow/:address` | Get MaxFlow trust score |
| `GET /api/aave/apy/:chainId` | Get current Aave APY |
| `GET /api/exchange-rates` | Get fiat exchange rates |

### Wallet Operations
| Endpoint | Description |
|----------|-------------|
| `POST /api/transfer` | Submit gasless USDC transfer |
| `POST /api/aave/deposit` | Deposit to Aave savings |
| `POST /api/aave/withdraw` | Withdraw from Aave |

### XP System
| Endpoint | Description |
|----------|-------------|
| `GET /api/xp/:address` | Get XP balance and history |
| `POST /api/xp/claim` | Claim daily XP based on Signal |
| `POST /api/xp/redeem-usdc` | Redeem 100 XP for 1 USDC |
| `POST /api/xp/exchange-gd` | Exchange G$ for XP (50:1 rate) |

### Face Verification
| Endpoint | Description |
|----------|-------------|
| `POST /api/face-verify` | Submit face verification |
| `GET /api/face-verify/status/:address` | Check verification status |

## XP Economy

| Action | XP Reward |
|--------|-----------|
| Daily MaxFlow claim | (Signal²/100 + √Signal) / 2 |
| Face verification | 120 XP (after vouching someone) |
| First transfer received | 10 XP |
| 3 days of savings | 25 XP |
| GoodDollar exchange | 1 XP per 50 G$ |

**Redemptions:**
- 100 XP → 1 USDC (once per day, requires face verification)
- 1 XP → AI chat message

## Sybil Detection

The XP system uses graduated multipliers based on trust signals:

| Tier | Multiplier | Criteria |
|------|------------|----------|
| Clear | 1.0x | Verified face + high trust |
| Warn | 0.5x | Some trust signals |
| Limit | 0.167x | Limited trust |
| Block | 0x | Duplicate face or suspicious |

## Prize Pool

Users can opt a percentage of their Aave yield into a weekly prize pool:

- Draws occur every Sunday at 00:00 UTC
- Tickets based on yield contributed, not principal
- Weighted random selection based on yield contribution
- Prize is distributed in USDC

## Security

- **Local key storage**: Private keys encrypted with AES-GCM
- **PBKDF2 key derivation**: 310,000 iterations
- **No server-side keys**: Facilitator only pays gas, never handles user funds
- **Face verification**: Liveness detection prevents photo attacks
- **Duplicate detection**: Euclidean distance matching on face embeddings

## External Dependencies

- [viem](https://viem.sh) - Ethereum library
- [Aave](https://aave.com) - DeFi lending protocol
- [MaxFlow](https://maxflow.co) - Trust network
- [GoodDollar](https://gooddollar.org) - UBI protocol
- [face-api.js](https://github.com/justadudewhohacks/face-api.js) - Face recognition
- [MediaPipe](https://mediapipe.dev) - Liveness detection

## Contributing

Issues and PRs welcome. If you're working on financial inclusion, gasless transactions, or offline-first crypto — let's talk.

## License

MIT
