// src/components/common/PrivateRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import {PageLoader} from '@/components/common/LoadingSpinner';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isAuthenticated, initialized, loading } = useAuth();
  const location = useLocation();

  const isInitializing = loading && !initialized;

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <PageLoader message='Setting Dashboard...' />
      </div>
    );
  }

  // ✅ Redirect only AFTER initialization finishes
  if (initialized && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
