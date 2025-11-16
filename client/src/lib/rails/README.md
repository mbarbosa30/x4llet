# Payment Rails Architecture

## Overview

The PaymentRail abstraction provides a pluggable system for different payment methods (public EIP-3009 vs private Railgun transfers).

## Design Philosophy

**Rails are for TRANSFERS, not balance display:**
- `PaymentRail.getBalance()` is for checking if a transfer is possible on a specific chain
- Balance aggregation and display logic remains in components/API layer
- Home page continues to use `/api/balance/:address` (no chainId) for aggregated view
- Send page can use `/api/balance/:address?chainId=X` for per-chain balances

## Current State (Experimental)

- **PublicRail**: ✅ Production-ready for EIP-3009 transfers on Base & Celo
- **PrivateRail**: 🚧 Stub only - awaiting Kohaku stability
- **Context**: ✅ Safe fallback logic implemented
- **UI**: Privacy Mode toggle exists but is disabled

## Usage Pattern

### For Transfers (Send page):
```typescript
const { getRailForPayment } = useRail();

// Get appropriate rail with automatic fallback
const rail = await getRailForPayment(chainId, 'USDC');

// Build and submit transfer
const signedTransfer = await rail.buildTransfer(params, privateKey);
const result = await rail.submitTransfer(signedTransfer);
```

### For Balance Display (Home page):
```typescript
// Continue using existing API pattern
const { data } = useQuery({
  queryKey: ['/api/balance', address],
  // API handles aggregation across chains
});
```

## Next Steps

1. ⏳ Refactor Send.tsx to use `getRailForPayment()` for transfers
2. ⏳ Add Public/Private tabs to Send page UI
3. ⏳ Enable privacy toggle when PrivateRail is functional
4. ⏳ Integrate `@kohaku-eth/railgun` when stable

## Why This Design?

- **Separation of Concerns**: Rails handle payment logic, API handles balance aggregation
- **Minimal Changes**: Existing balance display code unchanged
- **Future-Proof**: Easy to add PrivateRail.getBalance() for private balances later
- **Safe Fallback**: Always falls back to PublicRail until privacy is stable
