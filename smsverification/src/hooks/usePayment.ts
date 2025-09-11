// src/hooks/usePayment.ts - Minor optimizations for WebSocket config usage
import { useState, useEffect, useCallback, useMemo } from 'react';
import { paymentAPI, type PaymentDeposit, type UserBalance, type PaymentSummary } from '@/api/payments';
import { useAppSelector } from '@/store/hook';
import type { ApiResponse } from '@/types/index';
import useWebSocket from './useWebsocket';
import toast from 'react-hot-toast';

interface PaymentFilters {
  status?: string;
  startDate?: string;
  endDate?: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface PaymentState {
  balance: UserBalance | null;
  transactions: PaymentDeposit[];
  loading: {
    balance: boolean;
    transactions: boolean;
    creating: boolean;
    verifying: string[]; // tx_refs being verified
  };
  error: string | null;
  pagination: PaginationInfo;
  summary: PaymentSummary;
  filters: PaymentFilters;
}

interface UsePaymentOptions {
  autoFetch?: boolean;
  autoRefresh?: number; // Auto refresh interval in ms
  enableWebSocket?: boolean;
  webSocketConfig?: {
    maxReconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    enableMetrics?: boolean;
  };
}

interface UsePaymentReturn extends PaymentState {
  // Actions
  createDeposit: (request: any) => Promise<ApiResponse<any>>;
  loadTransactions: (params?: any) => Promise<void>;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  verifyPayment: (txRef: string) => Promise<ApiResponse<any>>;
  cancelPayment: (txRef: string) => Promise<ApiResponse<any>>;
  manualVerifyTransaction: (txRef: string) => Promise<void>;
  updateFilters: (newFilters: Partial<PaymentFilters>) => void;

  // Utilities
  formatAmount: (amount: number, currency?: 'USD' | 'NGN') => string;
  getStatusDisplay: (status: string) => any;
  getPaymentMethodName: (method: string) => string;

  // WebSocket integration
  pendingTransactions: string[];
  retryingPayments: string[];
}

const INITIAL_STATE: PaymentState = {
  balance: null,
  transactions: [],
  loading: {
    balance: false,
    transactions: false,
    creating: false,
    verifying: []
  },
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    totalRecords: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  },
  summary: {
    total_payments: 0,
    successful_payments: 0,
    pending_payments: 0,
    pending_amount: 0,
    success_rate: 0
  },
  filters: {}
};

export const usePayment = (options: UsePaymentOptions = {}): UsePaymentReturn => {
  const {
    autoFetch = false,
    autoRefresh = 0,
    enableWebSocket = true,
    webSocketConfig = {} // Optional WebSocket configuration
  } = options;

  // map API pagination (whatever the API returns) to internal PaginationInfo
  const mapApiPaginationToPaginationInfo = (p: any): PaginationInfo => ({
    page: p.page ?? 1,
    limit: p.limit ?? 20,
    totalRecords: p.total_records ?? p.total ?? p.totalRecords ?? 0,
    totalPages: p.total_pages ?? p.totalPages ?? 0,
    hasNext: p.has_next ?? p.hasNext ?? false,
    hasPrevious: p.has_previous ?? p.hasPrevious ?? false
  });

  const { isAuthenticated, user } = useAppSelector(state => state.auth);
  const [state, setState] = useState<PaymentState>(INITIAL_STATE);

  // Track pending and retrying payments
  const [pendingTransactions, setPendingTransactions] = useState<string[]>([]);
  const [retryingPayments, setRetryingPayments] = useState<string[]>([]);

  // Update loading state helper
  const updateLoading = useCallback((key: keyof PaymentState['loading'], value: boolean | string[]) => {
    setState(prev => ({
      ...prev,
      loading: {
        ...prev.loading,
        [key]: value
      }
    }));
  }, []);

  // Set error helper
  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  // Load user balance
  const loadBalance = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      updateLoading('balance', true);
      setError(null);

      const response = await paymentAPI.getBalance();

      setState(prev => ({
        ...prev,
        balance: response.data.balance,
        summary: response.data.summary,
        error: null
      }));

    } catch (error: any) {
      console.error('Load balance error:', error);
      setError('Failed to load balance');
    } finally {
      updateLoading('balance', false);
    }
  }, [isAuthenticated, updateLoading, setError]);

  // Load transactions
  const loadTransactions = useCallback(async (params: any = {}) => {
    if (!isAuthenticated) return;

    try {
      updateLoading('transactions', true);
      setError(null);

      const requestParams = {
        page: state.pagination.page,
        limit: state.pagination.limit,
        ...state.filters,
        ...params
      };

      const response = await paymentAPI.getDeposits(requestParams);
      const mappedPagination = mapApiPaginationToPaginationInfo(response.data.pagination);

      setState(prev => ({
        ...prev,
        transactions: response.data.deposits,
        pagination: mappedPagination,
        error: null
      }));

      // Update pending transactions list
      const pending = response.data.deposits
        .filter(t => t.status === 'PENDING_UNSETTLED')
        .map(t => t.tx_ref);
      setPendingTransactions(pending);

    } catch (error: any) {
      console.error('Load transactions error:', error);
      setError('Failed to load transactions');
    } finally {
      updateLoading('transactions', false);
    }
  }, [isAuthenticated, state.pagination.page, state.pagination.limit, state.filters, updateLoading, setError]);

  // Refresh functions - FIXED: Now declared after loadBalance and loadTransactions
  const refreshBalance = useCallback(() => loadBalance(), [loadBalance]);
  const refreshTransactions = useCallback(() => loadTransactions(), [loadTransactions]);
  const refreshSummary = useCallback(() => loadBalance(), [loadBalance]); // Summary is part of balance response

  // Optimized WebSocket configuration for payment-specific needs
  const paymentWebSocketConfig = useMemo(() => ({
    maxReconnectAttempts: 8, // More attempts for payment reliability
    reconnectInterval: 2000, // Faster reconnection for payments
    heartbeatInterval: 25000, // More frequent heartbeat
    enableMessageQueue: true, // Important for payment messages
    enableDeduplication: true, // Prevent duplicate payment notifications
    enableMetrics: true,
    messageCleanupInterval: 120000, // 2 minutes - faster cleanup for payments
    ...webSocketConfig // Allow user overrides
  }), [webSocketConfig]);

  // WebSocket for real-time updates with payment-optimized config
  useWebSocket(
    useCallback((message: any) => {
      if (!enableWebSocket || !user) return;

      switch (message.type) {
        case 'payment_successful':
          if (message.data.userId === user.id) {
            console.log('Payment successful via WebSocket:', message.data);
            toast.success(`Payment successful! ${paymentAPI.formatAmount(message.data.settlementAmount)} credited to your account`);

            // Remove from pending list
            setPendingTransactions(prev => prev.filter(ref => ref !== message.data.transactionReference));

            // Refresh data
            refreshBalance();
            refreshTransactions();
            refreshSummary();
          }
          break;

        case 'payment_failed':
          if (message.data.userId === user.id) {
            console.log('Payment failed via WebSocket:', message.data);
            toast.error(`Payment failed: ${message.data.reason}`);

            // Remove from pending list
            setPendingTransactions(prev => prev.filter(ref => ref !== message.data.transactionReference));

            // Refresh transactions
            refreshTransactions();
          }
          break;

        case 'balance_updated':
          if (message.data.userId === user.id) {
            console.log('Balance updated via WebSocket:', message.data);

            // Update balance in state
            setState(prev => ({
              ...prev,
              balance: prev.balance ? {
                ...prev.balance,
                balance: message.data.balance,
                formatted_balance: paymentAPI.formatAmount(message.data.balance)
              } : null
            }));
          }
          break;

        case 'settlement_completed':
          if (message.data.userId === user.id) {
            console.log('Settlement completed via WebSocket:', message.data);
            toast.success('Payment settlement completed!');
            refreshBalance();
            refreshTransactions();
          }
          break;

        // Handle payment verification status updates
        case 'payment_verification_started':
          if (message.data.userId === user.id && message.data.txRef) {
            console.log('Payment verification started:', message.data.txRef);
            setRetryingPayments(prev => [...prev, message.data.txRef]);
          }
          break;

        case 'payment_verification_completed':
          if (message.data.userId === user.id && message.data.txRef) {
            console.log('Payment verification completed:', message.data.txRef);
            setRetryingPayments(prev => prev.filter(ref => ref !== message.data.txRef));
            
            if (message.data.success) {
              setPendingTransactions(prev => prev.filter(ref => ref !== message.data.txRef));
              refreshBalance();
              refreshTransactions();
            }
          }
          break;
      }
    }, [enableWebSocket, user, refreshBalance, refreshTransactions, refreshSummary]),
    enableWebSocket && isAuthenticated,
    paymentWebSocketConfig // Use optimized config
  );

  // Create deposit
  const createDeposit = useCallback(async (request: any) => {
    try {
      updateLoading('creating', true);
      setError(null);

      const response = await paymentAPI.createDeposit(request);

      // Add to pending transactions
      setPendingTransactions(prev => [...prev, response.data.tx_ref]);

      // Refresh transactions to show the new pending deposit
      setTimeout(() => {
        refreshTransactions();
      }, 1000);

      return response;

    } catch (error: any) {
      console.error('Create deposit error:', error);
      setError('Failed to create deposit');
      throw error;
    } finally {
      updateLoading('creating', false);
    }
  }, [updateLoading, setError, refreshTransactions]);

  // Verify payment
  const verifyPayment = useCallback(async (txRef: string) => {
    try {
      // Add to retrying list
      setRetryingPayments(prev => [...prev, txRef]);

      const response = await paymentAPI.verifyPayment(txRef);

      // Remove from pending if successful
      if (response.success) {
        setPendingTransactions(prev => prev.filter(ref => ref !== txRef));

        // Refresh data
        refreshBalance();
        refreshTransactions();
      }

      return response;

    } catch (error: any) {
      console.error('Verify payment error:', error);
      throw error;
    } finally {
      // Remove from retrying list
      setRetryingPayments(prev => prev.filter(ref => ref !== txRef));
    }
  }, [refreshBalance, refreshTransactions]);

  // Manual verification (with loading state in main loading object)
  const manualVerifyTransaction = useCallback(async (txRef: string) => {
    try {
      const currentVerifying = state.loading.verifying;
      updateLoading('verifying', [...currentVerifying, txRef]);

      await verifyPayment(txRef);

    } catch (error) {
      throw error;
    } finally {
      const currentVerifying = state.loading.verifying;
      updateLoading('verifying', currentVerifying.filter(ref => ref !== txRef));
    }
  }, [state.loading.verifying, updateLoading, verifyPayment]);

  // Cancel payment
  const cancelPayment = useCallback(async (txRef: string) => {
    try {
      const response = await paymentAPI.cancelPayment(txRef);

      // Remove from pending list
      setPendingTransactions(prev => prev.filter(ref => ref !== txRef));

      // Refresh transactions
      refreshTransactions();

      return response;

    } catch (error: any) {
      console.error('Cancel payment error:', error);
      throw error;
    }
  }, [refreshTransactions]);

  // Update filters
  const updateFilters = useCallback((newFilters: Partial<PaymentFilters>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...newFilters },
      pagination: { ...prev.pagination, page: 1 } // Reset to first page
    }));
  }, []);

  // Utility functions
  const formatAmount = useCallback((amount: number, currency: 'USD' | 'NGN' = 'USD') => {
    return paymentAPI.formatAmount(amount, currency);
  }, []);

  const getStatusDisplay = useCallback((status: string) => {
    return paymentAPI.getStatusDisplay(status);
  }, []);

  const getPaymentMethodName = useCallback((method: string) => {
    return paymentAPI.getPaymentMethodName(method);
  }, []);

  // Auto fetch on mount
  useEffect(() => {
    if (autoFetch && isAuthenticated) {
      loadBalance();
      loadTransactions();
    }
  }, [autoFetch, isAuthenticated, loadBalance, loadTransactions]);

  // Auto refresh interval
  useEffect(() => {
    if (!autoRefresh || !isAuthenticated) return;

    const interval = setInterval(() => {
      loadBalance();
      loadTransactions();
    }, autoRefresh);

    return () => clearInterval(interval);
  }, [autoRefresh, isAuthenticated, loadBalance, loadTransactions]);

  // Handle payment redirects on mount
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await paymentAPI.handlePaymentRedirect();
        if (result.handled) {
          // Refresh data after handling redirect
          setTimeout(() => {
            refreshBalance();
            refreshTransactions();
          }, 1000);
        }
      } catch (error) {
        console.error('Error handling payment redirect:', error);
      }
    };

    if (isAuthenticated) {
      handleRedirect();
    }
  }, [isAuthenticated, refreshBalance, refreshTransactions]);

  // Listen for custom payment events
  useEffect(() => {
    const handlePaymentCompleted = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail?.txRef) {
        // Remove from pending list
        setPendingTransactions(prev => prev.filter(ref => ref !== detail.txRef));

        // Refresh data
        refreshBalance();
        refreshTransactions();
      }
    };

    const handlePaymentFailed = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail?.txRef) {
        // Remove from pending list
        setPendingTransactions(prev => prev.filter(ref => ref !== detail.txRef));

        // Refresh transactions
        refreshTransactions();
      }
    };

    const handlePaymentCancelled = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail?.txRef) {
        // Remove from pending list
        setPendingTransactions(prev => prev.filter(ref => ref !== detail.txRef));

        // Refresh transactions
        refreshTransactions();
      }
    };

    const handlePaymentWindowClosed = () => {
      // Optionally refresh data when payment window is closed
      setTimeout(() => {
        if (pendingTransactions.length > 0) {
          refreshTransactions();
        }
      }, 2000);
    };

    window.addEventListener('payment:completed', handlePaymentCompleted);
    window.addEventListener('payment:failed', handlePaymentFailed);
    window.addEventListener('payment:cancelled', handlePaymentCancelled);
    window.addEventListener('payment:windowClosed', handlePaymentWindowClosed);

    return () => {
      window.removeEventListener('payment:completed', handlePaymentCompleted);
      window.removeEventListener('payment:failed', handlePaymentFailed);
      window.removeEventListener('payment:cancelled', handlePaymentCancelled);
      window.removeEventListener('payment:windowClosed', handlePaymentWindowClosed);
    };
  }, [refreshBalance, refreshTransactions, pendingTransactions.length]);

  // Memoized return object
  return useMemo(() => ({
    // State
    ...state,

    // Actions
    createDeposit,
    loadTransactions,
    refreshBalance,
    refreshTransactions,
    refreshSummary,
    verifyPayment,
    cancelPayment,
    manualVerifyTransaction,
    updateFilters,

    // Utilities
    formatAmount,
    getStatusDisplay,
    getPaymentMethodName,

    // WebSocket integration
    pendingTransactions,
    retryingPayments
  }), [
    state,
    createDeposit,
    loadTransactions,
    refreshBalance,
    refreshTransactions,
    refreshSummary,
    verifyPayment,
    cancelPayment,
    manualVerifyTransaction,
    updateFilters,
    formatAmount,
    getStatusDisplay,
    getPaymentMethodName,
    pendingTransactions,
    retryingPayments
  ]);
};

// Separate hook for WebSocket payment notifications with config support
export const usePaymentWebSocket = (options: { 
  enabled?: boolean;
  webSocketConfig?: any;
} = {}) => {
  const { enabled = true, webSocketConfig = {} } = options;
  const { user } = useAppSelector(state => state.auth);

  // Payment-specific WebSocket config
  const paymentConfig = useMemo(() => ({
    maxReconnectAttempts: 8,
    reconnectInterval: 2000,
    enableMessageQueue: true,
    enableDeduplication: true,
    messageCleanupInterval: 120000,
    ...webSocketConfig
  }), [webSocketConfig]);

  return useWebSocket(
    useCallback((message: any) => {
      if (!enabled || !user) return;

      // Handle payment-specific WebSocket messages
      switch (message.type) {
        case 'payment_successful':
        case 'payment_failed':
        case 'payment_reversed':
        case 'balance_updated':
        case 'settlement_completed':
        case 'settlement_failed':
          // These are handled by the main payment hook
          console.log(`Payment WebSocket: ${message.type}`, message.data);
          break;
      }
    }, [enabled, user]),
    enabled,
    paymentConfig
  );
};

export default usePayment;