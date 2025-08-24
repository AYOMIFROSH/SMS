// src/layouts/DashboardLayout.tsx - Updated to use useAuth hook
import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import Header from '@/components/common/Header';
import Sidebar from '@/components/common/Sidebar';

const DashboardLayout: React.FC = () => {
  const { isAuthenticated, initialized, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only redirect if initialization is complete and user is not authenticated
    if (initialized && !loading && !isAuthenticated) {
      console.log('🔀 DashboardLayout: Redirecting to login - not authenticated');
      navigate('/login', { 
        state: { from: location.pathname },
        replace: true 
      });
    }
  }, [isAuthenticated, initialized, loading, navigate, location.pathname]);

  // Show loading while authentication is being initialized
  if (!initialized || loading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect via useEffect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden ml-64">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
