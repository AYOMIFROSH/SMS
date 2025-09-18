// services/smsActivateServices.js - FIXED: Rate limiting and request queue
const axios = require('axios');
const logger = require('../utils/logger');
const cacheService = require('./cacheServices');

class SmsActivateService {
  constructor() {
    this.apiUrl = process.env.SMS_ACTIVATE_API_URL || 'https://api.sms-activate.ae/stubs/handler_api.php';
    this.apiKey = process.env.SMS_ACTIVATE_API_KEY;

    // ADDED: Rate limiting controls
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.minRequestDelay = 1000; // 1 second between requests
    this.maxConcurrentRequests = 1; // Only 1 request at a time
    this.rateLimitResetTime = null;

    this.actionMap = {
      getBalance: process.env.SMS_ACTIVATE_ACTION_GET_BALANCE || 'getBalance',
      getServices: process.env.SMS_ACTIVATE_ACTION_GET_SERVICES || 'getServicesList',
      getCountries: process.env.SMS_ACTIVATE_ACTION_GET_COUNTRIES || 'getCountries',
      getOperators: process.env.SMS_ACTIVATE_ACTION_GET_OPERATORS || 'getOperators',
      getPrices: process.env.SMS_ACTIVATE_ACTION_GET_PRICES || 'getPricesExtended',
      getPricesExtended: process.env.SMS_ACTIVATE_ACTION_GET_PRICES_EXTENDED || 'getPricesExtended',
      getNumbersStatus: process.env.SMS_ACTIVATE_ACTION_GET_NUMBERS_STATUS || 'getNumbersStatus',
      getNumber: process.env.SMS_ACTIVATE_ACTION_GET_NUMBER || 'getNumber',
      setStatus: process.env.SMS_ACTIVATE_ACTION_SET_STATUS || 'setStatus',
      getStatus: process.env.SMS_ACTIVATE_ACTION_GET_STATUS || 'getStatus',
      getFullSms: process.env.SMS_ACTIVATE_ACTION_GET_FULL_SMS || 'getFullSms'
    };
    
    this.statusCodes = {
      'STATUS_WAIT_CODE': 'waiting',
      'STATUS_WAIT_RETRY': 'waiting_retry',
      'STATUS_OK': 'received',
      'STATUS_CANCEL': 'cancelled',
      'STATUS_WAIT_RESEND': 'waiting_resend'
    };

    this.actionCodes = {
      CONFIRM_SMS: 1,      
      REQUEST_RETRY: 3,    
      FINISH_ACTIVATION: 6, 
      CANCEL_ACTIVATION: 8  
    };

    logger.info('SMS-Activate Service initialized with rate limiting');
  }

  // ADDED: Queue-based request system to prevent rate limiting
  async queueRequest(action, params = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ action, params, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      // Check if we're in rate limit cooldown
      if (this.rateLimitResetTime && Date.now() < this.rateLimitResetTime) {
        const waitTime = this.rateLimitResetTime - Date.now();
        logger.warn(`⏳ Rate limit cooldown: waiting ${waitTime}ms`);
        await this.sleep(waitTime);
        this.rateLimitResetTime = null;
      }

      // Ensure minimum delay between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestDelay) {
        const delayNeeded = this.minRequestDelay - timeSinceLastRequest;
        logger.info(`⏱️ Request throttling: waiting ${delayNeeded}ms`);
        await this.sleep(delayNeeded);
      }

      const { action, params, resolve, reject } = this.requestQueue.shift();

      try {
        const result = await this.makeDirectRequest(action, params);
        resolve(result);
      } catch (error) {
        // Handle rate limiting
        if (error.response?.status === 429 || error.message.includes('rate limit')) {
          logger.warn('📛 Rate limit hit, backing off for 30 seconds');
          this.rateLimitResetTime = Date.now() + 30000; // 30 second cooldown
          
          // Put the request back at the front of the queue
          this.requestQueue.unshift({ action, params, resolve, reject });
          continue;
        }
        reject(error);
      }

      this.lastRequestTime = Date.now();
    }

    this.isProcessingQueue = false;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Wrapper method that uses the queue
  async makeRequest(action, params = {}) {
    return this.queueRequest(action, params);
  }

  // Direct request method (used by queue processor)
  async makeDirectRequest(action, params = {}) {
    try {
      const providerAction = (this.actionMap && this.actionMap[action]) ? this.actionMap[action] : action;

      const requestParams = {
        api_key: this.apiKey,
        action: providerAction,
        ...params
      };
      
      logger.info(`📡 SMS-Activate API Request - Action: ${action}`, { 
        params: { ...requestParams, api_key: '***HIDDEN***' } // Hide API key in logs
      });
      
      const response = await axios.get(this.apiUrl, {
        params: requestParams,
        timeout: 10000, // Increased timeout
        headers: {
          'User-Agent': 'SMS-Dashboard-Service/2.0',
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      logger.info(`📡 SMS-Activate API Response - Status: ${response.status}`, { 
        data: typeof response.data === 'string' && response.data.length > 200 
          ? response.data.substring(0, 200) + '...' 
          : response.data,
        dataType: typeof response.data 
      });
      
      // Handle error responses
      if (typeof response.data === 'string') {
        if (response.data === 'WRONG_DOMAIN') {
          throw new Error('API key domain restriction: Your SMS-Activate API key is restricted to specific domains. Please contact SMS-Activate support to add your domain or use an unrestricted API key.');
        }
        
        const errorMessage = this.parseErrorResponse(response.data);
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }
      
      return response.data;
    } catch (error) {
      logger.error('❌ SMS-Activate API Error:', {
        action,
        error: error.message,
        status: error.response?.status,
        isRateLimit: error.response?.status === 429
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
      'WRONG_ADDITIONAL_SERVICE': 'Invalid additional service',
      'WRONG_DOMAIN': 'API key domain restriction - contact SMS-Activate support to authorize your domain'
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

  // ENHANCED: Better caching to reduce API calls
  async getBalance() {
    try {
      const cacheKey = 'sms:balance';
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('💰 Using cached balance');
        return cached;
      }

      const response = await this.makeRequest('getBalance');
      
      if (typeof response === 'string' && response.includes(':')) {
        const balance = parseFloat(response.split(':')[1]);
        await cacheService.set(cacheKey, balance, 600); // Cache for 10 minutes
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
      if (cached) {
        logger.info('📋 Using cached services');
        return cached;
      }

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
      'wa': 'messaging', 'tg': 'messaging', 'vi': 'messaging',
      'go': 'social', 'fb': 'social', 'ig': 'social', 'tw': 'social', 'li': 'social',
      'uber': 'services', 'airbnb': 'services', 'netflix': 'entertainment'
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
      if (cached) {
        logger.info('🌍 Using cached countries');
        return cached;
      }

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

  async getOperators(country) {
    try {
      const cacheKey = `sms:operators:${country}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`📡 Using cached operators for country ${country}`);
        return cached;
      }

      const response = await this.makeRequest('getOperators', { country });
      
      let operators;
      if (typeof response === 'string') {
        try {
          operators = JSON.parse(response);
        } catch (e) {
          return [];
        }
      } else {
        operators = response;
      }

      const processedOperators = Object.entries(operators).map(([id, name]) => ({
        id,
        name,
        country
      }));

      await cacheService.set(cacheKey, processedOperators, 3600); // Cache for 1 hour
      return processedOperators;
    } catch (error) {
      logger.error('❌ Get operators error:', error);
      return [];
    }
  }

  // ENHANCED: Better price extraction with freePriceMap handling
  async getPrices(country = null, service = null, operator = null) {
    try {
      const cacheKey = `sms:prices:${country || 'all'}:${service || 'all'}:${operator || 'all'}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info(`💰 Using cached prices for ${service || 'all'} in ${country || 'all'}`);
        return cached;
      }

      const params = {};
      if (country) params.country = country;
      if (service) params.service = service;

      const response = await this.makeRequest('getPricesExtended', params);
      
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

      // ENHANCED: Process prices to extract real prices from freePriceMap
      const processedPrices = this.processPricesWithFreePriceMap(prices);

      await cacheService.set(cacheKey, processedPrices, 1200); // Cache for 20 minutes
      return processedPrices;
    } catch (error) {
      logger.error('❌ Get prices error:', error);
      throw error;
    }
  }

  // ADDED: Process prices with freePriceMap extraction
  processPricesWithFreePriceMap(prices) {
    if (!prices || typeof prices !== 'object') return {};

    const processed = {};

    Object.entries(prices).forEach(([countryCode, countryData]) => {
      if (typeof countryData === 'object') {
        processed[countryCode] = {};

        Object.entries(countryData).forEach(([serviceCode, serviceData]) => {
          if (typeof serviceData === 'object') {
            let realPrice = 0;
            let availableCount = parseInt(serviceData.count || 0);

            // CRITICAL: Extract real price from freePriceMap
            if (serviceData.freePriceMap && Object.keys(serviceData.freePriceMap).length > 0) {
              const actualPrices = Object.keys(serviceData.freePriceMap);
              realPrice = parseFloat(actualPrices[0]); // Use the actual price
              
              const priceMapCount = parseInt(serviceData.freePriceMap[actualPrices[0]] || 0);
              if (priceMapCount > 0) {
                availableCount = priceMapCount;
              }
            } else {
              // Fallback to cost field if freePriceMap is not available
              realPrice = parseFloat(serviceData.cost || 0);
            }

            processed[countryCode][serviceCode] = {
              cost: realPrice, // Store the REAL price here
              realPrice: realPrice,
              misleadingCost: parseFloat(serviceData.cost || 0),
              count: availableCount,
              available: availableCount > 0,
              freePriceMap: serviceData.freePriceMap || {}
            };
          }
        });
      }
    });

    return processed;
  }

  async getNumbersStatus(country = null, operator = null) {
    const params = {};
    if (country) params.country = country;
    if (operator) params.operator = operator;
    
    try {
      const cacheKey = `sms:numbers_status:${country || 'all'}:${operator || 'all'}`;
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.info('📊 Using cached numbers status');
        return cached;
      }

      const response = await this.makeRequest('getNumbersStatus', params);
      
      // Cache the response for 5 minutes
      await cacheService.set(cacheKey, response, 300);
      return response;
    } catch (error) {
      logger.error('❌ Get numbers status error:', error);
      throw error;
    }
  }

  // ... (rest of the methods remain the same)
  
  async getNumber(service, country = null, operator = null, maxPrice = null) {
    const params = { service };
    if (country) params.country = country;
    if (operator) params.operator = operator;
    
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
      logger.info('📋 Getting status for:', id);
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

  getActionCode(action) {
    return this.actionCodes[action] || action;
  }

  isErrorResponse(response) {
    if (typeof response !== 'string') return false;
    return response.startsWith('ERROR') || 
           response === 'BAD_KEY' || 
           response === 'BAD_ACTION' ||
           response === 'NO_BALANCE' ||
           response === 'NO_NUMBERS' ||
           response === 'WRONG_DOMAIN';
  }

  // ADDED: Get queue status for debugging
  getQueueStatus() {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
      rateLimitActive: this.rateLimitResetTime && Date.now() < this.rateLimitResetTime,
      rateLimitResetTime: this.rateLimitResetTime
    };
  }
}

module.exports = new SmsActivateService();