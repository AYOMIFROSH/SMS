// services/smsActivateServices.js - ENHANCED VERSION WITH FULL API INTEGRATION
const axios = require('axios');
const logger = require('../utils/logger');
const cacheService = require('./cacheServices');

class SmsActivateService {
  constructor() {
    this.apiUrl = process.env.SMS_ACTIVATE_API_URL || 'https://api.sms-activate.io/stubs/handler_api.php';
    this.apiKey = process.env.SMS_ACTIVATE_API_KEY;

    // Minimal action map — safe defaults, override via env vars if needed
    this.actionMap = {
      getBalance: process.env.SMS_ACTIVATE_ACTION_GET_BALANCE || 'getBalance',
      // provider docs use getServicesList for services — override without editing code using env var
      getServices: process.env.SMS_ACTIVATE_ACTION_GET_SERVICES || 'getServicesList',
      getCountries: process.env.SMS_ACTIVATE_ACTION_GET_COUNTRIES || 'getCountries',
      getOperators: process.env.SMS_ACTIVATE_ACTION_GET_OPERATORS || 'getOperators',
      getPrices: process.env.SMS_ACTIVATE_ACTION_GET_PRICES || 'getPrices',
      getNumbersStatus: process.env.SMS_ACTIVATE_ACTION_GET_NUMBERS_STATUS || 'getNumbersStatus',
      getNumber: process.env.SMS_ACTIVATE_ACTION_GET_NUMBER || 'getNumber',
      setStatus: process.env.SMS_ACTIVATE_ACTION_SET_STATUS || 'setStatus',
      getStatus: process.env.SMS_ACTIVATE_ACTION_GET_STATUS || 'getStatus',
      getFullSms: process.env.SMS_ACTIVATE_ACTION_GET_FULL_SMS || 'getFullSms'
    };
    
    // SMS-Activate API status codes
    this.statusCodes = {
      'STATUS_WAIT_CODE': 'waiting',
      'STATUS_WAIT_RETRY': 'waiting_retry',
      'STATUS_OK': 'received',
      'STATUS_CANCEL': 'cancelled',
      'STATUS_WAIT_RESEND': 'waiting_resend'
    };

    // API action codes for setStatus
    this.actionCodes = {
      CONFIRM_SMS: 1,      // Confirm SMS received
      REQUEST_RETRY: 3,    // Request retry
      FINISH_ACTIVATION: 6, // Finish activation
      CANCEL_ACTIVATION: 8  // Cancel activation
    };

    logger.info('Enhanced SMS-Activate Service initialized with full API support');
  }

  async makeRequest(action, params = {}) {
    try {

      const providerAction = (this.actionMap && this.actionMap[action]) ? this.actionMap[action] : action;

      const requestParams = {
        api_key: this.apiKey,
        action: providerAction, // send providerAction, not raw action
        ...params
      };
      
      logger.info(`📡 SMS-Activate API Request - Action: ${action}`, { params: requestParams });
      
      const response = await axios.get(this.apiUrl, {
        params: requestParams,
        timeout: 30000,
        headers: {
          'User-Agent': 'SMS-Dashboard-Service/1.0'
        }
      });
      
      logger.info(`📡 SMS-Activate API Response - Status: ${response.status}`, { 
        data: response.data,
        dataType: typeof response.data 
      });
      
      // Handle error responses
      if (typeof response.data === 'string') {
        const errorMessage = this.parseErrorResponse(response.data);
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }
      
      return response.data;
    } catch (error) {
      logger.error('❌ SMS-Activate API Error:', {
        action,
        params,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      throw this.enhanceError(error);
    }
  }

  parseErrorResponse(response) {
    const errorMap = {
      'BAD_KEY': 'Invalid API key provided',
      'ERROR_SQL': 'Database error on SMS-Activate server',
      'BAD_ACTION': 'Invalid API action requested',
      'BAD_SERVICE': 'Invalid service code provided',
      'BAD_STATUS': 'Invalid status for activation',
      'NO_NUMBERS': 'No numbers available for this service/country',
      'NO_BALANCE': 'Insufficient balance in SMS-Activate account',
      'NO_ACTIVATION': 'Activation ID not found',
      'ACTIVATION_USED': 'Activation already completed',
      'WRONG_ACTIVATION_ID': 'Invalid activation ID format',
      'WRONG_EXCEPTION_PHONE': 'Invalid phone number exception',
      'NO_OPERATIONS': 'No operations available',
      'WRONG_ADDITIONAL_SERVICE': 'Invalid additional service'
    };

    if (errorMap[response]) {
      return errorMap[response];
    }

    if (response.startsWith('ERROR')) {
      return `SMS-Activate API Error: ${response}`;
    }

    return null;
  }

  enhanceError(error) {
    if (error.code === 'ENOTFOUND') {
      return new Error('DNS resolution failed - SMS-Activate API unavailable');
    } else if (error.code === 'ECONNREFUSED') {
      return new Error('Connection refused - SMS-Activate server down');
    } else if (error.code === 'ETIMEDOUT') {
      return new Error('Request timeout - SMS-Activate API too slow');
    } else if (error.response?.status === 429) {
      return new Error('Rate limit exceeded - too many API requests');
    }
    return error;
  }

  async getBalance() {
    try {
      const cacheKey = 'sms:balance';
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const response = await this.makeRequest('getBalance');
      
      if (typeof response === 'string' && response.includes(':')) {
        const balance = parseFloat(response.split(':')[1]);
        await cacheService.set(cacheKey, balance, 300); // Cache for 5 minutes
        return balance;
      }
      
      throw new Error('Invalid balance response format');
    } catch (error) {
      logger.error('❌ Get balance error:', error);
      throw error;
    }
  }

  async getServices() {
    try {
      const cached = await cacheService.getCachedServices();
      if (cached) return cached;

      const response = await this.makeRequest('getServices');
      
      let services;
      if (typeof response === 'string') {
        try {
          services = JSON.parse(response);
        } catch (e) {
          throw new Error(`Invalid services JSON: ${response}`);
        }
      } else {
        services = response;
      }

      // Process and enhance services data
      const processedServices = this.processServicesData(services);
      await cacheService.cacheServices(processedServices);
      
      return processedServices;
    } catch (error) {
      logger.error('❌ Get services error:', error);
      throw error;
    }
  }

  processServicesData(services) {
    const serviceCategories = {
      'wa': 'messaging',
      'tg': 'messaging',
      'vi': 'messaging',
      'go': 'social',
      'fb': 'social',
      'ig': 'social',
      'tw': 'social',
      'li': 'social',
      'uber': 'services',
      'airbnb': 'services',
      'netflix': 'entertainment'
    };

    if (Array.isArray(services)) {
      return services;
    }

    return Object.entries(services).map(([code, data]) => {
      if (typeof data === 'object') {
        return {
          code,
          name: data.name || data.title || code.toUpperCase(),
          category: serviceCategories[code] || 'other',
          icon: data.icon || null,
          popular: ['wa', 'tg', 'go', 'fb', 'ig'].includes(code),
          ...data
        };
      }
      return {
        code,
        name: data || code.toUpperCase(),
        category: serviceCategories[code] || 'other',
        popular: ['wa', 'tg', 'go', 'fb', 'ig'].includes(code)
      };
    });
  }

  async getCountries() {
    try {
      const cached = await cacheService.getCachedCountries();
      if (cached) return cached;

      const response = await this.makeRequest('getCountries');
      
      let countries;
      if (typeof response === 'string') {
        try {
          countries = JSON.parse(response);
        } catch (e) {
          throw new Error(`Invalid countries JSON: ${response}`);
        }
      } else {
        countries = response;
      }

      const processedCountries = Object.entries(countries)
        .filter(([_, data]) => data.visible !== 0)
        .map(([id, data]) => ({
          code: id,
          name: data.eng || data.name || `Country ${id}`,
          rus: data.rus || '',
          visible: data.visible !== 0,
          retry: data.retry || 0,
          rent: data.rent || false
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      await cacheService.cacheCountries(processedCountries);
      return processedCountries;
    } catch (error) {
      logger.error('❌ Get countries error:', error);
      throw error;
    }
  }

  // NEW: Get operators by country
  async getOperators(country) {
    try {
      const cacheKey = `sms:operators:${country}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const response = await this.makeRequest('getOperators', { country });
      
      let operators;
      if (typeof response === 'string') {
        try {
          operators = JSON.parse(response);
        } catch (e) {
          return []; // Return empty if no operators
        }
      } else {
        operators = response;
      }

      const processedOperators = Object.entries(operators).map(([id, name]) => ({
        id,
        name,
        country
      }));

      await cacheService.set(cacheKey, processedOperators, 1800); // Cache 30 minutes
      return processedOperators;
    } catch (error) {
      logger.error('❌ Get operators error:', error);
      return []; // Return empty array on error
    }
  }

  async getPrices(country = null, service = null) {
    try {
      const cacheKey = `sms:prices:${country || 'all'}:${service || 'all'}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      const params = {};
      if (country) params.country = country;
      if (service) params.service = service;

      const response = await this.makeRequest('getPrices', params);
      
      let prices;
      if (typeof response === 'string') {
        try {
          prices = JSON.parse(response);
        } catch (e) {
          throw new Error(`Invalid prices JSON: ${response}`);
        }
      } else {
        prices = response;
      }

      await cacheService.set(cacheKey, prices, 600); // Cache 10 minutes
      return prices;
    } catch (error) {
      logger.error('❌ Get prices error:', error);
      throw error;
    }
  }

  async getNumbersStatus(country = null, operator = null) {
    const params = {};
    if (country) params.country = country;
    if (operator) params.operator = operator;
    
    try {
      const response = await this.makeRequest('getNumbersStatus', params);
      return response;
    } catch (error) {
      logger.error('❌ Get numbers status error:', error);
      throw error;
    }
  }

  // Enhanced number purchase with better error handling
  async getNumber(service, country = null, operator = null, maxPrice = null) {
    const params = { service };
    if (country) params.country = country;
    if (operator) params.operator = operator;
    if (maxPrice) params.maxPrice = maxPrice;
    
    try {
      logger.info('📱 Purchasing number:', params);
      const response = await this.makeRequest('getNumber', params);
      
      if (typeof response === 'string') {
        const parts = response.split(':');
        const status = parts[0];
        
        if (status === 'ACCESS_NUMBER') {
          return { 
            id: parts[1], 
            number: parts[2],
            status: 'purchased'
          };
        } else {
          throw new Error(this.parseErrorResponse(response) || response);
        }
      }
      
      throw new Error('Invalid number response format');
    } catch (error) {
      logger.error('❌ Get number error:', error);
      throw error;
    }
  }

  // Enhanced status management
  async setStatus(id, status, forward = null) {
    const params = { id, status };
    if (forward) params.forward = forward;
    
    try {
      logger.info('⚙️ Setting status:', params);
      const response = await this.makeRequest('setStatus', params);
      
      if (typeof response === 'string' && response === 'ACCESS_READY') {
        return { success: true, message: 'Status updated successfully' };
      }
      
      return response;
    } catch (error) {
      logger.error('❌ Set status error:', error);
      throw error;
    }
  }

  async getStatus(id) {
    try {
      logger.info('🔍 Getting status for:', id);
      const response = await this.makeRequest('getStatus', { id });
      
      if (typeof response === 'string') {
        if (response.startsWith('STATUS_')) {
          const parts = response.split(':');
          return {
            status: this.statusCodes[parts[0]] || parts[0],
            code: parts[1] || null,
            text: parts[2] || null
          };
        } else {
          const errorMessage = this.parseErrorResponse(response);
          if (errorMessage) {
            throw new Error(errorMessage);
          }
        }
      }
      
      return { status: 'unknown', code: null, text: null };
    } catch (error) {
      logger.error('❌ Get status error:', error);
      throw error;
    }
  }

  // NEW: Get full SMS text
  async getFullSms(id) {
    try {
      logger.info('📨 Getting full SMS for:', id);
      const response = await this.makeRequest('getFullSms', { id });
      
      if (typeof response === 'string' && response.startsWith('FULL_SMS:')) {
        const smsText = response.substring('FULL_SMS:'.length);
        return { success: true, text: smsText };
      }
      
      throw new Error(this.parseErrorResponse(response) || 'Failed to get full SMS');
    } catch (error) {
      logger.error('❌ Get full SMS error:', error);
      throw error;
    }
  }

  // NEW: Get active activations
  async getActiveActivations() {
    try {
      logger.info('🔄 Getting active activations...');
      const response = await this.makeRequest('getActiveActivations');
      
      if (typeof response === 'string') {
        try {
          return JSON.parse(response);
        } catch (e) {
          return [];
        }
      }
      
      return response || [];
    } catch (error) {
      logger.error('❌ Get active activations error:', error);
      return [];
    }
  }

  // NEW: Additional service for longer SMS
  async additionalService(id, service) {
    try {
      logger.info('➕ Requesting additional service:', { id, service });
      const response = await this.makeRequest('additionalService', { id, service });
      return response;
    } catch (error) {
      logger.error('❌ Additional service error:', error);
      throw error;
    }
  }

  // NEW: Buy activation subscription
  async buySubscription(service, country, period) {
    try {
      logger.info('💳 Buying subscription:', { service, country, period });
      const response = await this.makeRequest('buySubscription', {
        service,
        country,
        period
      });
      
      if (typeof response === 'string' && response.startsWith('ACCESS_SUBSCRIPTION:')) {
        const subscriptionId = response.split(':')[1];
        return { success: true, subscriptionId };
      }
      
      throw new Error(this.parseErrorResponse(response) || 'Failed to buy subscription');
    } catch (error) {
      logger.error('❌ Buy subscription error:', error);
      throw error;
    }
  }

  // NEW: Get subscription status
  async getSubscriptionStatus(subscriptionId) {
    try {
      logger.info('📋 Getting subscription status:', subscriptionId);
      const response = await this.makeRequest('getSubscriptionStatus', {
        id: subscriptionId
      });
      return response;
    } catch (error) {
      logger.error('❌ Get subscription status error:', error);
      throw error;
    }
  }

  // NEW: Cancel subscription
  async cancelSubscription(subscriptionId) {
    try {
      logger.info('❌ Canceling subscription:', subscriptionId);
      const response = await this.makeRequest('setSubscriptionStatus', {
        id: subscriptionId,
        status: 'cancel'
      });
      return response;
    } catch (error) {
      logger.error('❌ Cancel subscription error:', error);
      throw error;
    }
  }

  // Utility methods
  getActionCode(action) {
    return this.actionCodes[action] || action;
  }

  isErrorResponse(response) {
    if (typeof response !== 'string') return false;
    return response.startsWith('ERROR') || 
           response === 'BAD_KEY' || 
           response === 'BAD_ACTION' ||
           response === 'NO_BALANCE' ||
           response === 'NO_NUMBERS';
  }
}

module.exports = new SmsActivateService();