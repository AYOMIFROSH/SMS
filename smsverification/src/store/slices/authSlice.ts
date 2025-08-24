// src/store/slices/authSlice.ts - Cleaned for cookie-based auth
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi, LoginResponse } from '@/api/auth';
import { tokenManager } from '@/api/client';
import { User } from '@/types';

// Simplified auth state - no refresh tokens or CSRF since cookies handle that
export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  initialized: false,
};

// Login thunk
export const login = createAsyncThunk<
  LoginResponse,
  { username: string; password: string },
  { rejectValue: string }
>(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await authApi.login(username, password);
      return response;
    } catch (error: any) {
      console.error('❌ Login thunk error:', error);
      
      if (error.response?.data?.code) {
        switch (error.response.data.code) {
          case 'ACCOUNT_NOT_FOUND':
            return rejectWithValue('Account not found with this username or email');
          case 'INVALID_PASSWORD':
            return rejectWithValue('The password you entered is incorrect');
          case 'ACCOUNT_INACTIVE':
            return rejectWithValue('Your account is currently inactive. Please contact support.');
          case 'RATE_LIMIT_EXCEEDED':
            return rejectWithValue('Too many login attempts. Please try again later.');
          default:
            return rejectWithValue(error.response.data.message || 'Login failed');
        }
      }
      
      return rejectWithValue(error.response?.data?.error || error.message || 'Login failed');
    }
  }
);

// Logout thunk
export const logout = createAsyncThunk('auth/logout', async () => {
  await authApi.logout();
});

// Initialize authentication from cookies
export const initializeAuth = createAsyncThunk<
  { user: User | null; isAuthenticated: boolean },
  void,
  { rejectValue: string }
>(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      const result = await authApi.initializeAuth();
      return result;
    } catch (error: any) {
      console.error('❌ Auth initialization error:', error);
      return rejectWithValue(error.message || 'Auth initialization failed');
    }
  }
);

// Get current user info
export const getCurrentUser = createAsyncThunk<
  User,
  void,
  { rejectValue: string }
>(
  'auth/me',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.me();
      if (response.success) {
        return response.data;
      } else {
        return rejectWithValue('Failed to get user info');
      }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.error || 'Failed to get user info');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, accessToken } = action.payload;
      console.log('📝 Setting credentials in Redux store');
      state.user = user;
      state.accessToken = accessToken;
      state.isAuthenticated = true;
      state.error = null;
      tokenManager.setAccessToken(accessToken);
      state.initialized = true;
    },

    clearCredentials: (state) => {
      console.log('🗑️ Clearing credentials from Redux store');
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.error = null;
      tokenManager.clearTokens();
      state.initialized = true;
    },

    updateAccessToken: (state, action) => {
      const { accessToken } = action.payload;
      console.log('🔄 Updating access token in Redux store');
      state.accessToken = accessToken;
      tokenManager.setAccessToken(accessToken);
    },

    clearError: (state) => {
      state.error = null;
    },

    updateUser: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    }
  },

  extraReducers: (builder) => {
    builder
      // Initialize Auth
      .addCase(initializeAuth.pending, (state) => {
        // Only show loading if we haven't initialized yet
        if (!state.initialized && !state.isAuthenticated) {
          state.loading = true;
        }
        state.error = null;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.loading = false;
        state.initialized = true;

        const { user, isAuthenticated } = action.payload;

        if (isAuthenticated && user) {
          state.user = user;
          state.isAuthenticated = true;
        } else {
          state.user = null;
          state.isAuthenticated = false;
        }
        state.error = null;
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        state.loading = false;
        state.initialized = true;
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload || 'Auth initialization failed';
      })

      // Login
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.error = null;
        state.initialized = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.error = action.payload || 'Login failed';
        state.user = null;
        state.accessToken = null;
      })

      // Logout
      .addCase(logout.fulfilled, (state) => {
        console.log('✅ Logout completed in Redux');
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.error = null;
        state.initialized = true;
      })

      // Get current user
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.error = null;
      })
      .addCase(getCurrentUser.rejected, (state, action) => {
        state.error = action.payload || 'Failed to get user info';
      });
  },
});

export const {
  setCredentials,
  clearCredentials,
  updateAccessToken,
  clearError,
  updateUser
} = authSlice.actions;

export default authSlice.reducer;