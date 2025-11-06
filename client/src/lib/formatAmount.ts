/**
 * Smart amount formatter that shows clean amounts for readability
 * while preserving precision for very small values
 * 
 * Rules:
 * - Amounts >= 0.01: Show 2 decimals (e.g., "5.12", "100.50")
 * - Amounts < 0.01: Show up to 6 significant decimals (e.g., "0.000123", "0.0000056")
 * - Strips trailing zeros after decimal point
 */
export function formatAmount(amount: string | number, currency: string = 'USDC'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '0.00';
  }
  
  // For amounts >= 0.01, show 2 decimals
  if (numAmount >= 0.01) {
    return `${numAmount.toFixed(2)} ${currency}`;
  }
  
  // For very small amounts, show up to 6 decimals but strip trailing zeros
  if (numAmount > 0) {
    const formatted = numAmount.toFixed(6).replace(/\.?0+$/, '');
    return `${formatted} ${currency}`;
  }
  
  // Zero
  return `0.00 ${currency}`;
}
