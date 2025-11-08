/**
 * Smart amount formatter that shows clean amounts for readability
 * while preserving full precision
 * 
 * Accepts micro-USDC integers (6 decimals) as strings or numbers and formats for display
 * Also handles legacy decimal format for backward compatibility
 * 
 * Rules:
 * - Shows up to 6 decimals (full precision for micro-USDC)
 * - Strips trailing zeros for cleaner display
 * - Examples: "10.00" → "10", "1.50" → "1.5", "0.339800" → "0.3398", "0.000123" → "0.000123"
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
  
  if (isNaN(numAmount) || numAmount === 0) {
    return `0 ${currency}`;
  }
  
  // Show up to 6 decimals (full precision) and strip trailing zeros
  const formatted = numAmount.toFixed(6).replace(/\.?0+$/, '');
  return `${formatted} ${currency}`;
}
