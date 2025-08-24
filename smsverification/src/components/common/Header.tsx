// src/components/common/Header.tsx
import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Bell, User, LogOut, Settings } from 'lucide-react';
import { RootState } from '@/store/store';
import useAuth from '@/hooks/useAuth'; // Use the hook instead

const Header: React.FC = () => {
  const { user, stats } = useSelector((state: RootState) => ({
    user: state.auth.user,
    stats: state.dashboard.stats,
  }));
  const { logout } = useAuth(); // Get logout from the hook
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout(); 
      // This already handles navigation internally
      // No need to navigate here as logout() handles it
    } catch (error) {
      console.error('Logout failed:', error);
      // Fallback navigation if needed
      navigate('/login');
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Balance */}
          <div className="flex items-center space-x-4">
            <div className="bg-primary-50 px-4 py-2 rounded-lg">
              <span className="text-sm text-primary-600 font-medium">
                Balance: ${stats?.balance?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>

          {/* Right side - User menu */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <Bell className="h-5 w-5" />
            </button>

            {/* User dropdown */}
            <div className="relative group">
              <button className="flex items-center space-x-3 p-2 text-gray-700 hover:text-gray-900 transition-colors">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-600" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium">{user?.username}</div>
                  <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                </div>
              </button>

              {/* Dropdown menu */}
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="py-1">
                  <button
                    onClick={() => navigate('/settings')}
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
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;