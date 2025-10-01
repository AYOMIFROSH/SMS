// src/api/payments.ts - Frontend payment API integration
import client from './client';
import toast from 'react-hot-toast';
import {  toastWarning } from '@/utils/toastHelpers';

export interface ExchangeRateResponse {
  success: boolean;
  data: {
    from_currency: string;
    to_currency: string;
    rate: number;
    source: string;
    timestamp: string;
    formatted_rate: string;
  };
}

export interface USDCalculationResponse {
  success: boolean;
  data: {
    ngn_amount: number;
    usd_equivalent: number;
    fx_rate: number;
    source: string;
    margin_percentage: number;
    formatted_ngn: string;
    formatted_usd: string;
    timestamp: string;
  };
}

export interface CreateDepositRequest {
  amount: number;
  payment_type: 'card' | 'bank' | 'ussd' | 'mobile';
  customer_email?: string;
  customer_phone?: string;
}

export interface CreateDepositResponse {
  success: boolean;
  data: {
    tx_ref: string;
    payment_link: string;
    checkout_token?: string;
    expires_at: string;
    ngn_amount: number;
    usd_equivalent: number;
    fx_rate: number;
    currency: string;
    payment_type: string;
    formatted_ngn: string;
    formatted_usd: string;
  };
  message: string;
}

export interface PaymentDeposit {
  id: number;
  tx_ref: string;
  flw_tx_id?: number;
  flw_ref?: string;
  ngn_amount: number;
  usd_equivalent: number;
  fx_rate: number;
  status: 'PENDING_UNSETTLED' | 'PAID_SETTLED' | 'FAILED' | 'CANCELLED' | 'NOT_ACTIVATED';
  payment_type: string;
  currency: string;
  customer_email?: string;
  customer_name?: string;
  customer_phone?: string;
  charged_amount?: number;
  app_fee?: number;
  merchant_fee?: number;
  payment_link?: string;
  created_at: string;
  paid_at?: string;
  expires_at?: string;
  formatted_ngn: string;
  formatted_usd: string;
}

export interface DepositsResponse {
  success: boolean;
  data: {
    deposits: PaymentDeposit[];
    pagination: {
      page: number;
      limit: number;
      total_records: number;
      total_pages: number;
      has_next: boolean;
      has_previous: boolean;
    };
  };
}

export interface UserBalance {
  balance: number;
  total_deposited: number;
  total_spent: number;
  pending_deposits: number;
  formatted_balance: string;
  last_deposit_at?: string;
  last_transaction_at?: string;
}

export interface PaymentSummary {
  total_payments: number;
  successful_payments: number;
  pending_payments: number;
  pending_amount: number;
  success_rate: number;
}

export interface BalanceResponse {
  success: boolean;
  data: {
    balance: UserBalance;
    summary: PaymentSummary;
  };
}

export interface PaymentStatusResponse {
  success: boolean;
  data: {
    tx_ref: string;
    status: string;
    ngn_amount: number;
    usd_equivalent: number;
    fx_rate: number;
    payment_type: string;
    created_at: string;
    paid_at?: string;
    expires_at?: string;
    payment_link?: string;
    formatted_ngn: string;
    formatted_usd: string;
    is_expired: boolean;
  };
}

class PaymentAPI {
  // Format currency amounts
  formatAmount(amount: number, currency: 'USD' | 'NGN' = 'USD'): string {
    const symbol = currency === 'NGN' ? '₦' : '$';
    const decimals = currency === 'NGN' ? 2 : 4;
    return `${symbol}${parseFloat(amount.toString()).toFixed(decimals)}`;
  }

  // Validate amount
  validateAmount(amount: number): { isValid: boolean; error?: string } {
    if (isNaN(amount) || amount <= 0) {
      return { isValid: false, error: 'Amount must be a positive number' };
    }
    
    if (amount < 100) {
      return { isValid: false, error: 'Minimum deposit amount is ₦100' };
    }
    
    if (amount > 1000000) {
      return { isValid: false, error: 'Maximum deposit amount is ₦1,000,000' };
    }
    
    return { isValid: true };
  }

  // Get current exchange rate
  async getExchangeRate(from: string = 'USD', to: string = 'NGN'): Promise<ExchangeRateResponse> {
    try {
      console.log(`Fetching exchange rate: ${from} to ${to}`);
      
      const response = await client.get('/payments/exchange-rate', {
        params: { from, to }
      });

      if (response.data.success) {
        console.log('Exchange rate fetched:', response.data.data.formatted_rate);
        return response.data;
      }
      
      throw new Error(response.data.message || 'Failed to fetch exchange rate');
    } catch (error: any) {
      console.error('Exchange rate fetch error:', error);
      toast.error(error.response?.data?.message || 'Failed to get current exchange rate');
      throw error;
    }
  }

  // Calculate USD equivalent
  async calculateUSDEquivalent(ngnAmount: number): Promise<USDCalculationResponse> {
    try {
      const validation = this.validateAmount(ngnAmount);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      console.log(`Calculating USD equivalent for ₦${ngnAmount}`);
      
      const response = await client.post('/payments/calculate-usd', {
        amount: ngnAmount
      });

      if (response.data.success) {
        console.log(`USD equivalent: ${response.data.data.formatted_usd} (Rate: ${response.data.data.fx_rate})`);
        return response.data;
      }
      
      throw new Error(response.data.message || 'Calculation failed');
    } catch (error: any) {
      console.error('USD calculation error:', error);
      const message = error.response?.data?.message || error.message || 'Failed to calculate USD equivalent';
      toast.error(message);
      throw error;
    }
  }

  // Create deposit
  async createDeposit(request: CreateDepositRequest): Promise<CreateDepositResponse> {
    try {
      const validation = this.validateAmount(request.amount);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      console.log('Creating deposit:', {
        amount: request.amount,
        payment_type: request.payment_type
      });

      const response = await client.post('/payments/create-deposit', request);

      if (response.data.success) {
        console.log('Deposit created:', response.data.data.tx_ref);
        toast.success('Payment session created! Redirecting to payment gateway...');
        return response.data;
      }
      
      throw new Error(response.data.message || 'Failed to create deposit');
    } catch (error: any) {
      console.error('Create deposit error:', error);
      const message = error.response?.data?.message || error.message || 'Failed to create payment session';
      toast.error(message);
      throw error;
    }
  }

  // Open payment link
 openPaymentLink(paymentLink?: string): void {
  if (!paymentLink) {
    console.error("No payment link provided");
    toast.error("Payment link is not available for this transaction");
    return;
  }

  console.log('Opening payment link:', paymentLink.substring(0, 50) + '...');
  const popup = window.open(
    paymentLink,
    'flutterwave_payment',
    'width=800,height=700,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
  );

  if (!popup) {
    window.location.href = paymentLink;
    toastWarning('Payment window opened in current tab (popup blocked)');
  } else {
    popup.focus();
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        console.log('Payment window closed by user');
        window.dispatchEvent(new CustomEvent('payment:windowClosed'));
      }
    }, 1000);
    setTimeout(() => clearInterval(checkClosed), 600000);
  }
}

  // Get user deposits
  async getDeposits(params: {
    page?: number;
    limit?: number;
    status?: string;
    start_date?: string;
    end_date?: string;
  } = {}): Promise<DepositsResponse> {
    try {
      console.log('Fetching deposits:', params);
      
      const response = await client.get('/payments/deposits', { params });

      if (response.data.success) {
        console.log(`Fetched ${response.data.data.deposits.length} deposits`);
        return response.data;
      }
      
      throw new Error(response.data.message || 'Failed to fetch deposits');
    } catch (error: any) {
      console.error('Get deposits error:', error);
      toast.error(error.response?.data?.message || 'Failed to load payment history');
      throw error;
    }
  }

  // Get user balance and summary
  async getBalance(): Promise<BalanceResponse> {
    try {
      console.log('Fetching user balance...');
      
      const response = await client.get('/payments/balance');

      if (response.data.success) {
        console.log(`Balance: ${response.data.data.balance.formatted_balance}`);
        return response.data;
      }
      
      throw new Error(response.data.message || 'Failed to fetch balance');
    } catch (error: any) {
      console.error('Get balance error:', error);
      // Don't show toast for balance errors as they might be frequent
      throw error;
    }
  }

  // src/api/payments.ts - Enhanced verifyPayment with better error codes

// Verify payment manually
async verifyPayment(txRef: string): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    console.log('Manually verifying payment:', txRef);
    
    const response = await client.post(`/payments/verify/${txRef}`);

    if (response.data.success) {
      console.log('Payment verification successful');
      toast.success(response.data.message || 'Payment verified successfully!');
      
      // Dispatch custom event for payment completion
      window.dispatchEvent(new CustomEvent('payment:completed', {
        detail: { txRef, data: response.data.data }
      }));
      
      return response.data;
    }
    
    throw new Error(response.data.message || 'Payment verification failed');
  } catch (error: any) {
    console.error('Payment verification error:', error);
    
    const errorData = error.response?.data;
    const errorCode = errorData?.code;
    const message = errorData?.error || error.message || 'Verification failed';
    
    // Handle different error codes with appropriate UI feedback
    switch (errorCode) {
      case 'PAYMENT_EXPIRED':
        toast.error('Payment session expired. Please create a new payment.', {
          duration: 5000,
          icon: '⏰'
        });
        break;
        
      case 'PAYMENT_NOT_ACTIVATED':
        toastWarning('Payment was never completed. Creating a new payment...');
        // Auto-remove from pending list since it's now cancelled
        window.dispatchEvent(new CustomEvent('payment:auto_cancelled', {
          detail: { txRef, reason: 'not_activated' }
        }));
        break;
        
      case 'PAYMENT_FAILED':
        toast.error('Payment verification failed. Please try again or contact support.', {
          duration: 5000,
          icon: '⚠️'
        });
        break;
        
      default:
        toast.error(message);
    }
    
    // Dispatch custom event for payment failure with error code
    window.dispatchEvent(new CustomEvent('payment:failed', {
      detail: { txRef, error: message, code: errorCode }
    }));
    
    throw error;
  }
}

  // Cancel payment
  async cancelPayment(txRef: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('Cancelling payment:', txRef);
      
      const response = await client.delete(`/payments/cancel/${txRef}`);

      if (response.data.success) {
        console.log('Payment cancelled successfully');
        toast.success(response.data.message || 'Payment cancelled successfully');
        
        // Dispatch custom event for payment cancellation
        window.dispatchEvent(new CustomEvent('payment:cancelled', {
          detail: { txRef }
        }));
        
        return response.data;
      }
      
      throw new Error(response.data.message || 'Failed to cancel payment');
    } catch (error: any) {
      console.error('Cancel payment error:', error);
      const message = error.response?.data?.message || error.message || 'Failed to cancel payment';
      toast.error(message);
      throw error;
    }
  }

  // Get payment status
  async getPaymentStatus(txRef: string): Promise<PaymentStatusResponse> {
    try {
      console.log('Getting payment status:', txRef);
      
      const response = await client.get(`/payments/status/${txRef}`);

      if (response.data.success) {
        console.log(`Payment status: ${response.data.data.status}`);
        return response.data;
      }
      
      throw new Error(response.data.message || 'Failed to get payment status');
    } catch (error: any) {
      console.error('Get payment status error:', error);
      // Don't show toast for status checks as they might be frequent
      throw error;
    }
  }

  // Parse URL parameters for payment status
  parsePaymentParams(url: string = window.location.href): {
    status?: string;
    tx_ref?: string;
    transaction_id?: string;
  } {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      
      return {
        status: params.get('status') || undefined,
        tx_ref: params.get('tx_ref') || undefined,
        transaction_id: params.get('transaction_id') || undefined
      };
    } catch (error) {
      console.error('Error parsing payment params:', error);
      return {};
    }
  }

  // Handle payment redirect
  async handlePaymentRedirect(): Promise<{
    handled: boolean;
    success?: boolean;
    txRef?: string;
    message?: string;
  }> {
    try {
      const params = this.parsePaymentParams();
      
      if (!params.tx_ref) {
        return { handled: false };
      }

      console.log('Handling payment redirect:', params);

      // Get payment status
      const statusResponse = await this.getPaymentStatus(params.tx_ref);
      const paymentData = statusResponse.data;

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      if (paymentData.status === 'PAID_SETTLED') {
        // Payment successful
        toast.success(`Payment completed! ${paymentData.formatted_usd} credited to your account.`);
        
        window.dispatchEvent(new CustomEvent('payment:completed', {
          detail: { txRef: params.tx_ref, data: paymentData }
        }));
        
        return {
          handled: true,
          success: true,
          txRef: params.tx_ref,
          message: 'Payment completed successfully'
        };
      } else if (paymentData.status === 'PENDING_UNSETTLED') {
        // Payment pending - try verification
        toastWarning('Payment is being processed. Attempting verification...');
        
        try {
          await this.verifyPayment(params.tx_ref);
          return {
            handled: true,
            success: true,
            txRef: params.tx_ref,
            message: 'Payment verified and completed'
          };
        } catch (verifyError) {
          toastWarning('Payment is still processing. Please check back in a few minutes.');
          return {
            handled: true,
            success: false,
            txRef: params.tx_ref,
            message: 'Payment verification pending'
          };
        }
      } else if (paymentData.status === 'FAILED' || paymentData.status === 'CANCELLED') {
        // Payment failed
        toast.error(`Payment ${paymentData.status.toLowerCase()}. Please try again.`);
        
        window.dispatchEvent(new CustomEvent('payment:failed', {
          detail: { txRef: params.tx_ref, status: paymentData.status }
        }));
        
        return {
          handled: true,
          success: false,
          txRef: params.tx_ref,
          message: `Payment ${paymentData.status.toLowerCase()}`
        };
      }

      return {
        handled: true,
        success: false,
        txRef: params.tx_ref,
        message: 'Unknown payment status'
      };

    } catch (error: any) {
      console.error('Handle payment redirect error:', error);
      toast.error('Failed to process payment result');
      return {
        handled: true,
        success: false,
        message: error.message
      };
    }
  }

  // Get payment method display name
  getPaymentMethodName(method: string): string {
    const methods: Record<string, string> = {
      card: 'Debit/Credit Card',
      bank: 'Bank Transfer',
      ussd: 'USSD',
      mobile: 'Mobile Money'
    };
    
    return methods[method] || method.charAt(0).toUpperCase() + method.slice(1);
  }

  // Get status display info
  getStatusDisplay(status: string): {
    text: string;
    color: string;
    bgColor: string;
    icon: string;
  } {
    const statusMap: Record<string, any> = {
      'PENDING_UNSETTLED': {
        text: 'Pending',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50 border-yellow-200',
        icon: 'clock'
      },
      'PAID_SETTLED': {
        text: 'Completed',
        color: 'text-green-600',
        bgColor: 'bg-green-50 border-green-200',
        icon: 'check-circle'
      },
      'FAILED': {
        text: 'Failed',
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200',
        icon: 'x-circle'
      },
      'CANCELLED': {
        text: 'Cancelled',
        color: 'text-gray-600',
        bgColor: 'bg-gray-50 border-gray-200',
        icon: 'x-circle'
      }
    };

    return statusMap[status] || {
      text: status,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50 border-gray-200',
      icon: 'clock'
    };
  }

  // Calculate time remaining for payment
  getTimeRemaining(expiresAt: string): {
    isExpired: boolean;
    timeLeft: string;
    minutes: number;
  } {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return {
        isExpired: true,
        timeLeft: 'Expired',
        minutes: 0
      };
    }

    const minutes = Math.floor(diffMs / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    return {
      isExpired: false,
      timeLeft: `${minutes}m ${seconds}s`,
      minutes
    };
  }

  // Format date for display
  formatDate(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }
}

// Export singleton instance
export const paymentAPI = new PaymentAPI();
export default paymentAPI;