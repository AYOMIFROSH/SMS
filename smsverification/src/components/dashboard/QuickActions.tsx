// src/components/dashboard/QuickActions.tsx - Optimized and responsive
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShoppingCart, 
  CreditCard,
  Zap,
  Plus
} from 'lucide-react';

const QuickActions: React.FC = () => {
  const actions = [
    {
      name: 'Buy Number',
      description: 'Purchase SMS number',
      href: '/buy-number',
      icon: ShoppingCart,
      color: 'bg-blue-500 hover:bg-blue-600',
      primary: true,
    },
    {
      name: 'Add Funds',
      description: 'Top up balance',
      href: '/transactions',
      icon: CreditCard,
      color: 'bg-green-500 hover:bg-green-600',
      primary: false,
    },
  ];

  const popularServices = [
    { name: 'WhatsApp', code: 'wa', price: 0.15, emoji: '💬' },
    { name: 'Telegram', code: 'tg', price: 0.12, emoji: '✈️' },
    { name: 'Discord', code: 'ds', price: 0.18, emoji: '🎮' },
    { name: 'Instagram', code: 'ig', price: 0.20, emoji: '📸' },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-medium text-gray-900">Quick Actions</h3>
          <Zap className="h-5 w-5 text-yellow-500" />
        </div>

        <div className="space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.name}
                to={action.href}
                className="group block"
              >
                <div className={`
                  flex items-center p-3 sm:p-4 rounded-lg border transition-all
                  ${action.primary 
                    ? 'border-primary-200 bg-primary-50 hover:bg-primary-100 hover:border-primary-300' 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}>
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 ${action.color} rounded-lg flex items-center justify-center transition-colors flex-shrink-0`}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div className="ml-3 sm:ml-4 flex-1 min-w-0">
                    <h4 className={`text-sm sm:text-base font-medium ${
                      action.primary ? 'text-primary-700 group-hover:text-primary-800' : 'text-gray-900 group-hover:text-gray-700'
                    }`}>
                      {action.name}
                    </h4>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">
                      {action.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <Plus className={`h-4 w-4 ${
                      action.primary ? 'text-primary-600' : 'text-gray-400'
                    } group-hover:scale-110 transition-transform`} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Popular Services */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">Popular Services</h3>
        
        <div className="space-y-2 sm:space-y-3">
          {popularServices.map((service) => (
            <div key={service.code} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group">
              <div className="flex items-center space-x-2 sm:space-x-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-sm">
                    {service.emoji}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{service.name}</p>
                  <p className="text-xs text-gray-500">From ${service.price}</p>
                </div>
              </div>
              <button className="text-xs bg-primary-600 text-white px-2 sm:px-3 py-1 rounded-md hover:bg-primary-700 transition-colors font-medium flex-shrink-0 ml-2">
                Buy
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to="/buy-number"
            className="block text-center text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            View all services →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default QuickActions;