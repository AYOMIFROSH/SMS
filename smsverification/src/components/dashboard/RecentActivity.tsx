// src/components/dashboard/RecentActivity.tsx - Fixed price handling
import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle,
  ExternalLink,
  Activity
} from 'lucide-react';
import { NumberPurchase } from '@/types';

interface RecentActivityProps {
  activity: NumberPurchase[];
  loading: boolean;
}

const statusConfig = {
  waiting: {
    icon: Clock,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    dot: 'bg-yellow-400',
    text: 'Waiting',
  },
  received: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    dot: 'bg-green-400',
    text: 'Received',
  },
  used: {
    icon: CheckCircle,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    dot: 'bg-blue-400',
    text: 'Completed',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    dot: 'bg-red-400',
    text: 'Cancelled',
  },
  expired: {
    icon: AlertCircle,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    dot: 'bg-gray-400',
    text: 'Expired',
  },
};

// Helper function to safely format price
const formatPrice = (price: any): string => {
  if (price === null || price === undefined) {
    return '0.0000';
  }
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) {
    return '0.0000';
  }
  
  return numPrice.toFixed(4);
};

const RecentActivity: React.FC<RecentActivityProps> = ({ activity, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Activity className="h-5 w-5 text-gray-400" />
          <h3 className="text-base sm:text-lg font-medium text-gray-900">Recent Activity</h3>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 sm:p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-gray-400" />
            <h3 className="text-base sm:text-lg font-medium text-gray-900">Recent Activity</h3>
          </div>
          <Link
            to="/history"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center transition-colors"
          >
            <span className="hidden sm:inline">View all</span>
            <span className="sm:hidden">All</span>
            <ExternalLink className="ml-1 h-3 w-3 sm:h-4 sm:w-4" />
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {activity.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            <AlertCircle className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">No recent activity</h4>
            <p className="mt-1 text-xs sm:text-sm text-gray-500">
              Start by purchasing your first SMS number.
            </p>
            <div className="mt-4">
              <Link
                to="/buy-number"
                className="inline-flex items-center px-3 py-2 sm:px-4 sm:py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 transition-colors"
              >
                Buy Number
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {activity.slice(0, 8).map((item) => {
              const config = statusConfig[item.status] || statusConfig.waiting;
              const StatusIcon = config.icon;

              return (
                <div key={item.id} className="flex items-start space-x-3 sm:space-x-4 p-2 sm:p-3 hover:bg-gray-50 rounded-lg transition-colors">
                  {/* Status indicator */}
                  <div className="relative flex-shrink-0 mt-1">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 ${config.bg} rounded-full flex items-center justify-center`}>
                      <StatusIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${config.color}`} />
                    </div>
                    {/* Status dot */}
                    <div className={`absolute -top-1 -right-1 w-3 h-3 ${config.dot} rounded-full border-2 border-white`}></div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.service_name || `Service ${item.service_code}`}
                        </p>
                        {item.phone_number && (
                          <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">
                            {item.phone_number}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end ml-2 flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900">
                          ${formatPrice(item.price)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(item.purchase_date), 'MMM dd, HH:mm')}
                        </p>
                      </div>
                    </div>
                    
                    {/* Status and code row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          {config.text}
                        </span>
                      </div>
                    </div>

                    {/* SMS Code */}
                    {item.sms_code && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 font-mono">
                          Code: {item.sms_code}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentActivity;