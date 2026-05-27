import { useCallback, useRef } from 'react';

export function usePerformance() {
  const performanceRef = useRef<{
    startTime: number;
    endTime: number;
    duration: number;
  } | null>(null);

  const startTiming = useCallback(() => {
    performanceRef.current = {
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
    };
  }, []);

  const endTiming = useCallback(() => {
    if (performanceRef.current) {
      performanceRef.current.endTime = performance.now();
      performanceRef.current.duration = 
        performanceRef.current.endTime - performanceRef.current.startTime;
      
      console.log(`Performance: ${performanceRef.current.duration.toFixed(2)}ms`);
      return performanceRef.current.duration;
    }
    return 0;
  }, []);

  const measureAsync = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    label?: string
  ): Promise<T> => {
    startTiming();
    try {
      const result = await asyncFn();
      const duration = endTiming();
      if (label) {
        console.log(`${label}: ${duration.toFixed(2)}ms`);
      }
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  }, [startTiming, endTiming]);

  return {
    startTiming,
    endTiming,
    measureAsync,
  };
}
