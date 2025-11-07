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

  // Calculate required decimal precision for visible changes
  useEffect(() => {
    if (!enabled || inflationRate === 0) {
      setPrecision(2);
      return;
    }

    // Per-second decay rate (continuous compounding)
    const secondlyRate = inflationRate / (365 * 24 * 60 * 60);
    
    // Calculate absolute change in value per second (handle both inflation and deflation)
    const changePerSecond = Math.abs(baseValue * secondlyRate);
    
    // Find minimum precision where change is visible (at least 1 unit change per second)
    // For precision p, one unit is 10^-p
    // We need: changePerSecond >= 10^-p
    // Therefore: p <= -log10(changePerSecond)
    let requiredPrecision = 2;
    
    if (changePerSecond > 0) {
      // Use ceil to ensure change is always >= one unit at this precision
      // Example: changePerSecond = 0.0003, ceil(-log10(0.0003)) = ceil(3.52) = 4
      // At precision 4, one unit = 0.0001, so 0.0003 >= 0.0001 ✓
      const minPrecision = Math.ceil(-Math.log10(changePerSecond));
      
      // Only show extra decimals if we can achieve per-second visibility within 5 decimals
      // If required precision > 5, inflation is too low to show per-second changes
      if (minPrecision >= 3 && minPrecision <= 5) {
        requiredPrecision = minPrecision;
      }
      // Otherwise stick with 2 decimals (no extra decimals shown)
    }
    
    setPrecision(requiredPrecision);
  }, [baseValue, inflationRate, enabled]);

  // Animate value based on elapsed time
  useEffect(() => {
    if (!enabled || inflationRate === 0) {
      setAnimatedValue(baseValue);
      return;
    }

    // Per-second decay rate
    const secondlyDecayFactor = Math.exp(-inflationRate / (365 * 24 * 60 * 60));

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - mountTimeRef.current) / 1000;
      
      // Apply decay: value × e^(-rate × time)
      const decayedValue = baseValue * Math.pow(secondlyDecayFactor, elapsedSeconds);
      setAnimatedValue(decayedValue);
    }, 1000);

    return () => clearInterval(interval);
  }, [baseValue, inflationRate, enabled]);

  // Split into main (2) and extra decimals (up to 3)
  // Only show extra decimals if precision > 2 (inflation is visible)
  const formattedValue = animatedValue.toFixed(precision);
  const parts = formattedValue.split('.');
  const mainDecimals = parts[1]?.slice(0, 2) || '00';
  const extraDecimals = precision > 2 ? (parts[1]?.slice(2) || '') : '';

  return {
    animatedValue,
    precision,
    mainDecimals,
    extraDecimals,
  };
}
