// src/hooks/useAuth.ts - Fixed authentication hook
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

  // Initialize authentication on mount - ALWAYS run, don't depend on persisted token
  useEffect(() => {
    // Only initialize once per app load
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

  // Listen for session expiration events
  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      console.log('🔒 Session expired event received:', detail);

      dispatch(sessionExpired());

      // Only redirect after initialization is complete
      if (auth.initialized) {
        setTimeout(() => {
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        }, 100);
      }
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

  // Activity tracking - only when fully authenticated
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.initialized) return;

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
  }, [dispatch, auth.isAuthenticated, auth.initialized]);

  // Logout function
  const logout = useCallback(async (): Promise<void> => {
    try {
      console.log('🔐 Starting logout process...');
      await dispatch(logoutThunk()).unwrap();
      console.log('✅ Logout completed successfully');
      hasInitialized.current = false;
      
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } catch (error) {
      console.warn('⚠️ Logout API call failed, local cleanup completed:', error);
      dispatch(clearCredentials());
      hasInitialized.current = false;
      
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
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

  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
    initialized: auth.initialized,
    hasAccessToken: Boolean(auth.accessToken),
    logout,
    hasValidAuth,
    
    // Simplified state checks
    isReady: auth.initialized && !auth.loading,
    needsLogin: auth.initialized && !auth.isAuthenticated,
    isInitializing: !auth.initialized && (auth.loading || !hasInitialized.current),
    hasError: Boolean(auth.error),
    errorMessage: auth.error
  };
};

export default useAuth;