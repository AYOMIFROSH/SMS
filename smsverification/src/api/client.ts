// src/api/client.ts - Fixed for proper cookie-based refresh
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
  timeout: 30000,
});


// Request interceptor - only add Authorization header
client.interceptors.request.use(
  (config) => {
    console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.url}`);

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

// Response interceptor - handle token refresh via cookies
client.interceptors.response.use(
  (response) => {
    console.log(`📥 API Response: ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    return response;
  },
  async (error) => {
    // cast to any to allow custom properties like _retry/skipRetry without TS noise
    const originalRequest: any = error?.config;

    if (error.response) {
      const { status, data } = error.response;
      console.error(`❌ API Error: ${status} ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url}`, data);

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
            headers: { 'X-Skip-Retry': 'true' } as unknown as AxiosRequestHeaders
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
          toast.error('Access denied');
          break;
        case 429:
          {
            const retryAfter = error.response.headers['retry-after'];
            toast.error(`Too many requests. Please wait ${retryAfter || '60'} seconds.`);
            break;
          }
        case 500:
          toast.error('Server error. Please try again later.');
          break;
        default:
          // Only show error toast for non-401 errors or if not an initialization request
      }
    } else if (error.request) {
      console.error('❌ Network error:', error.request);
      toast.error('Network error. Please check your connection.');
    } else {
      console.error('❌ Request setup error:', error.message);
      toast.error('An unexpected error occurred.');
    }

    return Promise.reject(error);
  }
);

export default client;
export { API_URL };