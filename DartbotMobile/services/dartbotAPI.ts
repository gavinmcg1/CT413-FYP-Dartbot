/**
 * Dartbot API Service
 * Handles all communication with the Flask backend
 */

import axios, { AxiosInstance } from 'axios';

// Configuration - adjust IP/port as needed for your local development
const IS_WEB = typeof window !== 'undefined';
const WEB_HOST = IS_WEB ? window.location.hostname : 'localhost';
const API_BASE_URL = IS_WEB ? `http://${WEB_HOST}:5000` : 'http://192.168.1.100:5000'; // Update as needed
const API_TIMEOUT = 10000; // Increased from 5s to 10s for multiple API calls per turn

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

    // Add error interceptor
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('API Error:', error.message);
        throw error;
      }
    );
  }

  /**
   * Check if backend is reachable and has data
   */
  async healthCheck(): Promise<boolean> {
    try {
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
   * Get simulation results data (miss distributions, model)
   */
  async getSimulationResults(): Promise<SimulationResultsResponse | null> {
    try {
      const response = await this.api.get<SimulationResultsResponse>('/api/simulation/results');
      return response.data;
    } catch (error) {
      console.error('Failed to get simulation results:', error);
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
