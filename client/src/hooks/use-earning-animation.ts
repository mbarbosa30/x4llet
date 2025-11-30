import { useState, useEffect, useRef } from 'react';

interface UseEarningAnimationParams {
  usdcMicro: string;
  aaveBalanceMicro: string;
  apyRate: number;
  enabled?: boolean;
  minPrecision?: number;
}

interface EarningAnimationResult {
  animatedValue: number;
  mainDecimals: string;
  extraDecimals: string;
  precision: number;
}

export function useEarningAnimation({
  usdcMicro,
  aaveBalanceMicro,
  apyRate,
  enabled = true,
  minPrecision = 2,
}: UseEarningAnimationParams): EarningAnimationResult {
  const mountTimeRef = useRef<number>(Date.now());
  const [animatedValue, setAnimatedValue] = useState<number>(0);
  const [precision, setPrecision] = useState<number>(minPrecision);

  const liquidBalance = parseFloat(usdcMicro) / 1e6;
  const aaveBalance = parseFloat(aaveBalanceMicro) / 1e6;
  const totalBalance = liquidBalance + aaveBalance;

  useEffect(() => {
    mountTimeRef.current = Date.now();
    setAnimatedValue(totalBalance);
  }, [totalBalance]);

  useEffect(() => {
    if (!enabled || apyRate === 0 || aaveBalance === 0) {
      setPrecision(minPrecision);
      return;
    }

    const secondlyRate = apyRate / (365 * 24 * 60 * 60);
    const changePerSecond = aaveBalance * secondlyRate;

    let requiredPrecision = minPrecision;
    
    if (changePerSecond > 0) {
      const calculatedPrecision = Math.ceil(-Math.log10(changePerSecond));
      if (calculatedPrecision >= 3 && calculatedPrecision <= 6) {
        requiredPrecision = Math.max(minPrecision, Math.min(calculatedPrecision, 6));
      } else if (calculatedPrecision > 6) {
        requiredPrecision = Math.max(minPrecision, 6);
      }
    }
    
    setPrecision(requiredPrecision);
  }, [aaveBalance, apyRate, enabled, minPrecision]);

  useEffect(() => {
    if (!enabled || apyRate === 0 || aaveBalance === 0) {
      setAnimatedValue(totalBalance);
      return;
    }

    let animationFrameId: number;
    
    const animate = () => {
      const elapsedSeconds = (Date.now() - mountTimeRef.current) / 1000;
      
      const rate = apyRate / (365 * 24 * 60 * 60);
      const earnedAmount = aaveBalance * (Math.exp(rate * elapsedSeconds) - 1);
      const newTotal = totalBalance + earnedAmount;
      
      setAnimatedValue(newTotal);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [totalBalance, aaveBalance, apyRate, enabled]);

  const scaleFactor = Math.pow(10, precision);
  const roundedValue = Math.floor(animatedValue * scaleFactor) / scaleFactor;
  
  const formattedValue = roundedValue.toFixed(precision);
  const parts = formattedValue.split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = parts[1] || '00';
  const mainDecimals = decimalPart.slice(0, 2);
  const extraDecimals = precision > 2 ? decimalPart.slice(2) : '';

  return {
    animatedValue: roundedValue,
    mainDecimals,
    extraDecimals,
    precision,
  };
}
