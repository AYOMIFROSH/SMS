// src/api/client.ts - Production-ready HTTP client with proper security
import axios, { AxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Centralized token manager with proper lifecycle
class TokenManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    console.log('🔧 Access token updated:', !!token);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearTokens(): void {
    console.log('🗑️ Clearing all tokens from memory');
    this.accessToken = null;
    this.refreshPromise = null;
  }

  hasValidToken(): boolean {
    return Boolean(this.accessToken);
  }

  // Prevent concurrent refresh attempts
  async refreshToken(): Promise<string | null> {
  
    if (this.refreshPromise) {
      console.log('🔄 Refresh already in progress, waiting...');
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
      console.log('🔄 Performing token refresh via httpOnly cookies...');

      const response = await axios.post(`${API_URL}/auth/refresh`, null, {
        withCredentials: true,
        timeout: 30000,
        headers: {
          'X-Skip-Auth-Interceptor': 'true'
        }
      });

      if (response.data?.success && response.data?.accessToken) {
        const newToken = response.data.accessToken;
        this.setAccessToken(newToken);

        // Emit token update event
        window.dispatchEvent(new CustomEvent('auth:tokenUpdated', {
          detail: { accessToken: newToken }
        }));

        return newToken;
      }

      throw new Error('Invalid refresh response');
    } catch (error: any) {
      console.error('❌ Token refresh failed:', error);

      // Clear tokens on refresh failure
      this.clearTokens();

      // Emit logout event
      window.dispatchEvent(new CustomEvent('auth:sessionExpired', {
        detail: { reason: 'refresh_failed' }
      }));

      return null;
    }
  }
}

export const tokenManager = new TokenManager();

// Enhanced axios client with proper security
const client = axios.create({
  baseURL: API_URL,
  timeout: 90000,
  withCredentials: true, // Essential for httpOnly cookies
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
  },
});

// Request interceptor
client.interceptors.request.use(
  (config) => {
    
    const startTime = Date.now();
    (config as any).metadata = { startTime };

    console.log(`📤 ${config.method?.toUpperCase()} ${config.url}`);

    // Add Bearer token if available
    const token = tokenManager.getAccessToken();
    if (token && !config.headers['X-Skip-Auth-Interceptor']) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with simplified error handling
client.interceptors.response.use((response) => {
  const cfg = response.config as AxiosRequestConfig & { metadata?: { startTime: number } };
  const duration = Date.now() - (cfg.metadata?.startTime ?? Date.now());

  if (duration > 30000) {
    console.warn(`⚠️ Slow response (${duration}ms) - possible cold start`);
  }

  return response;
},
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
      metadata?: { startTime: number };
      headers: any;
    };

    const duration = originalRequest?.metadata?.startTime
      ? Date.now() - originalRequest.metadata.startTime
      : 0;

    // Handle network errors (cold starts)
    if (!error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
      console.error(`❌ Network error (${duration}ms):`, error.message);

      if (duration > 30000) {
        toast.loading('Server is starting up, please wait...', { duration: 8000 });
      }

      return Promise.reject(error);
    }

    if (error.response) {
      const { status } = error.response;

      console.error(`❌ ${status} ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} (${duration}ms)`);

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
          // Refresh failed, let the error propagate
          console.error('❌ Refresh failed during 401 handling');
        }
      }

      // Handle other status codes without intrusive toasts
      switch (status) {
        case 403:
          if (!originalRequest?.url?.includes('/health')) {
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