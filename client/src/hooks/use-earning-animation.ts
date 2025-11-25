import { useState, useEffect, useRef } from 'react';

interface UseEarningAnimationParams {
  usdcMicro: string;
  aaveBalanceMicro: string;
  apyRate: number;
  enabled?: boolean;
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
}: UseEarningAnimationParams): EarningAnimationResult {
  const mountTimeRef = useRef<number>(Date.now());
  const [animatedValue, setAnimatedValue] = useState<number>(0);
  const [precision, setPrecision] = useState<number>(2);

  const liquidBalance = parseFloat(usdcMicro) / 1e6;
  const aaveBalance = parseFloat(aaveBalanceMicro) / 1e6;
  const totalBalance = liquidBalance + aaveBalance;

  useEffect(() => {
    mountTimeRef.current = Date.now();
    setAnimatedValue(totalBalance);
  }, [totalBalance]);

  useEffect(() => {
    if (!enabled || apyRate === 0 || aaveBalance === 0) {
      setPrecision(2);
      return;
    }

    const secondlyRate = apyRate / (365 * 24 * 60 * 60);
    const changePerSecond = aaveBalance * secondlyRate;

    let requiredPrecision = 2;
    
    if (changePerSecond > 0) {
      const minPrecision = Math.ceil(-Math.log10(changePerSecond));
      if (minPrecision >= 3 && minPrecision <= 6) {
        requiredPrecision = Math.min(minPrecision, 6);
      }
    }
    
    setPrecision(requiredPrecision);
  }, [aaveBalance, apyRate, enabled]);

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
