// src/store/slices/authSlice.ts - Simplified and secure auth state management
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/api/auth';
import { tokenManager } from '@/api/client';
import { User } from '@/types';

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  lastActivity: number | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  initialized: false,
  lastActivity: null,
};

// Thunks
export const login = createAsyncThunk<
  { user: User; accessToken: string },
  { username: string; password: string },
  { rejectValue: string }
>(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await authApi.login(username, password);
      return {
        user: response.user,
        accessToken: response.accessToken
      };
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const logout = createAsyncThunk<void, void, { rejectValue: string }>(
  'auth/logout',
  async (_, { }) => {
    try {
      await authApi.logout();
    } catch (error: any) {
      // Don't reject logout - always clear local state
      console.warn('Logout API call failed, but clearing local state:', error.message);
    }
  }
);

export const initializeAuth = createAsyncThunk<
  { user: User | null; isAuthenticated: boolean },
  void,
  { rejectValue: string }
>(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.initializeAuth();
    } catch (error: any) {
      return rejectWithValue(error.message || 'Authentication initialization failed');
    }
  }
);

export const refreshTokens = createAsyncThunk<
  string,
  void,
  { rejectValue: string }
>(
  'auth/refresh',
  async (_, { rejectWithValue }) => {
    try {
      const newToken = await authApi.refresh();
      if (!newToken) {
        throw new Error('Token refresh failed');
      }
      return newToken;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchCurrentUser = createAsyncThunk<
  User,
  void,
  { rejectValue: string }
>(
  'auth/me',
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.me();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Direct credential setters (for login success)
    setCredentials: (state, action: PayloadAction<{ user: User; accessToken: string }>) => {
      const { user, accessToken } = action.payload;
      
      state.user = user;
      state.accessToken = accessToken;
      state.isAuthenticated = true;
      state.error = null;
      state.lastActivity = Date.now();
      state.initialized = true;
      
      // Sync with token manager
      tokenManager.setAccessToken(accessToken);
      
      console.log('Credentials set in Redux store');
    },

    // Clear all credentials (for logout)
    clearCredentials: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.lastActivity = null;
      state.initialized = true; // Keep initialized true
      
      // Clear from token manager
      tokenManager.clearTokens();
      
      console.log('Credentials cleared from Redux store');
    },

    // Update only the access token (for refresh)
    updateAccessToken: (state, action: PayloadAction<{ accessToken: string }>) => {
      const { accessToken } = action.payload;
      
      state.accessToken = accessToken;
      state.lastActivity = Date.now();
      
      // Sync with token manager
      tokenManager.setAccessToken(accessToken);
      
      console.log('Access token updated in Redux store');
    },

    // Update user information
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        state.lastActivity = Date.now();
      }
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Update last activity
    updateActivity: (state) => {
      state.lastActivity = Date.now();
    },

    // Handle session expiration
    sessionExpired: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.error = 'Session expired. Please log in again.';
      
      // Clear from token manager
      tokenManager.clearTokens();
      
      console.log('Session marked as expired');
    }
  },

  extraReducers: (builder) => {
    builder
      // Initialize Auth
      .addCase(initializeAuth.pending, (state) => {
        if (!state.initialized) {
          state.loading = true;
        }
        state.error = null;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        const { user, isAuthenticated } = action.payload;
        
        state.loading = false;
        state.initialized = true;
        state.isAuthenticated = isAuthenticated;
        state.user = user;
        state.error = null;
        
        if (isAuthenticated && user) {
          state.lastActivity = Date.now();
          // Access token should already be set by the API call
        }
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.loading = false;
        state.initialized = true;
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
        state.error = action.payload || 'Authentication initialization failed';
        
        // Ensure token manager is cleared
        tokenManager.clearTokens();
      })

      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        const { user, accessToken } = action.payload;
        
        state.loading = false;
        state.user = user;
        state.accessToken = accessToken;
        state.isAuthenticated = true;
        state.error = null;
        state.initialized = true;
        state.lastActivity = Date.now();
        
        // Sync with token manager
        tokenManager.setAccessToken(accessToken);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
        state.error = action.payload || 'Login failed';
        
        // Ensure token manager is cleared
        tokenManager.clearTokens();
      })

      // Logout
      .addCase(logout.pending, (state) => {
        state.loading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.loading = false;
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.error = null;
        state.lastActivity = null;
        state.initialized = true; // Keep initialized
        
        // Clear from token manager
        tokenManager.clearTokens();
        
        console.log('Logout completed in Redux');
      })
      .addCase(logout.rejected, (state, ) => {
        // Even if logout API fails, clear local state
        state.loading = false;
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.lastActivity = null;
        state.error = null; // Don't show logout API errors
        
        // Clear from token manager
        tokenManager.clearTokens();
        
        console.log('Logout completed (with API error) in Redux');
      })

      // Refresh Tokens
      .addCase(refreshTokens.fulfilled, (state, action) => {
        state.accessToken = action.payload;
        state.lastActivity = Date.now();
        state.error = null;
        
        // Token manager already updated by the API call
      })
      .addCase(refreshTokens.rejected, (state,) => {
        // On refresh failure, clear everything
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.error = 'Session expired. Please log in again.';
        
        // Clear from token manager
        tokenManager.clearTokens();
      })

      // Fetch Current User
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.lastActivity = Date.now();
        state.error = null;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.error = action.payload || 'Failed to fetch user information';
      });
  },
});

export const {
  setCredentials,
  clearCredentials,
  updateAccessToken,
  updateUser,
  clearError,
  updateActivity,
  sessionExpired
} = authSlice.actions;

export default authSlice.reducer;