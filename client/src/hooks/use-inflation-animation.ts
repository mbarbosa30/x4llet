import { useState, useEffect, useRef } from 'react';

interface UseInflationAnimationParams {
  usdcMicro: string; // Micro-USDC balance (e.g., "5120000" = 5.12 USDC)
  exchangeRate: number; // Exchange rate to local currency
  inflationRate: number; // Annual inflation rate (e.g., 0.05 for 5%)
  enabled?: boolean;
}

interface InflationAnimationResult {
  animatedValue: number;
  precision: number; // Total decimals to show (2-5)
  mainDecimals: string; // First 2 decimals
  extraDecimals: string; // Remaining decimals (0-3)
}

/**
 * Animates the local currency value with real-time inflation decay.
 * Calculates dynamic decimal precision to ensure visible changes per second.
 */
export function useInflationAnimation({
  usdcMicro,
  exchangeRate,
  inflationRate,
  enabled = true,
}: UseInflationAnimationParams): InflationAnimationResult {
  const mountTimeRef = useRef<number>(Date.now());
  const [animatedValue, setAnimatedValue] = useState<number>(0);
  const [precision, setPrecision] = useState<number>(2);

  // Calculate base fiat value (USDC × exchange rate)
  const baseValue = (parseFloat(usdcMicro) / 1e6) * exchangeRate;

  // Reset mount time when base value changes (new transaction or currency switch)
  useEffect(() => {
    mountTimeRef.current = Date.now();
    setAnimatedValue(baseValue);
  }, [baseValue]);

  // Calculate required decimal precision based on inflation magnitude
  useEffect(() => {
    if (!enabled || inflationRate === 0) {
      setPrecision(2);
      return;
    }

    // Per-second growth rate (continuous compounding)
    const secondlyRate = Math.abs(inflationRate) / (365 * 24 * 60 * 60);
    
    // Calculate change in value per second
    const changePerSecond = baseValue * secondlyRate;
    
    // Only show extra decimals if they change at least once per second
    // For precision p, one unit is 10^-p
    // We need: changePerSecond >= 10^-p (at least 1 unit change per second)
    // Therefore: p >= -log10(changePerSecond), so p = ceil(-log10(changePerSecond))
    let requiredPrecision = 2;
    
    if (changePerSecond > 0) {
      const minPrecision = Math.ceil(-Math.log10(changePerSecond));
      // Only show extra decimals (3-5) if they genuinely change once per second
      // Otherwise stick with 2 decimals
      if (minPrecision >= 3 && minPrecision <= 5) {
        requiredPrecision = minPrecision;
      }
    }
    
    setPrecision(requiredPrecision);
  }, [baseValue, inflationRate, enabled]);

  // Animate value based on elapsed time using requestAnimationFrame
  useEffect(() => {
    if (!enabled || inflationRate === 0) {
      setAnimatedValue(baseValue);
      return;
    }

    let animationFrameId: number;
    
    const animate = () => {
      const elapsedSeconds = (Date.now() - mountTimeRef.current) / 1000;
      
      // Apply GROWTH for inflation: value × e^(+rate × time)
      // Local currency devalues, so it takes MORE local currency to equal same USD
      const rate = inflationRate / (365 * 24 * 60 * 60); // Per-second rate
      const inflatedValue = baseValue * Math.exp(rate * elapsedSeconds);
      
      setAnimatedValue(inflatedValue);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [baseValue, inflationRate, enabled]);

  // Split into main (2) and extra decimals (up to 3)
  // Use Math.ceil for upward movement to ensure monotonic increase
  const scaleFactor = Math.pow(10, precision);
  const ceiledValue = Math.ceil(animatedValue * scaleFactor) / scaleFactor;
  
  const formattedValue = ceiledValue.toFixed(precision);
  const parts = formattedValue.split('.');
  const mainDecimals = parts[1]?.slice(0, 2) || '00';
  const extraDecimals = precision > 2 ? (parts[1]?.slice(2) || '') : '';

  return {
    animatedValue: ceiledValue,
    precision,
    mainDecimals,
    extraDecimals,
  };
}
