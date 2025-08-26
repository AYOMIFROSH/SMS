// src/layouts/DashboardLayout.tsx
import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import Header from '@/components/common/Header';
import Sidebar from '@/components/common/Sidebar';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const DashboardLayout: React.FC = () => {
  const { isAuthenticated, initialized, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect only after initialization finishes & not during initializing
  useEffect(() => {
  // Only redirect after init finished and no token was found
  if (!isInitializing && initialized && !isAuthenticated) {
    console.log('🔀 Redirecting to login - not authenticated');
    navigate('/login', { 
      state: { from: location.pathname },
      replace: true 
    });
  }
}, [isAuthenticated, initialized, isInitializing, navigate, location.pathname]);


  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Handle window resize - close mobile sidebar on desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show loading spinner while initializing
  if (isInitializing) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Checking session..." />
      </div>
    );
  }

  // If initialization done but not authenticated, return null (redirect will fire)
  if (!isAuthenticated) {
    return null;
  }

  // Authenticated user — show dashboard layout
  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden pl-0 lg:pl-64">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
