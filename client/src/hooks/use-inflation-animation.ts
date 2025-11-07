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
    
    // Calculate absolute change in value per second
    const changePerSecond = baseValue * secondlyRate;
    
    // Find minimum precision where change is visible (≥ 1 full unit at that decimal place)
    let requiredPrecision = 2;
    for (let p = 3; p <= 5; p++) {
      const threshold = 1 / Math.pow(10, p); // One full unit at this decimal place
      if (changePerSecond >= threshold) {
        requiredPrecision = p;
        break;
      }
    }
    
    // Only show extra decimals if change is visible beyond 2 decimals
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
