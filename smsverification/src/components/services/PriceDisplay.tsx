// src/components/services/PriceDisplay.tsx - Updated with real-time balance integration
import React, { useState } from 'react';
import { DollarSign, AlertCircle, CheckCircle, Info, CreditCard, Shield, Clock, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { Link } from 'react-router-dom';

interface PriceDisplayProps {
  price: number | null;
  balance: number;
  canAfford: boolean;
  loading?: boolean;
  balanceLoading?: boolean;
}

const PriceDisplay: React.FC<PriceDisplayProps> = ({ 
  price, 
  balance, 
  canAfford, 
  loading = false,
  balanceLoading = false 
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showPaymentInfo, setShowPaymentInfo] = useState(false);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-center py-6">
            <LoadingSpinner text='Loading price information...' />
          </div>
        </div>
      </div>
    );
  }

  if (!price) {
    return (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-yellow-800">Price Information Unavailable</h4>
              <p className="text-sm text-yellow-700 mt-1">
                Unable to fetch pricing for this service combination. Please try selecting different options or refresh the page.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const remainingBalance = balance - price;
  const serviceFee = 0; // No service fee in this case
  const totalCost = price + serviceFee;

  return (
    <div className="space-y-4">
      {/* Mobile Price Summary */}
      <div className="lg:hidden">
        <div className={`rounded-lg p-4 border ${
          canAfford 
            ? 'bg-white border-gray-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-base font-semibold text-gray-900">Total Cost</h4>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">
                ${totalCost.toFixed(4)}
              </div>
              <div className="text-xs text-gray-500">USD</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-gray-600 flex items-center">
              Your Balance
              {balanceLoading && (
                <div className="ml-2 w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              )}
            </span>
            <span className={`font-medium ${canAfford ? 'text-green-600' : 'text-red-600'}`}>
              ${balance.toFixed(4)}
            </span>
          </div>

          {canAfford ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">After Purchase</span>
              <span className="font-medium text-gray-900">
                ${remainingBalance.toFixed(4)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className="text-red-600">Additional Needed</span>
              <span className="font-semibold text-red-600">
                ${Math.abs(remainingBalance).toFixed(4)}
              </span>
            </div>
          )}

          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center justify-center w-full mt-3 pt-3 border-t border-gray-200 text-sm text-primary-600 hover:text-primary-700 transition-colors"
          >
            <span>Price Breakdown</span>
            {showBreakdown ? (
              <ChevronUp className="h-4 w-4 ml-1" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-1" />
            )}
          </button>
        </div>
      </div>

      {/* Desktop Price Breakdown */}
      <div className="hidden lg:block">
        <div className="bg-gray-50 rounded-lg p-4 lg:p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-4 flex items-center">
            <DollarSign className="h-4 w-4 mr-2" />
            Price Breakdown
          </h4>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">SMS Number</span>
              <span className="text-sm font-medium text-gray-900">
                ${price.toFixed(4)}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Service Fee</span>
              <span className="text-sm font-medium text-gray-900">
                ${serviceFee.toFixed(4)}
              </span>
            </div>
            
            <div className="border-t border-gray-200 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-base font-medium text-gray-900">Total</span>
                <span className="text-xl font-bold text-gray-900">
                  ${totalCost.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Price Breakdown - Collapsible */}
      {showBreakdown && (
        <div className="lg:hidden bg-gray-50 rounded-lg p-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">SMS Number</span>
              <span className="font-medium text-gray-900">
                ${price.toFixed(4)}
              </span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Service Fee</span>
              <span className="font-medium text-gray-900">
                ${serviceFee.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Balance Status - Enhanced with real-time indicators */}
      <div className={`rounded-lg p-4 ${
        canAfford 
          ? 'bg-green-50 border border-green-200' 
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-start space-x-3">
          {canAfford ? (
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <h4 className={`text-sm font-medium flex items-center ${
              canAfford ? 'text-green-800' : 'text-red-800'
            }`}>
              {canAfford ? 'Sufficient Balance' : 'Insufficient Balance'}
              {balanceLoading && (
                <div className="ml-2 w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-60"></div>
              )}
            </h4>
            
            {/* Desktop Balance Info */}
            <div className="hidden lg:block">
              <p className={`text-sm mt-1 ${
                canAfford ? 'text-green-600' : 'text-red-600'
              }`}>
                Current balance: ${balance.toFixed(4)} | 
                {canAfford 
                  ? ` After purchase: $${remainingBalance.toFixed(4)}`
                  : ` Additional needed: $${Math.abs(remainingBalance).toFixed(4)}`
                }
              </p>
              {balanceLoading && (
                <p className="text-xs text-gray-500 mt-1">Balance updating...</p>
              )}
            </div>

            {/* Mobile Balance Info */}
            <div className="lg:hidden mt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className={canAfford ? 'text-green-700' : 'text-red-700'}>
                  Current balance:
                </span>
                <span className={`font-medium ${canAfford ? 'text-green-800' : 'text-red-800'}`}>
                  ${balance.toFixed(4)}
                </span>
              </div>
              {!canAfford && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-700">You need:</span>
                  <span className="font-semibold text-red-800">
                    ${Math.abs(remainingBalance).toFixed(4)} more
                  </span>
                </div>
              )}
              {balanceLoading && (
                <div className="text-xs text-gray-500">Balance updating...</div>
              )}
            </div>

            {/* Top-up suggestion for insufficient balance */}
            {!canAfford && (
              <div className="mt-3 pt-3 border-t border-red-200">
                <Link 
                  to="/transactions" 
                  className="text-sm font-medium text-red-700 hover:text-red-800 transition-colors underline"
                >
                  Top up your account
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex items-center space-x-2 flex-shrink-0">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <button
              onClick={() => setShowPaymentInfo(!showPaymentInfo)}
              className="lg:hidden text-sm font-medium text-blue-800 hover:text-blue-900 transition-colors"
            >
              Payment Info {showPaymentInfo ? '▼' : '▶'}
            </button>
          </div>
          <div className="flex-1">
            <div className="hidden lg:block">
              <h4 className="text-sm font-medium text-blue-800 mb-2">Payment Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-blue-700">
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4 flex-shrink-0" />
                  <span>Payment deducted immediately</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  <span>Valid for 20 minutes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 flex-shrink-0" />
                  <span>Partial refund if cancelled</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>Instant SMS delivery</span>
                </div>
              </div>
            </div>

            {/* Mobile Payment Info - Collapsible */}
            <div className="lg:hidden">
              <h4 className="text-sm font-medium text-blue-800 mb-1">Payment Information</h4>
              {showPaymentInfo && (
                <div className="space-y-2 text-sm text-blue-700 mt-2">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-3 w-3 flex-shrink-0" />
                    <span>Payment deducted immediately upon purchase</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span>Numbers are valid for 20 minutes unless extended</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-3 w-3 flex-shrink-0" />
                    <span>Unused numbers can be cancelled for partial refund</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-3 w-3 flex-shrink-0" />
                    <span>SMS codes are delivered instantly when received</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Cost Comparison */}
      <div className="lg:hidden bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
          <Info className="h-4 w-4 mr-2" />
          Cost Comparison
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded p-3">
            <div className="text-lg font-bold text-green-600">${price.toFixed(4)}</div>
            <div className="text-xs text-gray-500 mt-1">This Service</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-lg font-bold text-gray-600">$0.02</div>
            <div className="text-xs text-gray-500 mt-1">Average</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-lg font-bold text-blue-600">85%</div>
            <div className="text-xs text-gray-500 mt-1">Success Rate</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceDisplay;