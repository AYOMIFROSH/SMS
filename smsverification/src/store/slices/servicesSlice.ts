// src/store/slices/servicesSlice.ts - OPTIMIZED: Aggressive caching to reduce API calls
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
  lastPriceFetch: number | null;
  priceCache: {
    [key: string]: {
      data: any;
      timestamp: number;
      expiresAt: number;
    };
  };
}

const initialState: ServicesState = {
  services: STATIC_SERVICES as Service[],
  countries: STATIC_COUNTRIES as Country[],
  prices: {},
  loading: false,
  pricesLoading: false,
  error: null,
  selectedCountry: null,
  selectedService: null,
  lastPriceFetch: null,
  priceCache: {}
};

// Fetch prices with intelligent caching
export const fetchPrices = createAsyncThunk(
  'services/fetchPrices',
  async ({ country, service, forceRefresh = false }: { 
    country?: string; 
    service?: string;
    forceRefresh?: boolean;
  }, { rejectWithValue, getState }) => {
    try {
      const state = getState() as { services: ServicesState };
      const { priceCache } = state.services;
      
      // Create cache key
      const cacheKey = `${country || 'all'}_${service || 'all'}`;
      const now = Date.now();
      
      // Check cache validity (10 minutes for specific, 15 minutes for bulk)
      const CACHE_DURATION = (country && service) ? 10 * 60 * 1000 : 15 * 60 * 1000;
      
      // Return cached data if valid and not forcing refresh
      if (!forceRefresh && priceCache[cacheKey]) {
        const cached = priceCache[cacheKey];
        
        if (now < cached.expiresAt) {
          const ageMinutes = Math.floor((now - cached.timestamp) / 1000 / 60);
          console.log(`✅ Using cached prices (${ageMinutes}min old, valid for ${Math.floor((cached.expiresAt - now) / 1000 / 60)}min more)`);
          
          return {
            data: cached.data,
            filters: { country, service },
            cached: true,
            cacheAge: ageMinutes,
            cacheKey
          };
        }
      }
      
      console.log('💲 Fetching fresh prices from API');
      const response = await servicesApi.getPrices({ country, service });
      
      if (!response || !response.success) {
        // If API fails but we have stale cache, return it
        if (priceCache[cacheKey]) {
          console.warn('⚠️ API failed, returning stale cached prices');
          return {
            data: priceCache[cacheKey].data,
            filters: { country, service },
            cached: true,
            stale: true,
            cacheKey
          };
        }
        
        const errorMessage = response?.error || 'Failed to fetch prices';
        return rejectWithValue(errorMessage);
      }

      return {
        data: response.data || {},
        filters: response.filters || { country, service },
        cached: false,
        fetchTime: now,
        cacheKey,
        expiresAt: now + CACHE_DURATION
      };
    } catch (error: any) {
      console.error('❌ fetchPrices error:', error);
      
      // Try to return stale cache on error
      const state = getState() as { services: ServicesState };
      const cacheKey = `${country || 'all'}_${service || 'all'}`;
      
      if (state.services.priceCache[cacheKey]) {
        console.warn('⚠️ Exception occurred, returning stale cached prices');
        return {
          data: state.services.priceCache[cacheKey].data,
          filters: { country, service },
          cached: true,
          stale: true,
          cacheKey
        };
      }
      
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
      console.log('🌍 Selected country changed to:', action.payload);
    },

    setSelectedService: (state, action) => {
      state.selectedService = action.payload;
      console.log('📱 Selected service changed to:', action.payload);
    },

    clearError: (state) => {
      state.error = null;
    },

    clearSelections: (state) => {
      state.selectedCountry = null;
      state.selectedService = null;
      console.log('🔄 Cleared all selections');
    },

    // Invalidate specific cache entry
    invalidatePriceCache: (state, action) => {
      if (action.payload) {
        // Invalidate specific cache key
        const cacheKey = action.payload;
        if (state.priceCache[cacheKey]) {
          delete state.priceCache[cacheKey];
          console.log(`♻️ Invalidated cache: ${cacheKey}`);
        }
      } else {
        // Invalidate all cache
        state.priceCache = {};
        state.lastPriceFetch = null;
        console.log('♻️ Invalidated all price cache');
      }
    },

    // Clean up expired cache entries (call this periodically)
    cleanExpiredCache: (state) => {
      const now = Date.now();
      let cleanedCount = 0;
      
      Object.keys(state.priceCache).forEach(key => {
        if (now > state.priceCache[key].expiresAt) {
          delete state.priceCache[key];
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired cache entries`);
      }
    },

    // Warm up cache with common country/service combinations
    warmUpCache: (state, action) => {
      const { country, service, data } = action.payload;
      const cacheKey = `${country}_${service}`;
      const now = Date.now();
      const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
      
      state.priceCache[cacheKey] = {
        data,
        timestamp: now,
        expiresAt: now + CACHE_DURATION
      };
      
      console.log(`🔥 Warmed up cache for: ${cacheKey}`);
    }
  },

  extraReducers: (builder) => {
    builder
      // Fetch Prices
      .addCase(fetchPrices.pending, (state) => {
        state.pricesLoading = true;
        state.error = null;
        console.log('⏳ fetchPrices: Loading started');
      })
      .addCase(fetchPrices.fulfilled, (state, action) => {
        state.pricesLoading = false;
        state.error = null;
        
        const { data, cached, cacheKey, fetchTime, expiresAt, stale } = action.payload;
        
        if (!cached || stale) {
          // Update main prices state
          state.prices = { ...state.prices, ...data };
          state.lastPriceFetch = fetchTime || Date.now();
          
          // Update cache
          if (cacheKey && expiresAt) {
            state.priceCache[cacheKey] = {
              data,
              timestamp: fetchTime || Date.now(),
              expiresAt
            };
          }
          
          if (stale) {
            console.log('⚠️ fetchPrices: Using stale cache due to API error');
          } else {
            console.log('✅ fetchPrices: Fresh data loaded and cached');
          }
        } else {
          // Using valid cache
          state.prices = { ...state.prices, ...data };
          console.log(`✅ fetchPrices: Using valid cache (${action.payload.cacheAge}min old)`);
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
  invalidatePriceCache,
  cleanExpiredCache,
  warmUpCache
} = servicesSlice.actions;

export default servicesSlice.reducer;