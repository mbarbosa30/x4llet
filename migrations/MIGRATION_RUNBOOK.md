# Production Migration Runbook: USDC Amount Format Update

**Migration ID:** 001  
**Date Created:** November 7, 2025  
**Author:** nanoPay Team  
**Estimated Duration:** 10-15 minutes  
**Risk Level:** Medium (data transformation)

## Overview

This migration converts USDC amounts from 2-decimal string format to micro-USDC integer format for full 6-decimal precision.

### What's Changing

- **Before:** Amounts stored as decimal strings (e.g., `"5.12"`, `"0.01"`)
- **After:** Amounts stored as micro-USDC integers (e.g., `"5120000"`, `"10000"`)
- **Impact:** All financial calculations will preserve full 6-decimal blockchain precision

### Affected Tables

1. **cached_transactions** - Migrated via SQL (permanent data, must preserve)
2. **cached_balances** - Cleared via admin dashboard (auto-refreshes)
3. **balance_history** - Cleared via admin dashboard (reconstructed from transactions)

---

## Pre-Migration Checklist

- [ ] Read through entire runbook before starting
- [ ] Have database backup access ready
- [ ] Admin dashboard credentials available
- [ ] Ability to rollback if needed
- [ ] Low-traffic maintenance window scheduled (optional but recommended)

---

## Step 1: Pre-Migration Validation

### 1.1 Connect to Production Database

```bash
# Using psql or your preferred PostgreSQL client
psql $DATABASE_URL
```

### 1.2 Run Validation Queries

```sql
-- Count total transactions
SELECT COUNT(*) AS total_transactions FROM cached_transactions;

-- Sample current data (should see decimal strings)
SELECT amount, "from", "to", timestamp 
FROM cached_transactions 
ORDER BY timestamp DESC 
LIMIT 10;

-- Check for invalid data
SELECT COUNT(*) AS invalid_amounts 
FROM cached_transactions 
WHERE amount IS NULL 
   OR amount = '' 
   OR amount !~ '^[0-9]+\.?[0-9]*$';
```

**Expected Results:**
- `total_transactions`: Should match expected number of historical transactions
- Sample amounts should show decimal strings like `"5.12"`, `"100.00"`
- `invalid_amounts` should be `0`

### 1.3 Document Baseline Metrics

Record these for post-migration comparison:

```
Total Transactions: _______
Sample Amount #1: _______
Sample Amount #2: _______
Sample Amount #3: _______
```

---

## Step 2: Execute Migration

### 2.1 Create Backup

```sql
-- Create safety backup of transactions table
CREATE TABLE cached_transactions_backup AS 
SELECT * FROM cached_transactions;

-- Verify backup created
SELECT COUNT(*) FROM cached_transactions_backup;
```

### 2.2 Run Migration in Transaction

```sql
BEGIN;

-- Update amounts: multiply by 1,000,000
UPDATE cached_transactions
SET amount = CAST(ROUND(CAST(amount AS NUMERIC) * 1000000) AS TEXT)
WHERE amount IS NOT NULL 
  AND amount != '';

-- Quick sanity check
SELECT amount, "from", "to", timestamp 
FROM cached_transactions 
ORDER BY timestamp DESC 
LIMIT 10;
```

**Checkpoint:** Review the sample output. Amounts should now be integers (e.g., `"5120000"` instead of `"5.12"`).

- ✅ **Amounts look correct?** → Proceed to `COMMIT;`
- ❌ **Something looks wrong?** → Run `ROLLBACK;` and investigate

### 2.3 Commit or Rollback

```sql
-- If everything looks good:
COMMIT;

-- If there's an issue:
-- ROLLBACK;
```

---

## Step 3: Post-Migration Validation

### 3.1 Run Validation Queries

```sql
-- Verify no decimal points remain
SELECT COUNT(*) AS amounts_with_decimals
FROM cached_transactions
WHERE amount LIKE '%.%';
-- Expected: 0

-- Check for zero/negative amounts
SELECT COUNT(*) AS zero_or_negative
FROM cached_transactions
WHERE CAST(amount AS BIGINT) <= 0;
-- Expected: 0 (unless you had test transactions)

-- Sample migrated data with human-readable display
SELECT 
  amount AS micro_usdc,
  CAST(amount AS NUMERIC) / 1000000 AS usdc_display,
  "from",
  "to",
  timestamp
FROM cached_transactions
ORDER BY timestamp DESC
LIMIT 20;

-- Verify row counts match
SELECT 
  (SELECT COUNT(*) FROM cached_transactions) AS current_count,
  (SELECT COUNT(*) FROM cached_transactions_backup) AS backup_count;
```

### 3.2 Validate Results

**Pass Criteria:**
- [ ] No amounts contain decimal points
- [ ] No zero or negative amounts (unless expected)
- [ ] Row counts match between main and backup tables
- [ ] Sample data displays correctly when divided by 1,000,000
- [ ] All amounts are parseable as BIGINT

---

## Step 4: Clear Derived Data via Admin Dashboard

### 4.1 Access Admin Dashboard

1. Navigate to `https://your-app.replit.app/admin`
2. Log in with admin credentials

### 4.2 Clear Cached Balances

1. Scroll to "Maintenance" section
2. Click **"Clear Cached Balances"**
3. Confirm the action
4. Wait for success toast notification

**What This Does:** Removes cached balance entries. They will be refetched from the blockchain with the correct format on next user login/refresh.

### 4.3 Clear Balance History

1. In the same "Maintenance" section
2. Click **"Clear Balance History"**
3. Confirm the action
4. Wait for success toast notification

**What This Does:** Removes all historical balance snapshots. These will be reconstructed from the migrated transaction data.

---

## Step 5: Reconstruct Balance History

### 5.1 Backfill History for Active Wallets

For each active wallet that needs historical charts:

1. In admin dashboard, find "Backfill Operations" section
2. Enter wallet address
3. Select network (Base or Celo)
4. Click **"Backfill Balance History"**
5. Wait for completion (may take 10-30 seconds per wallet)

**Note:** The backfill logic now uses the migrated micro-USDC amounts, working backwards from the current on-chain balance.

### 5.2 Verify Chart Display

1. Log into the app as a test user
2. Navigate to home page
3. Verify balance history chart displays correctly
4. Check that USDC amounts are formatted properly (e.g., "5.12 USDC" not "5120000 USDC")

---

## Step 6: Monitor and Verify

### 6.1 Application Health Checks

- [ ] Admin dashboard loads without errors
- [ ] User balance displays correctly on home page
- [ ] Transaction history shows proper amounts
- [ ] Balance charts render correctly
- [ ] Send/receive flows work normally

### 6.2 Check Application Logs

```bash
# Monitor for any errors related to amount parsing
# Look for lines containing "USDC", "amount", or "balance"
```

### 6.3 Spot Check User Accounts

Verify 2-3 active user accounts:
- Balance matches blockchain
- Transaction history displays correctly
- Historical chart shows reasonable data

---

## Rollback Procedure

If critical issues arise after migration:

### Option 1: Restore from Backup (Fastest)

```sql
BEGIN;

-- Drop the migrated table
DROP TABLE cached_transactions;

-- Rename backup to main table
ALTER TABLE cached_transactions_backup RENAME TO cached_transactions;

COMMIT;
```

### Option 2: Reverse the Multiplication

```sql
BEGIN;

-- Divide amounts back by 1,000,000
UPDATE cached_transactions
SET amount = CAST(CAST(amount AS NUMERIC) / 1000000 AS TEXT)
WHERE amount IS NOT NULL 
  AND amount != '';

COMMIT;
```

**After Rollback:**
1. Restart application server to clear any in-memory caches
2. Investigate the root cause before attempting migration again

---

## Cleanup (Post-Verification)

Once migration is confirmed successful and stable for 24-48 hours:

```sql
-- Remove backup table to free up space
DROP TABLE cached_transactions_backup;
```

---

## Troubleshooting

### Issue: Amounts displaying as huge numbers in UI

**Cause:** Frontend not dividing by 1e6 for display  
**Fix:** Verify `formatAmount()` function includes division by 1e6

### Issue: Balance history shows incorrect values

**Cause:** Old snapshots not cleared before reconstruction  
**Fix:** Clear balance_history via admin dashboard, then re-run backfill

### Issue: Migration fails with "cannot cast to NUMERIC"

**Cause:** Non-numeric data in amount column  
**Fix:** Run pre-migration validation query to identify bad data, clean manually

### Issue: Chart shows negative balances

**Cause:** Reconstruction logic may need old data cleared  
**Fix:** Clear both cached_balances and balance_history, then backfill from scratch

---

## Success Criteria

Migration is complete when:

- [x] All transactions migrated to micro-USDC format
- [x] No decimal points in cached_transactions.amount
- [x] Cached balances cleared and refetching correctly
- [x] Balance history reconstructed successfully
- [x] UI displays amounts correctly (divided by 1e6)
- [x] Charts render with proper values
- [x] No application errors in logs
- [x] Spot checks pass for 2-3 user accounts

---

## Contacts

**On-Call Engineer:** [Your Contact]  
**Database Admin:** [DBA Contact]  
**Rollback Authority:** [Manager Contact]

---

## Migration Log

**Executed By:** _______________  
**Start Time:** _______________  
**End Time:** _______________  
**Status:** [ ] Success [ ] Rolled Back [ ] Partial  
**Notes:**

```
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
```
