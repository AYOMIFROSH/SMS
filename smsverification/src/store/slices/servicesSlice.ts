// src/store/slices/servicesSlice.ts - OPTIMIZED: Static data + removed operator calls
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { servicesApi } from '@/api/services';
import { Service, Country } from '@/types';

// Import static data
import STATIC_COUNTRIES from '@/data/countries.json';
import STATIC_SERVICES from '@/data/services.json';

interface ServicesState {
  services: Service[];
  countries: Country[];
  prices: any;
  loading: boolean;
  pricesLoading: boolean;
  error: string | null;
  selectedCountry: string | null;
  selectedService: string | null;
  // REMOVED: selectedOperator - always using "Any Operator"
  lastPriceFetch: number | null; // Track last price fetch time
}

const initialState: ServicesState = {
  services: STATIC_SERVICES as Service[], // Load from static JSON
  countries: STATIC_COUNTRIES as Country[], // Load from static JSON
  prices: {},
  loading: false,
  pricesLoading: false,
  error: null,
  selectedCountry: null,
  selectedService: null,
  lastPriceFetch: null,
};

// REMOVED: fetchServices thunk - using static data
// REMOVED: fetchCountries thunk - using static data
// REMOVED: fetchOperators thunk - always using "Any Operator"

// Fetch prices - ONLY called on purchase confirmation with aggressive caching
export const fetchPrices = createAsyncThunk(
  'services/fetchPrices',
  async ({ country, service, forceRefresh = false }: { 
    country?: string; 
    service?: string;
    forceRefresh?: boolean;
  }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as { services: ServicesState };
      const { lastPriceFetch, prices } = state.services;
      
      // Cache for 30 minutes (1800000ms) - don't refetch if recently fetched
      const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
      const now = Date.now();
      
      // Check if we have cached prices and they're still valid
      if (!forceRefresh && lastPriceFetch && (now - lastPriceFetch) < CACHE_DURATION) {
        const cachedPrice = country && service ? prices[country]?.[service] : null;
        if (cachedPrice) {
          console.log('✅ Using cached prices (< 30 min old)');
          return {
            data: prices,
            filters: { country, service },
            cached: true,
            cacheAge: Math.floor((now - lastPriceFetch) / 1000 / 60) // minutes
          };
        }
      }
      
      console.log('💲 Fetching fresh prices from API');
      const response = await servicesApi.getPrices({ country, service });
      
      if (!response || !response.success) {
        const errorMessage = response?.error || 'Failed to fetch prices';
        return rejectWithValue(errorMessage);
      }

      return {
        data: response.data || {},
        filters: response.filters || { country, service },
        cached: false,
        fetchTime: now
      };
    } catch (error: any) {
      console.error('❌ fetchPrices error:', error);
      return rejectWithValue(error.message || 'Failed to fetch prices');
    }
  }
);

const servicesSlice = createSlice({
  name: 'services',
  initialState,
  reducers: {
    setSelectedCountry: (state, action) => {
      state.selectedCountry = action.payload;
      // REMOVED: Reset operator when country changes
      console.log('🌍 Selected country changed to:', action.payload);
    },

    setSelectedService: (state, action) => {
      state.selectedService = action.payload;
      console.log('📱 Selected service changed to:', action.payload);
    },

    // REMOVED: setSelectedOperator - always using "Any Operator" (empty string)

    clearError: (state) => {
      state.error = null;
    },

    clearSelections: (state) => {
      state.selectedCountry = null;
      state.selectedService = null;
      console.log('🔄 Cleared all selections');
    },

    // REMOVED: resetOperators - no longer needed

    // Force refresh prices (for manual refresh button)
    invalidatePriceCache: (state) => {
      state.lastPriceFetch = null;
      console.log('♻️ Price cache invalidated');
    }
  },

  extraReducers: (builder) => {
    builder
      // Fetch Prices - with caching
      .addCase(fetchPrices.pending, (state) => {
        state.pricesLoading = true;
        state.error = null;
        console.log('⏳ fetchPrices: Loading started');
      })
      .addCase(fetchPrices.fulfilled, (state, action) => {
        state.pricesLoading = false;
        state.error = null;
        
        // Only update prices if not from cache
        if (!action.payload.cached) {
          state.prices = action.payload.data;
          state.lastPriceFetch = action.payload.fetchTime || Date.now();
          console.log('✅ fetchPrices: Fresh data loaded and cached');
        } else {
          console.log(`✅ fetchPrices: Using cache (${action.payload.cacheAge} min old)`);
        }
      })
      .addCase(fetchPrices.rejected, (state, action) => {
        state.pricesLoading = false;
        state.error = action.payload as string || 'Failed to fetch prices';
        console.error('❌ fetchPrices: Failed with error:', state.error);
      });
  },
});

export const {
  setSelectedCountry,
  setSelectedService,
  clearError,
  clearSelections,
  invalidatePriceCache
} = servicesSlice.actions;

export default servicesSlice.reducer;