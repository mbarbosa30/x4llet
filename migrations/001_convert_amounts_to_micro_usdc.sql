-- Migration: Convert USDC amounts from decimal strings to micro-USDC integers
-- Date: 2025-11-07
-- Description: Converts existing transaction amounts stored as 2-decimal strings (e.g., "5.12")
--              to micro-USDC integers (e.g., "5120000") to preserve full 6-decimal precision.
--
-- IMPORTANT: This migration should be run on the production database.
--            Test it on the development database first to verify correctness.
--
-- Tables affected:
--   - cached_transactions: amount column (permanent historical data - must preserve)
--
-- Notes:
--   - cached_balances: Should be cleared via admin dashboard (will auto-refresh)
--   - balance_history: Should be cleared via admin dashboard (will be reconstructed)

-- ==============================================================================
-- PRE-MIGRATION VALIDATION QUERIES
-- ==============================================================================

-- 1. Count total transactions before migration
SELECT COUNT(*) AS total_transactions FROM cached_transactions;

-- 2. Sample current amounts (should see decimal strings like "5.12", "100.00")
SELECT amount, "from", "to", timestamp 
FROM cached_transactions 
ORDER BY timestamp DESC 
LIMIT 10;

-- 3. Check for any NULL or invalid amounts
SELECT COUNT(*) AS invalid_amounts 
FROM cached_transactions 
WHERE amount IS NULL 
   OR amount = '' 
   OR amount !~ '^[0-9]+\.?[0-9]*$';
-- Expected: 0 - ABORT MIGRATION IF NON-ZERO

-- 4. Check for amounts with more than 6 decimal places
-- USDC only supports 6 decimals, more precision would be lost
SELECT COUNT(*) AS excessive_precision,
       amount
FROM cached_transactions
WHERE amount ~ '^\d+\.\d{7,}$'
GROUP BY amount;
-- Expected: 0 rows - ABORT MIGRATION IF ANY FOUND

-- 5. Verify all amounts are parseable as numeric with proper precision
SELECT COUNT(*) AS parseable_amounts
FROM cached_transactions
WHERE amount ~ '^[0-9]+\.?[0-9]{0,6}$';
-- Expected: Equal to total_transactions (all amounts valid)

-- ==============================================================================
-- MIGRATION (RUN IN A TRANSACTION)
-- ==============================================================================

BEGIN;

-- CRITICAL: Verify pre-migration validation passed before continuing
-- If any validation queries above showed errors, ROLLBACK and fix data first

-- Create backup table (optional but recommended)
CREATE TABLE cached_transactions_backup AS 
SELECT * FROM cached_transactions;

-- Update amounts: multiply decimal strings by 1,000,000 to get micro-USDC integers
-- Uses NUMERIC(78,6) to parse input, then casts to BIGINT to remove decimals
-- Example transformations:
--   "5.12"    -> "5120000"
--   "0.01"    -> "10000"
--   "100.00"  -> "100000000"
--   "0.000001" -> "1"
UPDATE cached_transactions
SET amount = CAST(CAST((CAST(amount AS NUMERIC(78,6)) * 1000000) AS BIGINT) AS TEXT)
WHERE amount IS NOT NULL 
  AND amount != ''
  AND amount ~ '^[0-9]+\.?[0-9]{0,6}$';  -- Only update valid amounts

-- Verify NO rows were skipped due to invalid format
DO $$
DECLARE
  total_count INTEGER;
  updated_count INTEGER;
  skipped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM cached_transactions_backup;
  SELECT COUNT(*) INTO updated_count FROM cached_transactions WHERE amount !~ '%.%';
  skipped_count := total_count - updated_count;
  
  IF skipped_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % rows were skipped due to invalid amount format. ROLLBACK and investigate.', skipped_count;
  END IF;
  
  RAISE NOTICE 'Migration successful: % rows converted to micro-USDC format', updated_count;
END $$;

-- Verify update succeeded
SELECT COUNT(*) AS updated_transactions FROM cached_transactions;

-- Sample migrated amounts (should see integers like "5120000", "100000000")
SELECT amount, "from", "to", timestamp 
FROM cached_transactions 
ORDER BY timestamp DESC 
LIMIT 10;

-- COMMIT or ROLLBACK based on verification
-- If everything looks correct, run: COMMIT;
-- If there are issues, run: ROLLBACK;
COMMIT;

-- ==============================================================================
-- POST-MIGRATION VALIDATION QUERIES
-- ==============================================================================

-- 1. Verify all amounts are now integers (no decimal points)
SELECT COUNT(*) AS amounts_with_decimals
FROM cached_transactions
WHERE amount LIKE '%.%';
-- Expected: 0

-- 2. Verify no amounts are zero or negative
SELECT COUNT(*) AS zero_or_negative
FROM cached_transactions
WHERE CAST(amount AS BIGINT) <= 0;
-- Expected: 0 (unless you had zero-value test transactions)

-- 3. Sample migrated data to visually verify correctness
SELECT 
  amount AS micro_usdc,
  CAST(amount AS NUMERIC) / 1000000 AS usdc_display,
  "from",
  "to",
  timestamp
FROM cached_transactions
ORDER BY timestamp DESC
LIMIT 20;

-- 4. Compare row counts (should match pre-migration)
SELECT 
  (SELECT COUNT(*) FROM cached_transactions) AS current_count,
  (SELECT COUNT(*) FROM cached_transactions_backup) AS backup_count;

-- ==============================================================================
-- CLEANUP (OPTIONAL - ONLY AFTER VERIFYING MIGRATION SUCCESS)
-- ==============================================================================

-- Once migration is verified successful in production, you can drop the backup
-- DROP TABLE cached_transactions_backup;

-- ==============================================================================
-- NEXT STEPS AFTER MIGRATION
-- ==============================================================================

-- 1. Go to admin dashboard and click "Clear Cached Balances"
--    (Balances will be refetched from blockchain with correct format)
--
-- 2. Go to admin dashboard and click "Clear Balance History"
--    (History will be reconstructed from migrated transactions)
--
-- 3. For each wallet that needs history, click "Backfill Balance History"
--    (Uses the migrated micro-USDC transaction amounts to reconstruct)
--
-- 4. Verify the balance history chart displays correctly on the home page
