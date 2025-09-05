// src/hooks/usePayment.ts - FIXED to trust backend webhooks and handle popup properly
import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hook';
import {
    fetchBalance,
    fetchTransactions,
    createDeposit,
    verifyPayment,
    clearError,
    setFilters,
    clearFilters,
    updateTransactionStatus,
    removeActiveDeposit,
    updateBalance,
    updateSettlementStatus,
    selectPaymentBalance,
    selectPaymentTransactions,
    selectPaymentLoading,
    selectPaymentError,
    selectPaymentPagination,
    selectPaymentSummary,
    selectPaymentFilters,
    selectActiveDeposits,
} from '@/store/slices/paymentSlice';
import { paymentApi, DepositRequest } from '@/api/payments';
import useWebSocket from '@/hooks/useWebsocket';
import toast from 'react-hot-toast';
import { toastInfo } from "@/utils/toastHelpers";

interface UsePaymentOptions {
    autoFetch?: boolean;
    enableWebSocketUpdates?: boolean;
}

export const usePayment = (options: UsePaymentOptions = {}) => {
    const { autoFetch = false, enableWebSocketUpdates = true } = options;

    const dispatch = useAppDispatch();

    // Selectors
    const balance = useAppSelector(selectPaymentBalance);
    const transactions = useAppSelector(selectPaymentTransactions);
    const loading = useAppSelector(selectPaymentLoading);
    const error = useAppSelector(selectPaymentError);
    const pagination = useAppSelector(selectPaymentPagination);
    const summary = useAppSelector(selectPaymentSummary);
    const filters = useAppSelector(selectPaymentFilters);
    const activeDeposits = useAppSelector(selectActiveDeposits);

    // WebSocket for real-time updates
    const { sendMessage } = useWebSocket(
        enableWebSocketUpdates ? handleWebSocketMessage : undefined,
        enableWebSocketUpdates
    );

    // FIXED: Enhanced WebSocket message handler
    function handleWebSocketMessage(message: any) {
        switch (message.type) {
            case 'payment_successful':
                handlePaymentSuccess(message.data);
                break;

            case 'payment_failed':
                handlePaymentFailed(message.data);
                break;

            case 'payment_reversed':
                handlePaymentReversed(message.data);
                break;

            case 'settlement_completed':
                handleSettlementCompleted(message.data);
                break;

            case 'settlement_failed':
                handleSettlementFailed(message.data);
                break;

            case 'balance_updated':
                handleBalanceUpdated(message.data);
                break;

            default:
                // Let other handlers manage non-payment messages
                break;
        }
    }

    // FIXED: WebSocket event handlers - minimal refresh calls
    const handlePaymentSuccess = useCallback((data: any) => {
        dispatch(updateTransactionStatus({
            reference: data.paymentReference,
            status: 'PAID',
            paidAt: data.timestamp,
            settlementStatus: data.settlementStatus || 'PENDING'
        }));

        dispatch(updateBalance({
            balance: data.newBalance,
            change: data.amount
        }));

        dispatch(removeActiveDeposit(data.paymentReference));

        toast.success(
            `Payment successful! ${formatAmount(data.amount)} added to your account.`,
            { duration: 6000 }
        );

        // FIXED: No automatic refresh - Redux state is already updated from webhook data
        // Only refresh if user manually requests it or if there's a specific need
    }, [dispatch]);

    const handlePaymentFailed = useCallback((data: any) => {
        dispatch(updateTransactionStatus({
            reference: data.paymentReference,
            status: 'FAILED',
            failureReason: data.reason
        }));

        dispatch(removeActiveDeposit(data.paymentReference));

        toast.error(
            `Payment failed: ${data.reason || 'Unknown error'}`,
            { duration: 8000 }
        );
    }, [dispatch]);

    const handlePaymentReversed = useCallback((data: any) => {
        dispatch(updateTransactionStatus({
            reference: data.transactionReference,
            status: 'REVERSED'
        }));

        dispatch(updateBalance({
            balance: data.newBalance,
            change: -data.reversalAmount
        }));

        toast.error(
            `Payment reversed: ${formatAmount(data.reversalAmount)}. New balance: ${formatAmount(data.newBalance)}`,
            { duration: 8000 }
        );

        // FIXED: No automatic refresh - Redux state updated from webhook
    }, [dispatch]);

    // FIXED: Handle settlement completion notifications
    const handleSettlementCompleted = useCallback((data: any) => {
        dispatch(updateSettlementStatus({
            settlementReference: data.settlementReference,
            status: 'COMPLETED',
            settlementDate: data.settlementDate
        }));

        toast(
            `Settlement completed: ${formatAmount(data.settlementAmount)} for ${data.transactionCount} transactions`,
            { duration: 5000 }
        );

        // FIXED: No automatic refresh - Redux state updated
    }, [dispatch]);

    const handleSettlementFailed = useCallback((data: any) => {
        dispatch(updateSettlementStatus({
            settlementReference: data.settlementReference,
            status: 'FAILED',
            failureReason: data.failureReason
        }));

        toast.error(
            `Settlement failed: ${data.failureReason}`,
            { duration: 6000 }
        );

        // FIXED: No automatic refresh
    }, [dispatch]);

    const handleBalanceUpdated = useCallback((data: any) => {
        dispatch(updateBalance({
            balance: data.balance,
            change: data.change || 0
        }));

        if (data.change > 0) {
            toast.success(`Balance updated: +${formatAmount(data.change)}`);
        }
    }, [dispatch]);

    // Actions
    const loadBalance = useCallback(async () => {
        try {
            await dispatch(fetchBalance()).unwrap();
        } catch (error) {
            // Error is handled in Redux
        }
    }, [dispatch]);

    const loadTransactions = useCallback(async (params?: {
        page?: number;
        limit?: number;
        status?: string;
        startDate?: string;
        endDate?: string;
    }) => {
        try {
            await dispatch(fetchTransactions(params || {})).unwrap();
        } catch (error) {
            // Error is handled in Redux
        }
    }, [dispatch]);

    // FIXED: Enhanced deposit initiation with proper popup handling and redirect
    const initiateDeposit = useCallback(async (depositData: DepositRequest) => {
        try {
            const result = await dispatch(createDeposit(depositData)).unwrap();

            // Subscribe to payment updates via WebSocket
            if (enableWebSocketUpdates && sendMessage) {
                sendMessage({
                    type: 'subscribe_payment',
                    data: { paymentReference: result.paymentReference }
                });
            }

            // FIXED: Open Monnify checkout with proper redirect handling
            const popup = paymentApi.openMonnifyCheckout(result.checkoutUrl);
            
            toast.success('Payment created! Complete your payment in the popup window.');

            // FIXED: Enhanced popup monitoring - close popup and stay on current page
            if (popup) {
                const checkClosed = setInterval(async () => {
                    if (popup.closed) {
                        clearInterval(checkClosed);
                        
                        console.log('Payment popup closed - checking status');
                        
                        // FIXED: Check status and handle without redirects
                        try {
                            const verificationResult = await paymentApi.verifyPayment(result.paymentReference);
                            console.log('Verification after popup close:', verificationResult.data.status);
                            
                            if (verificationResult.data.status === 'PAID') {
                                // FIXED: Payment successful - stay on current page, refresh data
                                toast.success(`Payment successful! ${formatAmount(verificationResult.data.amountPaid)} credited to your account.`);
                                
                                // Refresh balance and transactions in background
                                await loadBalance();
                                await loadTransactions();
                                
                                // User stays on current page (transactions, dashboard, etc.)
                                
                            } else if (verificationResult.data.status === 'FAILED') {
                                // Payment failed - show error, user stays on current page
                                toast.error('Payment was not successful. Please try again.');
                                
                            } else if (verificationResult.data.status === 'PENDING') {
                                // Still processing - show info toast
                                toast('Payment is being processed. You will be notified when complete.', {
                                    icon: '⏳',
                                    duration: 6000
                                });
                            }
                            
                        } catch (error) {
                            console.warn('Payment verification failed after popup close:', error);
                            toast('Payment status will be updated shortly. Check your transactions for confirmation.', {
                                duration: 5000
                            });
                        }
                    }
                }, 1000);

                // Cleanup interval after 10 minutes
                setTimeout(() => {
                    if (checkClosed) {
                        clearInterval(checkClosed);
                    }
                }, 600000);
            } else {
                // FIXED: Popup blocked - set up redirect URL properly
                const currentUrl = window.location.origin;
                const redirectUrl = `${currentUrl}/payment-success?ref=${result.paymentReference}`;
                
                // Update checkout URL with proper redirect
                const urlWithRedirect = `${result.checkoutUrl}&redirectUrl=${encodeURIComponent(redirectUrl)}`;
                
                toastInfo('Redirecting to payment page...');
                setTimeout(() => {
                    window.location.href = urlWithRedirect;
                }, 1000);
            }

            return result;
        } catch (error: any) {
            toast.error(error.message || 'Failed to create deposit');
            throw error;
        }
    }, [dispatch, enableWebSocketUpdates, sendMessage]);

    // FIXED: Simple verification - trust the server completely
    const verifyPaymentStatus = useCallback(async (reference: string) => {
        try {
            const result = await dispatch(verifyPayment(reference)).unwrap();
            
            // FIXED: After verification, refresh transactions to get latest server state
            await loadTransactions();
            
            return result;
        } catch (error: any) {
            console.error('Payment verification failed:', error);
            throw error;
        }
    }, [dispatch, loadTransactions]);

    const cancelPayment = useCallback(async (paymentReference: string) => {
        try {
            await paymentApi.cancelPayment(paymentReference);
            dispatch(updateTransactionStatus({
                reference: paymentReference,
                status: 'CANCELLED'
            }));
            dispatch(removeActiveDeposit(paymentReference));
            toast.success('Payment cancelled successfully');
            
            // FIXED: Refresh transactions to get server state
            await loadTransactions();
        } catch (error: any) {
            toast.error(error.message || 'Failed to cancel payment');
            throw error;
        }
    }, [dispatch, loadTransactions]);

    const retryPayment = useCallback((checkoutUrl: string) => {
        if (!checkoutUrl) {
            toast.error('Checkout URL not available');
            return null;
        }

        const popup = paymentApi.openMonnifyCheckout(checkoutUrl);
        toastInfo('Payment window reopened. Complete your payment to continue.');
        return popup;
    }, []);

    // Filter and pagination management
    const updateFilters = useCallback((newFilters: Partial<typeof filters>) => {
        dispatch(setFilters(newFilters));
    }, [dispatch]);

    const resetFilters = useCallback(() => {
        dispatch(clearFilters());
    }, [dispatch]);

    const clearErrorState = useCallback(() => {
        dispatch(clearError());
    }, [dispatch]);

    // Auto-fetch data on mount
    useEffect(() => {
        if (autoFetch) {
            loadBalance();
            loadTransactions();
        }
    }, [autoFetch, loadBalance, loadTransactions]);

    // Utility functions
    const formatAmount = useCallback((amount: number, currency = 'NGN') => {
        return paymentApi.formatAmount(amount, currency);
    }, []);

    const validateAmount = useCallback((amount: number) => {
        return paymentApi.validateDepositAmount(amount);
    }, []);

    const getTransactionStatus = useCallback((reference: string) => {
        return transactions.find(t =>
            t.payment_reference === reference ||
            t.transaction_reference === reference
        );
    }, [transactions]);

    const isDepositActive = useCallback((reference: string) => {
        return activeDeposits.includes(reference);
    }, [activeDeposits]);

    // FIXED: Get transactions by settlement status - trust server data
    const getTransactionsBySettlement = useCallback((settlementStatus: 'PENDING' | 'COMPLETED' | 'FAILED') => {
        return transactions.filter(t => 
            t.status === 'PAID' && 
            (t as any).settlement_status === settlementStatus
        );
    }, [transactions]);

    // FIXED: Calculate settlement statistics from server data
    const getSettlementStats = useCallback(() => {
        const paidTransactions = transactions.filter(t => t.status === 'PAID');
        const settledTransactions = paidTransactions.filter(t => (t as any).settlement_status === 'COMPLETED');
        const pendingSettlements = paidTransactions.filter(t => (t as any).settlement_status === 'PENDING');
        const failedSettlements = paidTransactions.filter(t => (t as any).settlement_status === 'FAILED');

        const settledAmount = settledTransactions.reduce((sum, t) => sum + ((t as any).settlement_amount || t.amount_paid), 0);
        const pendingAmount = pendingSettlements.reduce((sum, t) => sum + t.amount_paid, 0);

        return {
            total_settled: settledTransactions.length,
            pending_settlements: pendingSettlements.length,
            failed_settlements: failedSettlements.length,
            settled_amount: settledAmount,
            pending_settlement_amount: pendingAmount,
            settlement_rate: paidTransactions.length > 0 
                ? Math.round((settledTransactions.length / paidTransactions.length) * 100)
                : 0
        };
    }, [transactions]);

    // Statistics and computed values
    const statistics = {
        totalBalance: balance?.balance || 0,
        totalSpent: balance?.total_spent || 0,
        totalDeposited: summary.total_deposited,
        pendingAmount: summary.pending_amount,
        successRate: summary.total_payments > 0
            ? Math.round((summary.successful_payments / summary.total_payments) * 100)
            : 0,
        hasActiveDeposits: activeDeposits.length > 0,
        pendingTransactions: transactions.filter(t => t.status === 'PENDING').length,
        failedTransactions: transactions.filter(t => t.status === 'FAILED').length,
        settledTransactions: transactions.filter(t => (t as any).settlement_status === 'COMPLETED').length,
        pendingSettlements: transactions.filter(t => (t as any).settlement_status === 'PENDING' && t.status === 'PAID').length,
        ...getSettlementStats()
    };

    return {
        // State
        balance,
        transactions,
        loading,
        error,
        pagination,
        summary,
        filters,
        activeDeposits,
        statistics,

        // Actions
        loadBalance,
        loadTransactions,
        initiateDeposit,
        verifyPaymentStatus,
        cancelPayment,
        retryPayment,
        updateFilters,
        resetFilters,
        clearErrorState,

        // Settlement-specific
        getSettlementsByStatus: getTransactionsBySettlement,
        getSettlementStats,

        // Utilities
        formatAmount,
        validateAmount,
        getTransactionStatus,
        isDepositActive,

        // WebSocket status
        isWebSocketEnabled: enableWebSocketUpdates,
    };
};