// src/store/slices/paymentSlice.ts - Payment state management
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { paymentAPI, type PaymentDeposit, type UserBalance, type PaymentSummary } from '@/api/payments';

export interface PaymentState {
  balance: UserBalance | null;
  transactions: PaymentDeposit[];
  summary: PaymentSummary | null;
  loading: {
    balance: boolean;
    transactions: boolean;
    creating: boolean;
    verifying: string[];
  };
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
  };
  pendingTransactions: string[];
  lastUpdated: number | null;
}

const initialState: PaymentState = {
  balance: null,
  transactions: [],
  summary: null,
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
  filters: {},
  pendingTransactions: [],
  lastUpdated: null
};

// add near top
const mapApiPaginationToPagination = (p: any): PaymentState['pagination'] => ({
  page: p.page ?? 1,
  limit: p.limit ?? 20,
  totalRecords: p.total_records ?? p.total ?? 0,
  totalPages: p.total_pages ?? p.totalPages ?? 0,
  hasNext: p.has_next ?? p.hasNext ?? false,
  hasPrevious: p.has_previous ?? p.hasPrevious ?? false
});


// Async thunks
export const fetchBalance = createAsyncThunk<
  { balance: UserBalance; summary: PaymentSummary },
  void,
  { rejectValue: string }
>(
  'payment/fetchBalance',
  async (_, { rejectWithValue }) => {
    try {
      const response = await paymentAPI.getBalance();
      return {
        balance: response.data.balance,
        summary: response.data.summary
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch balance');
    }
  }
);

export const fetchTransactions = createAsyncThunk<
  {
    transactions: PaymentDeposit[];
    pagination: PaymentState['pagination'];
  },
  {
    page?: number;
    limit?: number;
    status?: string;
    start_date?: string;
    end_date?: string;
  },
  { rejectValue: string }
>(
  'payment/fetchTransactions',
  async (params, { rejectWithValue }) => {
    try {
      const response = await paymentAPI.getDeposits(params);

      const apiPagination = response.data.pagination ?? {};
      const mappedPagination = mapApiPaginationToPagination(apiPagination);

      return {
        transactions: response.data.deposits ?? [],
        pagination: mappedPagination
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch transactions');
    }
  }
);

export const createDeposit = createAsyncThunk<
  any,
  {
    amount: number;
    payment_type: 'card' | 'bank' | 'ussd' | 'mobile';
    customer_email?: string;
    customer_phone?: string;
  },
  { rejectValue: string }
>(
  'payment/createDeposit',
  async (request, { rejectWithValue }) => {
    try {
      const response = await paymentAPI.createDeposit(request);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create deposit');
    }
  }
);

export const verifyPayment = createAsyncThunk<
  any,
  string,
  { rejectValue: string }
>(
  'payment/verifyPayment',
  async (txRef, { rejectWithValue }) => {
    try {
      const response = await paymentAPI.verifyPayment(txRef);
      return { txRef, ...response };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Payment verification failed');
    }
  }
);

export const cancelPayment = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>(
  'payment/cancelPayment',
  async (txRef, { rejectWithValue }) => {
    try {
      await paymentAPI.cancelPayment(txRef);
      return txRef;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to cancel payment');
    }
  }
);

const paymentSlice = createSlice({
  name: 'payment',
  initialState,
  reducers: {
    // Update balance directly (for WebSocket updates)
    updateBalance: (state, action: PayloadAction<Partial<UserBalance>>) => {
      if (state.balance) {
        state.balance = { ...state.balance, ...action.payload };
      }
      state.lastUpdated = Date.now();
    },

    // Add or update transaction
    updateTransaction: (state, action: PayloadAction<PaymentDeposit>) => {
      const index = state.transactions.findIndex(t => t.tx_ref === action.payload.tx_ref);
      if (index >= 0) {
        state.transactions[index] = action.payload;
      } else {
        state.transactions.unshift(action.payload);
      }
      state.lastUpdated = Date.now();
    },

    // Update transaction status
    updateTransactionStatus: (state, action: PayloadAction<{ txRef: string; status: string; data?: any }>) => {
      const transaction = state.transactions.find(t => t.tx_ref === action.payload.txRef);
      if (transaction) {
        transaction.status = action.payload.status as any;
        if (action.payload.data) {
          Object.assign(transaction, action.payload.data);
        }
      }
      
      // Remove from pending if status changed
      if (action.payload.status !== 'PENDING_UNSETTLED') {
        state.pendingTransactions = state.pendingTransactions.filter(ref => ref !== action.payload.txRef);
      }
      
      state.lastUpdated = Date.now();
    },

    // Add to pending transactions
    addPendingTransaction: (state, action: PayloadAction<string>) => {
      if (!state.pendingTransactions.includes(action.payload)) {
        state.pendingTransactions.push(action.payload);
      }
    },

    // Remove from pending transactions
    removePendingTransaction: (state, action: PayloadAction<string>) => {
      state.pendingTransactions = state.pendingTransactions.filter(ref => ref !== action.payload);
    },

    // Update filters
    setFilters: (state, action: PayloadAction<PaymentState['filters']>) => {
      state.filters = action.payload;
      state.pagination.page = 1; // Reset to first page when filters change
    },

    // Update pagination
    setPagination: (state, action: PayloadAction<Partial<PaymentState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload };
    },

    // Set loading state
    setLoading: (state, action: PayloadAction<{ key: keyof PaymentState['loading']; value: boolean | string[] }>) => {
      (state.loading as any)[action.payload.key] = action.payload.value;
    },

    // Clear error
    clearError: (state) => {
      state.error = null;
    },

    // Reset state
    resetPaymentState: () => initialState
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
        state.balance = action.payload.balance;
        state.summary = action.payload.summary;
        state.error = null;
        state.lastUpdated = Date.now();
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
        state.transactions = action.payload.transactions;
        state.pagination = action.payload.pagination;
        state.error = null;
        
        // Update pending transactions
        state.pendingTransactions = action.payload.transactions
          .filter(t => t.status === 'PENDING_UNSETTLED')
          .map(t => t.tx_ref);
        
        state.lastUpdated = Date.now();
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading.transactions = false;
        state.error = action.payload || 'Failed to fetch transactions';
      })

      // Create Deposit
      .addCase(createDeposit.pending, (state) => {
        state.loading.creating = true;
        state.error = null;
      })
      .addCase(createDeposit.fulfilled, (state, action) => {
        state.loading.creating = false;
        state.error = null;
        
        // Add to pending transactions
        if (action.payload.tx_ref) {
          state.pendingTransactions.push(action.payload.tx_ref);
        }
      })
      .addCase(createDeposit.rejected, (state, action) => {
        state.loading.creating = false;
        state.error = action.payload || 'Failed to create deposit';
      })

      // Verify Payment
      .addCase(verifyPayment.pending, (state, action) => {
        const txRef = action.meta.arg;
        if (!state.loading.verifying.includes(txRef)) {
          state.loading.verifying.push(txRef);
        }
        state.error = null;
      })
      .addCase(verifyPayment.fulfilled, (state, action) => {
        const txRef = action.payload.txRef;
        state.loading.verifying = state.loading.verifying.filter(ref => ref !== txRef);
        
        // Remove from pending if successful
        if (action.payload.success) {
          state.pendingTransactions = state.pendingTransactions.filter(ref => ref !== txRef);
        }
        state.error = null;
      })
      .addCase(verifyPayment.rejected, (state, action) => {
        const txRef = action.meta.arg;
        state.loading.verifying = state.loading.verifying.filter(ref => ref !== txRef);
        state.error = action.payload || 'Payment verification failed';
      })

      // Cancel Payment
      .addCase(cancelPayment.pending, (state) => {
        state.error = null;
      })
      .addCase(cancelPayment.fulfilled, (state, action) => {
        const txRef = action.payload;
        
        // Remove from pending
        state.pendingTransactions = state.pendingTransactions.filter(ref => ref !== txRef);
        
        // Update transaction status
        const transaction = state.transactions.find(t => t.tx_ref === txRef);
        if (transaction) {
          transaction.status = 'CANCELLED';
        }
        state.error = null;
      })
      .addCase(cancelPayment.rejected, (state, action) => {
        state.error = action.payload || 'Failed to cancel payment';
      });
  },
});

export const {
  updateBalance,
  updateTransaction,
  updateTransactionStatus,
  addPendingTransaction,
  removePendingTransaction,
  setFilters,
  setPagination,
  setLoading,
  clearError,
  resetPaymentState
} = paymentSlice.actions;

// Selectors
export const selectBalance = (state: { payment: PaymentState }) => state.payment.balance;
export const selectTransactions = (state: { payment: PaymentState }) => state.payment.transactions;
export const selectSummary = (state: { payment: PaymentState }) => state.payment.summary;
export const selectPendingTransactions = (state: { payment: PaymentState }) => state.payment.pendingTransactions;
export const selectPaymentLoading = (state: { payment: PaymentState }) => state.payment.loading;
export const selectPaymentError = (state: { payment: PaymentState }) => state.payment.error;
export const selectPagination = (state: { payment: PaymentState }) => state.payment.pagination;
export const selectFilters = (state: { payment: PaymentState }) => state.payment.filters;

export default paymentSlice.reducer;