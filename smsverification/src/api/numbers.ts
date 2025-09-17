// src/api/numbers.ts - Enhanced with new endpoints and better error handling
import client from './client';

export interface PurchaseRequest {
  service: string;
  country?: string;
  operator?: string;
  maxPrice?: number;
}

export interface PurchaseResponse {
  success: boolean;
  data: {
    activationId: string;
    number: string;
    price: number;
    purchaseId: number;
    service: string;
    country: string;
    operator?: string;
    status: string;
    expiryDate: string;
    remainingBalance: number;
  };
}

export const numbersApi = {
  purchase: async (purchaseData: PurchaseRequest): Promise<PurchaseResponse> => {
    const response = await client.post('/numbers/purchase', purchaseData);
    return response.data;
  },

  getActive: async (page = 1, limit = 20) => {
    const response = await client.get('/numbers/active', {
      params: { page, limit }
    });
    
    if (response.data.success) {
      return {
        data: response.data.data || [],
        pagination: response.data.pagination || {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1
        }
      };
    } else {
      throw new Error(response.data.error || 'Failed to fetch active numbers');
    }
  },

  // Get specific number status
  getStatus: async (id: number) => {
    const response = await client.get(`/numbers/${id}/status`);
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.error || 'Failed to get number status');
    }
  },

  cancel: async (id: number) => {
    const response = await client.post(`/numbers/${id}/cancel`);
    
    if (response.data.success) {
      return {
        message: response.data.message,
        refundAmount: response.data.refundAmount
      };
    } else {
      throw new Error(response.data.error || 'Failed to cancel number');
    }
  },

  // New: Mark number as completed/used
  complete: async (id: number) => {
    const response = await client.post(`/numbers/${id}/complete`);
    
    if (response.data.success) {
      return response.data;
    } else {
      throw new Error(response.data.error || 'Failed to complete number');
    }
  },

  // New: Request SMS retry
  retry: async (id: number) => {
    const response = await client.post(`/numbers/${id}/retry`);
    
    if (response.data.success) {
      return {
        message: response.data.message,
        newExpiryDate: response.data.newExpiryDate
      };
    } else {
      throw new Error(response.data.error || 'Failed to retry SMS');
    }
  },

  // New: Get full SMS text
  getFullSms: async (id: number) => {
    const response = await client.get(`/numbers/${id}/full-sms`);
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.error || 'Failed to get full SMS');
    }
  },

  getHistory: async (params?: {
    page?: number;
    limit?: number;
    service?: string;
    country?: string;
    status?: string;
    search?: string;
  }) => {
    const response = await client.get('/numbers/history', { params });
    
    if (response.data.success) {
      return {
        data: response.data.data || [],
        pagination: response.data.pagination || {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1
        }
      };
    } else {
      throw new Error(response.data.error || 'Failed to fetch history');
    }
  },

  refresh: async (id: number) => {
    const response = await client.post(`/numbers/${id}/refresh`);
    
    if (response.data.success) {
      return {
        message: response.data.message,
        newExpiryDate: response.data.data.newExpiryDate,
        phoneNumber: response.data.data.phoneNumber
      };
    } else {
      throw new Error(response.data.error || 'Failed to refresh number');
    }
  },

  // Subscription management
  subscriptions: {
    buy: async (data: {
      service: string;
      country: string;
      period: number;
    }) => {
      const response = await client.post('/numbers/subscriptions/buy', data);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to buy subscription');
      }
    },

    list: async (params?: {
      page?: number;
      limit?: number;
      status?: string;
    }) => {
      const response = await client.get('/numbers/subscriptions', { params });
      
      if (response.data.success) {
        return {
          data: response.data.data || [],
          pagination: response.data.pagination || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 1
          }
        };
      } else {
        throw new Error(response.data.error || 'Failed to fetch subscriptions');
      }
    },

    cancel: async (id: number) => {
      const response = await client.post(`/numbers/subscriptions/${id}/cancel`);
      
      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to cancel subscription');
      }
    }
  }
};