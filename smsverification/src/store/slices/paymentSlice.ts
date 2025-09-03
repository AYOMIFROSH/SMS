// src/store/slices/paymentSlice.ts - Payment state management
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { paymentApi, PaymentBalance, PaymentTransaction, DepositRequest, DepositResponse } from '@/api/payments';

export interface PaymentState {
  balance: PaymentBalance | null;
  transactions: PaymentTransaction[];
  loading: {
    balance: boolean;
    transactions: boolean;
    deposit: boolean;
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
  };
  filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
  };
  activeDeposits: string[]; // Track active payment references
}

const initialState: PaymentState = {
  balance: null,
  transactions: [],
  loading: {
    balance: false,
    transactions: false,
    deposit: false,
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
  },
  filters: {},
  activeDeposits: [],
};

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
    data: PaymentTransaction[];
    pagination: { page: number; totalPages: number; total: number };
    summary: PaymentState['summary'];
  },
  {
    page?: number;
    limit?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
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
      
      return {
        data: response.data,
        pagination: response.pagination,
        summary: response.summary,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch transactions');
    }
  }
);

export const createDeposit = createAsyncThunk<
  // return type
  DepositResponse['data'],
  // arg type
  DepositRequest,
  { rejectValue: string }
>(
  'payment/createDeposit',
  async (depositData: DepositRequest, { rejectWithValue }) => {
    try {
      const response = await paymentApi.createDeposit(depositData);
      return response.data; // response is DepositResponse, so .data matches DepositResponse['data']
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to create deposit');
    }
  }
);


export const verifyPayment = createAsyncThunk<
  PaymentTransaction,
  string,
  { rejectValue: string }
>(
  'payment/verifyPayment',
  async (reference, { rejectWithValue }) => {
    try {
      const response = await paymentApi.verifyPayment(reference);
      return response.data as any; // Type assertion for compatibility
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
    
    updateTransactionStatus: (
      state,
      action: PayloadAction<{ reference: string; status: string; paidAt?: string }>
    ) => {
      const { reference, status, paidAt } = action.payload;
      const transaction = state.transactions.find(
        t => t.payment_reference === reference || t.transaction_reference === reference
      );
      
      if (transaction) {
        transaction.status = status as any;
        if (paidAt) transaction.paid_at = paidAt;
      }
    },
    
    addActiveDeposit: (state, action: PayloadAction<string>) => {
      if (!state.activeDeposits.includes(action.payload)) {
        state.activeDeposits.push(action.payload);
      }
    },
    
    removeActiveDeposit: (state, action: PayloadAction<string>) => {
      state.activeDeposits = state.activeDeposits.filter(ref => ref !== action.payload);
    },
    
    // WebSocket updates
    updateBalance: (state, action: PayloadAction<{ balance: number; change: number }>) => {
      if (state.balance) {
        state.balance.balance = action.payload.balance;
      }
    },
    
    addTransaction: (state, action: PayloadAction<PaymentTransaction>) => {
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
        // Add to active deposits for tracking
        state.activeDeposits.push(action.payload.paymentReference);
      })
      .addCase(createDeposit.rejected, (state, action) => {
        state.loading.deposit = false;
        state.error = action.payload || 'Failed to create deposit';
      })
      
      // Verify Payment
      .addCase(verifyPayment.fulfilled, (state, action) => {
        // Update existing transaction or add new one
        const existingIndex = state.transactions.findIndex(
          t => t.payment_reference === (action.payload as any).paymentReference
        );
        
        if (existingIndex >= 0) {
          state.transactions[existingIndex] = action.payload;
        } else {
          state.transactions.unshift(action.payload);
        }
        
        // Remove from active deposits if completed
        const status = (action.payload as any).status;
        if (['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) {
          const reference = (action.payload as any).paymentReference;
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