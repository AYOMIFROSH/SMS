// routes/services.js - ENHANCED WITH OPERATORS AND FULL SMS-ACTIVATE INTEGRATION
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPool } = require('../Config/database');
const smsActivateService = require('../services/smsActivateServices');
const cacheService = require('../services/cacheServices');
const {
  rateLimiters,
  validationRules,
  handleValidationErrors,
  csrfProtection
} = require('../middleware/security');
const logger = require('../utils/logger');

const router = express.Router();

// Apply rate limiting
router.use(rateLimiters.api);

// Get available services with enhanced data
router.get('/', authenticateToken, async (req, res) => {
  try {
    logger.info('🔍 Getting services - Enhanced version');

    // Try to get from cache first
    let services = await cacheService.getCachedServices();

    if (!services) {
      // Get from SMS-Activate API
      services = await smsActivateService.getServices();

      // Cache the results
      await cacheService.cacheServices(services);
    }

    // Get user favorites
    const pool = getPool();
    const [favorites] = await pool.execute(
      'SELECT service_code FROM user_favorites WHERE user_id = ?',
      [req.user.id]
    );

    const favoriteServices = favorites.map(f => f.service_code);

    // Enhance services with favorite status
    const enhancedServices = services.map(service => ({
      ...service,
      isFavorite: favoriteServices.includes(service.code)
    }));

    // Sort by popularity and favorites
    enhancedServices.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return a.name.localeCompare(b.name);
    });

    logger.info('✅ Services retrieved successfully:', { count: enhancedServices.length });

    res.json({
      success: true,
      data: enhancedServices,
      total: enhancedServices.length
    });

  } catch (error) {
    logger.error('❌ Services route error:', error);

    // Return fallback services on error
    const fallbackServices = [
      { code: 'wa', name: 'WhatsApp', category: 'messaging', popular: true, isFavorite: false },
      { code: 'tg', name: 'Telegram', category: 'messaging', popular: true, isFavorite: false },
      { code: 'go', name: 'Google', category: 'social', popular: true, isFavorite: false },
      { code: 'fb', name: 'Facebook', category: 'social', popular: true, isFavorite: false },
      { code: 'ig', name: 'Instagram', category: 'social', popular: true, isFavorite: false },
      { code: 'tw', name: 'Twitter', category: 'social', popular: true, isFavorite: false }
    ];

    res.status(500).json({
      error: 'Failed to get services',
      message: error.message,
      fallback: true,
      data: fallbackServices
    });
  }
});

// Get countries with enhanced data
router.get('/countries', authenticateToken, async (req, res) => {
  try {
    logger.info('🔍 Getting countries - Enhanced version');

    let countries = await cacheService.getCachedCountries();

    if (!countries) {
      countries = await smsActivateService.getCountries();
      await cacheService.cacheCountries(countries);
    }

    // Get user's recent country usage
    const pool = getPool();
    const [recentCountries] = await pool.execute(
      `SELECT country_code, COUNT(*) as usage_count
       FROM number_purchases 
       WHERE user_id = ? AND purchase_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY country_code
       ORDER BY usage_count DESC
       LIMIT 5`,
      [req.user.id]
    );

    const recentCountryMap = {};
    recentCountries.forEach(rc => {
      recentCountryMap[rc.country_code] = rc.usage_count;
    });

    // Enhance countries with usage data
    const enhancedCountries = countries.map(country => ({
      ...country,
      recentUsage: recentCountryMap[country.code] || 0,
      isRecent: !!recentCountryMap[country.code]
    }));

    // Sort by recent usage, then alphabetically
    enhancedCountries.sort((a, b) => {
      if (a.recentUsage > 0 && b.recentUsage === 0) return -1;
      if (a.recentUsage === 0 && b.recentUsage > 0) return 1;
      if (a.recentUsage !== b.recentUsage) return b.recentUsage - a.recentUsage;
      return a.name.localeCompare(b.name);
    });

    logger.info('✅ Countries retrieved successfully:', { count: enhancedCountries.length });

    res.json({
      success: true,
      data: enhancedCountries,
      total: enhancedCountries.length
    });

  } catch (error) {
    logger.error('❌ Countries route error:', error);
    res.status(500).json({
      error: 'Failed to get countries',
      message: error.message
    });
  }
});

// Update existing operators endpoint to include availability hints
router.get('/operators/:country',
  authenticateToken,
  [
    require('express-validator').param('country')
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { country } = req.params;

    try {
      logger.info('📡 Getting operators for country:', country);

      const response = await smsActivateService.getOperators(country);

      let operators = [];

      // Handle SMS-Activate API response format
      if (response && response.status === 'success' && response.countryOperators) {
        // SMS-Activate returns: {"status":"success", "countryOperators": {"36": ["operator1", "operator2"]}}
        const countryOperators = response.countryOperators[country];
        if (Array.isArray(countryOperators)) {
          operators = countryOperators.map((operatorName, index) => ({
            id: operatorName.toLowerCase(), // Use operator name as ID
            name: operatorName.charAt(0).toUpperCase() + operatorName.slice(1), // Capitalize
            country: country
          }));
        }
      } else if (Array.isArray(response)) {
        // Direct array response (from your cached data)
        operators = response;
      }

      logger.info('✅ Operators processed successfully:', {
        country,
        count: operators.length,
        operators: operators.map(op => op.name)
      });

      res.json({
        success: true,
        data: operators,
        country: country,
        total: operators.length
      });

    } catch (error) {
      logger.error('❌ Operators route error:', error);

      // Return empty array instead of error to prevent frontend issues
      res.json({
        success: true,
        data: [],
        country: country,
        total: 0,
        message: 'No operators found for this country'
      });
    }
  }
);


// Enhanced prices with caching and validation
router.get('/prices',
  authenticateToken,
  [
    require('express-validator').query('country')
      .optional()
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    require('express-validator').query('service')
      .optional()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid service code format')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { country, service } = req.query;

    try {
      logger.info('💰 Getting prices for:', { country, service });

      // Check cache first with longer TTL during rate limiting
      let prices = await cacheService.getCachedPrices(country, service);
      let fromCache = !!prices;

      if (!prices) {
        try {
          prices = await smsActivateService.getPrices(country, service);
          await cacheService.cachePrices(country, service, prices);
          fromCache = false;
        } catch (apiError) {
          // If we hit rate limiting, return cached data if available (even expired)
          if (apiError.message.includes('rate limit') || apiError.message.includes('429')) {
            logger.warn('⚠️ Rate limit hit, attempting to use any cached data');

            // Try to get cached data with no expiry check
            const anyCachedPrices = await cacheService.get(`sms:prices:${country || 'all'}:${service || 'all'}:all`);
            if (anyCachedPrices) {
              logger.info('💾 Using stale cached prices due to rate limiting');
              prices = anyCachedPrices;
              fromCache = true;
            } else {
              // Return a friendly rate limit error
              return res.status(429).json({
                error: 'Rate limit exceeded. Please try again in a moment.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: 30,
                message: 'SMS-Activate API is temporarily unavailable due to rate limiting. Cached data will be used when available.'
              });
            }
          } else {
            throw apiError;
          }
        }
      }

      // Process prices to ensure consistent format with real prices
      const processedPrices = processPricesData(prices);

      logger.info('✅ Prices retrieved successfully');

      res.json({
        success: true,
        data: processedPrices,
        cached: fromCache,
        filters: {
          country: country || null,
          service: service || null
        }
      });
    } catch (error) {
      logger.error('❌ Prices route error:', error);

      // Enhanced error response
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please wait before trying again.',
          retryAfter: 30
        });
      } else {
        res.status(500).json({
          error: 'Failed to get prices',
          message: error.message,
          code: 'PRICE_FETCH_ERROR'
        });
      }
    }
  }
);


// Helper methods
function processPricesData(prices) {
  if (!prices || typeof prices !== 'object') return {};

  const processed = {};

  Object.entries(prices).forEach(([countryCode, countryData]) => {
    if (typeof countryData === 'object') {
      processed[countryCode] = {};

      Object.entries(countryData).forEach(([serviceCode, serviceData]) => {
        if (typeof serviceData === 'object') {
          let realPrice = 0;
          let availableCount = parseInt(serviceData.count || 0);

          // CRITICAL FIX: Extract CHEAPEST price from freePriceMap
          if (serviceData.freePriceMap && Object.keys(serviceData.freePriceMap).length > 0) {
            // Convert all price keys to numbers and sort to find cheapest
            const allPrices = Object.keys(serviceData.freePriceMap)
              .map(priceKey => parseFloat(priceKey))
              .filter(price => !isNaN(price))
              .sort((a, b) => a - b); // Sort ascending - cheapest first

            if (allPrices.length > 0) {
              realPrice = allPrices[0]; // Get the cheapest price

              // Find the original key for this price to get the count
              const cheapestPriceKey = Object.keys(serviceData.freePriceMap)
                .find(key => Math.abs(parseFloat(key) - realPrice) < 0.0001);

              if (cheapestPriceKey) {
                const countForCheapest = parseInt(serviceData.freePriceMap[cheapestPriceKey] || 0);
                if (countForCheapest > 0) {
                  availableCount = countForCheapest;
                }
              }
            }

            console.log(`PRICE DEBUG - ${serviceCode} in country ${countryCode}:`, {
              originalCost: serviceData.cost,
              allAvailablePrices: allPrices,
              selectedCheapestPrice: realPrice,
              countAtCheapestPrice: availableCount,
              userWillPay: realPrice * 2 // With 100% bonus
            });
          } else {
            // Fallback to cost field if freePriceMap is not available
            realPrice = parseFloat(serviceData.cost || 0);
            console.log(`PRICE DEBUG - ${serviceCode} in country ${countryCode}: No freePriceMap, using cost: ${realPrice}`);
          }

          processed[countryCode][serviceCode] = {
            cost: realPrice, // Store the REAL cheapest price
            realPrice: realPrice,
            misleadingCost: parseFloat(serviceData.cost || 0),
            count: availableCount,
            available: availableCount > 0,
            freePriceMap: serviceData.freePriceMap || {}
          };
        } else {
          processed[countryCode][serviceCode] = {
            cost: parseFloat(serviceData || 0),
            realPrice: parseFloat(serviceData || 0),
            count: 0,
            available: false,
            freePriceMap: {}
          };
        }
      });
    }
  });

  return processed;
}



module.exports = router;