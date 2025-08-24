// src/api/dashboard.ts - Enhanced with new endpoints and better error handling
import client from './client';
import { DashboardStats, ActivityItem } from '@/types';

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    try {
      console.log('📊 Making API call to /dashboard/stats');
      const response = await client.get('/dashboard/stats');
      
      console.log('📊 Stats response:', response.data);
      
      if (response.data.success || response.data.balance !== undefined) {
        // Handle both new format (with success flag) and legacy format
        const data = response.data.success ? response.data.data : response.data;
        return {
          balance: data.balance || 0,
          activeNumbers: data.activeNumbers || 0,
          todayPurchases: data.todayPurchases || 0,
          todaySpent: data.todaySpent || 0,
          successRate: data.successRate || 0,
          totalNumbers: data.totalNumbers || 0,
          totalSpent: data.totalSpent || 0
        };
      } else {
        throw new Error(response.data.error || 'Failed to fetch stats');
      }
    } catch (error: any) {
      console.error('❌ API Error in getStats:', error);
      throw error;
    }
  },

  getActivity: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<ActivityItem[]> => {
    try {
      console.log('📋 Making API call to /dashboard/activity', params);
      const response = await client.get('/dashboard/activity', { params });
      
      console.log('📋 Activity response:', response.data);
      
      if (response.data.success) {
        return response.data.data || [];
      } else if (Array.isArray(response.data)) {
        // Legacy format - array directly
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch activity');
      }
    } catch (error: any) {
      console.error('❌ API Error in getActivity:', error);
      throw error;
    }
  },

  // New: Get detailed statistics with time periods
  getDetailedStats: async (period: 'day' | 'week' | 'month' | 'year' = 'day') => {
    try {
      console.log('📊 Making API call to /dashboard/detailed-stats');
      const response = await client.get('/dashboard/detailed-stats', {
        params: { period }
      });
      
      console.log('📊 Detailed stats response:', response.data);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch detailed stats');
      }
    } catch (error: any) {
      console.error('❌ API Error in getDetailedStats:', error);
      throw error;
    }
  },

  // New: Get usage analytics
  getUsageAnalytics: async (days: number = 30) => {
    try {
      console.log('📈 Making API call to /dashboard/analytics');
      const response = await client.get('/dashboard/analytics', {
        params: { days }
      });
      
      console.log('📈 Analytics response:', response.data);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch analytics');
      }
    } catch (error: any) {
      console.error('❌ API Error in getUsageAnalytics:', error);
      throw error;
    }
  },

  // New: Get service popularity stats
  getServicePopularity: async () => {
    try {
      console.log('🏆 Making API call to /dashboard/service-popularity');
      const response = await client.get('/dashboard/service-popularity');
      
      console.log('🏆 Service popularity response:', response.data);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch service popularity');
      }
    } catch (error: any) {
      console.error('❌ API Error in getServicePopularity:', error);
      throw error;
    }
  },

  // New: Get country usage stats
  getCountryUsage: async () => {
    try {
      console.log('🌍 Making API call to /dashboard/country-usage');
      const response = await client.get('/dashboard/country-usage');
      
      console.log('🌍 Country usage response:', response.data);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch country usage');
      }
    } catch (error: any) {
      console.error('❌ API Error in getCountryUsage:', error);
      throw error;
    }
  }
};