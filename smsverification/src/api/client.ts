// src/api/client.ts - Enhanced with CSRF and iOS support
import axios, { AxiosError } from 'axios';
import { ApiError } from '@/types';
import type { AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// CSRF Token Manager
// CSRF Token Manager
class CSRFManager {
  private csrfToken: string | null = null;
  private fetchPromise: Promise<string> | null = null;
  private lastFetched: number | null = null;
  private readonly TOKEN_TTL = 10 * 60 * 1000; // 10 min TTL

  /**
   * Get a valid CSRF token, refreshing if missing or expired.
   */
  async getToken(): Promise<string> {
    if (this.hasValidToken()) return this.csrfToken as string;
    if (this.fetchPromise) return this.fetchPromise;

    this.fetchPromise = this.fetchToken();
    try {
      const token = await this.fetchPromise;
      return token;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Actually fetch a new token from the server.
   */
  private async fetchToken(): Promise<string> {
    try {
      const response = await axios.get(`${API_URL}/csrf-token`, {
        withCredentials: true,
        timeout: 10000
      });

      const csrfToken = response.data?.csrfToken;
      if (response.data?.success && typeof csrfToken === 'string' && csrfToken.trim()) {
        this.csrfToken = csrfToken;
        this.lastFetched = Date.now();
        return csrfToken;
      }

      throw new Error('Invalid CSRF response');
    } catch (error) {
      this.clearToken();
      console.warn('Failed to get CSRF token:', error);
      throw error;
    }
  }

  /**
   * Check if the current token is still valid based on TTL.
   */
  private hasValidToken(): boolean {
    if (!this.csrfToken || !this.lastFetched) return false;
    return Date.now() - this.lastFetched < this.TOKEN_TTL;
  }

  /**
   * Clear the token manually, e.g., on logout or CSRF failure.
   */
  clearToken(): void {
    this.csrfToken = null;
    this.lastFetched = null;
  }

  /**
   * Allow manual token injection if needed.
   */
  setToken(token: string): void {
    this.csrfToken = token;
    this.lastFetched = Date.now();
  }
}

// Enhanced Token Manager with iOS Support
// --- TokenManager (updated) ---
class TokenManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    console.log('Access token updated:', !!token);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearTokens(): void {
    console.log('Clearing all tokens from memory');
    this.accessToken = null;
    this.refreshPromise = null;
    csrfManager.clearToken();
  }

  hasValidToken(): boolean {
    return Boolean(this.accessToken);
  }

  async refreshToken(): Promise<string | null> {
    if (this.refreshPromise) {
      console.log('Refresh already in progress, waiting...');
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<string | null> {
    try {
      console.log('Performing token refresh via httpOnly cookies...');

      // Use httpOnly cookie refresh endpoint only. No localStorage fallbacks.
      const response = await axios.post(`${API_URL}/auth/refresh`, null, {
        withCredentials: true,
        timeout: 30000,
        headers: { 'X-Skip-Auth-Interceptor': 'true' }
      });

      if (response.data?.success && response.data?.accessToken) {
        const newToken = response.data.accessToken;
        this.setAccessToken(newToken);

        // Emit token update event for other parts of the app (still useful)
        window.dispatchEvent(new CustomEvent('auth:tokenUpdated', {
          detail: { accessToken: newToken }
        }));

        return newToken;
      }

      throw new Error('Invalid refresh response');
    } catch (error: any) {
      console.error('Token refresh failed:', error);

      // Clear tokens on refresh failure
      this.clearTokens();

      // Emit logout/session expired event
      window.dispatchEvent(new CustomEvent('auth:sessionExpired', {
        detail: { reason: 'refresh_failed' }
      }));

      return null;
    }
  }
}

export const tokenManager = new TokenManager();
export const csrfManager = new CSRFManager();

// Enhanced axios client
const client = axios.create({
  baseURL: API_URL,
  timeout: 90000,
  withCredentials: true, // Essential for httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
  },
});

// Request interceptor with CSRF support
client.interceptors.request.use(
  async (config) => {
    const startTime = Date.now();
    (config as any).metadata = { startTime };

    console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`);

    // Add Bearer token if available
    const token = tokenManager.getAccessToken();
    if (token && !config.headers['X-Skip-Auth-Interceptor']) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests
    const needsCSRF = ['post', 'put', 'patch', 'delete'].includes(
      config.method?.toLowerCase() || ''
    );

    if (needsCSRF && !config.headers['X-Skip-Auth-Interceptor']) {
      try {
        const csrfToken = await csrfManager.getToken();
        config.headers['X-CSRF-Token'] = csrfToken;
      } catch (error) {
        console.warn('Failed to get CSRF token for request:', error);
        // Continue without CSRF token - let server handle it
      }
    }

    // iOS helper header (no localStorage fallbacks)
    const userAgent = navigator.userAgent;
    if (/iPad|iPhone|iPod|CriOS|FxiOS/.test(userAgent)) {
      if (token) {
        config.headers['X-Access-Token'] = token;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);


// Response interceptor with enhanced error handling
client.interceptors.response.use(
  (response) => {
    const cfg = response.config as AxiosRequestConfig & { metadata?: { startTime: number } };
    const duration = Date.now() - (cfg.metadata?.startTime ?? Date.now());

    if (duration > 30000) {
      console.warn(`⚠️ Slow response (${duration}ms) - possible cold start`);
    }

    return response;
  },
  async (error: AxiosError<ApiError>) => {   
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
      metadata?: { startTime: number };
      headers: any;
    };

    const duration = originalRequest?.metadata?.startTime
      ? Date.now() - originalRequest.metadata.startTime
      : 0;

    // Handle network errors
    if (!error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
      console.error(`❌ Network error (${duration}ms):`, error.message);
      
      if (duration > 30000) {
        toast.loading('Server is starting up, please wait...', { duration: 8000 });
      }
      
      return Promise.reject(error);
    }

    if (error.response) {
      const { status, data } = error.response;
      console.error(`❌ ${status} ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} (${duration}ms)`);

      // Handle CSRF token errors
      if (status === 403 && data?.code === 'CSRF_ERROR') {
        console.warn('CSRF token invalid, clearing and retrying...');
        csrfManager.clearToken();
        
        if (originalRequest && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const newCSRFToken = await csrfManager.getToken();
            originalRequest.headers['X-CSRF-Token'] = newCSRFToken;
            return client(originalRequest);
          } catch (csrfError) {
            console.error('Failed to get new CSRF token:', csrfError);
          }
        }
      }

      // Handle 401 Unauthorized with token refresh
      if (status === 401 &&
        originalRequest &&
        !originalRequest._retry &&
        !originalRequest.headers['X-Skip-Auth-Interceptor'] &&
        !originalRequest.url?.includes('/auth/')) {

        originalRequest._retry = true;

        try {
          const newToken = await tokenManager.refreshToken();

          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return client(originalRequest);
          }
        } catch (refreshError) {
          console.error('Refresh failed during 401 handling');
        }
      }

      // Handle other status codes
      switch (status) {
        case 403:
          if (data?.code !== 'CSRF_ERROR' && !originalRequest?.url?.includes('/health')) {
            console.warn('🚫 Access forbidden');
          }
          break;
        case 429:
          const retryAfter = error.response.headers['retry-after'] || '60';
          toast.error(`Rate limited. Wait ${retryAfter}s`, { duration: 5000 });
          break;
        case 500:
          if (!originalRequest?.url?.includes('/health')) {
            console.error('🔥 Server error occurred');
          }
          break;
      }
    }

    return Promise.reject(error);
  }
);

// Health check utility
export const healthCheck = async (): Promise<boolean> => {
  try {
    const response = await client.get('/health', {
      headers: { 'X-Skip-Auth-Interceptor': 'true' },
      timeout: 30000
    });
    return response.status === 200;
  } catch {
    return false;
  }
};

export default client;
export { API_URL };