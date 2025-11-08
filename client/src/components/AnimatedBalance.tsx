interface AnimatedBalanceProps {
  value: number;
  mainDecimals: string;
  extraDecimals: string;
  currency: string;
  className?: string;
  testId?: string;
}

/**
 * Displays an animated balance with main decimals and superscript extra decimals.
 * Example: 5.12³⁴⁵⁶ USD
 */
export default function AnimatedBalance({
  value,
  mainDecimals,
  extraDecimals,
  currency,
  className = '',
  testId,
}: AnimatedBalanceProps) {
  const wholePart = Math.floor(value);

  return (
    <div className={`flex items-baseline gap-1 ${className}`} data-testid={testId}>
      <span className="text-inherit">{currency}</span>
      <span className="text-inherit">
        {wholePart}.{mainDecimals}
      </span>
      {extraDecimals && (
        <sup className="text-[0.5em] text-muted-foreground opacity-70">
          {extraDecimals}
        </sup>
      )}
    </div>
  );
}
