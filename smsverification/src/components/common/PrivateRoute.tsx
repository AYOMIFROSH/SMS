// src/components/common/PrivateRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, initializationComplete } = useAuth();
  const location = useLocation();

  console.log('🛡️ PrivateRoute check:', {
    isAuthenticated,
    isLoading,
    initializationComplete,
    pathname: location.pathname
  });

  if (!initializationComplete || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('❌ User not authenticated, redirecting to login');
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  console.log('✅ User authenticated, rendering protected content');
  return <>{children}</>;
};

export default PrivateRoute;
