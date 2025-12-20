// routes/services.js - MINIMAL: Only prices endpoint, NO rate limits
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const smsActivateService = require('../services/smsActivateServices');
const logger = require('../utils/logger');

const router = express.Router();

// NO RATE LIMITING - Direct API calls only

// Get prices - ONLY endpoint needed for optimized flow
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
  require('../middleware/security').handleValidationErrors,
  async (req, res) => {
    const { country, service } = req.query;

    try {
      logger.info('💰 Getting prices for:', { country, service });

      const prices = await smsActivateService.getPrices(country, service);

      logger.info('✅ Prices retrieved successfully');

      res.json({
        success: true,
        data: prices,
        filters: {
          country: country || null,
          service: service || null
        }
      });
    } catch (error) {
      logger.error('❌ Prices route error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get prices',
        message: error.message
      });
    }
  }
);

module.exports = router;
