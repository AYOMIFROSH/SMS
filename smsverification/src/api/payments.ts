// src/api/payments.ts - FIXED to trust backend webhooks completely
import client from './client';
import { ApiResponse } from '@/types';

export interface PaymentBalance {
  balance: number;
  currency: string;
  total_spent: number;
  total_deposited: number;
  total_numbers_purchased: number;
  account_status: 'active' | 'suspended' | 'pending';
  deposit_count?: number;
  last_deposit_at?: string;
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
  // FIXED: Settlement fields from server
  settlement_status?: 'PENDING' | 'COMPLETED' | 'FAILED';
  settlement_date?: string;
  settlement_reference?: string;
  settlement_amount?: number;
  transaction_fee?: number;
  response_code?: string;
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
    failureReason?: string;
    // FIXED: Settlement fields from server
    settlement_status?: 'PENDING' | 'COMPLETED' | 'FAILED';
    settlement_date?: string;
    settlement_reference?: string;
    settlement_amount?: number;
    transaction_fee?: number;
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
   * FIXED: Simple verification - trust server completely, no forced completion
   */
  verifyPayment: async (reference: string): Promise<PaymentVerification> => {
    console.log('Verifying payment with server:', reference);

    try {
      const response = await client.get(`/payments/verify/${reference}`);

      if (response.data?.success) {
        console.log('Payment verification result:', response.data.data.status);
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
   * FIXED: Get payment history with settlement status from server
   */
  getPaymentHistory: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    settlement_status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaymentHistory> => {
    console.log('Fetching payment history from server:', params);

    try {
      const response = await client.get('/payments/history', { params });

      if (response.data?.success) {
        console.log('Payment history fetched:', response.data.data.length, 'transactions');
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
   * FIXED: Open Monnify checkout with proper redirect URL
   */
  openMonnifyCheckout: (checkoutUrl: string): Window | null => {
    console.log('Opening Monnify checkout:', checkoutUrl);

    try {
      // FIXED: Enhanced popup with better positioning
      const left = (window.screen.width / 2) - (800 / 2);
      const top = (window.screen.height / 2) - (700 / 2);
      
      const popup = window.open(
        checkoutUrl,
        'monnify-checkout',
        `width=800,height=700,left=${left},top=${top},scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        console.warn('Popup blocked - redirecting to checkout URL');
        
        // FIXED: Add redirect URL parameter to checkout URL
        const currentUrl = window.location.origin;
        const paymentRef = new URL(checkoutUrl).searchParams.get('paymentReference') || 
                          new URL(checkoutUrl).searchParams.get('reference');
        const redirectUrl = `${currentUrl}/payment-success?ref=${paymentRef}`;
        
        const separator = checkoutUrl.includes('?') ? '&' : '?';
        const urlWithRedirect = `${checkoutUrl}${separator}redirectUrl=${encodeURIComponent(redirectUrl)}`;
        
        window.location.href = urlWithRedirect;
        return null;
      }

      // FIXED: Focus the popup window
      if (popup.focus) {
        popup.focus();
      }

      return popup;
    } catch (error) {
      console.error('Failed to open checkout popup:', error);
      
      // Fallback to direct redirect
      window.location.href = checkoutUrl;
      return null;
    }
  },

  /**
   * FIXED: Handle payment redirect success - simple verification only
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
      // FIXED: Simple verification - trust server completely
      const result = await paymentApi.verifyPayment(reference);
      console.log('Payment redirect verified:', result.data.status, result.data.settlement_status);
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
  },

  /**
   * FIXED: Get settlement status display text
   */
  getSettlementStatusText: (status?: string): string => {
    switch (status) {
      case 'COMPLETED': return 'Settled';
      case 'FAILED': return 'Settlement Failed';
      case 'PENDING': return 'Pending Settlement';
      default: return 'Pending Settlement';
    }
  },

  /**
   * FIXED: Get settlement status color class
   */
  getSettlementStatusColor: (status?: string): string => {
    switch (status) {
      case 'COMPLETED': return 'text-green-600 bg-green-50 border-green-200';
      case 'FAILED': return 'text-red-600 bg-red-50 border-red-200';
      case 'PENDING': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
  }
};