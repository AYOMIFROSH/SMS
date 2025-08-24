// src/components/dashboard/QuickActions.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShoppingCart, 
  Smartphone, 
  History, 
  CreditCard,
  Zap
} from 'lucide-react';

const QuickActions: React.FC = () => {
  const actions = [
    {
      name: 'Buy Number',
      description: 'Purchase a new SMS number',
      href: '/buy-number',
      icon: ShoppingCart,
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      name: 'Active Numbers',
      description: 'View your active numbers',
      href: '/active-numbers',
      icon: Smartphone,
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      name: 'History',
      description: 'View purchase history',
      href: '/history',
      icon: History,
      color: 'bg-purple-500 hover:bg-purple-600',
    },
    {
      name: 'Add Funds',
      description: 'Top up your balance',
      href: '/transactions',
      icon: CreditCard,
      color: 'bg-orange-500 hover:bg-orange-600',
    },
  ];

  const popularServices = [
    { name: 'WhatsApp', code: 'wa', price: 0.15 },
    { name: 'Telegram', code: 'tg', price: 0.12 },
    { name: 'Discord', code: 'ds', price: 0.18 },
    { name: 'Instagram', code: 'ig', price: 0.20 },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
          <Zap className="h-5 w-5 text-yellow-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.name}
                to={action.href}
                className="group"
              >
                <div className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all">
                  <div className={`w-8 h-8 ${action.color} rounded-lg flex items-center justify-center mb-3 transition-colors`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <h4 className="text-sm font-medium text-gray-900 group-hover:text-primary-600">
                    {action.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Popular Services */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Popular Services</h3>
        
        <div className="space-y-3">
          {popularServices.map((service) => (
            <div key={service.code} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-primary-600">
                    {service.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{service.name}</p>
                  <p className="text-xs text-gray-500">Starting from ${service.price}</p>
                </div>
              </div>
              <button className="text-xs bg-primary-600 text-white px-3 py-1 rounded-md hover:bg-primary-700 transition-colors">
                Buy
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            to="/buy-number"
            className="block text-center text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View all services →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default QuickActions;