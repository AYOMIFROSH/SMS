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

// NEW: Get operators by country
router.get('/operators/:country/:service',
  authenticateToken,
  [
    require('express-validator').param('country')
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    require('express-validator').param('service')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid service code format')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { country, service } = req.params;

    try {
      logger.info('🔍 Getting operators with availability for:', { country, service });

      // Get all operators for country
      const allOperators = await smsActivateService.getOperators(country);
      
      // Get availability for the specific service
      const availability = await smsActivateService.getNumbersStatus(country);
      
      // Filter operators that have availability for this service
      const availableOperators = allOperators.filter(operator => {
        const key = `${service}_${operator.id}`;
        const count = availability[key];
        return count && parseInt(count) > 0;
      });

      logger.info('✅ Available operators found:', {
        country,
        service,
        total: allOperators.length,
        available: availableOperators.length
      });

      res.json({
        success: true,
        data: availableOperators,
        total: availableOperators.length,
        country,
        service,
        message: availableOperators.length === 0 ? 'No operators have numbers available for this service' : undefined
      });

    } catch (error) {
      logger.error('❌ Operators availability route error:', error);
      res.status(500).json({
        error: 'Failed to get operators with availability',
        message: error.message,
        country,
        service
      });
    }
  }
);

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

      const operators = await smsActivateService.getOperators(country);
      
      // Add availability status hint (general availability, not service-specific)
      const availability = await smsActivateService.getNumbersStatus(country);
      
      const operatorsWithStatus = operators.map(operator => ({
        ...operator,
        hasGeneralAvailability: Object.keys(availability).some(key => 
          key.includes(`_${operator.id}`) && parseInt(availability[key]) > 0
        )
      }));

      logger.info('✅ Operators retrieved successfully:', {
        country,
        count: operatorsWithStatus.length
      });

      res.json({
        success: true,
        data: operatorsWithStatus,
        country: country,
        total: operatorsWithStatus.length
      });

    } catch (error) {
      logger.error('❌ Operators route error:', error);
      res.status(500).json({
        error: 'Failed to get operators',
        message: error.message,
        country: country
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
      logger.info('🔍 Getting prices for:', { country, service });

      // Check cache first
      let prices = await cacheService.getCachedPrices(country, service);

      if (!prices) {
        prices = await smsActivateService.getPrices(country, service);
        await cacheService.cachePrices(country, service, prices);
      }

      // Process prices to ensure consistent format
      const processedPrices = processPricesData(prices);

      logger.info('✅ Prices retrieved successfully');

      res.json({
        success: true,
        data: processedPrices,
        filters: {
          country: country || null,
          service: service || null
        }
      });
    } catch (error) {
      logger.error('❌ Prices route error:', error);
      res.status(500).json({
        error: 'Failed to get prices',
        message: error.message
      });
    }
  }
);

// Enhanced availability check
router.get('/availability',
  authenticateToken,
  [
    require('express-validator').query('country')
      .optional()
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    require('express-validator').query('operator')
      .optional()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid operator format')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { country, operator } = req.query;

    try {
      logger.info('🔍 Getting availability for:', { country, operator });

      const availability = await smsActivateService.getNumbersStatus(country, operator);

      // Process availability data
      const processedAvailability = processAvailabilityData(availability);

      logger.info('✅ Availability retrieved successfully');

      res.json({
        success: true,
        data: processedAvailability,
        filters: {
          country: country || null,
          operator: operator || null
        }
      });
    } catch (error) {
      logger.error('❌ Availability route error:', error);
      res.status(500).json({
        error: 'Failed to get availability',
        message: error.message
      });
    }
  }
);

// NEW: Get service restrictions by country
router.get('/restrictions/:country/:service',
  authenticateToken,
  [
    require('express-validator').param('country')
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    require('express-validator').param('service')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid service code format')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { country, service } = req.params;

    try {
      logger.info('🔍 Getting restrictions for:', { country, service });

      // Get prices to check if service is available in country
      const prices = await smsActivateService.getPrices(country, service);

      // Get operators for the country
      const operators = await smsActivateService.getOperators(country);

      // Check availability
      const availability = await smsActivateService.getNumbersStatus(country);

      const restrictions = {
        serviceAvailable: prices && Object.keys(prices).length > 0,
        availableOperators: operators.length,
        currentStock: extractStockInfo(availability, service),
        priceRange: extractPriceRange(prices, service),
        recommendations: generateRecommendations(prices, availability, service, country)
      };

      res.json({
        success: true,
        data: restrictions,
        country,
        service
      });

    } catch (error) {
      logger.error('❌ Restrictions route error:', error);
      res.status(500).json({
        error: 'Failed to get restrictions',
        message: error.message
      });
    }
  }
);

// NEW: Get popular combinations (service + country)
router.get('/popular-combinations', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();

    // Get popular combinations from database
    const [popularCombos] = await pool.execute(
      `SELECT 
        service_code,
        country_code,
        COUNT(*) as usage_count,
        AVG(price) as avg_price,
        MAX(purchase_date) as last_used
       FROM number_purchases
       WHERE purchase_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY service_code, country_code
       HAVING usage_count >= 2
       ORDER BY usage_count DESC, last_used DESC
       LIMIT 10`
    );

    // Get global popular combinations (not user-specific)
    const [globalPopular] = await pool.execute(
      `SELECT 
        service_code,
        country_code,
        COUNT(*) as usage_count,
        AVG(price) as avg_price
       FROM number_purchases
       WHERE purchase_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY service_code, country_code
       ORDER BY usage_count DESC
       LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        userPopular: popularCombos,
        globalPopular: globalPopular
      }
    });

  } catch (error) {
    logger.error('❌ Popular combinations route error:', error);
    res.status(500).json({
      error: 'Failed to get popular combinations',
      message: error.message
    });
  }
});

// NEW: Search services
router.get('/search',
  authenticateToken,
  [
    require('express-validator').query('q')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Search query must be 2-50 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { q: query } = req.query;

    try {
      logger.info('🔍 Searching services:', { query });

      const services = await smsActivateService.getServices();

      // Search in service names and codes
      const results = services.filter(service =>
        service.name.toLowerCase().includes(query.toLowerCase()) ||
        service.code.toLowerCase().includes(query.toLowerCase()) ||
        service.category.toLowerCase().includes(query.toLowerCase())
      );

      // Sort by relevance (exact matches first)
      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === query.toLowerCase() ||
          a.code.toLowerCase() === query.toLowerCase();
        const bExact = b.name.toLowerCase() === query.toLowerCase() ||
          b.code.toLowerCase() === query.toLowerCase();

        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        return a.name.localeCompare(b.name);
      });

      res.json({
        success: true,
        data: results,
        query: query,
        total: results.length
      });

    } catch (error) {
      logger.error('❌ Search services route error:', error);
      res.status(500).json({
        error: 'Failed to search services',
        message: error.message
      });
    }
  }
);

// Helper methods
function processPricesData(prices) {
  if (!prices || typeof prices !== 'object') return {};

  // Convert to consistent format
  const processed = {};

  Object.entries(prices).forEach(([countryCode, countryData]) => {
    if (typeof countryData === 'object') {
      processed[countryCode] = {};

      Object.entries(countryData).forEach(([serviceCode, serviceData]) => {
        if (typeof serviceData === 'object') {
          processed[countryCode][serviceCode] = {
            cost: parseFloat(serviceData.cost || 0),
            count: parseInt(serviceData.count || 0),
            available: (serviceData.count || 0) > 0
          };
        } else {
          processed[countryCode][serviceCode] = {
            cost: parseFloat(serviceData || 0),
            count: 0,
            available: false
          };
        }
      });
    }
  });

  return processed;
}

function processAvailabilityData(availability) {
  if (!availability || typeof availability !== 'object') return {};

  const processed = {};

  Object.entries(availability).forEach(([key, value]) => {
    processed[key] = {
      available: parseInt(value || 0),
      status: parseInt(value || 0) > 0 ? 'available' : 'unavailable'
    };
  });

  return processed;
}

function extractStockInfo(availability, service) {
  if (!availability || !service) return 0;

  return Object.entries(availability)
    .filter(([key]) => key.includes(service))
    .reduce((total, [_, count]) => total + parseInt(count || 0), 0);
}

function extractPriceRange(prices, service) {
  if (!prices || !service) return { min: 0, max: 0 };

  const servicePrices = [];

  Object.values(prices).forEach(countryData => {
    if (countryData && countryData[service]) {
      const cost = parseFloat(countryData[service].cost || countryData[service] || 0);
      if (cost > 0) servicePrices.push(cost);
    }
  });

  if (servicePrices.length === 0) return { min: 0, max: 0 };

  return {
    min: Math.min(...servicePrices),
    max: Math.max(...servicePrices),
    average: servicePrices.reduce((a, b) => a + b, 0) / servicePrices.length
  };
}

function generateRecommendations(prices, availability, service, country) {
  const recommendations = [];

  // Check if service is available
  if (!prices || !prices[country] || !prices[country][service]) {
    recommendations.push({
      type: 'warning',
      message: 'Service not available in selected country',
      action: 'Try a different country'
    });
  }

  // Check stock levels
  const stock = extractStockInfo(availability, service);
  if (stock < 5 && stock > 0) {
    recommendations.push({
      type: 'info',
      message: 'Low stock available',
      action: 'Consider purchasing soon'
    });
  } else if (stock === 0) {
    recommendations.push({
      type: 'warning',
      message: 'Currently out of stock',
      action: 'Try again later or choose different operator'
    });
  }

  // Price recommendations
  const priceRange = extractPriceRange(prices, service);
  if (prices[country] && prices[country][service]) {
    const currentPrice = parseFloat(prices[country][service].cost || 0);
    if (currentPrice > priceRange.average * 1.2) {
      recommendations.push({
        type: 'tip',
        message: 'Price is above average',
        action: 'Consider other countries for better rates'
      });
    }
  }

  return recommendations;
}

module.exports = router;