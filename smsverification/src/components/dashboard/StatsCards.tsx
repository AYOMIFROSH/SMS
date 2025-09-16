// src/components/dashboard/StatsCards.tsx - Fixed with safe number handling
import React from 'react';
import { 
  Smartphone, 
  ShoppingBag, 
  TrendingUp,
  Phone,
  DollarSign,
  Clock
} from 'lucide-react';
import { DashboardStats } from '@/types';

interface StatsCardsProps {
  stats: DashboardStats | null;
}

// Helper functions for safe number formatting
const safeToString = (value: any): string => {
  if (value === null || value === undefined) return '0';
  return String(value);
};

const safeToFixed = (value: any, decimals: number = 2): string => {
  if (value === null || value === undefined) {
    return '0.' + '0'.repeat(decimals);
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '0.' + '0'.repeat(decimals);
  }
  
  return numValue.toFixed(decimals);
};

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  const cards = [
    {
      name: 'Active Numbers',
      value: safeToString(stats?.activeNumbers),
      icon: Smartphone,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      name: "Today's Purchases",
      value: safeToString(stats?.todayPurchases),
      icon: ShoppingBag,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
    {
      name: 'Success Rate',
      value: `${safeToFixed(stats?.successRate, 1)}%`,
      icon: TrendingUp,
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
    {
      name: 'Total Numbers',
      value: safeToString(stats?.totalNumbers),
      icon: Phone,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
    },
    {
      name: 'Total Spent',
      value: `$${safeToFixed(stats?.totalSpent, 2)}`,
      icon: DollarSign,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
      textColor: 'text-red-600',
    },
    {
      name: 'Today Spent',
      value: `$${safeToFixed(stats?.todaySpent, 2)}`,
      icon: Clock,
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.name}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 lg:p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs sm:text-sm font-medium text-gray-600 leading-tight mb-1">
                  {card.name}
                </p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 leading-tight">
                  {card.value}
                </p>
              </div>
              <div className={`${card.bgColor} p-2 lg:p-3 rounded-lg flex-shrink-0`}>
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 ${card.textColor}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;