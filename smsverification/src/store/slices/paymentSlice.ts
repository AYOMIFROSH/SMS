// src/store/slices/paymentSlice.ts - FIXED with proper settlement handling
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { paymentApi, PaymentBalance, PaymentTransaction, DepositRequest, DepositResponse, PaymentVerification } from '@/api/payments';

// FIXED: Enhanced interface with settlement fields
export interface EnhancedPaymentTransaction extends PaymentTransaction {
  settlement_status?: 'PENDING' | 'COMPLETED' | 'FAILED';
  settlement_date?: string;
  settlement_reference?: string;
  settlement_amount?: number;
  transaction_fee?: number;
  response_code?: string;
}

export interface PaymentState {
  balance: PaymentBalance | null;
  transactions: EnhancedPaymentTransaction[];
  loading: {
    balance: boolean;
    transactions: boolean;
    deposit: boolean;
    settlement: boolean;
  };
  error: string | null;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
  summary: {
    total_payments: number;
    total_deposited: number;
    pending_amount: number;
    successful_payments: number;
    failed_payments: number;
    settled_amount: number;
    pending_settlement_amount: number;
    settlement_count: number;
  };
  filters: {
    status?: string;
    settlement_status?: string;
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
  };
  activeDeposits: string[];
  settlementStats: {
    total_settled: number;
    pending_settlements: number;
    failed_settlements: number;
    settlement_rate: number;
    last_settlement_date?: string;
  };
}

const initialState: PaymentState = {
  balance: null,
  transactions: [],
  loading: {
    balance: false,
    transactions: false,
    deposit: false,
    settlement: false,
  },
  error: null,
  pagination: {
    page: 1,
    totalPages: 1,
    total: 0,
  },
  summary: {
    total_payments: 0,
    total_deposited: 0,
    pending_amount: 0,
    successful_payments: 0,
    failed_payments: 0,
    settled_amount: 0,
    pending_settlement_amount: 0,
    settlement_count: 0,
  },
  filters: {},
  activeDeposits: [],
  settlementStats: {
    total_settled: 0,
    pending_settlements: 0,
    failed_settlements: 0,
    settlement_rate: 0,
  },
};

// FIXED: Mapper to convert API response to enhanced transaction
function mapVerificationToEnhanced(api: PaymentVerification['data']): EnhancedPaymentTransaction {
  return {
    id: 0,
    payment_reference: api.paymentReference,
    transaction_reference: api.transactionReference ?? undefined,
    monnify_transaction_reference: undefined,
    amount: api.amount,
    amount_paid: api.amountPaid,
    currency: api.currency,
    status: api.status,
    payment_method: api.paymentMethod,
    customer_name: '',
    customer_email: '',
    payment_description: api.paymentDescription ?? '',
    checkout_url: undefined,
    account_details: null,
    failure_reason: undefined,
    paid_at: api.paidAt,
    expires_at: api.expiresAt,
    created_at: api.createdAt,
    updated_at: api.paidAt ?? api.createdAt,

    // FIXED: Settlement fields - will be updated by server data
    settlement_status: 'PENDING', // Default to PENDING for new payments
    settlement_date: undefined,
    settlement_reference: undefined,
    settlement_amount: undefined,
    transaction_fee: undefined,
    response_code: undefined,
  };
}

// Async thunks
export const fetchBalance = createAsyncThunk<
  PaymentBalance,
  void,
  { rejectValue: string }
>(
  'payment/fetchBalance',
  async (_, { rejectWithValue }) => {
    try {
      const response = await paymentApi.getBalance();
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch balance');
    }
  }
);

export const fetchTransactions = createAsyncThunk<
  {
    data: EnhancedPaymentTransaction[];
    pagination: { page: number; totalPages: number; total: number };
    summary: PaymentState['summary'];
  },
  {
    page?: number;
    limit?: number;
    status?: string;
    settlement_status?: string;
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
  },
  { rejectValue: string }
>(
  'payment/fetchTransactions',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await paymentApi.getPaymentHistory({
        page: params.page || 1,
        limit: params.limit || 20,
        ...params,
      });

      // FIXED: Calculate settlement stats from server response
      const paidTransactions = response.data.filter(t => t.status === 'PAID');
      const settledTransactions = paidTransactions.filter(t => (t as any).settlement_status === 'COMPLETED');
      const pendingSettlements = paidTransactions.filter(t => (t as any).settlement_status === 'PENDING');

      const settled_amount = settledTransactions.reduce((sum, t) => sum + ((t as any).settlement_amount || t.amount_paid), 0);
      const pending_settlement_amount = pendingSettlements.reduce((sum, t) => sum + t.amount_paid, 0);

      return {
        data: response.data as EnhancedPaymentTransaction[],
        pagination: response.pagination,
        summary: {
          ...response.summary,
          settled_amount,
          pending_settlement_amount,
          settlement_count: settledTransactions.length,
        },
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch transactions');
    }
  }
);

export const createDeposit = createAsyncThunk<
  DepositResponse['data'],
  DepositRequest,
  { rejectValue: string }
>(
  'payment/createDeposit',
  async (depositData: DepositRequest, { rejectWithValue }) => {
    try {
      const response = await paymentApi.createDeposit(depositData);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create deposit');
    }
  }
);

export const verifyPayment = createAsyncThunk<
  EnhancedPaymentTransaction,
  string,
  { rejectValue: string }
>(
  'payment/verifyPayment',
  async (reference, { rejectWithValue }) => {
    try {
      const response = await paymentApi.verifyPayment(reference);
      const normalized = mapVerificationToEnhanced(response.data);
      return normalized;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Payment verification failed');
    }
  }
);

const paymentSlice = createSlice({
  name: 'payment',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    setFilters: (state, action: PayloadAction<Partial<PaymentState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    clearFilters: (state) => {
      state.filters = {};
    },

    // FIXED: Enhanced transaction status update with settlement
    updateTransactionStatus: (
      state,
      action: PayloadAction<{
        reference: string;
        status: string;
        paidAt?: string;
        settlementStatus?: string;
        failureReason?: string;
      }>
    ) => {
      const { reference, status, paidAt, settlementStatus, failureReason } = action.payload;
      const transaction = state.transactions.find(
        t => t.payment_reference === reference || t.transaction_reference === reference
      );

      if (transaction) {
        transaction.status = status as any;
        if (paidAt) transaction.paid_at = paidAt;
        if (settlementStatus) transaction.settlement_status = settlementStatus as any;
        if (failureReason) transaction.failure_reason = failureReason;
      }
    },

    // FIXED: Settlement status update
    updateSettlementStatus: (
      state,
      action: PayloadAction<{
        settlementReference?: string;
        transactionReference?: string;
        status: 'COMPLETED' | 'FAILED';
        settlementDate?: string;
        failureReason?: string;
      }>
    ) => {
      const { settlementReference, transactionReference, status, settlementDate, failureReason } = action.payload;

      state.transactions.forEach(transaction => {
        const matchesBySettlement = settlementReference && transaction.settlement_reference === settlementReference;
        const matchesByTransaction = transactionReference && transaction.transaction_reference === transactionReference;

        if (matchesBySettlement || matchesByTransaction) {
          transaction.settlement_status = status;
          if (settlementDate) transaction.settlement_date = settlementDate;
          if (failureReason && status === 'FAILED') transaction.failure_reason = failureReason;
        }
      });

      // FIXED: Update settlement stats
      const paidTransactions = state.transactions.filter(t => t.status === 'PAID');
      const settledCount = paidTransactions.filter(t => t.settlement_status === 'COMPLETED').length;
      const pendingCount = paidTransactions.filter(t => t.settlement_status === 'PENDING').length;
      const failedCount = paidTransactions.filter(t => t.settlement_status === 'FAILED').length;

      state.settlementStats = {
        ...state.settlementStats,
        total_settled: settledCount,
        pending_settlements: pendingCount,
        failed_settlements: failedCount,
        settlement_rate: paidTransactions.length > 0
          ? Math.round((settledCount / paidTransactions.length) * 100)
          : 0,
      };
    },

    addActiveDeposit: (state, action: PayloadAction<string>) => {
      if (!state.activeDeposits.includes(action.payload)) {
        state.activeDeposits.push(action.payload);
      }
    },

    removeActiveDeposit: (state, action: PayloadAction<string>) => {
      state.activeDeposits = state.activeDeposits.filter(ref => ref !== action.payload);
    },

    updateBalance: (state, action: PayloadAction<{ balance: number; change: number }>) => {
      if (state.balance) {
        state.balance.balance = action.payload.balance;
      }
    },

    addTransaction: (state, action: PayloadAction<EnhancedPaymentTransaction>) => {
      const exists = state.transactions.some(t => t.id === action.payload.id);
      if (!exists) {
        state.transactions.unshift(action.payload);
      }
    },
  },

  extraReducers: (builder) => {
    builder
      // Fetch Balance
      .addCase(fetchBalance.pending, (state) => {
        state.loading.balance = true;
        state.error = null;
      })
      .addCase(fetchBalance.fulfilled, (state, action) => {
        state.loading.balance = false;
        state.balance = action.payload;
        state.error = null;
      })
      .addCase(fetchBalance.rejected, (state, action) => {
        state.loading.balance = false;
        state.error = action.payload || 'Failed to fetch balance';
      })

      // Fetch Transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.loading.transactions = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading.transactions = false;
        state.transactions = action.payload.data;
        state.pagination = action.payload.pagination;
        state.summary = action.payload.summary;
        state.error = null;

        // FIXED: Update settlement stats from fresh server data
        const paidTransactions = action.payload.data.filter(t => t.status === 'PAID');
        const settledCount = paidTransactions.filter(t => t.settlement_status === 'COMPLETED').length;
        const pendingCount = paidTransactions.filter(t => t.settlement_status === 'PENDING').length;
        const failedCount = paidTransactions.filter(t => t.settlement_status === 'FAILED').length;

        state.settlementStats = {
          ...state.settlementStats,
          total_settled: settledCount,
          pending_settlements: pendingCount,
          failed_settlements: failedCount,
          settlement_rate: paidTransactions.length > 0
            ? Math.round((settledCount / paidTransactions.length) * 100)
            : 0,
        };
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading.transactions = false;
        state.error = action.payload || 'Failed to fetch transactions';
      })

      // Create Deposit
      .addCase(createDeposit.pending, (state) => {
        state.loading.deposit = true;
        state.error = null;
      })
      .addCase(createDeposit.fulfilled, (state, action) => {
        state.loading.deposit = false;
        state.error = null;
        state.activeDeposits.push(action.payload.paymentReference);
      })
      .addCase(createDeposit.rejected, (state, action) => {
        state.loading.deposit = false;
        state.error = action.payload || 'Failed to create deposit';
      })

      // FIXED: Verify Payment - trust server completely
      .addCase(verifyPayment.fulfilled, (state, action) => {
        const existingIndex = state.transactions.findIndex(
          t => t.payment_reference === action.payload.payment_reference ||
               t.transaction_reference === action.payload.transaction_reference
        );

        if (existingIndex >= 0) {
          // FIXED: Merge server data with existing transaction
          state.transactions[existingIndex] = {
            ...state.transactions[existingIndex],
            ...action.payload
          };
        } else {
          state.transactions.unshift(action.payload);
        }

        // Remove from active deposits if completed
        const status = action.payload.status;
        if (['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
          const reference = action.payload.payment_reference;
          state.activeDeposits = state.activeDeposits.filter(ref => ref !== reference);
        }
      });
  },
});

export const {
  clearError,
  setFilters,
  clearFilters,
  updateTransactionStatus,
  updateSettlementStatus,
  addActiveDeposit,
  removeActiveDeposit,
  updateBalance,
  addTransaction,
} = paymentSlice.actions;

export default paymentSlice.reducer;

// Selectors
export const selectPaymentBalance = (state: { payment: PaymentState }) => state.payment.balance;
export const selectPaymentTransactions = (state: { payment: PaymentState }) => state.payment.transactions;
export const selectPaymentLoading = (state: { payment: PaymentState }) => state.payment.loading;
export const selectPaymentError = (state: { payment: PaymentState }) => state.payment.error;
export const selectPaymentPagination = (state: { payment: PaymentState }) => state.payment.pagination;
export const selectPaymentSummary = (state: { payment: PaymentState }) => state.payment.summary;
export const selectPaymentFilters = (state: { payment: PaymentState }) => state.payment.filters;
export const selectActiveDeposits = (state: { payment: PaymentState }) => state.payment.activeDeposits;
export const selectSettlementStats = (state: { payment: PaymentState }) => state.payment.settlementStats;

// FIXED: Settlement-specific selectors
export const selectPendingSettlements = (state: { payment: PaymentState }) =>
  state.payment.transactions.filter(t => t.status === 'PAID' && t.settlement_status === 'PENDING');

export const selectCompletedSettlements = (state: { payment: PaymentState }) =>
  state.payment.transactions.filter(t => t.settlement_status === 'COMPLETED');

export const selectFailedSettlements = (state: { payment: PaymentState }) =>
  state.payment.transactions.filter(t => t.settlement_status === 'FAILED');

export const selectSettlementsByReference = (state: { payment: PaymentState }, settlementReference: string) =>
  state.payment.transactions.filter(t => t.settlement_reference === settlementReference);