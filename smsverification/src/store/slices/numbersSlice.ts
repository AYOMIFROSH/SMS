// src/store/slices/numbersSlice.ts - Enhanced with new features and better error handling
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { numbersApi, PurchaseRequest } from '@/api/numbers';
import { NumberPurchase, Subscription } from '@/types';

interface NumbersState {
  activeNumbers: NumberPurchase[];
  history: NumberPurchase[];
  subscriptions: Subscription[];
  loading: boolean;
  purchasing: boolean;
  subscriptionLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
  };
  historyPagination: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
  };
  subscriptionPagination: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
  };
}

const initialState: NumbersState = {
  activeNumbers: [],
  history: [],
  subscriptions: [],
  loading: false,
  purchasing: false,
  subscriptionLoading: false,
  error: null,
  pagination: {
    page: 1,
    totalPages: 1,
    total: 0,
    limit: 20,
  },
  historyPagination: {
    page: 1,
    totalPages: 1,
    total: 0,
    limit: 20,
  },
  subscriptionPagination: {
    page: 1,
    totalPages: 1,
    total: 0,
    limit: 20,
  },
};

// Enhanced purchase thunk with better error handling
export const purchaseNumber = createAsyncThunk(
  'numbers/purchase',
  async (purchaseData: PurchaseRequest, { rejectWithValue }) => {
    try {
      console.log('🛒 Purchasing number with data:', purchaseData);
      const response = await numbersApi.purchase(purchaseData);
      console.log('✅ Purchase successful:', response);
      return response;
    } catch (error: any) {
      console.error('❌ Purchase failed:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Purchase failed');
    }
  }
);

// Fetch active numbers with pagination
export const fetchActiveNumbers = createAsyncThunk(
  'numbers/active',
  async (params: { page?: number; limit?: number } = {}, { rejectWithValue }) => {
    try {
      console.log('📱 Fetching active numbers:', params);
      const response = await numbersApi.getActive(params.page, params.limit);
      console.log('✅ Active numbers fetched:', response);
      return response;
    } catch (error: any) {
      console.error('❌ Failed to fetch active numbers:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to fetch active numbers');
    }
  }
);

// Fetch number history with filters and pagination
export const fetchNumberHistory = createAsyncThunk(
  'numbers/history',
  async (params: {
    page?: number;
    limit?: number;
    service?: string;
    country?: string;
    status?: string;
    search?: string;
  } = {}, { rejectWithValue }) => {
    try {
      console.log('📚 Fetching number history:', params);
      const response = await numbersApi.getHistory(params);
      console.log('✅ History fetched:', response);
      return response;
    } catch (error: any) {
      console.error('❌ Failed to fetch history:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to fetch history');
    }
  }
);

// Get specific number status
export const fetchNumberStatus = createAsyncThunk(
  'numbers/status',
  async (id: number, { rejectWithValue }) => {
    try {
      console.log('🔍 Fetching number status for ID:', id);
      const response = await numbersApi.getStatus(id);
      console.log('✅ Status fetched:', response);
      return { id, ...response };
    } catch (error: any) {
      console.error('❌ Failed to fetch status:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to fetch status');
    }
  }
);

// Cancel number
export const cancelNumber = createAsyncThunk(
  'numbers/cancel',
  async (id: number, { rejectWithValue }) => {
    try {
      console.log('❌ Cancelling number ID:', id);
      const response = await numbersApi.cancel(id);
      console.log('✅ Number cancelled:', response);
      return { id, ...response };
    } catch (error: any) {
      console.error('❌ Failed to cancel number:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to cancel number');
    }
  }
);

// Complete/mark number as used
export const completeNumber = createAsyncThunk(
  'numbers/complete',
  async (id: number, { rejectWithValue }) => {
    try {
      console.log('✅ Completing number ID:', id);
      const response = await numbersApi.complete(id);
      console.log('✅ Number completed:', response);
      return { id, ...response };
    } catch (error: any) {
      console.error('❌ Failed to complete number:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to complete number');
    }
  }
);

// Retry SMS for number
export const retryNumber = createAsyncThunk(
  'numbers/retry',
  async (id: number, { rejectWithValue }) => {
    try {
      console.log('🔄 Retrying SMS for number ID:', id);
      const response = await numbersApi.retry(id);
      console.log('✅ SMS retry requested:', response);
      return { id, ...response };
    } catch (error: any) {
      console.error('❌ Failed to retry SMS:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to retry SMS');
    }
  }
);

// Get full SMS text
export const fetchFullSms = createAsyncThunk(
  'numbers/full-sms',
  async (id: number, { rejectWithValue }) => {
    try {
      console.log('📄 Fetching full SMS for number ID:', id);
      const response = await numbersApi.getFullSms(id);
      console.log('✅ Full SMS fetched:', response);
      return { id, ...response };
    } catch (error: any) {
      console.error('❌ Failed to fetch full SMS:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to fetch full SMS');
    }
  }
);

// Subscription management thunks
export const buySubscription = createAsyncThunk(
  'numbers/subscriptions/buy',
  async (data: { service: string; country: string; period: number }, { rejectWithValue }) => {
    try {
      console.log('🎫 Buying subscription:', data);
      const response = await numbersApi.subscriptions.buy(data);
      console.log('✅ Subscription purchased:', response);
      return response;
    } catch (error: any) {
      console.error('❌ Failed to buy subscription:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to buy subscription');
    }
  }
);

export const fetchSubscriptions = createAsyncThunk(
  'numbers/subscriptions',
  async (params: { page?: number; limit?: number; status?: string } = {}, { rejectWithValue }) => {
    try {
      console.log('🎫 Fetching subscriptions:', params);
      const response = await numbersApi.subscriptions.list(params);
      console.log('✅ Subscriptions fetched:', response);
      return response;
    } catch (error: any) {
      console.error('❌ Failed to fetch subscriptions:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to fetch subscriptions');
    }
  }
);

export const cancelSubscription = createAsyncThunk(
  'numbers/subscription/cancel',
  async (id: number, { rejectWithValue }) => {
    try {
      console.log('❌ Cancelling subscription ID:', id);
      const response = await numbersApi.subscriptions.cancel(id);
      console.log('✅ Subscription cancelled:', response);
      return { id, ...response };
    } catch (error: any) {
      console.error('❌ Failed to cancel subscription:', error);
      return rejectWithValue(error.response?.data?.error || error.message || 'Failed to cancel subscription');
    }
  }
);

const numbersSlice = createSlice({
  name: 'numbers',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    // Update number status (used by WebSocket)
    updateNumberStatus: (state, action) => {
      const { activationId, status, code, smsText } = action.payload;
      const number = state.activeNumbers.find(n => n.activation_id === activationId);
      if (number) {
        number.status = status;
        if (code) {
          number.sms_code = code;
          number.received_at = new Date().toISOString();
        }
        if (smsText) {
          number.sms_text = smsText;
        }
        console.log('📱 Updated number status:', { activationId, status, code });
      }
    },

    // Add new purchase (used by WebSocket)
    addNewPurchase: (state, action) => {
      const newPurchase = action.payload;
      // Avoid duplicates
      const exists = state.activeNumbers.find(n => n.activation_id === newPurchase.activation_id);
      if (!exists) {
        state.activeNumbers.unshift(newPurchase);
        console.log('➕ Added new purchase:', newPurchase);
      }
    },

    // Remove from active numbers
    removeFromActive: (state, action) => {
      const id = action.payload;
      state.activeNumbers = state.activeNumbers.filter(n => n.id !== id);
      console.log('➖ Removed from active:', id);
    },

    // Update number in active list
    updateActiveNumber: (state, action) => {
      const { id, updates } = action.payload;
      const number = state.activeNumbers.find(n => n.id === id);
      if (number) {
        Object.assign(number, updates);
        console.log('🔄 Updated active number:', { id, updates });
      }
    },

    // Reset pagination
    resetPagination: (state) => {
      state.pagination = initialState.pagination;
      state.historyPagination = initialState.historyPagination;
      state.subscriptionPagination = initialState.subscriptionPagination;
    },

    // Set active numbers directly (for manual updates)
    setActiveNumbers: (state, action) => {
      state.activeNumbers = action.payload;
    }
  },

  extraReducers: (builder) => {
    builder
      // Purchase Number
      .addCase(purchaseNumber.pending, (state) => {
        state.purchasing = true;
        state.error = null;
        console.log('⏳ Purchase: Loading started');
      })
      .addCase(purchaseNumber.fulfilled, (state) => {
        state.purchasing = false;
        state.error = null;
        console.log('✅ Purchase: Completed successfully');
      })
      // In numbersSlice.ts, update the purchaseNumber.rejected case:
  // In numbersSlice.ts, make sure purchaseNumber.rejected looks like this:
.addCase(purchaseNumber.rejected, (state, action) => {
  state.purchasing = false;
  state.error = action.payload as string || 'Failed to purchase number';
  console.error('❌ Purchase: Failed with error:', state.error);
})
      // Fetch Active Numbers
      .addCase(fetchActiveNumbers.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('⏳ Fetch active: Loading started');
      })
      .addCase(fetchActiveNumbers.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.activeNumbers = action.payload.data || [];
        state.pagination = action.payload.pagination || initialState.pagination;
        console.log('✅ Fetch active: Loaded', state.activeNumbers.length, 'numbers');
      })
      .addCase(fetchActiveNumbers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch active numbers';
        console.error('❌ Fetch active: Failed with error:', state.error);
      })

      // Fetch Number History
      .addCase(fetchNumberHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log('⏳ Fetch history: Loading started');
      })
      .addCase(fetchNumberHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.history = action.payload.data || [];
        state.historyPagination = action.payload.pagination || initialState.historyPagination;
        console.log('✅ Fetch history: Loaded', state.history.length, 'items');
      })
      .addCase(fetchNumberHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch history';
        console.error('❌ Fetch history: Failed with error:', state.error);
      })

      // Fetch Number Status
      .addCase(fetchNumberStatus.fulfilled, (state, action) => {
        const { id, ...statusData } = action.payload;
        const number = state.activeNumbers.find(n => n.id === id);
        if (number) {
          Object.assign(number, statusData);
        }
        console.log('✅ Status updated for number:', id);
      })

      // Cancel Number
      .addCase(cancelNumber.pending, (state) => {
        state.error = null;
      })
      .addCase(cancelNumber.fulfilled, (state, action) => {
        const { id } = action.payload;
        const number = state.activeNumbers.find(n => n.id === id);
        if (number) {
          number.status = 'cancelled';
        }
        state.error = null;
        console.log('✅ Number cancelled:', id);
      })
      .addCase(cancelNumber.rejected, (state, action) => {
        state.error = action.payload as string || 'Failed to cancel number';
        console.error('❌ Cancel failed:', state.error);
      })

      // Complete Number
      .addCase(completeNumber.pending, (state) => {
        state.error = null;
      })
      .addCase(completeNumber.fulfilled, (state, action) => {
        const { id } = action.payload;
        const number = state.activeNumbers.find(n => n.id === id);
        if (number) {
          number.status = 'used';
        }
        state.error = null;
        console.log('✅ Number completed:', id);
      })
      .addCase(completeNumber.rejected, (state, action) => {
        state.error = action.payload as string || 'Failed to complete number';
        console.error('❌ Complete failed:', state.error);
      })

      // Retry Number
      .addCase(retryNumber.fulfilled, (state, action) => {
        const { id, newExpiryDate } = action.payload;
        const number = state.activeNumbers.find(n => n.id === id);
        if (number && newExpiryDate) {
          number.expiry_date = newExpiryDate;
        }
        console.log('✅ SMS retry requested for:', id);
      })

      // Fetch Full SMS
      .addCase(fetchFullSms.fulfilled, (state, action) => {
        const { id, fullText, code } = action.payload;
        const number = state.activeNumbers.find(n => n.id === id);
        if (number) {
          if (fullText) number.sms_text = fullText;
          if (code) number.sms_code = code;
        }
        console.log('✅ Full SMS fetched for:', id);
      })

      // Buy Subscription
      .addCase(buySubscription.pending, (state) => {
        state.subscriptionLoading = true;
        state.error = null;
      })
      .addCase(buySubscription.fulfilled, (state, action) => {
        state.subscriptionLoading = false;
        state.error = null;
        // Add to subscriptions list if not already there
        const newSub = action.payload;
        const exists = state.subscriptions.find(s => s.subscriptionId === newSub.subscriptionId);
        if (!exists) {
          state.subscriptions.unshift(newSub as Subscription);
        }
        console.log('✅ Subscription purchased:', newSub);
      })
      .addCase(buySubscription.rejected, (state, action) => {
        state.subscriptionLoading = false;
        state.error = action.payload as string || 'Failed to buy subscription';
        console.error('❌ Subscription purchase failed:', state.error);
      })

      // Fetch Subscriptions
      .addCase(fetchSubscriptions.pending, (state) => {
        state.subscriptionLoading = true;
        state.error = null;
      })
      .addCase(fetchSubscriptions.fulfilled, (state, action) => {
        state.subscriptionLoading = false;
        state.error = null;
        state.subscriptions = action.payload.data || [];
        state.subscriptionPagination = action.payload.pagination || initialState.subscriptionPagination;
        console.log('✅ Subscriptions fetched:', state.subscriptions.length);
      })
      .addCase(fetchSubscriptions.rejected, (state, action) => {
        state.subscriptionLoading = false;
        state.error = action.payload as string || 'Failed to fetch subscriptions';
        console.error('❌ Fetch subscriptions failed:', state.error);
      })

      // Cancel Subscription
      .addCase(cancelSubscription.fulfilled, (state, action) => {
        const { id } = action.payload;
        const subscription = state.subscriptions.find(s => s.id === id);
        if (subscription) {
          subscription.status = 'cancelled';
        }
        console.log('✅ Subscription cancelled:', id);
      });
  },
});

export const {
  clearError,
  updateNumberStatus,
  addNewPurchase,
  removeFromActive,
  updateActiveNumber,
  resetPagination,
  setActiveNumbers
} = numbersSlice.actions;

export default numbersSlice.reducer;