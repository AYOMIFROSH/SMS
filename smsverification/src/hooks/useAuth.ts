// src/hooks/useAuth.ts - Fixed to prevent multiple initialization attempts
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useCallback, useRef } from 'react';
import { RootState, AppDispatch } from '@/store/store';
import {
  clearCredentials,
  updateAccessToken,
  initializeAuth,
  logout as logoutThunk
} from '@/store/slices/authSlice';
import client from '@/api/client';

const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const initializationAttempted = useRef(false);
  const initializationPromise = useRef<Promise<any> | null>(null);

  // Initialize authentication when hook mounts
  useEffect(() => {
    // Only initialize if we haven't tried before AND haven't already initialized
    if (!initializationAttempted.current && !auth.initialized && !auth.loading) {
      console.log('🚀 Initializing auth on hook mount...');
      initializationAttempted.current = true;
      
      // Prevent multiple initialization attempts
      if (!initializationPromise.current) {
        initializationPromise.current = dispatch(initializeAuth());
        
        // Clean up promise when done
        initializationPromise.current.finally(() => {
          initializationPromise.current = null;
        });
      }
    }
  }, [dispatch, auth.initialized, auth.loading]);

  // Listen for logout events from the API client
  useEffect(() => {
    const handleLogout = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      console.log('🔒 Received logout event:', detail);
      
      // Only clear credentials if we're actually authenticated
      if (auth.isAuthenticated) {
        dispatch(clearCredentials());
      }
    };

    window.addEventListener('auth:logout', handleLogout as EventListener);
    return () => {
      window.removeEventListener('auth:logout', handleLogout as EventListener);
    };
  }, [dispatch, auth.isAuthenticated]);

  // Listen for token updates from client interceptors
  useEffect(() => {
    const handleTokensUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.accessToken) {
        console.log('🔔 Access token updated, syncing to Redux');
        dispatch(updateAccessToken({ accessToken: detail.accessToken }));
      }
    };

    window.addEventListener('auth:tokensUpdated', handleTokensUpdated as EventListener);
    return () => {
      window.removeEventListener('auth:tokensUpdated', handleTokensUpdated as EventListener);
    };
  }, [dispatch]);

  // Update axios headers when access token changes
  useEffect(() => {
    if (auth.accessToken) {
      client.defaults.headers.common['Authorization'] = `Bearer ${auth.accessToken}`;
    } else {
      delete client.defaults.headers.common['Authorization'];
    }
  }, [auth.accessToken]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      console.log('🔐 Starting logout process...');
      await dispatch(logoutThunk()).unwrap();
      console.log('✅ Logout completed');
      
      // Reset initialization flag so user can log in again
      initializationAttempted.current = false;
      
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Clear local state even if server call failed
      dispatch(clearCredentials());
      initializationAttempted.current = false;
    }
  }, [dispatch]);

  // Check if user has valid authentication
  const hasValidAuth = useCallback(() => {
    return Boolean(auth.isAuthenticated && auth.user && auth.accessToken);
  }, [auth.isAuthenticated, auth.user, auth.accessToken]);

  // Reinitialize auth (useful for manual refresh)
  const reinitializeAuth = useCallback(async () => {
    try {
      console.log('🔄 Reinitializing auth...');
      // Reset the flag to allow re-initialization
      initializationAttempted.current = false;
      await dispatch(initializeAuth()).unwrap();
      console.log('✅ Auth reinitialized');
      return true;
    } catch (error) {
      console.error('❌ Auth reinitialization failed:', error);
      return false;
    }
  }, [dispatch]);

  return {
    // Auth state
    user: auth.user,
    accessToken: auth.accessToken,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
    initialized: auth.initialized,

    // Actions
    logout,
    reinitializeAuth,

    // Utilities
    hasValidAuth,
    hasError: Boolean(auth.error),
    errorMessage: auth.error,
    isLoading: auth.loading,
    initializationComplete: auth.initialized && !auth.loading,

    // Token status (simplified)
    tokenStatus: {
      hasAccessToken: Boolean(auth.accessToken),
      isComplete: hasValidAuth()
    }
  };
};

export default useAuth;