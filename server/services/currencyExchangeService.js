// services/currencyExchangeService.js - Professional Exchange Rate Service
const axios = require('axios');
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

class CurrencyExchangeService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    this.apiTimeout = 10000; // 10 seconds timeout
    
    // Exchange rate APIs in order of preference
    this.exchangeAPIs = [
      {
        name: 'exchangerate.host',
        url: (from, to) => `https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=1`,
        parseResponse: (data) => data?.success && data?.result ? parseFloat(data.result) : null
      },
      {
        name: 'fixer.io',
        url: (from, to) => {
          if (from === 'EUR') {
            return `https://data.fixer.io/api/latest?access_key=${process.env.EXCHANGE_API_KEY}&format=1&symbols=${to}`;
          } else if (to === 'EUR') {
            return `https://data.fixer.io/api/latest?access_key=${process.env.EXCHANGE_API_KEY}&format=1&symbols=${from}`;
          } else {
            return `https://data.fixer.io/api/latest?access_key=${process.env.EXCHANGE_API_KEY}&format=1&symbols=${from},${to}`;
          }
        },
        parseResponse: (data, from, to) => {
          if (!data?.success || !data?.rates) return null;
          
          if (from === 'EUR') {
            return data.rates[to] || null;
          } else if (to === 'EUR') {
            return 1 / (data.rates[from] || 1);
          } else {
            const eurToFrom = data.rates[from];
            const eurToTarget = data.rates[to];
            return (eurToFrom && eurToTarget) ? eurToTarget / eurToFrom : null;
          }
        }
      },
      {
        name: 'exchangeratesapi.io',
        url: (from, to) => `https://api.exchangeratesapi.io/v1/latest?access_key=${process.env.EXCHANGERATESAPI_KEY}&base=${from}&symbols=${to}`,
        parseResponse: (data) => data?.success && data?.rates ? Object.values(data.rates)[0] : null
      }
    ];
  }

  /**
   * Enhanced exchange rate fetching with multiple fallbacks
   * Maintains backward compatibility with existing FlutterwaveService
   */
  async getExchangeRate(fromCurrency = 'USD', toCurrency = 'NGN') {
    const pool = getPool();
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    
    try {
      // 1. Check memory cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        const now = Date.now();
        
        if (now - cached.timestamp < this.cacheTimeout) {
          logger.info('Using memory cached exchange rate:', { 
            rate: cached.rate, 
            age: Math.round((now - cached.timestamp) / 1000) + 's',
            fromCurrency,
            toCurrency
          });
          return parseFloat(cached.rate);
        } else {
          // Remove expired cache
          this.cache.delete(cacheKey);
        }
      }

      // 2. Check database cache (1 hour validity)
      const [dbCached] = await pool.execute(
        'SELECT rate, expires_at FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND expires_at > NOW()',
        [fromCurrency, toCurrency]
      );

      if (dbCached.length > 0) {
        const rate = parseFloat(dbCached[0].rate);
        
        // Update memory cache
        this.cache.set(cacheKey, {
          rate: rate,
          timestamp: Date.now()
        });
        
        logger.info('Using database cached exchange rate:', { 
          rate, 
          expires: dbCached[0].expires_at,
          fromCurrency,
          toCurrency
        });
        return rate;
      }

      // 3. Fetch from APIs with fallback chain
      let rate = null;
      let apiUsed = null;
      let apiError = null;

      for (const api of this.exchangeAPIs) {
        try {
          const url = api.url(fromCurrency, toCurrency);
          logger.info(`Attempting to fetch rate from ${api.name}:`, { url: url.replace(/access_key=[^&]+/, 'access_key=***') });
          
          const response = await axios.get(url, {
            timeout: this.apiTimeout,
            headers: {
              'User-Agent': 'SMSPlatform/1.0'
            }
          });
          
          rate = api.parseResponse(response.data, fromCurrency, toCurrency);
          
          if (rate && !isNaN(rate) && rate > 0) {
            apiUsed = api.name;
            logger.info(`Successfully fetched rate from ${api.name}:`, { 
              rate, 
              fromCurrency, 
              toCurrency 
            });
            break;
          }
        } catch (error) {
          apiError = error.message;
          logger.warn(`${api.name} API failed:`, { 
            error: error.message,
            fromCurrency,
            toCurrency
          });
          continue;
        }
      }

      // 4. Apply currency-specific fallback rates if all APIs fail
      if (!rate) {
        rate = this.getFallbackRate(fromCurrency, toCurrency);
        apiUsed = 'fallback';
        logger.warn(`Using fallback exchange rate:`, { 
          rate, 
          fromCurrency, 
          toCurrency,
          lastError: apiError
        });
      }

      // 5. Validate rate
      if (!rate || isNaN(rate) || rate <= 0) {
        throw new Error(`Invalid exchange rate calculated: ${rate}`);
      }

      // 6. Cache the rate in both memory and database
      try {
        // Memory cache
        this.cache.set(cacheKey, {
          rate: rate,
          timestamp: Date.now()
        });

        // Database cache (1 hour expiry)
        await pool.execute(
          `INSERT INTO exchange_rates (from_currency, to_currency, rate, expires_at, api_source) 
           VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)
           ON DUPLICATE KEY UPDATE 
             rate = VALUES(rate), 
             expires_at = VALUES(expires_at),
             api_source = VALUES(api_source),
             updated_at = NOW()`,
          [fromCurrency, toCurrency, rate, apiUsed]
        );

        logger.info('Exchange rate cached successfully:', {
          fromCurrency,
          toCurrency,
          rate,
          apiUsed
        });
      } catch (cacheError) {
        logger.warn('Failed to cache exchange rate:', cacheError.message);
      }

      return parseFloat(rate.toFixed(6));

    } catch (error) {
      logger.error('Exchange rate fetch error:', {
        error: error.message,
        fromCurrency,
        toCurrency
      });

      // 7. Final fallback: try to get any cached rate (even expired)
      try {
        const [expiredCache] = await pool.execute(
          'SELECT rate, updated_at FROM exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY updated_at DESC LIMIT 1',
          [fromCurrency, toCurrency]
        );
        
        if (expiredCache.length > 0) {
          const fallbackRate = parseFloat(expiredCache[0].rate);
          logger.warn('Using expired cached rate due to fetch failure:', {
            rate: fallbackRate,
            lastUpdated: expiredCache[0].updated_at,
            fromCurrency,
            toCurrency
          });
          return fallbackRate;
        }
      } catch (fallbackError) {
        logger.error('Failed to get fallback rate:', fallbackError.message);
      }

      // 8. Ultimate fallback
      const ultimateFallback = this.getFallbackRate(fromCurrency, toCurrency);
      logger.error('Using ultimate fallback rate:', {
        rate: ultimateFallback,
        fromCurrency,
        toCurrency,
        originalError: error.message
      });
      
      return ultimateFallback;
    }
  }

  /**
   * Get hardcoded fallback rates for critical currency pairs
   */
  getFallbackRate(fromCurrency, toCurrency) {
    const fallbackRates = {
      'USD_NGN': 1520.00,
      'EUR_NGN': 1650.00,
      'GBP_NGN': 1900.00,
      'USD_EUR': 0.85,
      'EUR_USD': 1.18,
      'GBP_USD': 1.25,
      'USD_GBP': 0.80
    };

    const key = `${fromCurrency}_${toCurrency}`;
    const reverseKey = `${toCurrency}_${fromCurrency}`;

    if (fallbackRates[key]) {
      return fallbackRates[key];
    } else if (fallbackRates[reverseKey]) {
      return 1 / fallbackRates[reverseKey];
    }

    // Default fallback for unknown pairs
    if (toCurrency === 'NGN') {
      return 1520.00; // Assume USD base
    } else if (fromCurrency === 'NGN') {
      return 0.000658; // 1/1520
    }

    return 1.00; // Same currency fallback
  }

  /**
   * Convert amount from one currency to another
   * Maintains compatibility with existing deposit calculations
   */
  async convertCurrency(amount, fromCurrency, toCurrency) {
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount for currency conversion');
    }

    if (fromCurrency === toCurrency) {
      return {
        originalAmount: amount,
        convertedAmount: amount,
        exchangeRate: 1.0,
        fromCurrency,
        toCurrency
      };
    }

    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = amount * exchangeRate;

    return {
      originalAmount: parseFloat(amount.toFixed(2)),
      convertedAmount: parseFloat(convertedAmount.toFixed(2)),
      exchangeRate: parseFloat(exchangeRate.toFixed(6)),
      fromCurrency,
      toCurrency,
      timestamp: Date.now()
    };
  }

  /**
   * Bulk convert multiple amounts (useful for transaction processing)
   */
  async bulkConvert(conversions) {
    const results = [];
    
    for (const { amount, fromCurrency, toCurrency, reference } of conversions) {
      try {
        const result = await this.convertCurrency(amount, fromCurrency, toCurrency);
        results.push({
          reference,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          reference,
          success: false,
          error: error.message,
          originalAmount: amount,
          fromCurrency,
          toCurrency
        });
      }
    }

    return results;
  }

  /**
   * Get exchange rate history for analytics
   */
  async getRateHistory(fromCurrency, toCurrency, days = 30) {
    const pool = getPool();
    
    try {
      const [history] = await pool.execute(
        `SELECT rate, api_source, created_at, updated_at 
         FROM exchange_rates 
         WHERE from_currency = ? AND to_currency = ? 
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY created_at DESC`,
        [fromCurrency, toCurrency, days]
      );

      return history.map(record => ({
        rate: parseFloat(record.rate),
        source: record.api_source,
        timestamp: record.created_at,
        updated: record.updated_at
      }));
    } catch (error) {
      logger.error('Failed to get rate history:', error);
      return [];
    }
  }

  /**
   * Clear all caches (memory and optionally database)
   */
  async clearCache(clearDatabase = false) {
    try {
      // Clear memory cache
      this.cache.clear();
      logger.info('Memory cache cleared');

      if (clearDatabase) {
        const pool = getPool();
        await pool.execute('DELETE FROM exchange_rates WHERE expires_at < NOW()');
        logger.info('Expired database cache cleared');
      }

      return { success: true, message: 'Cache cleared successfully' };
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Health check for the exchange rate service
   */
  async healthCheck() {
    try {
      // Test a simple conversion
      const testRate = await this.getExchangeRate('USD', 'NGN');
      
      const memoryCache = {
        size: this.cache.size,
        keys: Array.from(this.cache.keys())
      };

      // Check database connectivity
      const pool = getPool();
      const [dbTest] = await pool.execute('SELECT COUNT(*) as count FROM exchange_rates');
      
      return {
        status: 'healthy',
        testRate: {
          pair: 'USD/NGN',
          rate: testRate
        },
        memoryCache,
        databaseRecords: dbTest[0].count,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
module.exports = new CurrencyExchangeService();

// =============================================================================
// INTEGRATION PATCH FOR EXISTING FLUTTERWAVESERVICE
// =============================================================================

/**
 * Enhanced getExchangeRate method replacement for FlutterwaveService
 * This is a drop-in replacement that maintains backward compatibility
 */
const enhancedGetExchangeRate = async function(fromCurrency = 'USD', toCurrency = 'NGN') {
  const currencyService = require('./currencyExchangeService');
  
  try {
    // Use the professional currency exchange service
    const rate = await currencyService.getExchangeRate(fromCurrency, toCurrency);
    
    // Log for compatibility with existing monitoring
    logger.info('Enhanced exchange rate fetched:', {
      fromCurrency,
      toCurrency,
      rate,
      service: 'enhanced'
    });
    
    return rate;
  } catch (error) {
    // Fallback to original logic if enhanced service fails
    logger.warn('Enhanced service failed, using original fallback:', error.message);
    
    const pool = getPool();
    
    // Try database cache
    try {
      const [fallback] = await pool.execute(
        'SELECT rate FROM exchange_rates WHERE from_currency = ? AND to_currency = ? ORDER BY created_at DESC LIMIT 1',
        [fromCurrency, toCurrency]
      );
      
      if (fallback.length > 0) {
        return parseFloat(fallback[0].rate);
      }
    } catch (dbError) {
      logger.error('Database fallback failed:', dbError.message);
    }
    
    // Ultimate hardcoded fallback
    return fromCurrency === 'USD' && toCurrency === 'NGN' ? 1520.00 : 1.00;
  }
};

// Export the enhanced method for easy integration
module.exports.enhancedGetExchangeRate = enhancedGetExchangeRate;