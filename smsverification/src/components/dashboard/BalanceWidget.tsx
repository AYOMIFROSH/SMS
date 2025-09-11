// src/components/dashboard/BalanceWidget.tsx - Enhanced with payment data
import React from 'react';
import { Wallet, TrendingUp, Clock, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BalanceWidgetProps {
  balance: number;
  totalDeposited?: number;
  totalSpent?: number;
  pendingAmount?: number;
  loading?: boolean;
}

const BalanceWidget: React.FC<BalanceWidgetProps> = ({ 
  balance, 
  totalDeposited = 0,
  totalSpent = 0,
  pendingAmount = 0,
  loading = false
}) => {
  const navigate = useNavigate();

  const handleAddFunds = () => {
    navigate('/transactions');
  };

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
          {loading ? (
            <div className="h-9 bg-gray-200 rounded animate-pulse w-32 mb-2"></div>
          ) : (
            <p className="text-3xl font-bold text-gray-900">
              ${balance.toFixed(4)}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">Available balance</p>
        </div>

        {/* Growth indicator - simplified for now */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-green-600">Active</span>
          </div>
          <span className="text-gray-500">Real-time updates</span>
        </div>

        {/* Add funds button */}
        <div className="pt-4 border-t border-gray-200">
          <button 
            onClick={handleAddFunds}
            className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors font-medium flex items-center justify-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Funds
          </button>
        </div>

        {/* Enhanced stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">Total Deposited</p>
            {loading ? (
              <div className="h-4 bg-gray-200 rounded animate-pulse mt-1"></div>
            ) : (
              <p className="text-xs text-gray-600 mt-1">${totalDeposited.toFixed(2)}</p>
            )}
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">Total Spent</p>
            {loading ? (
              <div className="h-4 bg-gray-200 rounded animate-pulse mt-1"></div>
            ) : (
              <p className="text-xs text-gray-600 mt-1">${totalSpent.toFixed(2)}</p>
            )}
          </div>
        </div>

        {/* Pending amount indicator */}
        {pendingAmount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-yellow-600 mr-2" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Pending Deposits</p>
                <p className="text-xs text-yellow-600">${pendingAmount.toFixed(4)} processing</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BalanceWidget;