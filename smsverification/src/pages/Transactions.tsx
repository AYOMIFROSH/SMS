// src/pages/Transactions.tsx - Fixed to trust backend webhooks
import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  TrendingUp, 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ExternalLink,
  Filter,
  Calendar,
  Download,
  RefreshCw
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePayment } from '@/hooks/usePayment';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { toastInfo } from '@/utils/toastHelpers';

// Status color mapping
const getStatusColor = (status: string) => {
  switch (status) {
    case 'PAID': return 'text-green-600 bg-green-50 border-green-200';
    case 'PENDING': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'FAILED': return 'text-red-600 bg-red-50 border-red-200';
    case 'CANCELLED': return 'text-gray-600 bg-gray-50 border-gray-200';
    case 'EXPIRED': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'REVERSED': return 'text-purple-600 bg-purple-50 border-purple-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

// Status icon mapping
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'PAID': return <CheckCircle className="w-4 h-4" />;
    case 'PENDING': return <Clock className="w-4 h-4" />;
    case 'FAILED': return <XCircle className="w-4 h-4" />;
    case 'CANCELLED': return <XCircle className="w-4 h-4" />;
    case 'EXPIRED': return <AlertTriangle className="w-4 h-4" />;
    case 'REVERSED': return <Plus className="w-4 h-4 rotate-180" />;
    default: return <Clock className="w-4 h-4" />;
  }
};

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reference: string) => void;
  balance: number;
}

const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, onSuccess, balance }) => {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'ACCOUNT_TRANSFER' | 'USSD' | 'PHONE_NUMBER'>('CARD');
  const { initiateDeposit, validateAmount, formatAmount, loading } = usePayment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amountNum = parseFloat(amount);
    const validation = validateAmount(amountNum);
    
    if (!validation.isValid) {
      toast.error(validation.error!);
      return;
    }

    try {
      // Use the payment hook instead of direct API call
      const result = await initiateDeposit({
        amount: amountNum,
        paymentMethod
      });
      
      onSuccess(result.paymentReference);
      onClose();
      setAmount(''); // Reset form

    } catch (error: any) {
      console.error('Deposit creation failed:', error);
      // Error already handled by the hook
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-screen overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Add Funds</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Balance
            </label>
            <div className="text-2xl font-bold text-green-600">
              {formatAmount(balance)}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount to Deposit <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                ₦
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="100"
                max="1000000"
                step="0.01"
                required
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Minimum: ₦100 | Maximum: ₦1,000,000
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="CARD">Debit/Credit Card</option>
              <option value="ACCOUNT_TRANSFER">Bank Transfer</option>
              <option value="USSD">USSD</option>
              <option value="PHONE_NUMBER">Phone Number</option>
            </select>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">Payment Information</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Secure payment powered by Monnify</li>
              <li>• Funds added instantly upon successful payment</li>
              <li>• Multiple payment options available</li>
              <li>• Transaction fees may apply</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading.deposit || !amount}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading.deposit ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {loading.deposit ? 'Creating...' : 'Add Funds'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const Transactions: React.FC = () => {
  useDocumentTitle("SMS Verification Transactions");

  // Use payment hook for state management
  const {
    balance,
    transactions,
    loading,
    pagination,
    summary,
    filters,
    loadTransactions,
    formatAmount,
    cancelPayment,
    retryPayment,
    updateFilters,
  } = usePayment({ autoFetch: true });

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Load transactions when filters change
  useEffect(() => {
    loadTransactions({ ...filters, page: currentPage });
  }, [filters, currentPage, loadTransactions]);

  // Handle successful deposit
  const handleDepositSuccess = (reference: string) => {
    toast.success(`Deposit initiated! Reference: ${reference}`);
    toastInfo('Complete your payment to see updated balance.');
  };

  // Handle transaction retry - NO POLLING
  const handleRetryTransaction = (transaction: any) => {
    if (transaction.checkout_url) {
      retryPayment(transaction.checkout_url);
    } else {
      toast.error('Checkout URL not available for this transaction');
    }
  };

  // Handle payment cancellation
  const handleCancelPayment = async (paymentReference: string) => {
    try {
      await cancelPayment(paymentReference);
    } catch (error) {
      // Error already handled by hook
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle filter changes
  const handleStatusFilter = (status: string) => {
    updateFilters({ status: status || undefined });
    setCurrentPage(1);
  };

  const handleDateFilter = (field: 'startDate' | 'endDate', value: string) => {
    updateFilters({ [field]: value || undefined });
    setCurrentPage(1);
  };

  if (loading.balance && loading.transactions) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text="Loading transactions..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-600">Manage your account balance and view payment history.</p>
        </div>
        <button
          onClick={() => setShowDepositModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Funds
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CreditCard className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Current Balance</p>
              {loading.balance ? (
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                <p className="text-2xl font-bold text-gray-900">
                  {balance ? formatAmount(balance.balance) : '₦0.00'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Deposited</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatAmount(summary.total_deposited)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatAmount(summary.pending_amount)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary.total_payments > 0 
                  ? `${Math.round((summary.successful_payments / summary.total_payments) * 100)}%`
                  : '0%'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filters.status || ''}
                onChange={(e) => handleStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleDateFilter('startDate', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleDateFilter('endDate', e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => loadTransactions({ ...filters, page: currentPage })}
              disabled={loading.transactions}
              className="flex items-center px-3 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading.transactions ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            
            <button
              onClick={() => toastInfo('Export feature coming soon!')}
              className="flex items-center px-3 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">Payment History</h3>
          <div className="text-sm text-gray-500">
            {summary.total_payments} total transactions
          </div>
        </div>

        {loading.transactions ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" text="Loading transactions..." />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h4>
            <p className="text-gray-500 mb-6">
              {Object.keys(filters).length > 0
                ? 'No transactions match your current filters.'
                : 'Your payment history will appear here after making your first deposit.'
              }
            </p>
            {Object.keys(filters).length === 0 && (
              <button
                onClick={() => setShowDepositModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Make Your First Deposit
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Transaction List */}
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border ${getStatusColor(transaction.status)}`}>
                      {getStatusIcon(transaction.status)}
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-medium text-gray-900">
                          {transaction.payment_description || 'SMS Platform Deposit'}
                        </h4>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(transaction.status)}`}>
                          {transaction.status}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-500 space-y-1 mt-1">
                        <div>Reference: {transaction.payment_reference}</div>
                        <div>Created: {formatDate(transaction.created_at)}</div>
                        {transaction.payment_method && (
                          <div>Method: {transaction.payment_method}</div>
                        )}
                        {transaction.paid_at && (
                          <div>Completed: {formatDate(transaction.paid_at)}</div>
                        )}
                        {transaction.failure_reason && (
                          <div className="text-red-600">Reason: {transaction.failure_reason}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      {formatAmount(transaction.amount)}
                    </div>
                    {transaction.amount_paid && transaction.amount_paid !== transaction.amount && (
                      <div className="text-sm text-green-600">
                        Paid: {formatAmount(transaction.amount_paid)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-4 text-sm">
                    {transaction.expires_at && new Date(transaction.expires_at) > new Date() && (
                      <span className="text-gray-500">
                        Expires: {formatDate(transaction.expires_at)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    {transaction.status === 'PENDING' && transaction.checkout_url && (
                      <>
                        <button
                          onClick={() => handleRetryTransaction(transaction)}
                          className="flex items-center px-3 py-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Complete Payment
                        </button>
                        
                        <button
                          onClick={() => handleCancelPayment(transaction.payment_reference)}
                          className="flex items-center px-3 py-1 text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                      </>
                    )}
                    
                    {transaction.status === 'FAILED' && transaction.checkout_url && (
                      <button
                        onClick={() => handleRetryTransaction(transaction)}
                        className="flex items-center px-3 py-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retry Payment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                <div className="text-sm text-gray-500">
                  Page {pagination.page} of {pagination.totalPages}
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading.transactions}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          disabled={loading.transactions}
                          className={`px-3 py-2 text-sm font-medium rounded-lg ${
                            pageNum === currentPage
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(pagination.totalPages, prev + 1))}
                    disabled={currentPage === pagination.totalPages || loading.transactions}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={handleDepositSuccess}
        balance={balance?.balance || 0}
      />
    </div>
  );
};