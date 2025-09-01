// src/App.tsx - Production-ready app with security and proper error handling
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import DashboardLayout from '@/layouts/DashboardLayout';
import AuthLayout from '@/layouts/AuthLayout';
import Dashboard from '@/pages/Dashboard';
import BuyNumber from '@/pages/BuyNumber';
import ActiveNumbers from '@/pages/ActiveNumbers';
import { History } from '@/pages/History';
import { Transactions } from '@/pages/Transactions';
import { Settings } from '@/pages/Settings';
import Login from '@/pages/Login';
import PrivateRoute from '@/components/common/PrivateRoute';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import useWebSocket from './hooks/useWebsocket';
import useAuth from '@/hooks/useAuth';
import { healthCheck } from '@/api/client';
import { Analytics } from '@vercel/analytics/react';


// Security headers check component
const SecurityCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [securityChecked, setSecurityChecked] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy'>('checking');

  useEffect(() => {
    // Check for security headers and HTTPS in production
    const checkSecurity = async () => {
      try {
        // Check HTTPS in production
        if (import.meta.env.PROD && window.location.protocol !== 'https:') {
          console.warn('Production app should be served over HTTPS');
        }

        // Check if running in secure context
        if (!window.isSecureContext && import.meta.env.PROD) {
          console.warn('App not running in secure context');
        }

        // Verify server health
        const isHealthy = await healthCheck();
        setHealthStatus(isHealthy ? 'healthy' : 'unhealthy');

        setSecurityChecked(true);
      } catch (error) {
        console.error('Security check failed:', error);
        setHealthStatus('unhealthy');
        setSecurityChecked(true);
      }
    };

    checkSecurity();
  }, []);

  if (!securityChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Initializing secure connection...</p>
        </div>
      </div>
    );
  }

  if (healthStatus === 'unhealthy') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-red-800 mb-2">Server Connection Failed</h2>
          <p className="text-red-600 mb-4">
            Unable to connect to the server. Please check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Main app content component
const AppContent: React.FC = () => {
  const { isAuthenticated, isReady, needsLogin, isInitializing, hasError, errorMessage } = useAuth();
  const [showConnected, setShowConnected] = useState(false);



  // Initialize WebSocket connection only when fully authenticated and ready
  const ws = useWebSocket(undefined, true) || {};
  const { isConnected: wsConnected = false, connectionError: wsError = null } = ws;
  const hasConnectionIssue = !wsConnected && Boolean(wsError);


  useEffect(() => {
    if (wsConnected) {
      setShowConnected(true);
      const timer = setTimeout(() => {
        setShowConnected(false);
      }, 3500); // 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [wsConnected]);

  console.log('App render state:', {
    isAuthenticated,
    isReady,
    needsLogin,
    isInitializing,
    wsConnected,
    wsError
  });

  // Show loading during initialization
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading application...</p>
        </div>
      </div>
    );
  }

  // Show authentication error if it exists
  if (hasError && needsLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-red-800 mb-2">Authentication Error</h2>
          <p className="text-red-600 mb-4">{errorMessage}</p>
          <button
            onClick={() => window.location.href = '/login'}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      {import.meta.env.PROD && <Analytics />}

      <div className="App">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={
            <AuthLayout>
              <Login />
            </AuthLayout>
          } />

          {/* Protected Routes */}
          <Route path="/" element={
            <PrivateRoute>
              <DashboardLayout />
            </PrivateRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="buy-number" element={<BuyNumber />} />
            <Route path="active-numbers" element={<ActiveNumbers />} />
            <Route path="history" element={<History />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* 404 Route */}
          <Route path="*" element={
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
                  </svg>
                </div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
                <p className="text-gray-600 mb-4">The page you're looking for doesn't exist</p>
                <a
                  href="/"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  Go Home
                </a>
              </div>
            </div>
          } />
        </Routes>

        {/* Enhanced Toast Notifications with Security Considerations */}
        <Toaster
          position="top-right"
          gutter={8}
          containerClassName="toast-container"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
              fontSize: '14px',
              borderRadius: '8px',
              padding: '12px 16px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              maxWidth: '400px',
              wordBreak: 'break-word' as const,
            },
            success: {
              duration: 3000,
              style: {
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#fff',
              },
              iconTheme: {
                primary: '#fff',
                secondary: '#10B981',
              },
            },
            error: {
              duration: 6000,
              style: {
                background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                color: '#fff',
              },
              iconTheme: {
                primary: '#fff',
                secondary: '#EF4444',
              },
            },
            loading: {
              duration: 8000,
              style: {
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                color: '#fff',
              },
            },
          }}
        />

        {/* Connection Status Indicator */}
        {isAuthenticated && isReady && (
          <div className="fixed bottom-4 right-4 z-50">
            {wsError || hasConnectionIssue ? (
              <div className="flex items-center space-x-2 bg-red-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>Connection Issue</span>
              </div>
            ) : wsConnected && showConnected ? (
              <div className="flex items-center space-x-2 bg-green-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm opacity-75 hover:opacity-100 transition-opacity">
                <div className="w-2 h-2 bg-green-200 rounded-full animate-pulse"></div>
                <span>Connected</span>
              </div>
            ) : !wsConnected && !wsError ? (
              <div className="flex items-center space-x-2 bg-yellow-500 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                <div className="w-2 h-2 bg-yellow-200 rounded-full animate-pulse"></div>
                <span>Connecting...</span>
              </div>
            ) : null}
          </div>
        )}


      </div>
    </Router>
  );
};

// Main App component with providers and security
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <SecurityCheck>
        <AppContent />
      </SecurityCheck>
    </ErrorBoundary>
  );
};

export default App;