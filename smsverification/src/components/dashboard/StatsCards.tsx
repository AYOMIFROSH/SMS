// src/components/dashboard/StatsCards.tsx
import React from 'react';
import { 
  Wallet, 
  Smartphone, 
  ShoppingBag, 
  TrendingUp,
  Phone,
  DollarSign
} from 'lucide-react';
import { DashboardStats } from '@/types';

interface StatsCardsProps {
  stats: DashboardStats | null;
}

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  const cards = [
    {
      name: 'Account Balance',
      value: `$${stats?.balance?.toFixed(2) || '0.00'}`,
      icon: Wallet,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
    },
    {
      name: 'Active Numbers',
      value: stats?.activeNumbers?.toString() || '0',
      icon: Smartphone,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      name: 'Today\'s Purchases',
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
  ];

  console.log('stats.totalSpent type:', typeof stats?.totalSpent, 'value:', stats?.totalSpent);


  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.name}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">{card.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {card.value}
                </p>
              </div>
              <div className={`${card.bgColor} p-3 rounded-lg`}>
                <Icon className={`h-6 w-6 ${card.textColor}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StatsCards;