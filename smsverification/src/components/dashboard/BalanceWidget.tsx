// src/components/dashboard/BalanceWidget.tsx
import React from 'react';
import { Wallet, TrendingUp } from 'lucide-react';

interface BalanceWidgetProps {
  balance: number;
}

const BalanceWidget: React.FC<BalanceWidgetProps> = ({ balance }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Account Balance</h3>
        <div className="bg-primary-50 p-2 rounded-lg">
          <Wallet className="h-5 w-5 text-primary-600" />
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-3xl font-bold text-gray-900">
            ${balance.toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-1">Available balance</p>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-green-600">+12.5%</span>
          </div>
          <span className="text-gray-500">vs last week</span>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors font-medium">
            Add Funds
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">Today</p>
            <p className="text-xs text-gray-500 mt-1">$0.00</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">This Week</p>
            <p className="text-xs text-gray-500 mt-1">$0.00</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BalanceWidget;