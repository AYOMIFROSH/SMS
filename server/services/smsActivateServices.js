// services/smsActivateServices.js - ENHANCED: Better rate limit responses
const axios = require('axios');
const logger = require('../utils/logger');
const cacheService = require('./cacheServices');

class SmsActivateService {
  constructor() {
    this.apiUrl = process.env.SMS_ACTIVATE_API_URL || 'https://api.sms-activate.ae/stubs/handler_api.php';
    this.apiKey = process.env.SMS_ACTIVATE_API_KEY;

    // Rate limiting controls
    this.readQueue = [];    
    this.writeQueue = [];   
    this.readConcurrency = 3;      // REDUCED from 5 to 3
    this.writeConcurrency = 1;     
    this.currentRead = 0;
    this.currentWrite = 0;
    this.minRequestDelayRead = 500;   // INCREASED from 200ms to 500ms
    this.minRequestDelayWrite = 2000; // INCREASED from 1000ms to 2000ms
    this.backoff = { multiplier: 1, maxMultiplier: 8 }; // INCREASED max multiplier
    this.consecutive429s = 0;
    this.globalRateLimitReset = null;

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

    logger.info('SMS-Activate Service initialized with enhanced rate limiting');
  }

  async queueRequest(action, params = {}, options = { type: 'read' }) {
    return new Promise((resolve, reject) => {
      const entry = { action, params, options, resolve, reject, createdAt: Date.now() };
      if (options.type === 'write') {
        this.writeQueue.push(entry);
        this.processWriteQueue();
      } else {
        this.readQueue.push(entry);
        this.processReadQueue();
      }
    });
  }

  _computeDelay(type) {
    const base = type === 'write' ? this.minRequestDelayWrite : this.minRequestDelayRead;
    const mult = Math.min(this.backoff.multiplier, this.backoff.maxMultiplier);
    const jitter = Math.floor(Math.random() * 500); // INCREASED jitter
    return base * mult + jitter;
  }

  async processReadQueue() {
    if (this.globalRateLimitReset && Date.now() < this.globalRateLimitReset) return;
    while (this.readQueue.length > 0 && this.currentRead < this.readConcurrency) {
      const entry = this.readQueue.shift();
      this.currentRead++;
      (async () => {
        try {
          const since = Date.now() - (this.lastRequestTime || 0);
          const delayNeeded = this.minRequestDelayRead - since;
          if (delayNeeded > 0) await this.sleep(delayNeeded);

          const res = await this.makeDirectRequest(entry.action, entry.params);
          this.consecutive429s = Math.max(0, this.consecutive429s - 1);
          this.backoff.multiplier = Math.max(1, this.backoff.multiplier - 0.5);

          entry.resolve(res);
        } catch (err) {
          if (err.response?.status === 429) {
            this.consecutive429s++;
            const ra = err.response?.headers?.['retry-after'];
            let cooldownMs = 45000; // INCREASED default cooldown
            if (ra) {
              const raSec = parseInt(ra, 10);
              if (!Number.isNaN(raSec)) cooldownMs = raSec * 1000;
            } else {
              this.backoff.multiplier = Math.min(this.backoff.maxMultiplier, this.backoff.multiplier * 2.5); // INCREASED multiplier
              cooldownMs = Math.min(120000, this._computeDelay('read') * 15); // INCREASED multiplier
            }
            this.globalRateLimitReset = Date.now() + cooldownMs;
            
            // ENHANCED: Better rate limit error message
            const enhancedError = new Error(`Rate limit exceeded. Our provider is processing high traffic. Please wait ${Math.ceil(cooldownMs/1000)} seconds and try again.`);
            enhancedError.code = 'RATE_LIMIT_EXCEEDED';
            enhancedError.retryAfter = Math.ceil(cooldownMs/1000);
            entry.reject(enhancedError);
          } else {
            entry.reject(err);
          }
        } finally {
          this.currentRead = Math.max(0, this.currentRead - 1);
          this.lastRequestTime = Date.now();
        }
      })();
    }
  }

  async processWriteQueue() {
    if (this.globalRateLimitReset && Date.now() < this.globalRateLimitReset) return;
    if (this.currentWrite > 0) return;
    if (this.writeQueue.length === 0) return;

    const entry = this.writeQueue.shift();
    this.currentWrite = 1;

    try {
      const since = Date.now() - (this.lastRequestTime || 0);
      const delayNeeded = this.minRequestDelayWrite - since;
      if (delayNeeded > 0) await this.sleep(delayNeeded);

      const res = await this.makeDirectRequest(entry.action, entry.params);
      this.consecutive429s = Math.max(0, this.consecutive429s - 1);
      this.backoff.multiplier = 1;

      entry.resolve(res);
    } catch (err) {
      if (err.response?.status === 429) {
        this.consecutive429s++;
        const ra = err.response?.headers?.['retry-after'];
        let cooldownMs = 30000; // INCREASED default
        if (ra) {
          const raSec = parseInt(ra, 10);
          if (!Number.isNaN(raSec)) cooldownMs = raSec * 1000;
        } else {
          this.backoff.multiplier = Math.min(this.backoff.maxMultiplier, this.backoff.multiplier * 3); // INCREASED
          cooldownMs = Math.min(180000, this.minRequestDelayWrite * this.backoff.multiplier + Math.floor(Math.random() * 10000)); // INCREASED
        }
        this.globalRateLimitReset = Date.now() + cooldownMs;
        
        // ENHANCED: Better rate limit error for purchases
        const enhancedError = new Error(`Our provider is getting the best number for you. Please try again in ${Math.ceil(cooldownMs/1000)} seconds.`);
        enhancedError.code = 'RATE_LIMIT_EXCEEDED';
        enhancedError.retryAfter = Math.ceil(cooldownMs/1000);
        entry.reject(enhancedError);
      } else {
        entry.reject(err);
      }
    } finally {
      this.currentWrite = 0;
      this.lastRequestTime = Date.now();
      setImmediate(() => {
        this.processReadQueue();
        this.processWriteQueue();
      });
    }
  }

  async makeRequest(action, params = {}, options = { type: 'read' }) {
    return this.queueRequest(action, params, options);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeDirectRequest(action, params = {}) {
    try {
      const providerAction = (this.actionMap && this.actionMap[action]) ? this.actionMap[action] : action;

      const requestParams = {
        api_key: this.apiKey,
        action: providerAction,
        ...params
      };

      logger.info(`📡 SMS-Activate API Request - Action: ${action}`, {
        params: { ...requestParams, api_key: '***HIDDEN***' }
      });

      const response = await axios.get(this.apiUrl, {
        params: requestParams,
        timeout: 60000, // INCREASED timeout
        headers: {
          'User-Agent': 'SMS-Dashboard-Service/1.0',
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
      // ENHANCED: Better rate limit error message
      const enhancedError = new Error('Rate limit exceeded. Our provider is experiencing high traffic. Please wait 30 seconds and try again.');
      enhancedError.code = 'RATE_LIMIT_EXCEEDED';
      enhancedError.retryAfter = 30;
      return enhancedError;
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
        await cacheService.set(cacheKey, balance, 900); // INCREASED cache time to 15 minutes
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
      await cacheService.cacheServices(processedServices, 7200); // INCREASED cache time to 2 hours

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

      await cacheService.cacheCountries(processedCountries, 7200); // INCREASED cache time to 2 hours
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

      let processedResponse;
      if (typeof response === 'object' && response.status === 'success') {
        processedResponse = response;
      } else if (typeof response === 'string') {
        try {
          processedResponse = JSON.parse(response);
        } catch (e) {
          logger.warn(`Failed to parse operators response for country ${country}:`, response);
          processedResponse = { status: 'success', countryOperators: {} };
        }
      } else {
        processedResponse = response;
      }

      await cacheService.set(cacheKey, processedResponse, 7200); // INCREASED cache time to 2 hours
      return processedResponse;
    } catch (error) {
      logger.error('❌ Get operators error:', error);
      return { status: 'success', countryOperators: {} };
    }
  }

  // ENHANCED: Better price extraction with longer cache
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

      const processedPrices = this.processPricesWithFreePriceMap(prices);

      await cacheService.set(cacheKey, processedPrices, 300); // Keep 5 minutes for prices as they change frequently
      return processedPrices;
    } catch (error) {
      logger.error('❌ Get prices error:', error);
      throw error;
    }
  }

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

            if (serviceData.freePriceMap && Object.keys(serviceData.freePriceMap).length > 0) {
              const actualPrices = Object.keys(serviceData.freePriceMap).map(p => parseFloat(p));
              actualPrices.sort((a, b) => a - b);
              realPrice = actualPrices[0];

              const cheapestPriceStr = realPrice.toFixed(4);
              const priceMapCount = parseInt(serviceData.freePriceMap[cheapestPriceStr] || 0);
              if (priceMapCount > 0) {
                availableCount = priceMapCount;
              }
            } else {
              realPrice = parseFloat(serviceData.cost || 0);
            }

            processed[countryCode][serviceCode] = {
              cost: realPrice,
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
      await cacheService.set(cacheKey, response, 600); // Cache for 10 minutes
      return response;
    } catch (error) {
      logger.error('❌ Get numbers status error:', error);
      throw error;
    }
  }

  async getNumber(service, country = null, operator = null, maxPrice = null) {
    const params = { service };
    if (country) params.country = country;
    if (operator) params.operator = operator;

    try {
      logger.info('📱 Purchasing number:', params);
      const response = await this.makeRequest('getNumber', params, { type: 'write' }); // FIXED: Mark as write operation

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
      const response = await this.makeRequest('setStatus', params, { type: 'write' }); // FIXED: Mark as write operation

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

  getQueueStatus() {
    return {
      readQueue: this.readQueue.length,
      writeQueue: this.writeQueue.length,
      activeReads: this.currentRead,
      activeWrites: this.currentWrite,
      rateLimitActive: this.globalRateLimitReset && Date.now() < this.globalRateLimitReset,
      rateLimitResetTime: this.globalRateLimitReset,
      consecutive429s: this.consecutive429s,
      backoffMultiplier: this.backoff.multiplier
    };
  }
}

module.exports = new SmsActivateService();