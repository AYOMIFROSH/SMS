// src/App.tsx - Fixed for HTTP-only cookie authentication
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from '@/store/store';
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

// Main App wrapper component that includes WebSocket
const AppContent: React.FC = () => {
  const { isAuthenticated, initializationComplete } = useAuth();

  // Initialize WebSocket connection only when authenticated
  useWebSocket(undefined, isAuthenticated && initializationComplete);

  console.log('🚀 App state:', { isAuthenticated, initializationComplete });

  if (!initializationComplete) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
      </div>
    </div>;
  }

  return (
    <Router>
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
                <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                <p className="text-gray-600 mb-4">Page not found</p>
                <a
                  href="/"
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Go back home
                </a>
              </div>
            </div>
          } />
        </Routes>

        {/* Enhanced Toast Notifications */}
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
              style: {
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                color: '#fff',
              },
            },
          }}
        />
      </div>
    </Router>
  );
};

// Main App component with Redux Provider and Error Boundary
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <AppContent />
      </Provider>
    </ErrorBoundary>
  );
};

export default App;