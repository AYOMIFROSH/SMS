// src/api/client-mobile.ts - Enhanced client for mobile browser compatibility
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { ApiError } from '@/types';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Mobile detection
const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

class MobileTokenManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private lastRefresh: number = 0;
  private readonly REFRESH_COOLDOWN = 5000; // 5 seconds

  setAccessToken(token: string | null): void {
    this.accessToken = token;
    console.log(`[Mobile] Access token ${token ? 'set' : 'cleared'}`);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearTokens(): void {
    console.log('[Mobile] Clearing all tokens');
    this.accessToken = null;
    this.refreshPromise = null;
    this.lastRefresh = 0;
  }

  async refreshToken(): Promise<string | null> {
    // Prevent rapid refresh attempts on mobile
    const now = Date.now();
    if (now - this.lastRefresh < this.REFRESH_COOLDOWN) {
      console.log('[Mobile] Refresh cooldown active, skipping');
      return this.accessToken;
    }

    if (this.refreshPromise) {
      console.log('[Mobile] Refresh already in progress, waiting...');
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    
    try {
      const result = await this.refreshPromise;
      this.lastRefresh = now;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<string | null> {
    try {
      console.log('[Mobile] Performing token refresh...');

      // Mobile-specific headers and configuration
      const refreshConfig: AxiosRequestConfig = {
        withCredentials: true,
        timeout: isMobile ? 45000 : 30000, // Longer timeout for mobile
        headers: {
          'X-Skip-Auth-Interceptor': 'true',
          'Content-Type': 'application/json',
          // Mobile-specific headers
          ...(isMobile && {
            'X-Mobile-Request': 'true',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          })
        }
      };

      const response = await axios.post(`${API_URL}/auth/refresh`, {}, refreshConfig);

      if (response.data?.success && response.data?.accessToken) {
        const newToken = response.data.accessToken;
        this.setAccessToken(newToken);

        // Emit success event
        window.dispatchEvent(new CustomEvent('auth:tokenUpdated', {
          detail: { accessToken: newToken, source: 'mobile-refresh' }
        }));

        return newToken;
      }

      throw new Error('Invalid refresh response');
    } catch (error: any) {
      console.error('[Mobile] Token refresh failed:', error);
      
      // Check if it's a mobile-specific error
      if (isMobile && error.message?.includes('Network Error')) {
        console.warn('[Mobile] Network error - possible connection switch');
        // Don't immediately clear tokens on network errors for mobile
        return null;
      }

      this.clearTokens();
      
      window.dispatchEvent(new CustomEvent('auth:sessionExpired', {
        detail: { reason: 'mobile-refresh-failed', error: error.message }
      }));

      return null;
    }
  }
}

export const mobileTokenManager = new MobileTokenManager();

// Enhanced axios client with mobile optimizations
const client = axios.create({
  baseURL: API_URL,
  timeout: isMobile ? 60000 : 30000, // Longer timeouts for mobile
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    // Mobile-specific headers
    ...(isMobile && {
      'X-Mobile-Client': 'true',
      'X-Mobile-Platform': isIOS ? 'ios' : 'android'
    })
  },
});

// Mobile-enhanced request interceptor
client.interceptors.request.use(
  async (config) => {
    const startTime = Date.now();
    (config as any).metadata = { startTime };

    // Add Bearer token
    const token = mobileTokenManager.getAccessToken();
    if (token && !config.headers['X-Skip-Auth-Interceptor']) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Mobile-specific optimizations
    if (isMobile) {
      // Add cache-busting for mobile browsers
      config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      config.headers['Pragma'] = 'no-cache';
      
      // Add timestamp to prevent mobile caching issues
      if (config.method?.toLowerCase() === 'get') {
        const separator = config.url?.includes('?') ? '&' : '?';
        config.url += `${separator}_mobile_t=${Date.now()}`;
      }
    }

    // Ensure POST requests have valid body
    if (config.method?.toLowerCase() === 'post' && !config.data) {
      config.data = {};
    }

    console.log(`[${isMobile ? 'Mobile' : 'Desktop'}] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Mobile-enhanced response interceptor
client.interceptors.response.use(
  (response) => {
    const cfg = response.config as AxiosRequestConfig & { metadata?: { startTime: number } };
    const duration = Date.now() - (cfg.metadata?.startTime ?? Date.now());

    if (isMobile && duration > 45000) {
      console.warn(`[Mobile] Very slow response (${duration}ms) - network issue?`);
    }

    return response;
  },
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
      _mobileRetry?: boolean;
      metadata?: { startTime: number };
      headers: any;
    };

    // Mobile-specific error handling
    if (isMobile && !error.response && error.code === 'ERR_NETWORK') {
      console.warn('[Mobile] Network error - possible connection switch or background throttling');
      
      // For mobile network errors, try once more after a short delay
      if (!originalRequest._mobileRetry) {
        originalRequest._mobileRetry = true;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('[Mobile] Retrying after network error...');
        return client(originalRequest);
      }
      
      toast.error('Connection lost. Please check your internet connection.', { duration: 5000 });
      return Promise.reject(error);
    }

    if (error.response) {
      const { status} = error.response;

      // Handle 401 with mobile-specific logic
      if (status === 401 &&
        originalRequest &&
        !originalRequest._retry &&
        !originalRequest.headers['X-Skip-Auth-Interceptor'] &&
        !originalRequest.url?.includes('/auth/')) {

        originalRequest._retry = true;

        try {
          console.log('[Mobile] 401 detected, attempting token refresh...');
          const newToken = await mobileTokenManager.refreshToken();

          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            
            // Add extra delay for mobile browsers
            if (isMobile) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            return client(originalRequest);
          }
        } catch (refreshError) {
          console.error('[Mobile] Refresh failed during 401 handling');
          
          // Mobile-specific: Don't redirect immediately, let the user try again
          if (isMobile) {
            toast.error('Session expired. Please log in again.', { 
              duration: 8000,
              id: 'mobile-session-expired' 
            });
          }
        }
      }

      // Mobile-specific status code handling
      if (isMobile) {
        switch (status) {
          case 403:
            console.warn('[Mobile] 403 - possible cookie issue');
            break;
          case 429:
            toast.error('Too many requests. Mobile networks may be slower.', { duration: 6000 });
            break;
          case 500:
            console.error('[Mobile] Server error - check mobile compatibility');
            break;
        }
      }
    }

    return Promise.reject(error);
  }
);

export default client;
export { API_URL, isMobile, isIOS };