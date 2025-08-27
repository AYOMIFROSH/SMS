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

  // Track whether redirects are allowed
  const canRedirect = useRef(false);

  // Initialize authentication on mount (only once)
  useEffect(() => {
  // Only initialize auth if we have a persisted accessToken
  if (!hasInitialized.current && !auth.initialized && !auth.loading && auth.accessToken) {
    console.log('🚀 Starting auth initialization...');
    hasInitialized.current = true;

    if (!initializationPromise.current) {
      initializationPromise.current = dispatch(initializeAuth())
        .finally(() => {
          initializationPromise.current = null;
        });
    }
  }
}, [dispatch, auth.initialized, auth.loading, auth.accessToken]);


  // Allow redirect only after initialization
  useEffect(() => {
    if (auth.initialized) {
      canRedirect.current = true;
    }
  }, [auth.initialized]);

  // Listen for session expiration events
  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      console.log('🔒 Session expired event received:', detail);

      dispatch(sessionExpired());

      // Only redirect if initialization done and redirect allowed
      if (!auth.initialized || !canRedirect.current) {
        console.log('ℹ️ Session expired during initialization — deferring redirect.');
        return;
      }

      setTimeout(() => {
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }, 200); // small delay for UX
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
  }, [dispatch, auth.isAuthenticated, auth.initialized]);

  // Update axios headers when token changes
  useEffect(() => {
    if (auth.accessToken) {
      client.defaults.headers.common['Authorization'] = `Bearer ${auth.accessToken}`;
    } else {
      delete client.defaults.headers.common['Authorization'];
    }
  }, [auth.accessToken]);

  // Activity tracking
  useEffect(() => {
    if (!auth.isAuthenticated) return;

    const trackActivity = () => {
      if (auth.isAuthenticated) {
        dispatch(updateActivity());
      }
    };

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
      hasInitialized.current = false;
      canRedirect.current = true;
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } catch (error) {
      console.warn('⚠️ Logout API call failed, local cleanup completed:', error);
      dispatch(clearCredentials());
      hasInitialized.current = false;
      canRedirect.current = true;
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }, [dispatch]);

  // Manual re-initialization
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

  // Check valid auth
  const hasValidAuth = useCallback((): boolean => {
    return Boolean(
      auth.isAuthenticated &&
      auth.user &&
      auth.accessToken &&
      auth.initialized
    );
  }, [auth.isAuthenticated, auth.user, auth.accessToken, auth.initialized]);

  // Session info
  const getSessionInfo = useCallback(() => ({
    isValid: hasValidAuth(),
    user: auth.user,
    lastActivity: auth.lastActivity,
    timeSinceActivity: auth.lastActivity ? Date.now() - auth.lastActivity : null,
    sessionAge: auth.lastActivity ? Date.now() - auth.lastActivity : null
  }), [auth.user, auth.lastActivity, hasValidAuth]);

  // Session stale
  const isSessionStale = useCallback((thresholdMinutes = 30): boolean => {
    if (!auth.lastActivity) return false;
    const threshold = thresholdMinutes * 60 * 1000;
    return (Date.now() - auth.lastActivity) > threshold;
  }, [auth.lastActivity]);

  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
    initialized: auth.initialized,
    hasAccessToken: Boolean(auth.accessToken),
    logout,
    reinitialize,
    hasValidAuth,
    getSessionInfo,
    isSessionStale,
    isReady: auth.initialized && !auth.loading,
    needsLogin: auth.initialized && !auth.isAuthenticated,
    isInitializing: !auth.initialized && auth.loading,
    hasError: Boolean(auth.error),
    errorMessage: auth.error
  };
};

export default useAuth;
