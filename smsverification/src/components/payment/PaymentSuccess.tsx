// src/components/payment/PaymentSuccess.tsx - Fixed to trust webhooks
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { usePayment } from '@/hooks/usePayment';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { toastInfo, toastWarning } from '@/utils/toastHelpers';

type PaymentData = {
    status?: string;
    amount?: number;
    amountPaid?: number;
    paymentReference?: string;
    paidAt?: string;
    paymentMethod?: string;
    [k: string]: any;
};

const getStatusIcon = (status: string | undefined) => {
    switch (status) {
        case 'PAID': return <CheckCircle className="w-16 h-16 text-green-500" />;
        case 'FAILED': return <XCircle className="w-16 h-16 text-red-500" />;
        case 'PENDING': return <Clock className="w-16 h-16 text-yellow-500" />;
        case 'CANCELLED': return <XCircle className="w-16 h-16 text-gray-500" />;
        case 'EXPIRED': return <AlertTriangle className="w-16 h-16 text-orange-500" />;
        default: return <Clock className="w-16 h-16 text-gray-500" />;
    }
};

const getStatusMessage = (status: string | undefined) => {
    switch (status) {
        case 'PAID':
            return {
                title: 'Payment Successful!',
                description: 'Your account has been credited. You can now purchase SMS numbers.',
                color: 'text-green-600',
            };
        case 'FAILED':
            return {
                title: 'Payment Failed',
                description: 'Payment could not be processed. No charges were made.',
                color: 'text-red-600',
            };
        case 'PENDING':
            return {
                title: 'Payment Processing',
                description: 'Your payment is being confirmed. This typically takes 1-3 minutes.',
                color: 'text-yellow-600',
            };
        case 'CANCELLED':
            return {
                title: 'Payment Cancelled',
                description: 'Payment was cancelled. No charges were made.',
                color: 'text-gray-600',
            };
        case 'EXPIRED':
            return {
                title: 'Payment Expired',
                description: 'Payment session expired. Please create a new payment.',
                color: 'text-orange-600',
            };
        default:
            return {
                title: 'Checking Payment Status',
                description: 'Please wait while we verify your payment...',
                color: 'text-gray-600',
            };
    }
};

const PaymentSuccess: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { verifyPaymentStatus, formatAmount, loadBalance, loadTransactions } = usePayment();

    const [loading, setLoading] = useState(true);
    const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastChecked, setLastChecked] = useState<number>(0);
    const [checkCount, setCheckCount] = useState<number>(0);

    const paymentRef = searchParams.get('ref') ||
        searchParams.get('paymentReference') ||
        searchParams.get('transactionReference');

    // FIXED: Simple verification - no forced polling
    useEffect(() => {
        let mounted = true;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const checkPaymentStatus = async () => {
            if (!paymentRef) {
                if (!mounted) return;
                setError('No payment reference found in URL');
                setLoading(false);
                return;
            }

            try {
                setCheckCount(prev => prev + 1);
                setLastChecked(Date.now());

                const result = await verifyPaymentStatus(paymentRef);
                if (!mounted) return;

                setPaymentData(result);
                const status = result.status;

                // Terminal states - stop checking
                if (['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
                    setLoading(false);

                    if (status === 'PAID') {
                        toast.success(`Payment successful! ${formatAmount(result.amount || 0)} credited.`);
                        // Refresh data once on success
                        try {
                            await loadBalance();
                            await loadTransactions();
                        } catch (e) {
                            console.warn('Failed to refresh data after payment success:', e);
                        }
                    } else if (status === 'FAILED') {
                        toast.error('Payment failed. You can try again from Transactions page.');
                    } else if (status === 'CANCELLED') {
                        toastInfo('Payment was cancelled.');
                    } else if (status === 'EXPIRED') {
                        toastWarning('Payment session expired.');
                    }
                    return;
                }

                // Still PENDING - check a few times then let webhook handle it
                if (status === 'PENDING' && checkCount < 4) {
                    // Check 3 more times, then trust webhook system
                    timeoutId = setTimeout(checkPaymentStatus, 8000); // 8 second intervals
                } else if (status === 'PENDING') {
                    // Max checks reached - stop and trust webhook
                    setLoading(false);
                    toast('Payment is being processed. You will receive a notification when complete.', {
                        icon: '⏳',
                        duration: 8000
                    });
                }

            } catch (err: any) {
                console.error('Payment status check failed:', err);
                if (!mounted) return;

                if (checkCount < 3) {
                    // Retry on error (network issues, etc.)
                    timeoutId = setTimeout(checkPaymentStatus, 5000);
                } else {
                    setError(err.message || 'Unable to verify payment status');
                    setLoading(false);
                }
            }
        };

        checkPaymentStatus();

        return () => {
            mounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [paymentRef, verifyPaymentStatus]); // Removed dependencies that cause re-runs

    const handleManualRefresh = async () => {
        if (!paymentRef) return;

        setLoading(true);
        setError(null);

        try {
            const result = await verifyPaymentStatus(paymentRef);
            setPaymentData(result);
            setLastChecked(Date.now());

            if (result.status === 'PAID') {
                toast.success('Payment confirmed!');
                await loadBalance();
                await loadTransactions();
            }

        } catch (err: any) {
            setError(err.message || 'Failed to check payment status');
            toast.error('Unable to verify payment. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const timeSinceCheck = lastChecked ? Math.floor((Date.now() - lastChecked) / 1000) : 0;

    if (loading && !paymentData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
                    <LoadingSpinner size="lg" className="mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                        Verifying Payment
                    </h2>
                    <p className="text-gray-600">Please wait while we confirm your payment status...</p>
                    {paymentRef && (
                        <p className="text-xs text-gray-500 mt-4 break-all">Ref: {paymentRef}</p>
                    )}
                    {checkCount > 0 && (
                        <p className="text-xs text-gray-400 mt-2">Check {checkCount}/4</p>
                    )}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
                    <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-red-600 mb-2">Verification Error</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate('/transactions')}
                            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            View Transactions
                        </button>
                        <button
                            onClick={handleManualRefresh}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!paymentData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
                    <AlertTriangle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-orange-600 mb-2">Payment Not Found</h2>
                    <p className="text-gray-600 mb-6">No payment information available.</p>
                    <button
                        onClick={() => navigate('/transactions')}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        View Transactions
                    </button>
                </div>
            </div>
        );
    }

    const statusInfo = getStatusMessage(paymentData.status);

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 text-center">
                {getStatusIcon(paymentData.status)}

                <h2 className={`text-2xl font-semibold mb-2 ${statusInfo.color}`}>
                    {statusInfo.title}
                </h2>

                <p className="text-gray-600 mb-6">{statusInfo.description}</p>

                {/* Payment Details */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Amount:</span>
                        <span className="font-semibold">
                            {formatAmount(paymentData.amount || paymentData.amountPaid || 0)}
                        </span>
                    </div>

                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Reference:</span>
                        <span className="font-mono text-xs break-all">
                            {paymentData.paymentReference || paymentRef}
                        </span>
                    </div>

                    {paymentData.paymentMethod && (
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Method:</span>
                            <span className="font-medium">{paymentData.paymentMethod}</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <span className="text-gray-600">Status:</span>
                        <span
                            className={`font-medium px-2 py-1 rounded text-xs ${paymentData.status === 'PAID'
                                    ? 'bg-green-100 text-green-800'
                                    : paymentData.status === 'FAILED'
                                        ? 'bg-red-100 text-red-800'
                                        : paymentData.status === 'PENDING'
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-gray-100 text-gray-800'
                                }`}
                        >
                            {paymentData.status}
                        </span>
                    </div>

                    {lastChecked > 0 && (
                        <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>Last checked:</span>
                            <span>{timeSinceCheck}s ago</span>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    {paymentData.status === 'PAID' && (
                        <button
                            onClick={() => navigate('/buy-number')}
                            className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                        >
                            Continue to Purchase Numbers
                        </button>
                    )}

                    {paymentData.status === 'FAILED' && (
                        <button
                            onClick={() => navigate('/transactions')}
                            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                        >
                            Try Another Payment
                        </button>
                    )}

                    {paymentData.status === 'PENDING' && (
                        <div className="space-y-3">
                            <button
                                onClick={handleManualRefresh}
                                disabled={loading}
                                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
                            >
                                {loading ? (
                                    <LoadingSpinner size="sm" className="mr-2" />
                                ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                )}
                                Check Status
                            </button>
                            <p className="text-xs text-gray-500">
                                Processing can take up to 5 minutes. You'll receive a notification when complete.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => navigate('/transactions')}
                        className="w-full px-4 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 font-medium rounded-lg transition-colors"
                    >
                        View All Transactions
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;