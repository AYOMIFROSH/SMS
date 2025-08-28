// src/hooks/useMobileAuth.ts - Mobile-specific authentication handling
import { useEffect, useRef } from 'react';
import useAuth from './useAuth';

const useMobileAuth = () => {
  const { isAuthenticated, initialized } = useAuth();
  const lastAuthState = useRef(isAuthenticated);
  const authLossCount = useRef(0);
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    if (!isMobile || !initialized) return;

    // Track authentication state changes
    if (lastAuthState.current === true && isAuthenticated === false) {
      authLossCount.current += 1;
      console.warn(`Mobile auth lost (count: ${authLossCount.current})`);

      // If auth is lost multiple times quickly, there might be a cookie issue
      if (authLossCount.current >= 2) {
        console.error('Multiple auth losses detected - possible mobile cookie issue');
        
        // Store a flag to prevent redirect loops
        sessionStorage.setItem('mobile_auth_issue', 'true');
      }
    }

    lastAuthState.current = isAuthenticated;
  }, [isAuthenticated, initialized, isMobile]);

  // Mobile-specific visibility/focus handling
  useEffect(() => {
    if (!isMobile) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        // App became visible again - verify auth state
        console.log('Mobile app visible - checking auth state');
        // You could trigger a auth validation here if needed
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page was restored from cache - mobile browsers do this
        console.log('Page restored from cache - mobile browser behavior');
        window.location.reload(); // Force fresh state
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [isAuthenticated, isMobile]);

  return {
    isMobile,
    authLossCount: authLossCount.current,
    hasMobileAuthIssue: authLossCount.current >= 2
  };
};

export default useMobileAuth;