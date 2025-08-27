// src/layouts/DashboardLayout.tsx
import React, { useState } from 'react';
import { Outlet,  } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import Header from '@/components/common/Header';
import Sidebar from '@/components/common/Sidebar';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const DashboardLayout: React.FC = () => {
  const { isAuthenticated, initialized, isInitializing } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);


   // Show loading spinner while initializing
  if (isInitializing) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" text="Checking session..." />
      </div>
    );
  }

  // Redirect only AFTER initialization finishes
  if (initialized && !isAuthenticated) {
    window.location.href = '/login';
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
