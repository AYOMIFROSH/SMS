// src/components/common/Sidebar.tsx
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Smartphone, 
  History, 
  CreditCard, 
  Settings,
  MessageSquare,
  X
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Buy Number', href: '/buy-number', icon: ShoppingCart },
  { name: 'Active Numbers', href: '/active-numbers', icon: Smartphone },
  { name: 'History', href: '/history', icon: History },
  { name: 'Transactions', href: '/transactions', icon: CreditCard },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const Sidebar: React.FC<SidebarProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const location = useLocation();

  // Close sidebar when clicking on a nav link on mobile
  const handleNavClick = () => {
    if (window.innerWidth < 1024) { // lg breakpoint
      setSidebarOpen(false);
    }
  };

  // Close sidebar when clicking outside on mobile
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (sidebarOpen && !target.closest('.sidebar') && !target.closest('[data-sidebar-toggle]')) {
        if (window.innerWidth < 1024) {
          setSidebarOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sidebarOpen, setSidebarOpen]);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity lg:hidden z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        sidebar fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg border-r border-gray-200 
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-6 py-4 lg:hidden">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">SMS Dashboard</h1>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Logo - Desktop only */}
        <div className="hidden lg:block px-6 py-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">SMS Dashboard</h1>
              <p className="text-xs text-gray-500">Verification Platform</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-4 lg:px-6 pb-6 flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <li key={item.name}>
                  <NavLink
                    to={item.href}
                    onClick={handleNavClick}
                    className={({ isActive: linkActive }) =>
                      `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 group ${
                        linkActive || isActive
                          ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`
                    }
                  >
                    <item.icon
                      className={`mr-3 h-5 w-5 transition-colors ${
                        isActive
                          ? 'text-primary-600'
                          : 'text-gray-400 group-hover:text-gray-600'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                    {item.count && (
                      <span className="ml-auto inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-primary-600 bg-primary-100 rounded-full">
                        {item.count}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-4 lg:px-6 py-4 border-t border-gray-200 bg-white">
          <div className="text-center">
            <p className="text-xs text-gray-500">© 2024 SMS Dashboard</p>
            <p className="text-xs text-gray-400 mt-1">v1.0.0</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;