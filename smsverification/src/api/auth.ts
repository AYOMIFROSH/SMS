// src/api/auth.ts - Simplified and secure authentication API
import client, { tokenManager } from './client';
import { User } from '@/types';

export interface AuthResponse {
  success: boolean;
  message?: string;
}

export interface LoginResponse extends AuthResponse {
  accessToken: string;
  user: User;
}

export interface MeResponse extends AuthResponse {
  user: User;
}

export interface InitializeResponse {
  user: User | null;
  isAuthenticated: boolean;
}

let isInitializing = false;

export const authApi = {
  /**
   * Login with credentials - server sets httpOnly cookies automatically
   */
  login: async (username: string, password: string): Promise<LoginResponse> => {
    console.log('🔐 Attempting login for:', username);

    try {
      const response = await client.post('/auth/login', { 
        username, 
        password 
      });

      if (response.data.success) {
        console.log('✅ Login successful');
        
        // Store access token in memory
        tokenManager.setAccessToken(response.data.accessToken);
        
        return response.data;
      }
      
      throw new Error(response.data.message || 'Login failed');
    } catch (error: any) {
      console.error('❌ Login failed:', error);
      
      if (error.response?.data?.code) {
        const errorMap: Record<string, string> = {
          'ACCOUNT_NOT_FOUND': 'Account not found with this username or email',
          'INVALID_PASSWORD': 'Incorrect password provided',
          'ACCOUNT_INACTIVE': 'Account is inactive. Contact support.',
          'RATE_LIMIT_EXCEEDED': 'Too many attempts. Try again later.',
          'TWO_FACTOR_REQUIRED': 'Two-factor authentication required',
        };
        
        const message = errorMap[error.response.data.code] || error.response.data.message;
        throw new Error(message);
      }
      
      throw new Error(error.response?.data?.message || error.message || 'Login failed');
    }
  },

  /**
   * Logout - clears server cookies and local tokens
   */
  logout: async (): Promise<void> => {
    console.log('🔐 Initiating logout process...');
    
    try {
      // Call server logout endpoint to clear httpOnly cookies
      await client.post('/auth/logout');
      console.log('✅ Server logout successful');
    } catch (error) {
      console.warn('⚠️ Server logout failed, continuing with cleanup:', error);
    } finally {
      // Always clear local tokens regardless of server response
      tokenManager.clearTokens();
      
      // Clear axios default headers
      delete client.defaults.headers.common['Authorization'];
      
      console.log('✅ Local tokens cleared');
    }
  },

  /**
   * Get current authenticated user
   */
  me: async (): Promise<User> => {
    console.log('👤 Fetching current user...');
    
    const response = await client.get('/auth/me');
    
    if (response.data.success) {
      return response.data.user;
    }
    
    throw new Error(response.data.message || 'Failed to get user info');
  },

  /**
   * Initialize authentication from httpOnly cookies on app start
   */
  initializeAuth: async (): Promise<InitializeResponse> => {
  if (isInitializing) {
    console.log('🔄 Auth initialization already in progress...');
    return { user: null, isAuthenticated: false };
  }

  isInitializing = true;
  console.log('🚀 Initializing authentication from cookies...');

  try {
    // 1) Refresh token using httpOnly cookie
    const newToken = await tokenManager.refreshToken();

    if (!newToken) {
      console.log('ℹ️ No valid session found (refresh returned null)');
      return { user: null, isAuthenticated: false };
    }

    // 2) Immediately set Authorization header for subsequent calls
    client.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

    // 3) Now fetch the user and wait for it — only then consider user authenticated
    try {
      const user = await authApi.me(); // will throw if /me fails
      console.log('✅ User authenticated during init:', user?.username ?? user?.id);
      return { user, isAuthenticated: true };
    } catch (meErr: any) {
      // If /me fails after a successful refresh, treat as unauthenticated
      console.warn('⚠️ /me failed during init after refresh:', meErr?.message || meErr);
      tokenManager.clearTokens();
      delete client.defaults.headers.common['Authorization'];
      return { user: null, isAuthenticated: false };
    }

  } catch (error: any) {
    console.warn('⚠️ Auth initialization error:', error?.message || error);
    tokenManager.clearTokens();
    delete client.defaults.headers.common['Authorization'];
    return { user: null, isAuthenticated: false };
  } finally {
    isInitializing = false;
  }
},

  /**
   * Refresh access token using httpOnly refresh cookie
   */
  refresh: async (): Promise<string | null> => {
    try {
      console.log('🔄 Refreshing access token...');
      
      const response = await client.post('/auth/refresh', null, {
        headers: { 'X-Skip-Auth-Interceptor': 'true' }
      });
      
      if (response.data?.success && response.data?.accessToken) {
        const newToken = response.data.accessToken;
        tokenManager.setAccessToken(newToken);
        
        console.log('✅ Token refresh successful');
        return newToken;
      }
      
      throw new Error('Invalid refresh response');
      
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      tokenManager.clearTokens();
      return null;
    }
  },

  /**
   * Validate current session
   */
  validateSession: async (): Promise<boolean> => {
    try {
      await authApi.me();
      return true;
    } catch {
      return false;
    }
  }
};