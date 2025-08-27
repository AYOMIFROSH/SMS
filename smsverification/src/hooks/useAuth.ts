// src/hooks/useAuth.ts - Simplified and reliable authentication hook
import { useSelector, useDispatch } from 'react-redux';
import { useEffect, useCallback, useRef } from 'react';
import { RootState, AppDispatch } from '@/store/store';
import {
  clearCredentials,
  updateAccessToken,
  initializeAuth,
  logout as logoutThunk,
  sessionExpired,
  updateActivity
} from '@/store/slices/authSlice';
import client from '@/api/client';

const useAuth = () => {
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((state: RootState) => state.auth);
  const initializationPromise = useRef<Promise<any> | null>(null);
  const hasInitialized = useRef(false);

  // Initialize authentication on mount (only once)
  useEffect(() => {
    if (!hasInitialized.current && !auth.initialized && !auth.loading) {
      console.log('🚀 Starting auth initialization...');
      hasInitialized.current = true;
      
      if (!initializationPromise.current) {
        initializationPromise.current = dispatch(initializeAuth())
          .finally(() => {
            initializationPromise.current = null;
          });
      }
    }
  }, [dispatch, auth.initialized, auth.loading]);

  // Listen for session expiration events from the API client
useEffect(() => {
  const isInitializing = !auth.initialized && auth.loading;

  const handleSessionExpired = (event: Event) => {
    const detail = (event as CustomEvent)?.detail;
    console.log('🔒 Session expired event received:', detail);

    // Always update Redux state to mark session expired
    // but DO NOT redirect while initialization (refresh + /me) is in progress.
    dispatch(sessionExpired());

    if (isInitializing) {
      // We're still bootstrapping — do not navigate away.
      // Let the initializeAuth flow or UI handle the UX once it finishes.
      console.log('ℹ️ Session expired received during auth initialization — deferring redirect.');
      return;
    }

    // Only redirect the user after initialization is complete (or not running)
    // and if they are not already on the login page.
    setTimeout(() => {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }, 2000);
  };

  const handleTokenUpdated = (event: Event) => {
    const detail = (event as CustomEvent)?.detail;
    if (detail?.accessToken && auth.isAuthenticated) {
      console.log('🔔 Token updated from API client');
      dispatch(updateAccessToken({ accessToken: detail.accessToken }));
    }
  };

  window.addEventListener('auth:sessionExpired', handleSessionExpired as EventListener);
  window.addEventListener('auth:tokenUpdated', handleTokenUpdated as EventListener);

  return () => {
    window.removeEventListener('auth:sessionExpired', handleSessionExpired as EventListener);
    window.removeEventListener('auth:tokenUpdated', handleTokenUpdated as EventListener);
  };
}, [dispatch, auth.isAuthenticated, auth.initialized, auth.loading]);


  // Update axios default headers when access token changes
  useEffect(() => {
    if (auth.accessToken) {
      client.defaults.headers.common['Authorization'] = `Bearer ${auth.accessToken}`;
    } else {
      delete client.defaults.headers.common['Authorization'];
    }
  }, [auth.accessToken]);

  // Activity tracking for session management
  useEffect(() => {
    if (!auth.isAuthenticated) return;

    const trackActivity = () => {
      if (auth.isAuthenticated) {
        dispatch(updateActivity());
      }
    };

    // Track user activity
    const events = ['click', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, trackActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, trackActivity);
      });
    };
  }, [dispatch, auth.isAuthenticated]);

  // Logout function
  const logout = useCallback(async (): Promise<void> => {
    try {
      console.log('🔐 Starting logout process...');
      await dispatch(logoutThunk()).unwrap();
      
      console.log('✅ Logout completed successfully');
      
      // Reset initialization flag for future logins
      hasInitialized.current = false;
      
      // Redirect to login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } catch (error) {
      console.warn('⚠️ Logout API call failed, but local cleanup completed:', error);
      
      // Even if server logout fails, ensure local cleanup
      dispatch(clearCredentials());
      hasInitialized.current = false;
      
      // Still redirect to login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }, [dispatch]);

  // Manual re-initialization (for debugging or recovery)
  const reinitialize = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Manual auth reinitialization...');
      hasInitialized.current = false;
      await dispatch(initializeAuth()).unwrap();
      hasInitialized.current = true;
      return true;
    } catch (error) {
      console.error('Manual reinitialization failed:', error);
      return false;
    }
  }, [dispatch]);

  // Check if user has valid authentication
  const hasValidAuth = useCallback((): boolean => {
    return Boolean(
      auth.isAuthenticated && 
      auth.user && 
      auth.accessToken && 
      auth.initialized
    );
  }, [auth.isAuthenticated, auth.user, auth.accessToken, auth.initialized]);

  // Get session info
  const getSessionInfo = useCallback(() => {
    return {
      isValid: hasValidAuth(),
      user: auth.user,
      lastActivity: auth.lastActivity,
      timeSinceActivity: auth.lastActivity ? Date.now() - auth.lastActivity : null,
      sessionAge: auth.lastActivity ? Date.now() - auth.lastActivity : null
    };
  }, [auth.user, auth.lastActivity, hasValidAuth]);

  // Check if session is stale (for UI indicators)
  const isSessionStale = useCallback((thresholdMinutes: number = 30): boolean => {
    if (!auth.lastActivity) return false;
    const threshold = thresholdMinutes * 60 * 1000;
    return (Date.now() - auth.lastActivity) > threshold;
  }, [auth.lastActivity]);

  return {
    // Core auth state
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
    initialized: auth.initialized,

    // Token info (minimal exposure)
    hasAccessToken: Boolean(auth.accessToken),
    
    // Actions
    logout,
    reinitialize,

    // Utilities
    hasValidAuth,
    getSessionInfo,
    isSessionStale,
    
    // Status helpers
    isReady: auth.initialized && !auth.loading,
    needsLogin: auth.initialized && !auth.isAuthenticated,
    isInitializing: !auth.initialized && auth.loading,
    hasError: Boolean(auth.error),
    errorMessage: auth.error
  };
};

export default useAuth;