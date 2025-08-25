// src/components/common/Header.tsx
import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Settings, Menu, X } from 'lucide-react';
import { RootState } from '@/store/store';
import useAuth from '@/hooks/useAuth';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { user, stats } = useSelector((state: RootState) => ({
    user: state.auth.user,
    stats: state.dashboard.stats,
  }));
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      setUserMenuOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/login');
    }
  };

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

            {/* Balance - Responsive display */}
            <div className="hidden sm:block bg-primary-50 px-3 py-2 rounded-lg">
              <span className="text-sm text-primary-600 font-medium whitespace-nowrap">
                Balance: ${stats?.balance?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>

          {/* Right side - Notifications + User menu */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Balance for small screens - compact version */}
            <div className="sm:hidden bg-primary-50 px-2 py-1 rounded text-xs text-primary-600 font-medium whitespace-nowrap">
              ${stats?.balance?.toFixed(2) || '0.00'}
            </div>

            {/* Notifications */}
            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500">
              <Bell className="h-5 w-5" />
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
                  <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                </div>
              </button>

              {/* Dropdown menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                  {/* Mobile user info */}
                  <div className="px-4 py-3 border-b border-gray-100 sm:hidden">
                    <div className="text-sm font-medium text-gray-900">{user?.username}</div>
                    <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                  </div>
                  
                  <div className="py-1">
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