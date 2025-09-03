// src/pages/Dashboard.tsx - Optimized and responsive
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardStats, fetchActivity } from '@/store/slices/dashboardSlice';
import StatsCards from '@/components/dashboard/StatsCards';
import RecentActivity from '@/components/dashboard/RecentActivity';
import QuickActions from '@/components/dashboard/QuickActions';
import BalanceWidget from '@/components/dashboard/BalanceWidget';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const Dashboard: React.FC = () => {
    useDocumentTitle("SMS Verification Dashboard");
  const dispatch = useDispatch<AppDispatch>();
  const { stats, activity, loading, error } = useSelector(
    (state: RootState) => state.dashboard
  );

  useEffect(() => {
    dispatch(fetchDashboardStats());
    dispatch(fetchActivity());

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      dispatch(fetchDashboardStats());
    }, 30000);

    return () => clearInterval(interval);
  }, [dispatch]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="text-red-800">
          Error loading dashboard: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Welcome back! Here's your SMS verification overview.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => {
              dispatch(fetchDashboardStats());
              dispatch(fetchActivity());
            }}
            className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards - Responsive grid */}
      <StatsCards stats={stats} />

      {/* Content Grid - Responsive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left Column - Recent Activity (takes 3/4 width on xl screens) */}
        <div className="lg:col-span-2 order-2 lg:order-1">
          <RecentActivity activity={activity} loading={loading} />
        </div>

        {/* Right Column - Sidebar widgets (takes 1/4 width on xl screens) */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6 order-1 lg:order-2">
          {/* Balance Widget - Only show on mobile/tablet */}
          <div className="block lg:hidden">
            <BalanceWidget balance={stats?.balance || 0} />
          </div>
          
          {/* Quick Actions */}
          <QuickActions />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;