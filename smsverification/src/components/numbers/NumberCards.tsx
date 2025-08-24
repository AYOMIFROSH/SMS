// src/components/numbers/NumberCard.tsx
import React, { useState, useEffect } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { format, formatDistance } from 'date-fns';
import { 
  Copy, 
  Check, 
  Clock, 
  MessageSquare, 
  X, 
  CheckCircle,
  AlertCircle,
  Phone
} from 'lucide-react';
import { NumberPurchase } from '@/types';
import toast from 'react-hot-toast';

interface NumberCardProps {
  number: NumberPurchase;
  onCancel: () => void;
  onComplete: () => void;
}

const NumberCard: React.FC<NumberCardProps> = ({ number, onCancel, onComplete }) => {
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Calculate time remaining
  useEffect(() => {
    if (!number.expiry_date) return;

    const updateTimer = () => {
      const now = new Date();
      const expiry = new Date(number.expiry_date!);
      
      if (now > expiry) {
        setTimeLeft('Expired');
        return;
      }

      const distance = formatDistance(expiry, now, { addSuffix: false });
      setTimeLeft(distance);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [number.expiry_date]);

  const handleCopyNumber = () => {
    setCopiedNumber(true);
    toast.success('Phone number copied!');
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleCopyCode = () => {
    setCopiedCode(true);
    toast.success('SMS code copied!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getStatusConfig = () => {
    switch (number.status) {
      case 'waiting':
        return {
          color: 'text-yellow-600',
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: Clock,
          text: 'Waiting for SMS'
        };
      case 'received':
        return {
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: MessageSquare,
          text: 'SMS Received'
        };
      case 'used':
        return {
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          icon: CheckCircle,
          text: 'Completed'
        };
      case 'cancelled':
        return {
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: X,
          text: 'Cancelled'
        };
      case 'expired':
        return {
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          icon: AlertCircle,
          text: 'Expired'
        };
      default:
        return {
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          icon: Clock,
          text: 'Unknown'
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className={`bg-white rounded-lg shadow-sm border-2 ${statusConfig.border} p-6 transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
            <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">
              {number.service_name || `Service ${number.service_code}`}
            </h3>
            <p className="text-sm text-gray-500">
              {number.country_code} • ${number.price?.toFixed(4)}
            </p>
          </div>
        </div>
        
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
          {statusConfig.text}
        </span>
      </div>

      {/* Phone Number */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Phone Number
        </label>
        <div className="flex items-center space-x-2">
          <div className="flex-1 bg-gray-50 rounded-md p-3 font-mono text-sm">
            {number.phone_number || 'Loading...'}
          </div>
          {number.phone_number && (
            <CopyToClipboard text={number.phone_number} onCopy={handleCopyNumber}>
              <button className="p-3 text-gray-400 hover:text-gray-600 transition-colors">
                {copiedNumber ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </CopyToClipboard>
          )}
        </div>
      </div>

      {/* SMS Code */}
      {number.status === 'received' && number.sms_code && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            SMS Code
          </label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-md p-3 font-mono text-lg font-bold text-green-800">
              {number.sms_code}
            </div>
            <CopyToClipboard text={number.sms_code} onCopy={handleCopyCode}>
              <button className="p-3 text-green-600 hover:text-green-700 transition-colors">
                {copiedCode ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </CopyToClipboard>
          </div>
        </div>
      )}

      {/* Timer */}
      {number.status === 'waiting' && timeLeft && (
        <div className="mb-4">
          <div className={`flex items-center justify-between p-3 rounded-md ${
            timeLeft === 'Expired' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'
          }`}>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">
                {timeLeft === 'Expired' ? 'Expired' : `${timeLeft} remaining`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Info */}
      <div className="mb-4 text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>Purchased:</span>
          <span>{format(new Date(number.purchase_date), 'MMM dd, HH:mm')}</span>
        </div>
        {number.received_at && (
          <div className="flex justify-between">
            <span>Received:</span>
            <span>{format(new Date(number.received_at), 'MMM dd, HH:mm')}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Activation ID:</span>
          <span className="font-mono">{number.activation_id}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-2">
        {number.status === 'waiting' && (
          <>
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
        
        {number.status === 'received' && (
          <button
            onClick={onComplete}
            className="flex-1 px-3 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
          >
            Mark Complete
          </button>
        )}

        {(number.status === 'used' || number.status === 'cancelled' || number.status === 'expired') && (
          <div className="flex-1 px-3 py-2 text-sm font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-md text-center">
            {statusConfig.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default NumberCard;