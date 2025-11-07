/**
 * Smart amount formatter that shows clean amounts for readability
 * while preserving precision for very small values
 * 
 * Accepts micro-USDC integers (6 decimals) as strings or numbers and formats for display
 * Also handles legacy decimal format for backward compatibility
 * 
 * Rules:
 * - Amounts >= 0.01: Show 2 decimals (e.g., "5.12", "100.50")
 * - Amounts < 0.01: Show up to 6 significant decimals (e.g., "0.000123", "0.0000056")
 * - Strips trailing zeros after decimal point
 */
export function formatAmount(amount: string | number, currency: string = 'USDC'): string {
  let numAmount: number;
  
  if (typeof amount === 'string') {
    // Check if it's legacy decimal format (contains decimal point)
    if (amount.includes('.')) {
      // Legacy decimal format - already in USDC, just parse it
      numAmount = parseFloat(amount);
    } else {
      // Micro-USDC integer - divide by 1e6
      numAmount = parseFloat(amount) / 1e6;
    }
  } else {
    // Number input - assume micro-USDC
    numAmount = amount / 1e6;
  }
  
  if (isNaN(numAmount)) {
    return `0.00 ${currency}`;
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
