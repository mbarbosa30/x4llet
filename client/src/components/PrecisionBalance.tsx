interface PrecisionBalanceProps {
  amountMicroUsdc: string | number;
  showCurrency?: boolean;
  currencySymbol?: string;
  className?: string;
  mainClassName?: string;
  precisionClassName?: string;
}

export function PrecisionBalance({
  amountMicroUsdc,
  showCurrency = true,
  currencySymbol = '$',
  className = '',
  mainClassName = '',
  precisionClassName = 'text-[0.6em] align-super opacity-70',
}: PrecisionBalanceProps) {
  const microUsdc = typeof amountMicroUsdc === 'string' 
    ? parseFloat(amountMicroUsdc) 
    : amountMicroUsdc;
  
  if (isNaN(microUsdc) || microUsdc === 0) {
    return (
      <span className={className}>
        <span className={mainClassName}>{currencySymbol}0.00</span>
      </span>
    );
  }
  
  const fullAmount = microUsdc / 1e6;
  const fullString = fullAmount.toFixed(6);
  
  const mainPart = fullAmount.toFixed(2);
  
  const decimalIndex = fullString.indexOf('.');
  const afterTwoDecimals = fullString.slice(decimalIndex + 3);
  
  const trimmedPrecision = afterTwoDecimals.replace(/0+$/, '');
  
  return (
    <span className={className}>
      <span className={mainClassName}>{currencySymbol}{mainPart}</span>
      {trimmedPrecision && (
        <span className={precisionClassName}>{trimmedPrecision}</span>
      )}
      {showCurrency && <span className={mainClassName}> USDC</span>}
    </span>
  );
}

export function formatPrecisionBalance(amountMicroUsdc: string | number): {
  main: string;
  precision: string;
  full: string;
} {
  const microUsdc = typeof amountMicroUsdc === 'string' 
    ? parseFloat(amountMicroUsdc) 
    : amountMicroUsdc;
  
  if (isNaN(microUsdc) || microUsdc === 0) {
    return { main: '0.00', precision: '', full: '0.00' };
  }
  
  const fullAmount = microUsdc / 1e6;
  const fullString = fullAmount.toFixed(6);
  const mainPart = fullAmount.toFixed(2);
  
  const decimalIndex = fullString.indexOf('.');
  const afterTwoDecimals = fullString.slice(decimalIndex + 3);
  const trimmedPrecision = afterTwoDecimals.replace(/0+$/, '');
  
  const cleanFull = fullString.replace(/\.?0+$/, '');
  
  return {
    main: mainPart,
    precision: trimmedPrecision,
    full: cleanFull,
  };
}
