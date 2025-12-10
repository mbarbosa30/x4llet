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
  const formattedWholePart = wholePart.toLocaleString('en-US');

  return (
    <div className={`flex items-baseline ${className}`} data-testid={testId}>
      <span className="text-inherit tabular-nums mr-1">{currency}</span>
      <span className="inline-flex items-baseline text-inherit tabular-nums font-bold">
        {formattedWholePart}.{mainDecimals}
        {extraDecimals && (
          <span className="text-[0.45em] font-light text-success opacity-70 tabular-nums relative ml-0.5" style={{ top: '-0.5em' }}>
            {extraDecimals}
          </span>
        )}
        {!extraDecimals && (
          <span className="invisible text-[0.45em] font-light tabular-nums ml-0.5" style={{ width: '4ch' }} aria-hidden="true">
            00000000
          </span>
        )}
      </span>
    </div>
  );
}
