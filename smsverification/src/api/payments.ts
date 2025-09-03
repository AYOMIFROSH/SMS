// src/api/payments.ts - Simplified to trust backend webhooks
import client from './client';
import { ApiResponse } from '@/types';

export interface PaymentBalance {
  balance: number;
  currency: string;
  total_spent: number;
  total_numbers_purchased: number;
  account_status: 'active' | 'suspended' | 'pending';
}

export interface PaymentTransaction {
  id: number;
  payment_reference: string;
  transaction_reference?: string;
  monnify_transaction_reference?: string;
  amount: number;
  amount_paid: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REVERSED';
  payment_method?: string;
  customer_name: string;
  customer_email: string;
  payment_description: string;
  checkout_url?: string;
  account_details?: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
  } | null;
  failure_reason?: string;
  paid_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DepositRequest {
  amount: number;
  paymentMethod?: 'CARD' | 'ACCOUNT_TRANSFER' | 'USSD' | 'PHONE_NUMBER';
}

export interface DepositResponse {
  success: boolean;
  data: {
    paymentReference: string;
    transactionReference: string;
    amount: number;
    currency: string;
    checkoutUrl: string;
    accountDetails?: {
      accountNumber: string;
      accountName: string;
      bankName: string;
      bankCode: string;
    } | null;
    expiresAt: string;
    status: 'PENDING';
  };
  message?: string;
}

export interface PaymentHistory {
  success: boolean;
  data: PaymentTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    total_payments: number;
    total_deposited: number;
    pending_amount: number;
    successful_payments: number;
    failed_payments: number;
  };
}

export interface PaymentVerification {
  success: boolean;
  data: {
    paymentReference: string;
    transactionReference?: string;
    amount: number;
    amountPaid: number;
    currency: string;
    status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'REVERSED';
    paymentMethod?: string;
    paymentDescription?: string;
    createdAt: string;
    paidAt?: string;
    expiresAt?: string;
  };
}

export const paymentApi = {
  /**
   * Create a new deposit payment
   */
  createDeposit: async (depositData: DepositRequest): Promise<DepositResponse> => {
    console.log('Creating deposit payment:', depositData);

    try {
      const response = await client.post('/payments/deposit', depositData);

      if (response.data?.success) {
        console.log('Deposit payment created successfully:', response.data.data.paymentReference);
        return response.data;
      }

      throw new Error(response.data?.message || 'Failed to create deposit payment');
    } catch (error: any) {
      console.error('Deposit creation failed:', error);

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }

      throw new Error(error.message || 'Failed to create deposit payment');
    }
  },

  /**
   * SIMPLIFIED: Simple verification - no forced completion
   */
  verifyPayment: async (reference: string): Promise<PaymentVerification> => {
    console.log('Verifying payment:', reference);

    try {
      const response = await client.get(`/payments/verify/${reference}`);

      if (response.data?.success) {
        return response.data;
      }

      throw new Error(response.data?.message || 'Payment verification failed');
    } catch (error: any) {
      console.error('Payment verification failed:', error);

      if (error.response?.status === 404) {
        throw new Error('Payment not found');
      }

      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }

      throw new Error(error.message || 'Payment verification failed');
    }
  },

  /**
   * Get current user balance
   */
  getBalance: async (): Promise<ApiResponse<PaymentBalance>> => {
    console.log('Fetching user balance...');

    try {
      const response = await client.get('/payments/balance');

      if (response.data?.success) {
        return response.data;
      }

      throw new Error(response.data?.message || 'Failed to get balance');
    } catch (error: any) {
      console.error('Get balance failed:', error);
      throw new Error(error.response?.data?.error || error.message || 'Failed to get balance');
    }
  },

  /**
   * Get payment history with filtering
   */
  getPaymentHistory: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaymentHistory> => {
    console.log('Fetching payment history:', params);

    try {
      const response = await client.get('/payments/history', { params });

      if (response.data?.success) {
        return response.data;
      }

      throw new Error(response.data?.message || 'Failed to get payment history');
    } catch (error: any) {
      console.error('Get payment history failed:', error);
      throw new Error(error.response?.data?.error || error.message || 'Failed to get payment history');
    }
  },

  /**
   * Cancel a pending payment
   */
  cancelPayment: async (paymentReference: string): Promise<ApiResponse<void>> => {
    console.log('Cancelling payment:', paymentReference);

    try {
      const response = await client.post(`/payments/${paymentReference}/cancel`);

      if (response.data?.success) {
        return response.data;
      }

      throw new Error(response.data?.message || 'Failed to cancel payment');
    } catch (error: any) {
      console.error('Payment cancellation failed:', error);

      if (error.response?.status === 404) {
        throw new Error('Payment not found');
      }

      if (error.response?.data?.code === 'INVALID_PAYMENT_STATUS') {
        throw new Error(`Cannot cancel payment with status: ${error.response.data.currentStatus}`);
      }

      throw new Error(error.response?.data?.error || error.message || 'Failed to cancel payment');
    }
  },

  /**
   * Open Monnify checkout window - simple popup management
   */
  openMonnifyCheckout: (checkoutUrl: string): Window | null => {
    console.log('Opening Monnify checkout:', checkoutUrl);

    try {
      const popup = window.open(
        checkoutUrl,
        'monnify-checkout',
        'width=800,height=700,scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no'
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        console.warn('Popup blocked - redirecting to checkout URL');
        window.location.href = checkoutUrl;
        return null;
      }

      return popup;
    } catch (error) {
      console.error('Failed to open checkout popup:', error);
      window.location.href = checkoutUrl;
      return null;
    }
  },

  /**
   * Handle payment redirect success - simple verification only
   */
  handlePaymentRedirect: async (params: URLSearchParams): Promise<PaymentVerification | null> => {
    const reference = params.get('ref') || 
                     params.get('paymentReference') || 
                     params.get('transactionReference');

    console.log('Handling payment redirect:', { reference });

    if (!reference) {
      console.warn('No payment reference in redirect URL');
      return null;
    }

    try {
      // Simple verification - don't force any status
      const result = await paymentApi.verifyPayment(reference);
      console.log('Payment redirect verified:', result.data.status);
      return result;
    } catch (error) {
      console.error('Payment redirect verification failed:', error);
      return null;
    }
  },

  /**
   * Format amount for display
   */
  formatAmount: (amount: number, currency = 'NGN'): string => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  },

  /**
   * Validate deposit amount
   */
  validateDepositAmount: (amount: number): { isValid: boolean; error?: string } => {
    const min = 100; // ₦100 minimum
    const max = 1000000; // ₦1,000,000 maximum

    if (!amount || isNaN(amount)) {
      return { isValid: false, error: 'Please enter a valid amount' };
    }

    if (amount < min) {
      return { isValid: false, error: `Minimum deposit amount is ${paymentApi.formatAmount(min)}` };
    }

    if (amount > max) {
      return { isValid: false, error: `Maximum deposit amount is ${paymentApi.formatAmount(max)}` };
    }

    return { isValid: true };
  }
};