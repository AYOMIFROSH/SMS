// src/api/services.ts - FIXED: Handle exact server responses and remove unused rejectWithValue
import client from './client';
import axios from 'axios';

export const servicesApi = {
  getServices: async () => {
    try {
      console.log('🚀 Making API call to /services');
      const response = await client.get('/services');

      console.log('📡 Services response (status):', response.status);
      console.log('📡 Services response (data):', response.data);

      // FIXED: Handle exact server response format
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          total: response.data.total || 0
        };
      } else {
        // Backend returned an error
        const msg = response.data?.error || response.data?.message || 'Failed to fetch services';
        console.error('❌ getServices - backend returned error:', response.data);
        return {
          success: false,
          error: msg,
          data: [],
          total: 0
        };
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('❌ API Error in getServices: AxiosError', {
          message: error.message,
          status: error.response?.status,
          responseData: error.response?.data,
          responseHeaders: error.response?.headers
        });
        const backendMsg = error.response?.data?.message || error.response?.data?.error;
        return {
          success: false,
          error: backendMsg || `Request failed with status ${error.response?.status || 'unknown'}`,
          data: [],
          total: 0
        };
      } else {
        console.error('❌ API Error in getServices (non-Axios):', error);
        return {
          success: false,
          error: error.message || 'Unknown error occurred',
          data: [],
          total: 0
        };
      }
    }
  },

  getCountries: async () => {
    try {
      console.log('🌍 Making API call to /services/countries');
      const response = await client.get('/services/countries');
      
      console.log('📡 Countries response:', response.data);
      
      // FIXED: Handle exact server response format
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          total: response.data.total || 0
        };
      } else {
        return {
          success: false,
          error: response.data?.error || 'Failed to fetch countries',
          data: [],
          total: 0
        };
      }
    } catch (error: any) {
      console.error('❌ API Error in getCountries:', error);
      if (axios.isAxiosError(error)) {
        const backendMsg = error.response?.data?.message || error.response?.data?.error;
        return {
          success: false,
          error: backendMsg || `Request failed with status ${error.response?.status || 'unknown'}`,
          data: [],
          total: 0
        };
      }
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        data: [],
        total: 0
      };
    }
  },

  // FIXED: Get operators by country - handle exact server response
  getOperatorsByCountry: async (country: string) => {
    try {
      console.log('📡 Making API call to /services/operators/' + country);
      const response = await client.get(`/services/operators/${country}`);
      
      console.log('📡 Operators response:', response.data);
      
      // FIXED: Handle exact server response format
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || [],
          country: response.data.country || country,
          total: response.data.total || 0
        };
      } else {
        // Don't throw error for no operators, return empty result
        console.warn('⚠️ No operators found for country:', country, response.data);
        return {
          success: true,
          data: [],
          country: country,
          total: 0
        };
      }
    } catch (error: any) {
      console.error('❌ API Error in getOperators:', error);
      if (axios.isAxiosError(error)) {
        // If 404 or no operators, return empty instead of throwing
        if (error.response?.status === 404) {
          console.warn('⚠️ No operators endpoint or no operators for country:', country);
          return {
            success: true,
            data: [],
            country: country,
            total: 0
          };
        }
        const backendMsg = error.response?.data?.message || error.response?.data?.error;
        return {
          success: false,
          error: backendMsg || `Request failed with status ${error.response?.status || 'unknown'}`,
          data: [],
          country: country,
          total: 0
        };
      }
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        data: [],
        country: country,
        total: 0
      };
    }
  },

  getPrices: async (params: { country?: string; service?: string } = {}) => {
    try {
      console.log('💲 Making API call to /services/prices with params:', params);
      const response = await client.get('/services/prices', {
        params,
      });

      console.log('📡 Prices response:', response.data);

      // FIXED: Handle exact server response format
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || {},
          filters: response.data.filters || params
        };
      } else {
        return {
          success: false,
          error: response.data?.error || 'Failed to fetch prices',
          data: {},
          filters: params
        };
      }
    } catch (error: any) {
      console.error('❌ API Error in getPrices:', error);
      if (axios.isAxiosError(error)) {
        const backendMsg = error.response?.data?.message || error.response?.data?.error;
        return {
          success: false,
          error: backendMsg || `Request failed with status ${error.response?.status || 'unknown'}`,
          data: {},
          filters: params
        };
      }
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        data: {},
        filters: params
      };
    }
  },

  getAvailability: async (params: { country?: string; operator?: string } = {}) => {
    try {
      console.log('📊 Making API call to /services/availability with params:', params);
      const response = await client.get('/services/availability', {
        params,
      });

      console.log('📡 Availability response:', response.data);

      // FIXED: Handle exact server response format
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || {},
          filters: response.data.filters || params
        };
      } else {
        return {
          success: false,
          error: response.data?.error || 'Failed to fetch availability',
          data: {},
          filters: params
        };
      }
    } catch (error: any) {
      console.error('❌ API Error in getAvailability:', error);
      if (axios.isAxiosError(error)) {
        const backendMsg = error.response?.data?.message || error.response?.data?.error;
        return {
          success: false,
          error: backendMsg || `Request failed with status ${error.response?.status || 'unknown'}`,
          data: {},
          filters: params
        };
      }
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        data: {},
        filters: params
      };
    }
  },

  // Get service restrictions
  getServiceRestrictions: async (country: string, service: string) => {
    try {
      console.log('🔒 Making API call to /services/restrictions');
      const response = await client.get(`/services/restrictions/${country}/${service}`);
      
      console.log('📡 Restrictions response:', response.data);
      
      // FIXED: Handle exact server response format
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data || {},
          country: response.data.country || country,
          service: response.data.service || service
        };
      } else {
        return {
          success: false,
          error: response.data?.error || 'Failed to fetch restrictions',
          data: {},
          country: country,
          service: service
        };
      }
    } catch (error: any) {
      console.error('❌ API Error in getRestrictions:', error);
      if (axios.isAxiosError(error)) {
        const backendMsg = error.response?.data?.message || error.response?.data?.error;
        return {
          success: false,
          error: backendMsg || `Request failed with status ${error.response?.status || 'unknown'}`,
          data: {},
          country: country,
          service: service
        };
      }
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        data: {},
        country: country,
        service: service
      };
    }
  }
};