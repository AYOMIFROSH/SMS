// src/components/dashboard/RecentActivity.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertCircle,
  ExternalLink
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
    text: 'Waiting for SMS',
  },
  received: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    text: 'SMS Received',
  },
  used: {
    icon: CheckCircle,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    text: 'Completed',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    text: 'Cancelled',
  },
  expired: {
    icon: AlertCircle,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    text: 'Expired',
  },
};

const RecentActivity: React.FC<RecentActivityProps> = ({ activity, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
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
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
          <Link
            to="/history"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center"
          >
            View all
            <ExternalLink className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="p-6">
        {activity.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="mt-2 text-sm font-medium text-gray-900">No recent activity</h4>
            <p className="mt-1 text-sm text-gray-500">
              Start by purchasing your first SMS number.
            </p>
            <div className="mt-4">
              <Link
                to="/buy-number"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                Buy Number
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {activity.slice(0, 8).map((item) => {
              const config = statusConfig[item.status] || statusConfig.waiting;
              const StatusIcon = config.icon;

              return (
                <div key={item.id} className="flex items-center space-x-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                  <div className={`flex-shrink-0 w-10 h-10 ${config.bg} rounded-full flex items-center justify-center`}>
                    <StatusIcon className={`h-5 w-5 ${config.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.service_name || `Service ${item.service_code}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        ${item.price?.toFixed(4)}
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          {config.text}
                        </span>
                        {item.phone_number && (
                          <span className="text-xs text-gray-500 font-mono">
                            {item.phone_number}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-gray-500">
                        {format(new Date(item.purchase_date), 'MMM dd, HH:mm')}
                      </p>
                    </div>

                    {item.sms_code && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
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