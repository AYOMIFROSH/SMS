// src/api/auth.ts - Fixed to prevent infinite initialization loop
import client, { tokenManager } from './client';
import { User } from '@/types';

export interface LoginResponse {
  success: boolean;
  accessToken: string;
  user: User;
}

export interface MeResponse {
  success: boolean;
  data: User;
}

export interface CheckResponse {
  success: boolean;
  authenticated: boolean;
  user: User;
  session: {
    id: number;
    token: string;
  };
}

export interface RefreshResponse {
  success: boolean;
  accessToken: string;
  message: string;
}

// Track initialization to prevent multiple attempts
let isInitializing = false;

export const authApi = {
  // Login - receive access token, cookies are set automatically by server
  login: async (username: string, password: string): Promise<LoginResponse> => {
    console.log('🔐 Attempting login...');

    const response = await client.post('/auth/login', { username, password });

    if (response.data.success) {
      console.log('✅ Login successful');
      
      // Store only access token in memory
      tokenManager.setAccessToken(response.data.accessToken);
    }

    return response.data;
  },

  // Logout - server clears cookies
  logout: async (): Promise<void> => {
    try {
      console.log('🔐 Attempting logout...');
      await client.post('/auth/logout');
      console.log('✅ Server logout successful');
    } catch (error) {
      console.warn('⚠️ Server logout failed, but continuing with cleanup:', error);
    } finally {
      // Always clear local token
      tokenManager.clearTokens();
      console.log('✅ Local tokens cleared');
    }
  },

  // Get current user information
  me: async (): Promise<MeResponse> => {
    console.log('👤 Fetching user info...');
    const response = await client.get('/auth/me');
    return response.data;
  },

  // Check authentication status (if needed for debugging)
  check: async (): Promise<CheckResponse> => {
    console.log('🔍 Checking auth status...');
    const response = await client.get('/auth/check');
    return response.data;
  },

  // Initialize authentication from cookies (called on app start)
  // replace existing initializeAuth implementation with this
initializeAuth: async (): Promise<{ user: User | null; isAuthenticated: boolean }> => {
  if (isInitializing) {
    console.log('🔄 Authentication initialization already in progress...');
    return { user: null, isAuthenticated: false };
  }

  try {
    isInitializing = true;
    console.log('🚀 Initializing authentication from cookies (refresh-first)...');

    // 1) Try refresh first (uses httpOnly refresh cookie)
    try {
      const refreshResp = await client.post('/auth/refresh', undefined, {
        headers: { 'X-Skip-Retry': 'true' } 
      });

      if (refreshResp?.data?.success && refreshResp?.data?.accessToken) {
        const newToken = refreshResp.data.accessToken;
        tokenManager.setAccessToken(newToken);
        client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

        // ✅ Return user directly from refresh response, no need to call /auth/me
        if (refreshResp.data.user) {
          console.log('✅ Auth initialized via refresh (user returned)');
          return { user: refreshResp.data.user as User, isAuthenticated: true };
        }

        // If user was not returned, fallback to false because refresh didn't give full info
        console.log('⚠️ Refresh returned no user object; treating as unauthenticated');
        return { user: null, isAuthenticated: false };
      } else {
        console.log('ℹ️ Refresh completed but no accessToken returned; user not authenticated');
        tokenManager.clearTokens();
        return { user: null, isAuthenticated: false };
      }
    } catch (refreshErr: any) {
      if (refreshErr?.response?.status === 401) {
        console.log('ℹ️ Refresh returned 401 — user not authenticated');
        tokenManager.clearTokens();
        return { user: null, isAuthenticated: false };
      }
      console.warn('⚠️ Refresh request failed:', refreshErr?.message || refreshErr);
      return { user: null, isAuthenticated: false };
    }
  } finally {
    isInitializing = false;
  }
}

};