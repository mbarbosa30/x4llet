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

## Technical Approach

This isn't a scaffold project. It's a production wallet handling real money.

- **Frontend**: React + TypeScript + Vite, optimized for low-bandwidth (272KB gzipped)
- **Backend**: Express + Drizzle ORM + PostgreSQL
- **Crypto**: viem for wallet operations, WebCrypto for local key encryption
- **Auth**: Passkey support via WebAuthn with PRF extension for key derivation
- **Gasless**: EIP-3009 facilitator pattern — users sign typed data, backend submits transactions

The wallet generates keys locally using WebCrypto, encrypts them with a user password (AES-GCM + PBKDF2), and stores them in IndexedDB. Private keys never leave the device unencrypted.

## Try It

**Live app**: [nanopay.replit.app](https://nanopay.replit.app)

Create a wallet, receive some USDC on Base/Celo/Gnosis/Arbitrum, and send it to someone. No gas needed.

## Development

```bash
npm install
npm run dev
```

Requires PostgreSQL. Set `DATABASE_URL` in your environment.

## Architecture

```
client/           React frontend (PWA)
├── src/pages/    Route components
├── src/hooks/    Custom hooks (useWallet, useBalance, useXp)
├── src/lib/      Utilities (wallet, maxflow, gooddollar)
└── src/components/

server/           Express backend
├── routes.ts     API endpoints
├── storage.ts    Database interface
├── db.ts         Drizzle + Neon connection
└── facilitator/  Gasless transaction handlers

shared/           Shared types
└── schema.ts     Drizzle schema + Zod validation
```

## Contributing

Issues and PRs welcome. If you're working on financial inclusion, gasless transactions, or offline-first crypto — let's talk.

## License

MIT
