// src/store/slices/servicesSlice.ts - FIXED: Handle exact server response format and all TypeScript errors
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { servicesApi } from '@/api/services';
import { Service, Country } from '@/types';

// FIXED: Match exact API response structure
export interface Operator {
  id: string;
  name: string;
  country?: string;
  available?: boolean;
  price?: number;
}

interface ServicesState {
  services: Service[];
  countries: Country[];
  operators: { [country: string]: Operator[] }; // Store operators by country
  prices: any;
  availability: any;
  restrictions: any;
  loading: boolean;
  operatorsLoading: boolean;
  pricesLoading: boolean;
  availabilityLoading: boolean;
  restrictionsLoading: boolean;
  error: string | null;
  selectedCountry: string | null;
  selectedService: string | null;
  selectedOperator: string | null;
}

const initialState: ServicesState = {
  services: [],
  countries: [],
  operators: {}, // Initialize as empty object
  prices: {},
  availability: {},
  restrictions: {},
  loading: false,
  operatorsLoading: false,
  pricesLoading: false,
  availabilityLoading: false,
  restrictionsLoading: false,
  error: null,
  selectedCountry: null,
  selectedService: null,
  selectedOperator: null,
};

// Fetch services - handle exact server response
export const fetchServices = createAsyncThunk(
  'services/fetchServices',
  async (_, { rejectWithValue }) => {
    try {
      console.log("🚀 fetchServices: Starting API call");
      const response = await servicesApi.getServices();
      console.log("📦 fetchServices response:", response);

      if (!response || !response.success) {
        const errorMessage = response?.error || 'Failed to fetch services';
        return rejectWithValue(errorMessage);
      }

      // Normalize response.data into a flat Service[]
      let services: Service[] = [];

      const raw = response.data;

      // Helper to extract values from numeric-keyed object
      const valuesFromNumericKeyedObject = (obj: Record<string, any>) => {
        const numericKeys = Object.keys(obj).filter(k => /^\d+$/.test(k));
        return numericKeys.length ? numericKeys.map(k => obj[k]) : Object.values(obj);
      };

      if (Array.isArray(raw)) {
        if (raw.length === 0) {
          services = [];
        } else if (raw.length === 1 && raw[0] && typeof raw[0] === 'object' && !Array.isArray(raw[0])) {
          // Common pattern: server returns [ { "0": {...}, "1": {...}, "187": {...}, ... } ]
          services = valuesFromNumericKeyedObject(raw[0]).filter(Boolean);
        } else {
          // Flatten array items that might themselves be numeric-keyed objects or nested arrays
          services = raw.flatMap(item => {
            if (!item) return [];
            if (Array.isArray(item)) return item;
            if (typeof item === 'object') {
              const keys = Object.keys(item);
              if (keys.some(k => /^\d+$/.test(k))) return valuesFromNumericKeyedObject(item);
              return [item];
            }
            return [];
          });
        }
      } else if (raw && typeof raw === 'object') {
        services = valuesFromNumericKeyedObject(raw).filter(Boolean);
      } else {
        services = [];
      }

      console.log("✅ Final processed services (normalized):", services.length, "items — sample:", services.slice(0, 3));

      return {
        services,
        total: response.total || services.length
      };

    } catch (error: any) {
      console.error("❌ fetchServices error:", error);
      return rejectWithValue(error.message || 'Failed to fetch services');
    }
  }
);

// Fetch countries - handle exact server response
export const fetchCountries = createAsyncThunk(
  'services/fetchCountries',
  async (_, { rejectWithValue }) => {
    try {
      console.log("🌍 fetchCountries: Starting API call");
      const response = await servicesApi.getCountries();
      console.log("📦 Countries response:", response);

      if (!response || !response.success) {
        const errorMessage = response?.error || 'Failed to fetch countries';
        return rejectWithValue(errorMessage);
      }

      // FIXED: Use exact server response format
      const countries = Array.isArray(response.data) ? response.data : [];
      console.log("✅ Processed countries:", countries.length, "items");

      return {
        countries,
        total: response.total || countries.length
      };
    } catch (error: any) {
      console.error("❌ fetchCountries error:", error);
      return rejectWithValue(error.message || 'Failed to fetch countries');
    }
  }
);

// FIXED: Fetch operators by country - handle exact server response
export const fetchOperators = createAsyncThunk(
  'services/fetchOperators',
  async (country: string) => {
    try {
      console.log("📡 fetchOperators: Starting API call for country:", country);

      const response = await servicesApi.getOperatorsByCountry(country);
      console.log("📦 Operators response:", response);

      if (!response || !response.success) {
        // Don't throw error if no operators, just return empty array
        console.warn("⚠️ No operators found for country:", country);
        return {
          country,
          operators: [],
          total: 0
        };
      }

      // FIXED: Process operators exactly as received from server
      let operators: Operator[] = [];

      if (Array.isArray(response.data)) {
        operators = response.data;
      } else if (response.data && typeof response.data === 'object') {
        // Handle case where server returns operators as object with ID keys
        operators = Object.entries(response.data).map(([id, nameOrData]) => {
          // FIXED: Handle null case for nameOrData
          if (nameOrData === null) {
            return {
              id: id,
              name: id,
              country: country
            };
          }

          if (typeof nameOrData === 'string') {
            return {
              id: id,
              name: nameOrData,
              country: country
            };
          } else if (typeof nameOrData === 'object') {
            return {
              id: id,
              name: (nameOrData as any).name || id,
              country: country,
              ...nameOrData
            };
          }
          return {
            id: id,
            name: String(nameOrData),
            country: country
          };
        });
      }

      console.log("✅ Processed operators:", operators.length, "items for country:", country);

      return {
        country,
        operators,
        total: operators.length
      };
    } catch (error: any) {
      console.error("❌ fetchOperators error:", error);
      // Don't reject on error, just return empty operators
      return {
        country,
        operators: [],
        total: 0
      };
    }
  }
);

// FIXED: Fetch prices - handle exact server response
export const fetchPrices = createAsyncThunk(
  'services/fetchPrices',
  async ({ country, service }: { country?: string; service?: string } = {}, { rejectWithValue }) => {
    try {
      console.log("💲 fetchPrices: Starting API call", { country, service });

      const response = await servicesApi.getPrices({ country, service });
      console.log("💲 Prices response:", response);

      if (!response || !response.success) {
        const errorMessage = response?.error || 'Failed to fetch prices';
        return rejectWithValue(errorMessage);
      }

      return {
        data: response.data || {},
        filters: response.filters || { country, service }
      };
    } catch (error: any) {
      console.error("❌ fetchPrices error:", error);
      return rejectWithValue(error.message || 'Failed to fetch prices');
    }
  }
);

// FIXED: Fetch availability - handle exact server response
export const fetchAvailability = createAsyncThunk(
  'services/fetchAvailability',
  async ({ country, operator }: { country?: string; operator?: string } = {}, { rejectWithValue }) => {
    try {
      console.log("📊 fetchAvailability: Starting API call", { country, operator });

      const response = await servicesApi.getAvailability({ country, operator });
      console.log("📊 Availability response:", response);

      if (!response || !response.success) {
        const errorMessage = response?.error || 'Failed to fetch availability';
        return rejectWithValue(errorMessage);
      }

      return {
        data: response.data || {},
        filters: { country, operator }
      };
    } catch (error: any) {
      console.error("❌ fetchAvailability error:", error);
      return rejectWithValue(error.message || 'Failed to fetch availability');
    }
  }
);

// Fetch service restrictions
export const fetchRestrictions = createAsyncThunk(
  'services/fetchRestrictions',
  async ({ country, service }: { country: string; service: string }, { rejectWithValue }) => {
    try {
      console.log("🔒 fetchRestrictions: Starting API call", { country, service });

      const response = await servicesApi.getServiceRestrictions(country, service);
      console.log("🔒 Restrictions response:", response);

      if (!response || !response.success) {
        const errorMessage = response?.error || 'Failed to fetch restrictions';
        return rejectWithValue(errorMessage);
      }

      return {
        country,
        service,
        data: response.data || {}
      };
    } catch (error: any) {
      console.error("❌ fetchRestrictions error:", error);
      return rejectWithValue(error.message || 'Failed to fetch restrictions');
    }
  }
);

const servicesSlice = createSlice({
  name: 'services',
  initialState,
  reducers: {
    setSelectedCountry: (state, action) => {
      state.selectedCountry = action.payload;
      state.selectedOperator = null; // Reset operator when country changes
      console.log("🌍 Selected country changed to:", action.payload);
    },

    setSelectedService: (state, action) => {
      state.selectedService = action.payload;
      console.log("📱 Selected service changed to:", action.payload);
    },

    setSelectedOperator: (state, action) => {
      state.selectedOperator = action.payload;
      console.log("📡 Selected operator changed to:", action.payload);
    },

    clearError: (state) => {
      state.error = null;
    },

    clearSelections: (state) => {
      state.selectedCountry = null;
      state.selectedService = null;
      state.selectedOperator = null;
      console.log("🔄 Cleared all selections");
    },

    // Reset operators when country changes
    resetOperators: (state) => {
      state.operators = {};
      state.selectedOperator = null;
    }
  },

  extraReducers: (builder) => {
    builder
      // Fetch Services
      .addCase(fetchServices.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;

        // Normalize payload.services to always be an array
        const payloadServices = (action.payload && (action.payload as any).services) ?? [];
        state.services = Array.isArray(payloadServices)
          ? payloadServices
          : (payloadServices ? Object.values(payloadServices) : []);

        console.log("✅ fetchServices: Loaded", state.services.length, "services");
      })


      // Fetch Countries
      .addCase(fetchCountries.pending, (state) => {
        state.loading = true;
        state.error = null;
        console.log("⏳ fetchCountries: Loading started");
      })
      .addCase(fetchCountries.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.countries = action.payload.countries;
        console.log("✅ fetchCountries: Loaded", state.countries.length, "countries");
      })
      .addCase(fetchCountries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string || 'Failed to fetch countries';
        state.countries = [];
        console.error("❌ fetchCountries: Failed with error:", state.error);
      })

      // FIXED: Fetch Operators - handle exact server response
      .addCase(fetchOperators.pending, (state) => {
        state.operatorsLoading = true;
        state.error = null;
        console.log("⏳ fetchOperators: Loading started");
      })
      .addCase(fetchOperators.fulfilled, (state, action) => {
        state.operatorsLoading = false;
        state.error = null;

        const rawOperators = action.payload.operators || [];

        const normalized: Operator[] = rawOperators.flatMap(op => {
          // Skip "status" objects
          if (op.id === 'status') return [];

          // If name is an object like { 187: [...] }, flatten it
          if (op.name && typeof op.name === 'object') {
            return Object.values(op.name)
              .flat()
              .map(name => ({
                id: String(name),
                name: String(name),
                country: op.country || action.payload.country
              }));
          }


          return {
            id: op.id,
            name: typeof op.name === 'string' ? op.name : String(op.id),
            country: op.country || action.payload.country
          };
        });

        state.operators[action.payload.country] = normalized;

        console.log("✅ fetchOperators: Normalized operators", normalized.length, "for country:", action.payload.country);
      })

      .addCase(fetchOperators.rejected, (state, action) => {
        state.operatorsLoading = false;
        // Don't set error for operators, just log
        console.error("❌ fetchOperators: Failed with error:", action.payload);
      })

      // Fetch Prices
      .addCase(fetchPrices.pending, (state) => {
        state.pricesLoading = true;
        state.error = null;
        console.log("⏳ fetchPrices: Loading started");
      })
      .addCase(fetchPrices.fulfilled, (state, action) => {
        state.pricesLoading = false;
        state.error = null;
        state.prices = action.payload.data;
        console.log("✅ fetchPrices: Loaded prices");
      })
      .addCase(fetchPrices.rejected, (state, action) => {
        state.pricesLoading = false;
        state.error = action.payload as string || 'Failed to fetch prices';
        console.error("❌ fetchPrices: Failed with error:", state.error);
      })

      // Fetch Availability
      .addCase(fetchAvailability.pending, (state) => {
        state.availabilityLoading = true;
        state.error = null;
        console.log("⏳ fetchAvailability: Loading started");
      })
      .addCase(fetchAvailability.fulfilled, (state, action) => {
        state.availabilityLoading = false;
        state.error = null;
        state.availability = action.payload.data;
        console.log("✅ fetchAvailability: Loaded availability");
      })
      .addCase(fetchAvailability.rejected, (state, action) => {
        state.availabilityLoading = false;
        state.error = action.payload as string || 'Failed to fetch availability';
        console.error("❌ fetchAvailability: Failed with error:", state.error);
      })

      // Fetch Restrictions
      .addCase(fetchRestrictions.pending, (state) => {
        state.restrictionsLoading = true;
        state.error = null;
        console.log("⏳ fetchRestrictions: Loading started");
      })
      .addCase(fetchRestrictions.fulfilled, (state, action) => {
        state.restrictionsLoading = false;
        state.error = null;
        const key = `${action.payload.country}-${action.payload.service}`;
        state.restrictions[key] = action.payload.data;
        console.log("✅ fetchRestrictions: Loaded restrictions for", key);
      })
      .addCase(fetchRestrictions.rejected, (state, action) => {
        state.restrictionsLoading = false;
        state.error = action.payload as string || 'Failed to fetch restrictions';
        console.error("❌ fetchRestrictions: Failed with error:", state.error);
      });
  },
});

export const {
  setSelectedCountry,
  setSelectedService,
  setSelectedOperator,
  clearError,
  clearSelections,
  resetOperators
} = servicesSlice.actions;

export default servicesSlice.reducer;