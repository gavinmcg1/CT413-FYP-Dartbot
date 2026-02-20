/**
 * Dartbot API Service
 * Handles all communication with the Flask backend
 */

import axios, { AxiosInstance } from 'axios';
import Constants from 'expo-constants';
import { API_CONFIG } from '../config';



// Configuration - adjust IP/port as needed for your local development
const IS_WEB = typeof window !== 'undefined';
const WEB_HOST = IS_WEB ? window.location.hostname : 'localhost';

function normalizeApiRoot(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  const withoutApiSuffix = withoutTrailingSlash.replace(/\/api$/i, '');
  return withoutApiSuffix;
}

function getExpoHostApiUrl(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost;

  if (!hostUri || typeof hostUri !== 'string') {
    return null;
  }

  const host = hostUri.split(':')[0]?.trim();
  if (!host) {
    return null;
  }

  return `http://${host}:8000`;
}

const EXPLICIT_API_URL =
  normalizeApiRoot(process.env.EXPO_PUBLIC_DARTBOT_API_URL) ||
  normalizeApiRoot(API_CONFIG.BASE_URL);

const API_BASE_URL = EXPLICIT_API_URL || (
  IS_WEB
    ? (normalizeApiRoot(`http://${WEB_HOST}:8000`) || 'http://localhost:8000')
    : (getExpoHostApiUrl() || 'http://localhost:8000')
);
const API_TIMEOUT = API_CONFIG.TIMEOUT;

interface CheckoutRecommendation {
  best?: {
    sequence: string;
    safety: number;
  };
  all_candidates?: string[];
  safest?: {
    sequence: string;
    safety: number;
  };
  top_5?: Array<{
    sequence: string[] | string;
    safety: number;
    is_one_dart?: boolean;
  }>;
}

interface BotStrategyResponse {
  level: number;
  current_score: number;
  out_rule: string;
  mean_score: number;
  can_attempt_checkout: boolean;
  checkout_recommendation: any;
  strategy: {
    finish_if_possible: boolean;
    target_mean: number;
    is_finishing: boolean;
  };
}

interface SimulationResultsResponse {
  model?: {
    slope: number;
    intercept: number;
  };
  bins?: Record<string, any>;
  empirical_miss_dist?: Record<string, number>;
}

interface DoubleOutcomesResponse {
  bins?: Record<string, Record<string, {
    hit_double?: number;
    miss_inside?: number;
    miss_outside?: number;
    neighbor_singledouble?: number;
    other?: number;
    samples?: number;
  }>>;
}

class DartbotAPI {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if backend is reachable and has data
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.api.get('/api/health');
      return response.data.has_data === true;
    } catch {
      return false;
    }
  }

  /**
   * Get checkout recommendation for a specific score and average range
   * @param score - The remaining score (2-170)
   * @param averageRange - The average range bin (e.g., "30-39")
   */
  async getCheckoutRecommendation(
    score: number,
    averageRange: string = '30-39'
  ): Promise<CheckoutRecommendation | null> {
    try {
      const response = await this.api.post('/api/checkout/recommend', {
        score,
        average_range: averageRange,
      });

      if (response.data.recommendation) {
        return response.data.recommendation;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get approach play suggestion for high scores (>170)
   * Recommends the best starting segment to set up good finishing positions
   * @param score - The remaining score (typically > 170)
   * @param outRule - "straight" or "double" out rule
   */
  async getApproachSuggestion(
    score: number,
    outRule: string = 'double',
    dartsAvailable: number = 3
  ): Promise<{ segment: number; target?: string; reason: string; approach_play?: boolean; alternatives: Array<{ segment: number; target?: string; quality: number }> } | null> {
    try {
      const response = await this.api.post('/api/approach/suggest', {
        score,
        out_rule: outRule,
        darts_available: dartsAvailable,
      });

      if (response.data.segment !== undefined) {
        return response.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get simulation results data (miss distributions, model)
   */
  async getSimulationResults(): Promise<SimulationResultsResponse | null> {
    try {
      const response = await this.api.get<SimulationResultsResponse>('/api/simulation/results');
      if (response.data && Object.keys(response.data).length > 0) {
        return response.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get double outcomes data (hit/miss distributions for aimed doubles)
   */
  async getDoubleOutcomes(): Promise<DoubleOutcomesResponse | null> {
    try {
      const response = await this.api.get<DoubleOutcomesResponse>('/api/double/outcomes');
      if (response.data && Object.keys(response.data).length > 0) {
        return response.data;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get bot throw strategy based on level and current game state
   * @param level - Bot difficulty level (1-18)
   * @param currentScore - Bot's current remaining score
   * @param outRule - "straight" or "double"
   * @param averageRange - Optional average range for checkout recommendations
   */
  async getBotStrategy(
    level: number,
    currentScore: number,
    outRule: string = 'double',
    averageRange: string = '30-39'
  ): Promise<BotStrategyResponse | null> {
    try {
      const response = await this.api.post<BotStrategyResponse>('/api/bot/strategy', {
        level,
        current_score: currentScore,
        out_rule: outRule,
        average_range: averageRange,
      });

      return response.data;
    } catch {
      return null;
    }
  }

}

// Export singleton instance
export const dartbotAPI = new DartbotAPI();
export default dartbotAPI;
