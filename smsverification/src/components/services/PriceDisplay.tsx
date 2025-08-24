// src/components/services/PriceDisplay.tsx
import React from 'react';
import { DollarSign, AlertCircle, CheckCircle } from 'lucide-react';

interface PriceDisplayProps {
  price: number | null;
  balance: number;
  canAfford: boolean;
  loading?: boolean;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({ price, balance, canAfford }) => {
  if (!price) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
          <p className="text-sm text-yellow-800">Price information unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Price Breakdown */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Price Breakdown</h4>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">SMS Number</span>
            <span className="text-sm font-medium text-gray-900">
              ${price.toFixed(2)}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Service Fee</span>
            <span className="text-sm font-medium text-gray-900">
              $0.00
            </span>
          </div>
          
          <div className="border-t border-gray-200 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-base font-medium text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900">
                ${price.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Balance Check */}
      <div className={`rounded-lg p-4 ${
        canAfford 
          ? 'bg-green-50 border border-green-200' 
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-center">
          {canAfford ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">
                  Sufficient Balance
                </p>
                <p className="text-xs text-green-600 mt-1">
                  Current balance: ${balance.toFixed(4)} | After purchase: ${(balance - price).toFixed(4)}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">
                  Insufficient Balance
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Current balance: ${balance.toFixed(2)} | Required: ${price.toFixed(2)}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  You need ${(price - balance).toFixed(2)} more to complete this purchase.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <DollarSign className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Payment Information</p>
            <ul className="mt-2 text-xs space-y-1">
              <li>• Payment will be deducted immediately upon purchase</li>
              <li>• Numbers are valid for 20 minutes unless extended</li>
              <li>• Unused numbers can be cancelled for partial refund</li>
              <li>• SMS codes are delivered instantly when received</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceDisplay;