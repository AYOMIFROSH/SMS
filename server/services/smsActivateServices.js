// services/smsActivateServices.js - PRODUCTION: Optimized WITHOUT proxies
const axios = require('axios');
const logger = require('../utils/logger');
const cacheService = require('./cacheServices');

class SmsActivateService {
  constructor() {
    this.apiUrl = process.env.SMS_ACTIVATE_API_URL || 'https://api.sms-activate.ae/stubs/handler_api.php';
    this.apiKey = process.env.SMS_ACTIVATE_API_KEY;

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

    // Request tracking and throttling
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1500; // 1.5 seconds between requests
    this.requestCount = 0;
    this.rateLimitResetTime = null;

    // Track consecutive errors to implement cooling period
    this.consecutiveErrors = 0;
    this.coolingPeriod = 0;

    logger.info('✅ SMS-Activate Service initialized - Request queue management active');
  }

  // ============================================
  // REQUEST QUEUE SYSTEM
  // ============================================
  async makeRequest(action, params = {}, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const request = {
        action,
        params,
        priority,
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3
      };

      // High priority requests (like purchase) go to front of queue
      if (priority === 'high') {
        this.requestQueue.unshift(request);
      } else {
        this.requestQueue.push(request);
      }

      logger.debug(`📥 Request queued [${action}] - Queue length: ${this.requestQueue.length}`);

      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      // Check if we're in cooling period
      if (this.coolingPeriod > 0) {
        const waitTime = this.coolingPeriod;
        logger.warn(`❄️ Cooling period active - waiting ${waitTime}ms before next request`);
        await this.sleep(waitTime);
        this.coolingPeriod = 0;
      }

      // Enforce minimum interval between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.minRequestInterval) {
        const waitTime = this.minRequestInterval - timeSinceLastRequest;
        logger.debug(`⏳ Enforcing ${waitTime}ms delay between requests`);
        await this.sleep(waitTime);
      }

      const request = this.requestQueue.shift();
      
      try {
        const result = await this.executeRequest(request);
        request.resolve(result);
        this.consecutiveErrors = 0; // Reset error counter on success
      } catch (error) {
        this.handleRequestError(request, error);
      }

      this.lastRequestTime = Date.now();
    }

    this.isProcessingQueue = false;
  }

  async executeRequest(request) {
    const { action, params, retryCount } = request;

    try {
      const requestParams = {
        api_key: this.apiKey,
        action: action,
        ...params
      };

      logger.info(`📡 SMS-Activate [${action}] (attempt ${retryCount + 1}/${request.maxRetries + 1})`, {
        queueLength: this.requestQueue.length,
        consecutiveErrors: this.consecutiveErrors
      });

      this.requestCount++;

      const response = await axios.get(this.apiUrl, {
        params: requestParams,
        timeout: 60000,
        headers: {
          'User-Agent': 'SMS-Dashboard-Service/2.0',
          'Accept': 'application/json, text/plain, */*'
        }
      });

      logger.info(`✅ SMS-Activate Response [${action}]: ${response.status}`);

      // Handle error responses
      if (typeof response.data === 'string') {
        const errorMessage = this.parseErrorResponse(response.data);
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      }

      return response.data;

    } catch (error) {
      logger.error(`❌ SMS-Activate API Error [${action}]:`, {
        error: error.message,
        status: error.response?.status,
        attempt: retryCount + 1
      });

      throw error;
    }
  }

  handleRequestError(request, error) {
    const { action, retryCount, maxRetries, reject } = request;

    // Handle rate limiting
    if (this.isRateLimitError(error) || error.response?.status === 429) {
      this.consecutiveErrors++;

      if (retryCount < maxRetries) {
        // Calculate backoff time
        const backoffTime = this.calculateBackoff(retryCount);
        
        logger.warn(`⏰ Rate limit detected - retry ${retryCount + 1}/${maxRetries} after ${backoffTime}ms`, {
          consecutiveErrors: this.consecutiveErrors
        });

        // Increase cooling period based on consecutive errors
        if (this.consecutiveErrors > 2) {
          this.coolingPeriod = Math.min(this.consecutiveErrors * 5000, 30000); // Max 30s
          logger.warn(`❄️ Setting cooling period: ${this.coolingPeriod}ms due to ${this.consecutiveErrors} consecutive errors`);
        }

        // Re-queue with incremented retry count
        request.retryCount++;
        this.requestQueue.unshift(request); // High priority for retries

        // Wait before continuing queue processing
        setTimeout(() => {
          if (!this.isProcessingQueue) {
            this.processQueue();
          }
        }, backoffTime);

        return;
      } else {
        const enhancedError = new Error('Rate limit exceeded - Please wait 60 seconds before trying again');
        enhancedError.code = 'RATE_LIMIT_EXCEEDED';
        enhancedError.retryAfter = 60;
        reject(enhancedError);
        return;
      }
    }

    // Other errors - reject immediately
    reject(this.enhanceError(error));
  }

  isRateLimitError(error) {
    const errorStr = error.message?.toLowerCase() || '';
    const responseData = error.response?.data?.toLowerCase() || '';
    
    return errorStr.includes('rate limit') ||
           errorStr.includes('too many requests') ||
           errorStr.includes('banned') ||
           responseData.includes('banned') ||
           responseData.includes('flood') ||
           error.response?.status === 429;
  }

  calculateBackoff(retryCount) {
    // Exponential backoff: 3s, 6s, 12s, 24s
    const baseDelay = 3000;
    const maxDelay = 45000; // Cap at 45 seconds
    const calculatedDelay = baseDelay * Math.pow(2, retryCount);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 2000;
    
    return Math.min(calculatedDelay + jitter, maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  parseErrorResponse(response) {
    const errorMap = {
      'BAD_KEY': 'Invalid API key',
      'BAD_SERVICE': 'Invalid service code',
      'NO_NUMBERS': 'No numbers available for this service/country',
      'NO_BALANCE': 'Insufficient balance in SMS-Activate account',
      'NO_ACTIVATION': 'Activation ID not found',
      'ACTIVATION_USED': 'Activation already completed',
      'WRONG_ACTIVATION_ID': 'Invalid activation ID',
      'WRONG_DOMAIN': 'API key domain restriction',
      'BANNED': 'Account temporarily restricted - rate limit exceeded'
    };

    if (errorMap[response]) return errorMap[response];
    if (response.startsWith('ERROR')) return `SMS-Activate Error: ${response}`;
    return null;
  }

  enhanceError(error) {
    if (error.code === 'ETIMEDOUT') {
      return new Error('Request timeout - SMS-Activate API slow');
    }
    if (error.response?.status === 429) {
      const enhancedError = new Error('Rate limit exceeded by SMS-Activate API');
      enhancedError.code = 'RATE_LIMIT_EXCEEDED';
      enhancedError.retryAfter = 60;
      return enhancedError;
    }
    return error;
  }

  // ============================================
  // AGGRESSIVE PRICE CACHING
  // ============================================
  async getPrices(country = null, service = null, forceRefresh = false) {
    try {
      const cacheKey = `sms:prices:${country || 'all'}:${service || 'all'}`;
      
      // AGGRESSIVE CACHE: 10 minutes for specific, 15 minutes for bulk
      const cacheTTL = (country && service) ? 600 : 900;
      
      if (!forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          logger.info(`💾 Using cached prices (${country}/${service}) - age: ${this.getCacheAge(cached)}s`);
          return cached;
        }
      }

      const params = {};
      if (country) params.country = country;
      if (service) params.service = service;

      logger.info('🔄 Fetching prices from SMS-Activate', { country, service, forceRefresh });

      // Use normal priority for price fetching
      const response = await this.makeRequest('getPricesExtended', params, 'normal');

      let prices;
      if (typeof response === 'string') {
        prices = JSON.parse(response);
      } else {
        prices = response;
      }

      const processedPrices = this.processPricesData(prices);

      // Add timestamp to cache
      processedPrices._cachedAt = Date.now();

      // Cache with TTL
      await cacheService.set(cacheKey, processedPrices, cacheTTL);
      
      logger.info(`✅ Prices cached for ${cacheTTL}s`);
      
      return processedPrices;
    } catch (error) {
      logger.error('❌ Get prices error:', error);
      
      // ALWAYS try to return cached data if API fails
      const cacheKey = `sms:prices:${country || 'all'}:${service || 'all'}`;
      const staleCache = await cacheService.get(cacheKey);
      if (staleCache) {
        const age = this.getCacheAge(staleCache);
        logger.warn(`⚠️ Returning stale cached prices (${age}s old) due to API error`);
        return staleCache;
      }
      
      throw error;
    }
  }

  getCacheAge(cachedData) {
    if (!cachedData._cachedAt) return 'unknown';
    return Math.floor((Date.now() - cachedData._cachedAt) / 1000);
  }

  processPricesData(prices) {
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
              const actualPrices = Object.keys(serviceData.freePriceMap)
                .map(p => parseFloat(p))
                .filter(p => !isNaN(p))
                .sort((a, b) => a - b);
              
              if (actualPrices.length > 0) {
                realPrice = actualPrices[0];
              }
            } else {
              realPrice = parseFloat(serviceData.cost || 0);
            }

            processed[countryCode][serviceCode] = {
              cost: realPrice,
              realPrice: realPrice,
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

  // ============================================
  // NUMBER PURCHASE - HIGH PRIORITY
  // ============================================
  async getNumber(service, country = null, operator = null) {
    const params = { service };
    if (country) params.country = country;
    if (operator && operator !== '') params.operator = operator;

    try {
      logger.info('🛒 Purchasing number (HIGH PRIORITY):', { service, country, operator: operator || 'Any' });
      
      // HIGH PRIORITY - goes to front of queue
      const response = await this.makeRequest('getNumber', params, 'high');

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
      logger.error('❌ Purchase failed:', error);
      throw error;
    }
  }

  // ============================================
  // SMS STATUS CHECKING
  // ============================================
  async getStatus(id) {
    try {
      const response = await this.makeRequest('getStatus', { id }, 'normal');

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
          if (errorMessage) throw new Error(errorMessage);
        }
      }

      return { status: 'unknown', code: null, text: null };
    } catch (error) {
      logger.error('❌ Get status error:', error);
      throw error;
    }
  }

  async setStatus(id, status) {
    try {
      const response = await this.makeRequest('setStatus', { id, status }, 'normal');

      if (typeof response === 'string' && response === 'ACCESS_READY') {
        return { success: true, message: 'Status updated' };
      }

      return response;
    } catch (error) {
      logger.error('❌ Set status error:', error);
      throw error;
    }
  }

  async getFullSms(id) {
    try {
      const response = await this.makeRequest('getFullSms', { id }, 'normal');

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

  // ============================================
  // DIAGNOSTICS & MONITORING
  // ============================================
  getStats() {
    return {
      totalRequests: this.requestCount,
      queueLength: this.requestQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      consecutiveErrors: this.consecutiveErrors,
      coolingPeriod: this.coolingPeriod,
      lastRequestTime: this.lastRequestTime,
      minRequestInterval: this.minRequestInterval
    };
  }

  // Clear queue (emergency use only)
  clearQueue() {
    const clearedCount = this.requestQueue.length;
    this.requestQueue = [];
    logger.warn(`🗑️ Queue cleared - ${clearedCount} requests dropped`);
    return clearedCount;
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
      response === 'WRONG_DOMAIN' ||
      response === 'BANNED';
  }
}

module.exports = new SmsActivateService();