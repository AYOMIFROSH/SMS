// src/hooks/usePayment.ts - Fixed to properly trust backend webhooks
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
import toast from 'react-hot-toast';
import { toastInfo, toastWarning } from "@/utils/toastHelpers";

interface UsePaymentOptions {
    autoFetch?: boolean;
}

export const usePayment = (options: UsePaymentOptions = {}) => {
    const { autoFetch = false } = options;

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

    // FIXED: Simple polling WITHOUT forcing completion
    const pollPaymentStatus = useCallback(async (
        reference: string,
        onStatusUpdate?: (status: string) => void,
        maxAttempts = 24 // Reduced to 2 minutes max (5s intervals)
    ) => {
        try {
            let attempts = 0;
            
            const poll = async (): Promise<any> => {
                attempts++;
                const result = await paymentApi.verifyPayment(reference);
                const status = result.data.status;
                
                onStatusUpdate?.(status);
                
                // Only update Redux with current status - don't force completion
                dispatch(updateTransactionStatus({
                    reference,
                    status: result.data.status,
                    paidAt: result.data.paidAt
                }));

                // Terminal states OR max attempts reached - return current state
                if (['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status) || attempts >= maxAttempts) {
                    // Remove from active deposits if completed
                    if (['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
                        dispatch(removeActiveDeposit(reference));
                    }
                    return result;
                }

                // Continue polling if still PENDING
                await new Promise(resolve => setTimeout(resolve, 5000));
                return poll();
            };

            return await poll();
        } catch (error: any) {
            console.error('Payment polling failed:', error);
            throw error;
        }
    }, [dispatch]);

    const updateFilters = useCallback((newFilters: Partial<typeof filters>) => {
        dispatch(setFilters(newFilters));
    }, [dispatch]);

    const resetFilters = useCallback(() => {
        dispatch(clearFilters());
    }, [dispatch]);

    const clearErrorState = useCallback(() => {
        dispatch(clearError());
    }, [dispatch]);

    // FIXED: Simplified deposit initiation - trust backend completely
    const initiateDeposit = useCallback(async (depositData: DepositRequest) => {
        try {
            const result = await dispatch(createDeposit(depositData)).unwrap();

            // Open Monnify checkout
            const popup = paymentApi.openMonnifyCheckout(result.checkoutUrl);
            
            toast.success('Payment created! Complete your payment in the popup window.');

            // SIMPLE popup monitoring - NO forced verification
            if (popup) {
                const checkClosed = setInterval(() => {
                    if (popup.closed) {
                        clearInterval(checkClosed);
                        
                        // Just show a message - let webhook handle the rest
                        toast.loading('Checking payment status...', { 
                            id: `payment-check-${result.paymentReference}`,
                            duration: 5000 
                        });
                        
                        // Single status check after popup closes (not forced verification)
                        setTimeout(async () => {
                            try {
                                const status = await paymentApi.verifyPayment(result.paymentReference);
                                
                                if (status.data.status === 'PAID') {
                                    toast.success('Payment completed successfully!');
                                    loadBalance();
                                    loadTransactions();
                                } else if (status.data.status === 'PENDING') {
                                    toast('Payment is being processed. You will be notified once completed.', 
                                        { icon: '⏳', duration: 6000 });
                                } else {
                                    toast.error(`Payment ${status.data.status.toLowerCase()}`);
                                }
                            } catch (error) {
                                toast('Payment status will be updated shortly.', { icon: '⏳' });
                            }
                            
                            toast.dismiss(`payment-check-${result.paymentReference}`);
                        }, 3000);
                    }
                }, 1000);
            } else {
                // Popup blocked - user redirected
                toastInfo('Complete your payment and return to see updated balance.');
            }

            return result;
        } catch (error: any) {
            toast.error(error.message || 'Failed to create deposit');
            throw error;
        }
    }, [dispatch, loadBalance, loadTransactions]);

    const verifyPaymentStatus = useCallback(async (reference: string) => {
        try {
            const result = await dispatch(verifyPayment(reference)).unwrap();
            return result;
        } catch (error: any) {
            console.error('Payment verification failed:', error);
            throw error;
        }
    }, [dispatch]);

    const cancelPayment = useCallback(async (paymentReference: string) => {
        try {
            await paymentApi.cancelPayment(paymentReference);
            dispatch(updateTransactionStatus({
                reference: paymentReference,
                status: 'CANCELLED'
            }));
            dispatch(removeActiveDeposit(paymentReference));
            toast.success('Payment cancelled successfully');
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

    // FIXED: WebSocket updates - trust backend completely
    const handleWebSocketUpdate = useCallback((event: any) => {
        switch (event.type) {
            case 'payment_successful':
                // Backend confirmed via webhook - update immediately
                dispatch(updateBalance({
                    balance: event.data.newBalance,
                    change: event.data.amount
                }));
                dispatch(updateTransactionStatus({
                    reference: event.data.paymentReference,
                    status: 'PAID',
                    paidAt: new Date().toISOString()
                }));
                dispatch(removeActiveDeposit(event.data.paymentReference));
                toast.success(`Payment successful! ₦${event.data.amount} added to your account.`);
                
                // Refresh data to ensure consistency
                loadBalance();
                loadTransactions();
                break;

            case 'payment_failed':
                dispatch(updateTransactionStatus({
                    reference: event.data.paymentReference,
                    status: 'FAILED'
                }));
                dispatch(removeActiveDeposit(event.data.paymentReference));
                toast.error(`Payment failed: ${event.data.reason || 'Unknown error'}`);
                break;

            case 'payment_cancelled':
                dispatch(updateTransactionStatus({
                    reference: event.data.paymentReference,
                    status: 'CANCELLED'
                }));
                dispatch(removeActiveDeposit(event.data.paymentReference));
                toastInfo('Payment was cancelled.');
                break;

            case 'payment_reversed':
                dispatch(updateBalance({
                    balance: event.data.newBalance,
                    change: -event.data.reversalAmount
                }));
                dispatch(updateTransactionStatus({
                    reference: event.data.transactionReference,
                    status: 'REVERSED'
                }));
                toastWarning(`Payment reversed: ₦${event.data.reversalAmount}. New balance: ₦${event.data.newBalance}`);
                break;

            case 'balance_updated':
                dispatch(updateBalance({
                    balance: event.data.balance,
                    change: 0
                }));
                break;
        }
    }, [dispatch, loadBalance, loadTransactions]);

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
        pollPaymentStatus,
        updateFilters,
        resetFilters,
        clearErrorState,
        handleWebSocketUpdate,

        // Utilities
        formatAmount,
        validateAmount,
        getTransactionStatus,
        isDepositActive,
    };
};