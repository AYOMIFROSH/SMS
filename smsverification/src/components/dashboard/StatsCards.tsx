// src/components/dashboard/StatsCards.tsx - Optimized without balance redundancy
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

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  const cards = [
    {
      name: 'Active Numbers',
      value: stats?.activeNumbers?.toString() || '0',
      icon: Smartphone,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      name: "Today's Purchases",
      value: stats?.todayPurchases?.toString() || '0',
      icon: ShoppingBag,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
    {
      name: 'Success Rate',
      value: `${stats?.successRate?.toFixed(1) || '0.0'}%`,
      icon: TrendingUp,
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
    {
      name: 'Total Numbers',
      value: stats?.totalNumbers?.toString() || '0',
      icon: Phone,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
    },
    {
      name: 'Total Spent',
      value: `${stats?.totalSpent?.toFixed(2) || '0.00'}`,
      icon: DollarSign,
      color: 'bg-red-500',
      bgColor: 'bg-red-50',
      textColor: 'text-red-600',
    },
    {
      name: 'Today Spent',
      value: `${stats?.todaySpent?.toFixed(2) || '0.00'}`,
      icon: Clock,
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-6">
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