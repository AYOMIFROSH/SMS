// src/api/client.ts - Enhanced with cold start handling (keeping existing structure)
import axios, { type AxiosRequestHeaders } from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Only store access token for Authorization header
let accessToken: string | null = null;

// Prevent multiple concurrent refresh requests
let refreshPromise: Promise<any> | null = null;

export const tokenManager = {
  setAccessToken: (token: string | null) => {
    accessToken = token;
    console.log('🔧 Access token updated:', !!token);
  },

  getAccessToken: () => accessToken,

  clearTokens: () => {
    console.log('🗑️ Clearing access token from memory');
    accessToken = null;
    refreshPromise = null; // Clear refresh promise too
  },

  hasAccessToken: () => Boolean(accessToken)
};

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Essential for cookie-based auth
  timeout: 90000, // 🔧 Enhanced: Increased from 30s to 90s for Render cold starts
});

// 🆕 Enhanced: Add request timing for cold start detection
client.interceptors.request.use(
  (config) => {
    console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.url}`);

    // Add request start time for cold start detection
    (config as any).requestStartTime = Date.now();

    // Ensure headers object exists (cast to AxiosRequestHeaders to satisfy TS)
    if (!config.headers) config.headers = {} as AxiosRequestHeaders;

    // Add Bearer token if available
    if (accessToken) {
      (config.headers as any).Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// 🔧 Enhanced: Response interceptor with cold start handling
client.interceptors.response.use(
  (response) => {
    // Calculate request duration for cold start detection
    const duration = Date.now() - (response.config as any).requestStartTime;
    console.log(`📥 API Response: ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`);
    
    // Warn about potential cold start
    if (duration > 30000) {
      console.warn(`⚠️ Slow response detected (${duration}ms) - possible cold start`);
    }
    
    return response;
  },
  async (error) => {
    // cast to any to allow custom properties like _retry/skipRetry without TS noise
    const originalRequest: any = error?.config;
    const duration = Date.now() - (originalRequest?.requestStartTime || Date.now());

    // 🆕 Enhanced: Handle network errors (cold starts)
    if (error.code === 'ERR_NETWORK' || error.code === 'ERR_CONNECTION_CLOSED') {
      console.error(`❌ Network/Connection error (${duration}ms) - likely Render cold start:`, {
        code: error.code,
        message: error.message,
        url: originalRequest?.url
      });
      
      // Show user-friendly cold start message
      if (!originalRequest?._coldStartRetry) {
        toast.loading('Server is waking up, please wait...', { 
          id: 'cold-start',
          duration: 8000 
        });
        
        // Retry once with even longer timeout
        originalRequest._coldStartRetry = true;
        originalRequest.timeout = 120000; // 2 minutes for retry
        
        console.log('🔄 Retrying with extended timeout for cold start...');
        return client(originalRequest);
      } else {
        toast.dismiss('cold-start');
        toast.error('Server connection failed. Please try again.', { duration: 5000 });
      }
    }

    // 🆕 Enhanced: Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_TIMEOUT') {
      console.error(`❌ Request timeout (${duration}ms):`, {
        url: originalRequest?.url,
        timeout: originalRequest?.timeout
      });
      
      // Let components handle timeout UI - no toast spam
    }

    if (error.response) {
      const { status, data } = error.response;
      console.error(`❌ API Error: ${status} ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} (${duration}ms)`, data);

      // Defensive header access: originalRequest.headers may be undefined
      const headers = originalRequest?.headers || ({} as AxiosRequestHeaders);

      // CHECK: Skip retry logic for initialization requests
      if (headers['X-Skip-Retry'] === 'true' || headers['x-skip-retry'] === 'true' || originalRequest.skipRetry === true) {
        console.log('⏭️ Skipping retry for initialization request');
        return Promise.reject(error);
      }

      // Prevent refresh attempts for auth endpoints themselves
      if (originalRequest.url && (
        originalRequest.url.includes('/auth/login') ||
        originalRequest.url.includes('/auth/refresh') ||
        originalRequest.url.includes('/auth/logout')
      )) {
        console.log('⏭️ Auth endpoint error - not attempting refresh:', originalRequest.url);
        return Promise.reject(error);
      }

      // Token expired - attempt refresh using HTTP-only cookies
      if (status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // If there's already a refresh in progress, wait for it
          if (refreshPromise) {
            console.log('🔄 Refresh already in progress, waiting...');
            await refreshPromise;

            // Use the refreshed token
            if (accessToken) {
              if (!originalRequest.headers) originalRequest.headers = {} as AxiosRequestHeaders;
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return client(originalRequest);
            } else {
              throw new Error('Refresh completed but no token available');
            }
          }

          console.log('🔄 Starting token refresh via cookies...');

          // ✅ FIXED: Remove localStorage dependency - cookies are sent automatically
          console.log('🔍 Refresh request will use HTTP-only cookies automatically');

          // Create a single refresh promise that all concurrent requests can share
          refreshPromise = client.post('/auth/refresh', undefined, {
            headers: { 'X-Skip-Retry': 'true' } as unknown as AxiosRequestHeaders,
            timeout: 90000 // 🔧 Enhanced: Longer timeout for refresh too
          });
          
          const response = await refreshPromise;

          if (response.data?.success && response.data?.accessToken) {
            const newAccessToken = response.data.accessToken;

            // Update access token in memory
            tokenManager.setAccessToken(newAccessToken);
            console.log('✅ Token refresh successful');

            // Emit event for app-wide token update
            window.dispatchEvent(new CustomEvent('auth:tokensUpdated', {
              detail: { accessToken: newAccessToken }
            }));

            // Retry the original request with new token
            if (!originalRequest.headers) originalRequest.headers = {} as AxiosRequestHeaders;
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return client(originalRequest);
          } else {
            throw new Error('Refresh response invalid: ' + JSON.stringify(response.data));
          }

        } catch (refreshError: any) {
          console.error('❌ Token refresh failed:', refreshError);

          // Log the actual refresh error details
          if (refreshError.response) {
            console.error('❌ Refresh error response:', {
              status: refreshError.response.status,
              data: refreshError.response.data,
              headers: refreshError.response.headers
            });
          }

          // Clear tokens and emit logout event
          tokenManager.clearTokens();
          window.dispatchEvent(new CustomEvent('auth:logout', {
            detail: { 
              reason: 'token_refresh_failed',
              error: refreshError.message 
            }
          }));

          return Promise.reject(refreshError);
        } finally {
          // Clear the refresh promise when done (success or failure)
          refreshPromise = null;
        }
      }

      // Handle other status codes
      switch (status) {
        case 403:
          // Only toast for explicit user actions, not background requests
          if (!originalRequest.url?.includes('/health') && !originalRequest.url?.includes('/stats')) {
            toast.error('Access denied');
          }
          break;
        case 429:
          {
            const retryAfter = error.response.headers['retry-after'];
            toast.error(`Too many requests. Please wait ${retryAfter || '60'} seconds.`);
            break;
          }
        case 500:
          // Only toast server errors for user-initiated actions
          if (!originalRequest.url?.includes('/health') && !originalRequest.url?.includes('/stats')) {
            toast.error('Server error. Please try again later.');
          }
          break;
        default:
          // No default toast - let components handle their own error UI
      }
    } else if (error.request) {
      console.error('❌ Network error:', error.request);
      // Let components handle network error UI - no generic toast
    } else {
      console.error('❌ Request setup error:', error.message);
      // Let components handle setup error UI - no generic toast
    }

    return Promise.reject(error);
  }
);

// 🆕 Enhanced: Health check utility for cold start detection
export const checkServerHealth = async (): Promise<{ healthy: boolean; duration: number; coldStart: boolean }> => {
  try {
    console.log('🏥 Checking server health...');
    const startTime = Date.now();
    
    const response = await client.get('/health', {
      timeout: 120000, // 2 minutes for health check
      headers: { 'X-Skip-Retry': 'true' } as unknown as AxiosRequestHeaders
    });
    
    const duration = Date.now() - startTime;
    const coldStart = duration > 30000;
    
    console.log(`✅ Server healthy (${duration}ms)${coldStart ? ' - was cold' : ''}`, response.data);
    
    if (coldStart) {
      toast.success('Server is ready!', { icon: '🚀', duration: 3000 });
    }
    
    return { healthy: true, duration, coldStart };
  } catch (error: any) {
    console.error('❌ Server health check failed:', error);
    return { healthy: false, duration: 0, coldStart: false };
  }
};

// 🆕 Enhanced: Warmup utility to prevent cold starts
export const warmupServer = async (): Promise<boolean> => {
  try {
    console.log('🔥 Warming up server...');
    await checkServerHealth();
    return true;
  } catch (error) {
    console.warn('⚠️ Server warmup failed:', error);
    return false;
  }
};

export default client;
export { API_URL };