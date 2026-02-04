/**
 * useAPI Hook
 * Provides easy access to Dartbot API with loading and error states
 */

import { useState, useEffect, useCallback } from 'react';
import { dartbotAPI } from '../services/dartbotAPI';

interface UseAPIState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch checkout recommendation
 */
export function useCheckoutRecommendation(
  score: number | null,
  averageRange: string = '30-39'
): UseAPIState<any> {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (score === null) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const recommendation = await dartbotAPI.getCheckoutRecommendation(score, averageRange);
      setData(recommendation);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [score, averageRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to fetch bot strategy
 */
export function useBotStrategy(
  level: number,
  currentScore: number | null,
  outRule: string = 'double',
  averageRange: string = '30-39'
): UseAPIState<any> {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (currentScore === null) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const strategy = await dartbotAPI.getBotStrategy(
        level,
        currentScore,
        outRule,
        averageRange
      );
      setData(strategy);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [level, currentScore, outRule, averageRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Hook to check backend health
 */
export function useAPIHealth() {
  const [isHealthy, setIsHealthy] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const healthy = await dartbotAPI.healthCheck();
        setIsHealthy(healthy);
      } catch (err) {
        setIsHealthy(false);
      } finally {
        setChecking(false);
      }
    };

    checkHealth();
  }, []);

  return { isHealthy, checking };
}
