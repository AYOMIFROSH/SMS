// services/smsActivateServices.js - COMPLETE MINIMAL: No rate limits, only what's needed
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

    logger.info('SMS-Activate Service initialized - Direct API calls, no artificial limits');
  }

  // ============================================
  // DIRECT API REQUEST - NO QUEUES, NO DELAYS
  // ============================================
  async makeRequest(action, params = {}) {
    try {
      const requestParams = {
        api_key: this.apiKey,
        action: action,
        ...params
      };

      logger.info(`📡 SMS-Activate Request: ${action}`, { params: Object.keys(params) });

      const response = await axios.get(this.apiUrl, {
        params: requestParams,
        timeout: 60000,
        headers: {
          'User-Agent': 'SMS-Dashboard-Service/1.0',
          'Accept': 'application/json, text/plain, */*'
        }
      });

      logger.info(`✅ SMS-Activate Response: ${response.status}`);

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
        error: error.message,
        status: error.response?.status
      });
      throw this.enhanceError(error);
    }
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
      'WRONG_DOMAIN': 'API key domain restriction'
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
      // Let THEM tell us when we're rate limited
      const enhancedError = new Error('Rate limit exceeded by SMS-Activate API');
      enhancedError.code = 'RATE_LIMIT_EXCEEDED';
      return enhancedError;
    }
    return error;
  }

  // ============================================
  // PRICE FETCHING (Before Purchase)
  // ============================================
  async getPrices(country = null, service = null) {
    try {
      const cacheKey = `sms:prices:${country || 'all'}:${service || 'all'}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        logger.info(`💰 Using cached prices (${country}/${service})`);
        return cached;
      }

      const params = {};
      if (country) params.country = country;
      if (service) params.service = service;

      const response = await this.makeRequest('getPricesExtended', params);

      let prices;
      if (typeof response === 'string') {
        prices = JSON.parse(response);
      } else {
        prices = response;
      }

      const processedPrices = this.processPricesData(prices);

      // Cache for 5 minutes
      await cacheService.set(cacheKey, processedPrices, 300);
      
      return processedPrices;
    } catch (error) {
      logger.error('❌ Get prices error:', error);
      throw error;
    }
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

            // Extract cheapest price from freePriceMap
            if (serviceData.freePriceMap && Object.keys(serviceData.freePriceMap).length > 0) {
              const actualPrices = Object.keys(serviceData.freePriceMap)
                .map(p => parseFloat(p))
                .filter(p => !isNaN(p))
                .sort((a, b) => a - b);
              
              if (actualPrices.length > 0) {
                realPrice = actualPrices[0]; // Cheapest price
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
  // NUMBER PURCHASE (Main Function)
  // ============================================
  async getNumber(service, country = null, operator = null) {
    const params = { service };
    if (country) params.country = country;
    if (operator && operator !== '') params.operator = operator;

    try {
      logger.info('🛒 Purchasing number:', { service, country, operator: operator || 'Any' });
      
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
      logger.error('❌ Purchase failed:', error);
      throw error;
    }
  }

  // ============================================
  // SMS STATUS CHECKING
  // ============================================
  async getStatus(id) {
    try {
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
      const response = await this.makeRequest('setStatus', { id, status });

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

  // ============================================
  // HELPER METHODS
  // ============================================
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
}

module.exports = new SmsActivateService();