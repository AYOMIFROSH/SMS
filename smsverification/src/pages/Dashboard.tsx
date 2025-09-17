// src/pages/Dashboard.tsx - Updated with balance sync
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardStats, fetchActivity } from '@/store/slices/dashboardSlice';
import { usePayment } from '@/hooks/usePayment';
import StatsCards from '@/components/dashboard/StatsCards';
import RecentActivity from '@/components/dashboard/RecentActivity';
import QuickActions from '@/components/dashboard/QuickActions';
import BalanceWidget from '@/components/dashboard/BalanceWidget';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PageLoader } from '@/components/common/LoadingSpinner';

const Dashboard: React.FC = () => {
  useDocumentTitle("SMS Verification Dashboard");
  
  const dispatch = useDispatch<AppDispatch>();
  const { stats, activity, loading, error } = useSelector(
    (state: RootState) => state.dashboard
  );

  // Use payment hook for accurate balance
  const payment = usePayment({ autoFetch: true, enableWebSocket: true });

  useEffect(() => {
    dispatch(fetchDashboardStats());
    dispatch(fetchActivity());

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      dispatch(fetchDashboardStats());
    }, 30000);

    return () => clearInterval(interval);
  }, [dispatch]);

  // Enhanced refresh function that triggers global balance sync
  const handleRefresh = async () => {
    try {
      // Refresh dashboard data
      dispatch(fetchDashboardStats());
      dispatch(fetchActivity());
      
      // Refresh payment balance
      await payment.refreshBalance();
      
      // Dispatch custom event to notify other components (like Header) to refresh
      window.dispatchEvent(new CustomEvent('dashboard:refresh', {
        detail: { 
          source: 'dashboard',
          timestamp: Date.now(),
          includeBalance: true 
        }
      }));
      
      console.log('Dashboard refresh completed with balance sync');
      
    } catch (error) {
      console.error('Dashboard refresh failed:', error);
    }
  };

  // Listen for balance refresh requests from other components
  useEffect(() => {
    const handleBalanceRefreshRequest = async (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      
      // Only respond if the request is not from this component
      if (detail?.source !== 'dashboard') {
        console.log('Balance refresh requested by external component');
        await payment.refreshBalance();
      }
    };

    window.addEventListener('balance:refreshRequest', handleBalanceRefreshRequest);
    
    return () => {
      window.removeEventListener('balance:refreshRequest', handleBalanceRefreshRequest);
    };
  }, [payment.refreshBalance]);

  // Merge dashboard stats with payment balance for accurate display
  const enhancedStats = stats ? {
    ...stats,
    balance: payment.balance?.balance ?? stats.balance ?? 0
  } : null;

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <PageLoader message='Loading dashboard...' />
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
            onClick={handleRefresh}
            disabled={loading || payment.loading.balance}
            className="px-3 py-2 sm:px-4 sm:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || payment.loading.balance ? (
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                Refreshing...
              </div>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>



      {/* Stats Cards - Use enhanced stats with accurate balance */}
      <StatsCards stats={enhancedStats} />

      {/* Content Grid - Responsive layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left Column - Recent Activity */}
        <div className="lg:col-span-2 order-2 lg:order-1">
          <RecentActivity activity={activity} loading={loading} />
        </div>

        {/* Right Column - Sidebar widgets */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6 order-1 lg:order-2">
          {/* Enhanced Balance Widget - Show on mobile/tablet with payment data */}
          <div className="block lg:hidden">
            <BalanceWidget 
              balance={payment.balance?.balance ?? 0}
              totalDeposited={payment.balance?.total_deposited ?? 0}
              totalSpent={payment.balance?.total_spent ?? 0}
              pendingAmount={payment.summary?.pending_amount ?? 0}
              loading={payment.loading.balance}
            />
          </div>
          
          {/* Quick Actions */}
          <QuickActions />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;