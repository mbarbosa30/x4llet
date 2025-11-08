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
    <div className={`flex items-baseline ${className}`} data-testid={testId}>
      <span className="text-inherit tabular-nums mr-1">{currency}</span>
      <span className="text-inherit tabular-nums">
        {wholePart}.{mainDecimals}
      </span>
      <span className="inline-block w-[2.5ch] text-left">
        {extraDecimals && (
          <sup className="text-[0.5em] text-muted-foreground opacity-70 tabular-nums">
            {extraDecimals}
          </sup>
        )}
      </span>
    </div>
  );
}
