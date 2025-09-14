// src/api/auth.ts - Fixed initialization flow
import client, { tokenManager } from './client';
import { User } from '@/types';

export interface RegisterData {
  firstname: string;
  lastname: string;
  username: string;
  email: string;
  phoneCode: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
}

export interface RegisterResponse extends AuthResponse {
  accessToken: string;
  user: User;
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


export const authApi = {
  /**
   * Login with credentials - server sets httpOnly cookies automatically
   */
  login: async (username: string, password: string): Promise<LoginResponse> => {
    console.log('Attempting login for:', username);

    try {
      const response = await client.post('/auth/login', { 
        username, 
        password 
      });

      if (response.data.success) {
        console.log('Login successful');
        
        // Store access token in memory
        tokenManager.setAccessToken(response.data.accessToken);
        
        return response.data;
      }
      
      throw new Error(response.data.message || 'Login failed');
    } catch (error: any) {
      console.error('Login failed:', error);
      
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
    console.log('Initiating logout process...');
    
    try {
      await client.post('/auth/logout');
      console.log('Server logout successful');
    } catch (error) {
      console.warn('Server logout failed, continuing with cleanup:', error);
    } finally {
      tokenManager.clearTokens();
      delete client.defaults.headers.common['Authorization'];
      console.log('Local tokens cleared');
    }
  },

  /**
   * Register new user account
   */
  register: async (userData: RegisterData): Promise<RegisterResponse> => {
    console.log('Attempting registration for:', userData.username);

    try {
      const response = await client.post('/auth/register', userData);

      if (response.data.success) {
        console.log('Registration successful');
        
        // Store access token in memory
        tokenManager.setAccessToken(response.data.accessToken);
        
        return response.data;
      }
      
      throw new Error(response.data.message || 'Registration failed');
    } catch (error: any) {
      console.error('Registration failed:', error);
      
      if (error.response?.data?.code) {
        const errorMap: Record<string, string> = {
          'DUPLICATE_FIELD': error.response.data.field === 'username' 
            ? 'Username already taken. Please choose another.'
            : 'Email address already registered.',
          'VALIDATION_ERROR': 'Please check your input and try again',
          'RATE_LIMIT_EXCEEDED': 'Too many attempts. Try again later.',
          'SERVER_ERROR': 'Server error occurred. Please try again.',
        };
        
        const message = errorMap[error.response.data.code] || error.response.data.message;
        throw new Error(message);
      }
      
      throw new Error(error.response?.data?.message || error.message || 'Registration failed');
    }
  },

  /**
   * Get current authenticated user
   */
  me: async (): Promise<User> => {
    console.log('Fetching current user...');
    
    const response = await client.get('/auth/me');
    
    if (response.data.success) {
      return response.data.user;
    }
    
    throw new Error(response.data.message || 'Failed to get user info');
  },

  /**
   * Initialize authentication - SIMPLIFIED APPROACH
   * Always try server validation first, regardless of any stored tokens
   */
  initializeAuth: async (): Promise<InitializeResponse> => {
    console.log('Initializing authentication...');

    try {
      // Step 1: Try to refresh token using httpOnly cookie
      console.log('Attempting token refresh...');
      const refreshResponse = await client.post('/auth/refresh', {}, {
        headers: { 'X-Skip-Auth-Interceptor': 'true' }
      });

      if (refreshResponse.data?.success && refreshResponse.data?.accessToken) {
        const accessToken = refreshResponse.data.accessToken;
        
        // Step 2: Set token in memory and axios header
        tokenManager.setAccessToken(accessToken);
        client.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        // Step 3: Fetch user info to confirm everything is working
        try {
          const user = await authApi.me();
          console.log('Auth initialization successful for user:', user.username);
          return { user, isAuthenticated: true };
        } catch (meError) {
          console.warn('User fetch failed after refresh:', meError);
          throw meError;
        }
      } else {
        throw new Error('No valid refresh token');
      }

    } catch (error: any) {
      console.log('Auth initialization failed - no valid session');
      
      // Clean up any stale tokens
      tokenManager.clearTokens();
      delete client.defaults.headers.common['Authorization'];
      
      // Return unauthenticated state (this is not an error condition)
      return { user: null, isAuthenticated: false };
    }
  },

  /**
   * Refresh access token using httpOnly refresh cookie
   */
  refresh: async (): Promise<string | null> => {
    try {
      console.log('Refreshing access token...');
      
      const response = await client.post('/auth/refresh', {}, {
        headers: { 'X-Skip-Auth-Interceptor': 'true' }
      });
      
      if (response.data?.success && response.data?.accessToken) {
        const newToken = response.data.accessToken;
        tokenManager.setAccessToken(newToken);
        
        console.log('Token refresh successful');
        return newToken;
      }
      
      throw new Error('Invalid refresh response');
      
    } catch (error) {
      console.error('Token refresh failed:', error);
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