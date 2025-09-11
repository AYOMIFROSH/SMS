// Fixed portion of Transactions.tsx - Safe number handling
import React, { useState, useEffect } from 'react';
import {
  CreditCard, TrendingUp, Plus, Clock, CheckCircle, XCircle,
  RefreshCw, Eye, Loader2, DollarSign
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePayment } from '@/hooks/usePayment';
import { paymentAPI } from '@/api/payments';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import toast from 'react-hot-toast';

// Helper function to safely convert and format numbers
const safeNumber = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const safeFormatRate = (rate: any): string => {
  const numRate = safeNumber(rate);
  return numRate > 0 ? numRate.toFixed(2) : 'N/A';
};

export const Transactions: React.FC = () => {
  useDocumentTitle("SMS Verification Transactions");

  // Use our payment hook
  const payment = usePayment({ autoFetch: true, enableWebSocket: true });

  // Local UI state
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Load transactions when page changes
  useEffect(() => {
    payment.loadTransactions({ page: currentPage });
  }, [currentPage, payment.loadTransactions]);

  // FIXED: Better success handling for deposit modal
  const handleDepositSuccess = (txRef: string) => {
    console.log('Deposit success callback triggered:', txRef);

    // Show success message
    toast.success('Redirected to payment gateway! Complete your payment to add funds.', {
      duration: 6000,
      icon: '🚀'
    });

    // Close the modal
    setShowDepositModal(false);

    // Refresh transactions after a short delay to show the new pending payment
    setTimeout(() => {
      payment.refreshTransactions();
      payment.refreshBalance();
    }, 1000);
  };

  // FIXED: Better error handling for deposit creation
  const handleCreateDeposit = async (request: any) => {
    try {
      const result = await payment.createDeposit(request);
      console.log('Create deposit result in component:', result);
      return result;
    } catch (error: any) {
      console.error('Create deposit error in component:', error);
      // Re-throw error so modal can handle it
      throw error;
    }
  };

  // Get safe balance values with proper fallbacks
  const currentBalance = safeNumber(payment.balance?.balance);
  const totalDeposited = safeNumber(payment.balance?.total_deposited);
  const pendingAmount = safeNumber(payment.summary?.pending_amount);
  const totalPayments = safeNumber(payment.summary?.total_payments);
  const successfulPayments = safeNumber(payment.summary?.successful_payments);

  // Initial loading state
  if (payment.loading.balance && payment.loading.transactions && !payment.transactions.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text="Loading transactions..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-gray-600">Manage your account balance and view payment history.</p>
        </div>
        <button
          onClick={() => setShowDepositModal(true)}
          disabled={payment.loading.creating}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Funds
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <CreditCard className="h-8 w-8 text-green-600 mr-4" />
            <div>
              <p className="text-sm font-medium text-gray-600">Current Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                {payment.loading.balance ? (
                  <div className="h-8 bg-gray-200 rounded animate-pulse w-20"></div>
                ) : (
                  payment.formatAmount(currentBalance)
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-blue-600 mr-4" />
            <div>
              <p className="text-sm font-medium text-gray-600">Total Deposited</p>
              <p className="text-2xl font-bold text-gray-900">
                {payment.formatAmount(totalDeposited)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-600 mr-4" />
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                {payment.formatAmount(pendingAmount)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-purple-600 mr-4" />
            <div>
              <p className="text-sm font-medium text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalPayments > 0
                  ? `${Math.round((successfulPayments / totalPayments) * 100)}%`
                  : '0%'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Status Banner */}
      {(payment.pendingTransactions.length > 0 || payment.retryingPayments.length > 0) && (
        <div className="card border-blue-200 bg-blue-50">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-blue-600 mr-3 animate-pulse" />
            <div>
              <h4 className="font-medium text-blue-800">Real-time Payment Monitoring</h4>
              <p className="text-sm text-blue-600">
                {payment.pendingTransactions.length > 0 && `${payment.pendingTransactions.length} pending`}
                {payment.pendingTransactions.length > 0 && payment.retryingPayments.length > 0 && ' • '}
                {payment.retryingPayments.length > 0 && `${payment.retryingPayments.length} verifying`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Simple Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-4">
            <select
              value={payment.filters.status || ''}
              onChange={(e) => payment.updateFilters({ status: e.target.value || undefined })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="PENDING_UNSETTLED">Pending</option>
              <option value="PAID_SETTLED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <input
              type="date"
              value={payment.filters.startDate || ''}
              onChange={(e) => payment.updateFilters({ startDate: e.target.value || undefined })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={payment.filters.endDate || ''}
              onChange={(e) => payment.updateFilters({ endDate: e.target.value || undefined })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={() => {
              payment.refreshTransactions();
              payment.refreshBalance();
            }}
            disabled={payment.loading.transactions}
            className="flex items-center px-3 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${payment.loading.transactions ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">Payment History</h3>
          <span className="text-sm text-gray-500">{totalPayments} total</span>
        </div>

        {payment.loading.transactions && !payment.transactions.length ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner text="Loading transactions..." />
          </div>
        ) : !payment.transactions.length ? (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h4>
            <p className="text-gray-500 mb-6">Your payment history will appear here.</p>
            <button
              onClick={() => setShowDepositModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg"
            >
              Make Your First Deposit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {payment.transactions.map((tx) => {
              const statusDisplay = payment.getStatusDisplay(tx.status);
              const isPending = payment.pendingTransactions.includes(tx.tx_ref);
              const isRetrying = payment.retryingPayments.includes(tx.tx_ref);

              // FIXED: Safe handling of fx_rate and other numeric values
              const fxRate = safeNumber(tx.fx_rate);
              const ngnAmount = safeNumber(tx.ngn_amount);
              const usdEquivalent = safeNumber(tx.usd_equivalent);

              return (
                <div key={tx.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-full border flex items-center justify-center ${statusDisplay.bgColor}`}>
                        {statusDisplay.icon === 'check-circle' && <CheckCircle className="w-4 h-4" />}
                        {statusDisplay.icon === 'clock' && <Clock className="w-4 h-4" />}
                        {statusDisplay.icon === 'x-circle' && <XCircle className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">Flutterwave Deposit</h4>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                            {statusDisplay.text}
                          </span>
                          {isPending && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200">
                              <div className="w-2 h-2 bg-blue-500 rounded-full inline-block mr-1 animate-pulse"></div>
                              Live
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 space-y-1">
                          <div>Ref: {tx.tx_ref}</div>
                          <div>Created: {new Date(tx.created_at).toLocaleDateString()}</div>
                          {fxRate > 0 && <div>Rate: 1 USD = ₦{safeFormatRate(fxRate)}</div>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {tx.formatted_ngn || `₦${ngnAmount.toFixed(2)}`}
                      </div>
                      <div className="text-sm text-green-600">
                        ≈ {tx.formatted_usd || `$${usdEquivalent.toFixed(4)}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                    <div className="text-sm text-gray-500">
                      {tx.flw_ref && `FLW: ${tx.flw_ref}`}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedTx(tx)}
                        className="flex items-center px-3 py-1 text-gray-600 hover:text-gray-800 text-sm"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Details
                      </button>

                      {tx.status === 'PENDING_UNSETTLED' && (
                        <>
                          <button
                            onClick={() => payment.manualVerifyTransaction(tx.tx_ref)}
                            disabled={isRetrying}
                            className="flex items-center px-3 py-1 text-blue-600 hover:text-blue-700 text-sm disabled:opacity-50"
                          >
                            {isRetrying ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Verify
                          </button>

                          <button
                            onClick={() => paymentAPI.openPaymentLink(tx.payment_link)}
                            className="flex items-center px-3 py-1 text-green-600 hover:text-green-700 text-sm"
                          >
                            <CreditCard className="w-3 h-3 mr-1" />
                            Reopen Checkout
                          </button>

                          <button
                            onClick={() => payment.cancelPayment(tx.tx_ref)}
                            className="flex items-center px-3 py-1 text-red-600 hover:text-red-700 text-sm"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancel
                          </button>
                        </>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            {payment.pagination.totalPages > 1 && (
              <div className="flex justify-between items-center pt-6 border-t">
                <div className="text-sm text-gray-500">
                  Page {payment.pagination.page} of {payment.pagination.totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || payment.loading.transactions}
                    className="px-3 py-2 text-sm border rounded disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(payment.pagination.totalPages, p + 1))}
                    disabled={currentPage === payment.pagination.totalPages || payment.loading.transactions}
                    className="px-3 py-2 text-sm border rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FIXED: Deposit Modal with better success handling */}
      {showDepositModal && (
        <DepositModal
          onClose={() => setShowDepositModal(false)}
          onSuccess={handleDepositSuccess}
          balance={currentBalance}
          loading={payment.loading.creating}
          createDeposit={handleCreateDeposit}
        />
      )}

      {/* Transaction Details Modal - FIXED: Safe handling of numeric values */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Transaction Details</h2>
                <button onClick={() => setSelectedTx(null)}>
                  <XCircle className="w-6 h-6 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Reference:</strong><br />{selectedTx.tx_ref}</div>
                <div><strong>Status:</strong><br />{payment.getStatusDisplay(selectedTx.status).text}</div>
                <div>
                  <strong>NGN Amount:</strong><br />
                  {selectedTx.formatted_ngn || `₦${safeNumber(selectedTx.ngn_amount).toFixed(2)}`}
                </div>
                <div>
                  <strong>USD Equivalent:</strong><br />
                  {selectedTx.formatted_usd || `$${safeNumber(selectedTx.usd_equivalent).toFixed(4)}`}
                </div>
                <div>
                  <strong>Exchange Rate:</strong><br />
                  1 USD = ₦{safeFormatRate(selectedTx.fx_rate)}
                </div>
                <div><strong>Method:</strong><br />{payment.getPaymentMethodName(selectedTx.payment_type)}</div>
                {selectedTx.created_at && (
                  <div>
                    <strong>Created:</strong><br />
                    {new Date(selectedTx.created_at).toLocaleString()}
                  </div>
                )}
                {selectedTx.paid_at && (
                  <div>
                    <strong>Paid:</strong><br />
                    {new Date(selectedTx.paid_at).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={() => setSelectedTx(null)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// FIXED: DepositModal Component with better error handling and safe number handling
interface DepositModalProps {
  onClose: () => void;
  onSuccess: (txRef: string) => void;
  balance: number;
  loading: boolean;
  createDeposit: (request: any) => Promise<any>;
}

const DepositModal: React.FC<DepositModalProps> = ({
  onClose, onSuccess, balance, loading, createDeposit
}) => {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank' | 'ussd' | 'mobile'>('card');
  const [fxPreview, setFxPreview] = useState<any>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FX calculation with better error handling
  useEffect(() => {
    if (amount && parseFloat(amount) >= 100) {
      const timer = setTimeout(async () => {
        setFxLoading(true);
        setError(null);
        try {
          const result = await paymentAPI.calculateUSDEquivalent(parseFloat(amount));
          setFxPreview(result.data);
        } catch (error: any) {
          console.error('FX calculation error:', error);
          setFxPreview(null);
          // Don't show FX errors to user, just log them
        } finally {
          setFxLoading(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setFxPreview(null);
      setFxLoading(false);
    }
  }, [amount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !fxPreview) return;

    setError(null);

    try {
      console.log('Creating deposit:', {
        amount: parseFloat(amount),
        payment_type: paymentMethod
      });

      const result = await createDeposit({
        amount: parseFloat(amount),
        payment_type: paymentMethod
      });

      console.log('Deposit creation result:', result);

      // Check if we got a successful response with payment link
      if (result.success && result.data?.payment_link) {
        console.log('Opening payment link:', result.data.payment_link);

        // Open payment link first
        paymentAPI.openPaymentLink(result.data.payment_link);

        // Then call success callback
        onSuccess(result.data.tx_ref);

        // Note: Don't close modal immediately - let parent handle it
        // onClose(); 
      } else if (result.data?.payment_link) {
        // Handle case where success flag might be missing but data exists
        console.log('Opening payment link (fallback):', result.data.payment_link);
        paymentAPI.openPaymentLink(result.data.payment_link);
        onSuccess(result.data.tx_ref);
      } else {
        // No payment link received
        throw new Error('No payment link received from server');
      }

    } catch (error: any) {
      console.error('Deposit creation failed:', error);

      // Set user-friendly error message
      const errorMessage = error.response?.data?.message ||
        error.message ||
        'Failed to create payment session. Please try again.';
      setError(errorMessage);

      // Don't close modal on error - let user try again
    }
  };

  // Safe balance formatting
  const formatSafeAmount = (value: number | undefined | null): string => {
    const safeValue = safeNumber(value);
    return `$${safeValue.toFixed(4)}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-ml font-semibold">Add Funds</h2>
            <button onClick={onClose} disabled={loading}>
              <XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <XCircle className="w-4 h-4 text-red-600 mr-2" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Current Balance: {formatSafeAmount(balance)}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Amount (NGN) *</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null); // Clear error when user types
              }}
              min="100"
              max="1000000"
              required
              disabled={loading}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="Enter amount in NGN"
            />
            <p className="text-xs text-gray-500 mt-1">Min: ₦100 | Max: ₦1,000,000</p>
          </div>

          {/* FX Preview with better loading state and safe number handling */}
          {amount && parseFloat(amount) >= 100 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center mb-2">
                <DollarSign className="w-4 h-4 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-800">USD Equivalent</span>
              </div>
              <div className="text-sm text-blue-700">
                {fxLoading ? (
                  <div className="flex items-center">
                    <Loader2 className="w-3 h-3 animate-spin mr-2" />
                    Calculating exchange rate...
                  </div>
                ) : fxPreview ? (
                  <div>
                    <div>You'll receive: {formatSafeAmount(fxPreview.usd_equivalent)} USD</div>
                    <div className="text-xs text-blue-600 mt-1">
                      Rate: 1 USD = ₦{safeFormatRate(fxPreview.fx_rate)}
                      {fxPreview.margin && ` (includes ${safeNumber(fxPreview.margin).toFixed(1)}% margin)`}
                    </div>
                  </div>
                ) : (
                  <span className="text-red-600">Unable to calculate USD equivalent</span>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              disabled={loading}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="card">Debit/Credit Card</option>
              <option value="bank">Bank Transfer</option>
              <option value="ussd">USSD</option>
              <option value="mobile">Mobile Money</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !amount || !fxPreview || fxLoading || parseFloat(amount) < 100}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Proceed
                </>
              )}
            </button>
          </div>


          {/* Help text */}
          <div className="text-xs text-gray-500 text-center">
            You'll be redirected to Flutterwave secure checkout to complete your payment.
          </div>
        </form>
      </div>
    </div>
  );
};