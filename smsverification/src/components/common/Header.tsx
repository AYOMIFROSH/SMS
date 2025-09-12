// src/components/common/Header.tsx - Updated with balance sync
import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Settings, Menu, X, Wallet, RefreshCw } from 'lucide-react';
import { RootState } from '@/store/store';
import { usePayment } from '@/hooks/usePayment';
import useAuth from '@/hooks/useAuth';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  
  // Use payment hook for accurate real-time balance
  const payment = usePayment({ autoFetch: true, enableWebSocket: true });
  
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      setUserMenuOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/login');
    }
  };

  // Enhanced balance refresh handler
  const handleBalanceRefresh = async () => {
    if (isRefreshing || payment.loading.balance) return;

    try {
      setIsRefreshing(true);
      console.log('Header: Manually refreshing balance...');
      
      // Refresh balance in this component
      await payment.refreshBalance();
      
      // Request other components to refresh their balance as well
      window.dispatchEvent(new CustomEvent('balance:refreshRequest', {
        detail: { 
          source: 'header',
          timestamp: Date.now() 
        }
      }));
      
      console.log('Header: Balance refresh completed');
      
    } catch (error) {
      console.error('Header: Balance refresh failed:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000); // Prevent spam clicking
    }
  };

  // Listen for dashboard refresh events to sync balance
  React.useEffect(() => {
    const handleDashboardRefresh = async (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      
      if (detail?.includeBalance) {
        console.log('Header: Dashboard refresh detected, syncing balance...');
        try {
          await payment.refreshBalance();
          console.log('Header: Balance synced with dashboard refresh');
        } catch (error) {
          console.error('Header: Failed to sync balance with dashboard refresh:', error);
        }
      }
    };

    const handleBalanceRefreshRequest = async (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      
      // Only respond if the request is not from this component
      if (detail?.source !== 'header') {
        console.log('Header: Balance refresh requested by external component');
        await payment.refreshBalance();
      }
    };

    window.addEventListener('dashboard:refresh', handleDashboardRefresh);
    window.addEventListener('balance:refreshRequest', handleBalanceRefreshRequest);
    
    return () => {
      window.removeEventListener('dashboard:refresh', handleDashboardRefresh);
      window.removeEventListener('balance:refreshRequest', handleBalanceRefreshRequest);
    };
  }, [payment.refreshBalance]);

  // Close user menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.user-menu')) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [userMenuOpen]);

  // Get accurate balance with fallback
  const currentBalance = payment.balance?.balance ?? 0;
  const isBalanceLoading = payment.loading.balance || isRefreshing;

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Mobile menu button + Balance */}
          <div className="flex items-center space-x-4">
            {/* Mobile menu button */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <span className="sr-only">Toggle menu</span>
              {sidebarOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>

            {/* Enhanced Balance Display - Desktop with refresh button */}
            <div className="hidden sm:flex items-center bg-primary-50 px-3 py-2 rounded-lg group">
              <Wallet className="h-4 w-4 text-primary-600 mr-2" />
              <span className="text-sm text-primary-600 font-medium whitespace-nowrap">
                {isBalanceLoading ? (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-primary-400 rounded-full mr-1 animate-pulse"></div>
                    Updating...
                  </div>
                ) : (
                  `Balance: $${currentBalance.toFixed(4)}`
                )}
              </span>
              {payment.pendingTransactions.length > 0 && (
                <div className="ml-2 w-2 h-2 bg-blue-500 rounded-full animate-pulse" title={`${payment.pendingTransactions.length} pending transactions`}></div>
              )}
              
              {/* Refresh button - shows on hover */}
              <button
                onClick={handleBalanceRefresh}
                disabled={isBalanceLoading}
                className="ml-2 p-1 rounded text-primary-600 hover:bg-primary-100 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh balance"
              >
                <RefreshCw className={`h-3 w-3 ${isBalanceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Right side - Notifications + User menu */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Balance for small screens - compact version with touch-friendly refresh */}
            <div className="sm:hidden bg-primary-50 px-2 py-1 rounded text-xs text-primary-600 font-medium flex items-center group">
              {isBalanceLoading ? (
                <div className="w-2 h-2 bg-primary-400 rounded-full animate-pulse mr-1"></div>
              ) : (
                <Wallet className="h-3 w-3 mr-1" />
              )}
              <span className="whitespace-nowrap">
                {isBalanceLoading ? '...' : `$${currentBalance.toFixed(2)}`}
              </span>
              {payment.pendingTransactions.length > 0 && (
                <div className="ml-1 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
              )}
              
              {/* Mobile refresh button */}
              <button
                onClick={handleBalanceRefresh}
                disabled={isBalanceLoading}
                className="ml-1 p-1 rounded text-primary-600 hover:bg-primary-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${isBalanceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Notifications with pending indicator */}
            <button className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500">
              <Bell className="h-5 w-5" />
              {payment.pendingTransactions.length > 0 && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white font-bold">{payment.pendingTransactions.length > 9 ? '9+' : payment.pendingTransactions.length}</span>
                </div>
              )}
              <span className="sr-only">Notifications</span>
            </button>

            {/* User dropdown */}
            <div className="relative user-menu">
              <button 
                className="flex items-center space-x-2 sm:space-x-3 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-primary-600" />
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-sm font-medium truncate max-w-24 lg:max-w-none">{user?.username}</div>
                </div>
              </button>

              {/* Enhanced Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                  {/* User info with balance and refresh option */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="text-sm font-medium text-gray-900 mb-1">{user?.username}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500 flex items-center">
                        <Wallet className="h-3 w-3 mr-1" />
                        {isBalanceLoading ? (
                          'Updating balance...'
                        ) : (
                          `$${currentBalance.toFixed(4)} available`
                        )}
                      </div>
                      <button
                        onClick={handleBalanceRefresh}
                        disabled={isBalanceLoading}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        title="Refresh balance"
                      >
                        <RefreshCw className={`h-3 w-3 ${isBalanceLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="py-1">
                    <button
                      onClick={() => {
                        navigate('/transactions');
                        setUserMenuOpen(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Wallet className="h-4 w-4 mr-3" />
                      Transactions
                      {payment.pendingTransactions.length > 0 && (
                        <span className="ml-auto bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          {payment.pendingTransactions.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        navigate('/settings');
                        setUserMenuOpen(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Settings className="h-4 w-4 mr-3" />
                      Settings
                    </button>
                    <div className="border-t border-gray-100"></div>
                    <button
                      onClick={handleLogout}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;