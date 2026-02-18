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
const STATIC_LAN_API_URL = 'http://10.226.144.244:8000';
const API_HEALTH_TIMEOUT = 3000;

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
    : (getExpoHostApiUrl() || STATIC_LAN_API_URL)
);
const API_TIMEOUT = 15000; // Increased timeout for network requests

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

interface CheckoutBinsResponse {
  bins: string[];
  count: number;
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
  private readonly candidateBaseUrls: string[];
  private resolveBaseUrlPromise: Promise<void> | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const expoHostApiUrl = getExpoHostApiUrl();
    const explicitApiUrl = EXPLICIT_API_URL;
    this.candidateBaseUrls = Array.from(new Set([
      explicitApiUrl,
      API_BASE_URL,
      expoHostApiUrl,
      STATIC_LAN_API_URL,
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://10.0.2.2:8000',
    ].filter((url): url is string => Boolean(url))));

    console.log('[API] Initial base URL:', this.api.defaults.baseURL);
    console.log('[API] Candidate base URLs:', this.candidateBaseUrls.join(', '));

    // Add error interceptor
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.message);
        throw error;
      }
    );
  }

  private async ensureReachableBaseURL(): Promise<void> {
    if (this.resolveBaseUrlPromise) {
      await this.resolveBaseUrlPromise;
      return;
    }

    this.resolveBaseUrlPromise = (async () => {
      for (const candidateUrl of this.candidateBaseUrls) {
        try {
          console.log(`[API] Probing candidate: ${candidateUrl}`);
          const response = await axios.get(`${candidateUrl}/api/health`, { timeout: API_HEALTH_TIMEOUT });
          if (response.status === 200) {
            if (this.api.defaults.baseURL !== candidateUrl) {
              console.log(`[API] Using reachable base URL: ${candidateUrl}`);
            }
            this.api.defaults.baseURL = candidateUrl;
            return;
          }
        } catch {
          console.warn(`[API] Candidate unreachable: ${candidateUrl}`);
        }
      }

      console.warn(`[API] No reachable API base URL found. Keeping current base URL: ${this.api.defaults.baseURL}`);
    })();

    try {
      await this.resolveBaseUrlPromise;
    } finally {
      this.resolveBaseUrlPromise = null;
    }
  }

  /**
   * Check if backend is reachable and has data
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureReachableBaseURL();
      const response = await this.api.get('/api/health');
      return response.data.has_data === true;
    } catch (error) {
      console.warn('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get all available checkout average bins
   */
  async getCheckoutBins(): Promise<string[]> {
    try {
      await this.ensureReachableBaseURL();
      const response = await this.api.get<CheckoutBinsResponse>('/api/checkout/bins');
      return response.data.bins;
    } catch (error) {
      console.error('Failed to get checkout bins:', error);
      return ['30-39', '40-49', '50-59']; // Fallback defaults
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
      await this.ensureReachableBaseURL();
      const response = await this.api.post('/api/checkout/recommend', {
        score,
        average_range: averageRange,
      });

      if (response.data.recommendation) {
        return response.data.recommendation;
      }
      return null;
    } catch (error) {
      console.error(`Failed to get checkout recommendation for score ${score}:`, error);
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
      await this.ensureReachableBaseURL();
      console.log(`[API] Calling /api/approach/suggest with score=${score}, outRule=${outRule}, dartsAvailable=${dartsAvailable}`);
      const response = await this.api.post('/api/approach/suggest', {
        score,
        out_rule: outRule,
        darts_available: dartsAvailable,
      });

      console.log(`[API] Response received:`, response.data);
      if (response.data.segment !== undefined) {
        return response.data;
      }
      console.warn(`[API] Response missing segment field:`, response.data);
      return null;
    } catch (error) {
      console.error(`Failed to get approach suggestion for score ${score}:`, error);
      return null;
    }
  }

  /**
   * Get simulation results data (miss distributions, model)
   */
  async getSimulationResults(): Promise<SimulationResultsResponse | null> {
    try {
      await this.ensureReachableBaseURL();
      console.log('[API] Fetching simulation results from ' + this.api.defaults.baseURL + '/api/simulation/results');
      const response = await this.api.get<SimulationResultsResponse>('/api/simulation/results');
      console.log('[API] Simulation results received:', response.data);
      if (response.data && Object.keys(response.data).length > 0) {
        return response.data;
      }
      console.warn('[API] Simulation results data is empty');
      return null;
    } catch (error) {
      console.error('Failed to get simulation results:', error);
      return null;
    }
  }

  /**
   * Get double outcomes data (hit/miss distributions for aimed doubles)
   */
  async getDoubleOutcomes(): Promise<DoubleOutcomesResponse | null> {
    try {
      await this.ensureReachableBaseURL();
      console.log('[API] Fetching double outcomes from ' + this.api.defaults.baseURL + '/api/double/outcomes');
      const response = await this.api.get<DoubleOutcomesResponse>('/api/double/outcomes');
      console.log('[API] Double outcomes received:', response.data);
      if (response.data && Object.keys(response.data).length > 0) {
        return response.data;
      }
      console.warn('[API] Double outcomes data is empty');
      return null;
    } catch (error) {
      console.error('Failed to get double outcomes:', error);
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
      await this.ensureReachableBaseURL();
      const response = await this.api.post<BotStrategyResponse>('/api/bot/strategy', {
        level,
        current_score: currentScore,
        out_rule: outRule,
        average_range: averageRange,
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get bot strategy:', error);
      return null;
    }
  }

  /**
   * Set the API base URL (useful for dynamic configuration)
   */
  setBaseURL(url: string): void {
    this.api.defaults.baseURL = url;
  }

  /**
   * Get the current base URL
   */
  getBaseURL(): string {
    return this.api.defaults.baseURL || API_BASE_URL;
  }
}

// Export singleton instance
export const dartbotAPI = new DartbotAPI();
export default dartbotAPI;
