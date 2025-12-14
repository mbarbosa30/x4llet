import { useState, useEffect, useCallback } from 'react';
import { formatTimeRemaining } from '@/lib/formatTime';

interface UseCountdownOptions {
  onComplete?: () => void;
  enabled?: boolean;
}

interface UseCountdownResult {
  timeRemaining: number | null;
  formatted: string | null;
  isComplete: boolean;
}

export function useCountdown(
  targetTime: Date | number | string | null | undefined,
  options: UseCountdownOptions = {}
): UseCountdownResult {
  const { onComplete, enabled = true } = options;
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!enabled || !targetTime) {
      setTimeRemaining(null);
      setIsComplete(false);
      return;
    }

    // Normalize targetTime to Date object (handles Date, number timestamp, or ISO string)
    let target: Date;
    if (targetTime instanceof Date) {
      target = targetTime;
    } else if (typeof targetTime === 'number') {
      target = new Date(targetTime);
    } else if (typeof targetTime === 'string') {
      target = new Date(targetTime);
    } else {
      // Shouldn't happen due to type checking, but handle gracefully
      setTimeRemaining(null);
      setIsComplete(false);
      return;
    }
    
    // Validate the date is valid
    if (isNaN(target.getTime())) {
      setTimeRemaining(null);
      setIsComplete(false);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diff = target.getTime() - now;

      if (diff <= 0) {
        setTimeRemaining(0);
        setIsComplete(true);
        onComplete?.();
        return true;
      }

      setTimeRemaining(diff);
      setIsComplete(false);
      return false;
    };

    const completed = updateCountdown();
    if (completed) return;

    const interval = setInterval(() => {
      const completed = updateCountdown();
      if (completed) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTime, enabled, onComplete]);

  const formatted = timeRemaining !== null && timeRemaining > 0
    ? formatTimeRemaining(timeRemaining)
    : null;

  return {
    timeRemaining,
    formatted,
    isComplete,
  };
}

export function useTick(intervalMs: number = 1000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return tick;
}
