// routes/numbers.js - ENHANCED WITH 100% BONUS SYSTEM - COMPLETE VERSION
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPool } = require('../Config/database');
const smsActivateService = require('../services/smsActivateServices');
const webSocketService = require('../services/webhookService');
const {
  rateLimiters,
  validationRules,
  handleValidationErrors,
} = require('../middleware/security');
const logger = require('../utils/logger');

const router = express.Router();

// Apply rate limiting
router.use(rateLimiters.sms);

// UPDATED: Enhanced number purchase with 100% BONUS SYSTEM
// UPDATED: Enhanced number purchase with 100% BONUS SYSTEM
router.post('/purchase',
  authenticateToken,
  [
    require('express-validator').body('service')
      .trim()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid service code format'),
    require('express-validator').body('country')
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    require('express-validator').body('operator')
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid operator format'),
    require('express-validator').body('maxPrice')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Max price must be between 0 and 100')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { service, country, operator, maxPrice } = req.body;
    const userId = req.user.id;

    try {
      logger.info('📱 Number purchase request with BONUS system:', {
        userId,
        service,
        country,
        operator,
        maxPrice
      });

      // Get current price for the service from SMS-Activate API
      const prices = await smsActivateService.getPrices(country, service);
      const realPrice = prices?.[country]?.[service]?.cost || 0;

      if (realPrice === 0) {
        return res.status(400).json({
          error: 'Service not available in selected country',
          code: 'SERVICE_UNAVAILABLE'
        });
      }

      // BONUS SYSTEM: Calculate total price (real price + 100% bonus)
      const bonusAmount = realPrice; // 100% bonus = same as real price
      const totalPrice = realPrice + bonusAmount; // User pays double

      logger.info('💰 Price calculation with bonus:', {
        userId,
        realPrice,
        bonusAmount,
        totalPrice,
        service,
        country
      });

      // Check if total price exceeds user's maxPrice
      if (maxPrice && totalPrice > maxPrice) {
        return res.status(400).json({
          error: `Total price ${totalPrice.toFixed(4)} exceeds maximum ${maxPrice.toFixed(4)}`,
          code: 'PRICE_EXCEEDED',
          realPrice: realPrice,
          bonusAmount: bonusAmount,
          totalPrice: totalPrice,
          maxPrice: maxPrice
        });
      }

      // Check user balance in user_demo_balances table
      const pool = getPool();

      // Get or create balance record
      await pool.execute(`
        INSERT IGNORE INTO user_demo_balances (user_id, balance, total_deposited, total_spent)
        VALUES (?, 0, 0, 0)
      `, [userId]);

      const [userBalance] = await pool.execute(
        'SELECT balance FROM user_demo_balances WHERE user_id = ?',
        [userId]
      );

      const currentBalance = parseFloat(userBalance[0].balance || 0);

      // CRITICAL: Check if user has enough balance for TOTAL price (real + bonus)
      if (currentBalance < totalPrice) {
        return res.status(400).json({
          error: 'Insufficient balance for purchase including bonus',
          code: 'INSUFFICIENT_BALANCE',
          required: totalPrice,
          current: currentBalance,
          shortfall: totalPrice - currentBalance,
          breakdown: {
            realPrice: realPrice,
            bonusAmount: bonusAmount,
            totalPrice: totalPrice
          }
        });
      }

      // Start database transaction for atomic operation
      await pool.execute('START TRANSACTION');

      try {
        // STEP 1: Purchase number from SMS-Activate using REAL price only
        logger.info('🔄 Purchasing from SMS-Activate API with real price:', {
          userId,
          service,
          country,
          operator,
          realPrice
        });

        const numberData = await smsActivateService.getNumber(
          service,
          country,
          operator
        );

        const { id: activationId, number } = numberData;

        // Calculate expiry date (typically 20 minutes for SMS)
        const expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + 20);

        // STEP 2: Save purchase to database with total price user paid
        const [purchaseResult] = await pool.execute(
          `INSERT INTO number_purchases 
           (user_id, activation_id, phone_number, country_code, service_code, 
            service_name, price, status, expiry_date, purchase_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, NOW())`,
          [
            userId,
            activationId,
            number,
            country,
            service,
            service.toUpperCase(), // Service name
            totalPrice, // Store total price user paid (including bonus)
            expiryDate
          ]
        );

        // STEP 3: Deduct TOTAL price from user balance (real + bonus)
        const [balanceUpdateResult] = await pool.execute(
          `UPDATE user_demo_balances 
           SET balance = balance - ?, 
               total_spent = total_spent + ?,
               last_transaction_at = NOW()
           WHERE user_id = ?`,
          [totalPrice, totalPrice, userId]
        );

        if (balanceUpdateResult.affectedRows === 0) {
          throw new Error('Failed to update user balance');
        }

        // Get new balance for notifications
        const [newBalance] = await pool.execute(
          'SELECT balance FROM user_demo_balances WHERE user_id = ?',
          [userId]
        );

        const remainingBalance = parseFloat(newBalance[0].balance);

        // STEP 4: Add detailed transaction record
        await pool.execute(
          `INSERT INTO transactions 
           (user_id, transaction_type, amount, balance_before, balance_after, 
            reference_id, description, status, created_at)
           VALUES (?, 'purchase', ?, ?, ?, ?, ?, 'completed', NOW())`,
          [
            userId,
            totalPrice,
            currentBalance,
            remainingBalance,
            activationId,
            `SMS Number Purchase: ${service.toUpperCase()} (${country}) - Real: $${realPrice.toFixed(4)}, Bonus: $${bonusAmount.toFixed(4)}, Total: $${totalPrice.toFixed(4)}`
          ]
        );

        await pool.execute('COMMIT');

        // STEP 5: Send real-time WebSocket notifications
        try {
          // Notify successful purchase
          webSocketService.sendToUser(userId, {
            type: 'number_purchased',
            data: {
              activationId,
              number,
              service,
              country,
              operator,
              realPrice,
              bonusAmount,
              totalPrice,
              purchaseId: purchaseResult.insertId,
              expiryDate,
              remainingBalance
            }
          });

          // Notify balance update
          webSocketService.notifyBalanceUpdated(userId, remainingBalance, -totalPrice);

        } catch (wsError) {
          logger.warn('WebSocket notification failed (non-critical):', wsError.message);
        }

        logger.info('✅ Number purchased successfully with bonus system:', {
          userId,
          activationId,
          number,
          service,
          country,
          realPrice,
          bonusAmount,
          totalPrice,
          remainingBalance
        });

        res.json({
          success: true,
          data: {
            activationId,
            number,
            purchaseId: purchaseResult.insertId,
            service,
            country,
            operator,
            pricing: {
              realPrice,
              bonusAmount,
              totalPrice
            },
            status: 'waiting',
            expiryDate,
            balance: {
              previous: currentBalance,
              current: remainingBalance,
              deducted: totalPrice
            }
          },
          message: 'Number purchased successfully!'
        });

      } catch (purchaseError) {
        await pool.execute('ROLLBACK');
        throw purchaseError;
      }

    } catch (error) {
      logger.error('❌ Purchase error with bonus system:', {
        error: error.message,
        userId,
        service,
        country,
        operator,
        stack: error.stack
      });

      // Enhanced error handling with proper status codes
      if (error.message.includes('NO_NUMBERS')) {
        return res.status(400).json({
          error: `No numbers available for ${operator ? operator + ' operator in ' : ''}this service/country combination`,
          code: 'NO_NUMBERS_AVAILABLE',
          suggestion: operator && operator !== '' ? 'Try selecting "Any Operator" option for better availability' : 'Try a different service or country',
          details: {
            service: service.toUpperCase(),
            country,
            operator: operator || 'Any',
            availableCount: 0
          }
        });
      } else if (error.message.includes('NO_BALANCE')) {
        return res.status(400).json({
          error: 'SMS-Activate account has insufficient balance',
          code: 'PROVIDER_NO_BALANCE'
        });
      } else if (error.message.includes('BAD_SERVICE')) {
        return res.status(400).json({
          error: 'Invalid service code',
          code: 'INVALID_SERVICE'
        });
      }

      // Generic error - return 500 only for unexpected errors
      res.status(500).json({
        error: 'Failed to purchase number',
        code: 'PURCHASE_FAILED',
        message: error.message
      });
    }
  }
);

// Get active numbers with real-time SMS checking
router.get('/active',
  authenticateToken,
  validationRules.pagination,
  handleValidationErrors,
  async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
      const pool = getPool();
      const userId = req.user.id;

      const [numbers] = await pool.execute(
        `SELECT * FROM number_purchases 
         WHERE user_id = ? AND status IN ('waiting', 'received')
         ORDER BY purchase_date DESC
         LIMIT ? OFFSET ?`,
        [userId, parseInt(limit), offset]
      );

      // Check for SMS updates for each active number
      const updatedNumbers = [];
      for (const number of numbers) {
        if (number.activation_id && number.status === 'waiting') {
          try {
            const statusResult = await smsActivateService.getStatus(number.activation_id);

            if (statusResult.code && number.sms_code !== statusResult.code) {
              // Update database with new SMS
              await pool.execute(
                `UPDATE number_purchases 
                 SET sms_code = ?, sms_text = ?, status = 'received', received_at = NOW()
                 WHERE id = ?`,
                [statusResult.code, statusResult.text || null, number.id]
              );

              number.sms_code = statusResult.code;
              number.sms_text = statusResult.text;
              number.status = 'received';
              number.received_at = new Date();

              // Send WebSocket notification
              webSocketService.sendToUser(userId, {
                type: 'sms_received',
                data: {
                  activationId: number.activation_id,
                  code: statusResult.code,
                  smsText: statusResult.text,
                  purchaseId: number.id,
                  phoneNumber: number.phone_number
                }
              });

              logger.info('📨 SMS received:', {
                userId,
                activationId: number.activation_id,
                code: statusResult.code
              });
            }

            // Check for expiry
            if (new Date() > new Date(number.expiry_date) && number.status === 'waiting') {
              await pool.execute(
                'UPDATE number_purchases SET status = ? WHERE id = ?',
                ['expired', number.id]
              );
              number.status = 'expired';

              // Notify about expiry
              webSocketService.sendToUser(userId, {
                type: 'number_expired',
                data: {
                  activationId: number.activation_id,
                  phoneNumber: number.phone_number,
                  purchaseId: number.id
                }
              });
            }

          } catch (statusError) {
            logger.error('Status check error:', {
              error: statusError.message,
              activationId: number.activation_id
            });
          }
        }

        updatedNumbers.push({
          ...number,
          price: parseFloat(number.price || 0),
          timeRemaining: calculateTimeRemaining(number.expiry_date)
        });
      }

      // Get total count
      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM number_purchases WHERE user_id = ? AND status IN (?, ?)',
        [userId, 'waiting', 'received']
      );

      res.json({
        success: true,
        data: updatedNumbers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      });

    } catch (error) {
      logger.error('❌ Active numbers error:', error);
      res.status(500).json({
        error: 'Failed to get active numbers',
        message: error.message
      });
    }
  }
);

// Enhanced status check for specific number
router.get('/:id/status',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      // Get number details
      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      // Check current status from SMS-Activate
      if (number.activation_id && ['waiting', 'received'].includes(number.status)) {
        try {
          const statusResult = await smsActivateService.getStatus(number.activation_id);

          // Update if status changed
          if (statusResult.code && statusResult.code !== number.sms_code) {
            await pool.execute(
              `UPDATE number_purchases 
               SET sms_code = ?, sms_text = ?, status = 'received', received_at = NOW()
               WHERE id = ?`,
              [statusResult.code, statusResult.text || null, number.id]
            );

            number.sms_code = statusResult.code;
            number.sms_text = statusResult.text;
            number.status = 'received';
            number.received_at = new Date();

            // Send WebSocket notification
            webSocketService.sendToUser(userId, {
              type: 'sms_received',
              data: {
                activationId: number.activation_id,
                code: statusResult.code,
                smsText: statusResult.text,
                purchaseId: number.id,
                phoneNumber: number.phone_number
              }
            });
          }
        } catch (statusError) {
          logger.error('Status check error:', statusError);
        }
      }

      res.json({
        success: true,
        data: {
          ...number,
          price: parseFloat(number.price || 0),
          timeRemaining: calculateTimeRemaining(number.expiry_date)
        }
      });

    } catch (error) {
      logger.error('❌ Status check error:', error);
      res.status(500).json({
        error: 'Failed to check status',
        message: error.message
      });
    }
  }
);

// Enhanced cancel number with proper status handling
router.post('/:id/cancel',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      // Get number details
      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      if (!['waiting', 'received'].includes(number.status)) {
        return res.status(400).json({
          error: 'Number cannot be cancelled in current status',
          code: 'INVALID_STATUS_FOR_CANCEL',
          currentStatus: number.status
        });
      }

      // Start transaction
      await pool.execute('START TRANSACTION');

      try {
        // Cancel via SMS-Activate API
        if (number.activation_id) {
          await smsActivateService.setStatus(
            number.activation_id,
            smsActivateService.getActionCode('CANCEL_ACTIVATION')
          );
        }

        // Update database
        await pool.execute(
          'UPDATE number_purchases SET status = ?, updated_at = NOW() WHERE id = ?',
          ['cancelled', id]
        );

        // Calculate refund (partial refund logic - user gets refund of total amount paid)
        const refundAmount = calculateRefund(number);
        if (refundAmount > 0) {
          // Update balance
          await pool.execute(
            `UPDATE user_demo_balances 
             SET balance = balance + ?,
                 last_transaction_at = NOW()
             WHERE user_id = ?`,
            [refundAmount, userId]
          );

          // Add refund transaction
          await pool.execute(
            `INSERT INTO transactions 
             (user_id, transaction_type, amount, reference_id, description, status, created_at)
             VALUES (?, 'refund', ?, ?, ?, 'completed', NOW())`,
            [
              userId,
              refundAmount,
              number.activation_id,
              `Partial refund for cancelled number ${number.phone_number}`
            ]
          );
        }

        await pool.execute('COMMIT');

        // Send WebSocket notification
        webSocketService.sendToUser(userId, {
          type: 'number_cancelled',
          data: {
            activationId: number.activation_id,
            phoneNumber: number.phone_number,
            refundAmount
          }
        });

        if (refundAmount > 0) {
          const [newBalance] = await pool.execute(
            'SELECT balance FROM user_demo_balances WHERE user_id = ?',
            [userId]
          );

          webSocketService.notifyBalanceUpdated(userId, newBalance[0].balance, refundAmount);
        }

        logger.info('✅ Number cancelled successfully:', {
          userId,
          activationId: number.activation_id,
          refundAmount
        });

        res.json({
          success: true,
          message: 'Number cancelled successfully',
          refundAmount: refundAmount
        });

      } catch (cancelError) {
        await pool.execute('ROLLBACK');
        throw cancelError;
      }

    } catch (error) {
      logger.error('❌ Cancel error:', error);
      res.status(500).json({
        error: 'Failed to cancel number',
        message: error.message
      });
    }
  }
);

// Mark number as completed/used
router.post('/:id/complete',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      if (number.status !== 'received') {
        return res.status(400).json({
          error: 'Can only complete numbers with received SMS',
          code: 'INVALID_STATUS_FOR_COMPLETE',
          currentStatus: number.status
        });
      }

      // Mark as complete via SMS-Activate API
      if (number.activation_id) {
        await smsActivateService.setStatus(
          number.activation_id,
          smsActivateService.getActionCode('FINISH_ACTIVATION')
        );
      }

      // Update database
      await pool.execute(
        'UPDATE number_purchases SET status = ?, updated_at = NOW() WHERE id = ?',
        ['used', id]
      );

      // Send WebSocket notification
      webSocketService.sendToUser(userId, {
        type: 'number_completed',
        data: {
          activationId: number.activation_id,
          phoneNumber: number.phone_number,
          purchaseId: id
        }
      });

      logger.info('✅ Number completed successfully:', {
        userId,
        activationId: number.activation_id
      });

      res.json({
        success: true,
        message: 'Number marked as completed'
      });

    } catch (error) {
      logger.error('❌ Complete error:', error);
      res.status(500).json({
        error: 'Failed to complete number',
        message: error.message
      });
    }
  }
);

// NEW: Request retry for SMS
router.post('/:id/retry',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      if (number.status !== 'waiting') {
        return res.status(400).json({
          error: 'Can only request retry for waiting numbers',
          code: 'INVALID_STATUS_FOR_RETRY'
        });
      }

      // Request retry via SMS-Activate API
      await smsActivateService.setStatus(
        number.activation_id,
        smsActivateService.getActionCode('REQUEST_RETRY')
      );

      // Extend expiry time
      const newExpiry = new Date();
      newExpiry.setMinutes(newExpiry.getMinutes() + 20);

      await pool.execute(
        'UPDATE number_purchases SET expiry_date = ?, updated_at = NOW() WHERE id = ?',
        [newExpiry, id]
      );

      res.json({
        success: true,
        message: 'SMS retry requested successfully',
        newExpiryDate: newExpiry
      });

    } catch (error) {
      logger.error('❌ Retry error:', error);
      res.status(500).json({
        error: 'Failed to request retry',
        message: error.message
      });
    }
  }
);

// NEW: Get full SMS text
router.get('/:id/full-sms',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      if (number.status !== 'received') {
        return res.status(400).json({
          error: 'SMS not received yet',
          code: 'SMS_NOT_RECEIVED'
        });
      }

      // Get full SMS from API if not cached
      if (!number.sms_text && number.activation_id) {
        try {
          const fullSmsResult = await smsActivateService.getFullSms(number.activation_id);

          if (fullSmsResult.success) {
            await pool.execute(
              'UPDATE number_purchases SET sms_text = ? WHERE id = ?',
              [fullSmsResult.text, id]
            );
            number.sms_text = fullSmsResult.text;
          }
        } catch (fullSmsError) {
          logger.error('Full SMS fetch error:', fullSmsError);
        }
      }

      res.json({
        success: true,
        data: {
          activationId: number.activation_id,
          phoneNumber: number.phone_number,
          code: number.sms_code,
          fullText: number.sms_text,
          receivedAt: number.received_at
        }
      });

    } catch (error) {
      logger.error('❌ Full SMS error:', error);
      res.status(500).json({
        error: 'Failed to get full SMS',
        message: error.message
      });
    }
  }
);

// Enhanced purchase history with filters and statistics
router.get('/history',
  authenticateToken,
  [
    require('express-validator').query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be positive integer'),
    require('express-validator').query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be 1-100'),
    // Simpler fix - just allow empty strings in validation
    require('express-validator').query('service')
      .optional({ nullable: true, checkFalsy: true }) // This allows empty strings
      .matches(/^[a-zA-Z0-9_-]*$/)  // Note the * instead of + to allow empty
      .withMessage('Invalid service format'),
    require('express-validator').query('country')
      .optional({ nullable: true, checkFalsy: true })
      .matches(/^[0-9]*$/)  // Allow empty
      .withMessage('Country must be numeric'),
    require('express-validator').query('status')
      .optional({ nullable: true, checkFalsy: true })
      .isIn(['', 'waiting', 'received', 'cancelled', 'expired', 'used']) // Include empty string
      .withMessage('Invalid status'),
    require('express-validator').query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format'),
    require('express-validator').query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Invalid date format')
  ],
  handleValidationErrors,
  async (req, res) => {
    const {
      page = 1,
      limit = 20,
      service,
      country,
      status,
      dateFrom,
      dateTo,
      sortBy = 'purchase_date',
      sortOrder = 'DESC'
    } = req.query;

    const userId = req.user.id;
    const offset = (page - 1) * limit;

    try {
      const pool = getPool();

      // Build dynamic query
      let query = `
        SELECT np.*, 
               CASE 
                 WHEN np.status = 'received' OR np.status = 'used' THEN 'success'
                 WHEN np.status = 'cancelled' OR np.status = 'expired' THEN 'failed'
                 ELSE 'pending'
               END as result_status
        FROM number_purchases np
        WHERE np.user_id = ?
      `;

      const params = [userId];

      // Add filters
      if (service) {
        query += ' AND np.service_code = ?';
        params.push(service);
      }
      if (country) {
        query += ' AND np.country_code = ?';
        params.push(country);
      }
      if (status) {
        query += ' AND np.status = ?';
        params.push(status);
      }
      if (dateFrom) {
        query += ' AND np.purchase_date >= ?';
        params.push(dateFrom);
      }
      if (dateTo) {
        query += ' AND np.purchase_date <= ?';
        params.push(dateTo);
      }

      // Add sorting
      const validSortFields = ['purchase_date', 'price', 'status', 'service_code', 'country_code'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'purchase_date';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      query += ` ORDER BY np.${sortField} ${order} LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const [numbers] = await pool.execute(query, params);

      // Get total count with same filters
      let countQuery = 'SELECT COUNT(*) as total FROM number_purchases np WHERE np.user_id = ?';
      const countParams = [userId];

      if (service) {
        countQuery += ' AND np.service_code = ?';
        countParams.push(service);
      }
      if (country) {
        countQuery += ' AND np.country_code = ?';
        countParams.push(country);
      }
      if (status) {
        countQuery += ' AND np.status = ?';
        countParams.push(status);
      }
      if (dateFrom) {
        countQuery += ' AND np.purchase_date >= ?';
        countParams.push(dateFrom);
      }
      if (dateTo) {
        countQuery += ' AND np.purchase_date <= ?';
        countParams.push(dateTo);
      }

      const [countResult] = await pool.execute(countQuery, countParams);

      // Get statistics for the filtered data
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_purchases,
          SUM(CASE WHEN status IN ('received', 'used') THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status IN ('cancelled', 'expired') THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as pending,
          SUM(price) as total_spent,
          AVG(price) as average_price,
          MIN(price) as min_price,
          MAX(price) as max_price
        FROM number_purchases np 
        WHERE np.user_id = ? ${service ? 'AND np.service_code = ?' : ''} 
        ${country ? 'AND np.country_code = ?' : ''}
        ${status ? 'AND np.status = ?' : ''}
        ${dateFrom ? 'AND np.purchase_date >= ?' : ''}
        ${dateTo ? 'AND np.purchase_date <= ?' : ''}
      `, countParams);

      res.json({
        success: true,
        data: numbers.map(num => ({
          ...num,
          price: parseFloat(num.price || 0),
          timeRemaining: calculateTimeRemaining(num.expiry_date)
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        },
        statistics: {
          ...stats[0],
          total_spent: parseFloat(stats[0].total_spent || 0),
          average_price: parseFloat(stats[0].average_price || 0),
          min_price: parseFloat(stats[0].min_price || 0),
          max_price: parseFloat(stats[0].max_price || 0),
          success_rate: stats[0].total_purchases > 0
            ? (stats[0].successful / stats[0].total_purchases * 100).toFixed(2)
            : 0
        },
        filters: {
          service,
          country,
          status,
          dateFrom,
          dateTo,
          sortBy: sortField,
          sortOrder: order
        }
      });

    } catch (error) {
      logger.error('❌ History error:', error);
      res.status(500).json({
        error: 'Failed to get history',
        message: error.message
      });
    }
  }
);

// NEW: Subscription management routes

// Buy subscription
router.post('/subscriptions/buy',
  authenticateToken,
  [
    require('express-validator').body('service')
      .trim()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid service code format'),
    require('express-validator').body('country')
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    require('express-validator').body('period')
      .isInt({ min: 1, max: 30 })
      .withMessage('Period must be between 1 and 30 days')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { service, country, period } = req.body;
    const userId = req.user.id;

    try {
      logger.info('💳 Subscription purchase request:', { userId, service, country, period });

      // Check user balance
      const pool = getPool();
      const [userBalance] = await pool.execute(
        'SELECT balance FROM user_demo_balances WHERE user_id = ?',
        [userId]
      );

      if (!userBalance.length) {
        return res.status(404).json({
          error: 'SMS account not found',
          code: 'ACCOUNT_NOT_FOUND'
        });
      }

      // Calculate subscription price (example logic - adjust as needed)
      const basePrice = 5.00; // Base price for subscription
      const subscriptionPrice = basePrice * period;

      const currentBalance = parseFloat(userBalance[0].balance || 0);
      if (currentBalance < subscriptionPrice) {
        return res.status(400).json({
          error: 'Insufficient balance for subscription',
          code: 'INSUFFICIENT_BALANCE',
          required: subscriptionPrice,
          current: currentBalance
        });
      }

      // Start transaction
      await pool.execute('START TRANSACTION');

      try {
        // Buy subscription via SMS-Activate API
        const subscriptionResult = await smsActivateService.buySubscription(
          service,
          country,
          period
        );

        if (!subscriptionResult.success) {
          throw new Error('Failed to create subscription');
        }

        // Create subscription table if not exists
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS subscriptions (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            subscription_id VARCHAR(100) UNIQUE,
            service_code VARCHAR(50),
            country_code VARCHAR(5),
            period_days INT,
            price DECIMAL(10, 4),
            status ENUM('active', 'cancelled', 'expired') DEFAULT 'active',
            start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_subscriptions (user_id, status),
            INDEX idx_subscription_id (subscription_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Calculate end date
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + period);

        // Save subscription to database
        const [subscriptionInsert] = await pool.execute(
          `INSERT INTO subscriptions 
           (user_id, subscription_id, service_code, country_code, period_days, price, end_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            subscriptionResult.subscriptionId,
            service,
            country,
            period,
            subscriptionPrice,
            endDate
          ]
        );

        // Deduct balance
        await pool.execute(
          `UPDATE user_demo_balances 
           SET balance = balance - ?,
               total_spent = total_spent + ?,
               last_transaction_at = NOW()
           WHERE user_id = ?`,
          [subscriptionPrice, subscriptionPrice, userId]
        );

        // Add transaction record
        await pool.execute(
          `INSERT INTO transactions 
           (user_id, transaction_type, amount, reference_id, description, status, created_at)
           VALUES (?, 'purchase', ?, ?, ?, 'completed', NOW())`,
          [
            userId,
            subscriptionPrice,
            subscriptionResult.subscriptionId,
            `${period}-day subscription for ${service.toUpperCase()} (${country})`
          ]
        );

        await pool.execute('COMMIT');

        logger.info('✅ Subscription purchased successfully:', {
          userId,
          subscriptionId: subscriptionResult.subscriptionId,
          service,
          country,
          period,
          price: subscriptionPrice
        });

        res.json({
          success: true,
          data: {
            subscriptionId: subscriptionResult.subscriptionId,
            internalId: subscriptionInsert.insertId,
            service,
            country,
            period,
            price: subscriptionPrice,
            startDate: new Date(),
            endDate,
            status: 'active'
          }
        });

      } catch (subscriptionError) {
        await pool.execute('ROLLBACK');
        throw subscriptionError;
      }

    } catch (error) {
      logger.error('❌ Subscription purchase error:', error);
      res.status(500).json({
        error: 'Failed to purchase subscription',
        message: error.message
      });
    }
  }
);

// Get user subscriptions
router.get('/subscriptions',
  authenticateToken,
  [
    require('express-validator').query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be positive integer'),
    require('express-validator').query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be 1-100'),
    require('express-validator').query('status')
      .optional()
      .isIn(['active', 'cancelled', 'expired'])
      .withMessage('Invalid status')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const userId = req.user.id;
    const offset = (page - 1) * limit;

    try {
      const pool = getPool();

      let query = 'SELECT * FROM subscriptions WHERE user_id = ?';
      const params = [userId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const [subscriptions] = await pool.execute(query, params);

      // Check and update expired subscriptions
      const updatedSubscriptions = [];
      for (const subscription of subscriptions) {
        if (subscription.status === 'active' && new Date() > new Date(subscription.end_date)) {
          await pool.execute(
            'UPDATE subscriptions SET status = ? WHERE id = ?',
            ['expired', subscription.id]
          );
          subscription.status = 'expired';
        }

        updatedSubscriptions.push({
          ...subscription,
          price: parseFloat(subscription.price || 0),
          daysRemaining: calculateDaysRemaining(subscription.end_date)
        });
      }

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM subscriptions WHERE user_id = ?';
      const countParams = [userId];

      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      const [countResult] = await pool.execute(countQuery, countParams);

      res.json({
        success: true,
        data: updatedSubscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        }
      });

    } catch (error) {
      logger.error('❌ Get subscriptions error:', error);
      res.status(500).json({
        error: 'Failed to get subscriptions',
        message: error.message
      });
    }
  }
);

// Add this new endpoint to routes/numbers.js after the retry endpoint

// NEW: Refresh number (get new number with same activation)
router.post('/:id/refresh',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      // Get number details
      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      if (number.status !== 'waiting') {
        return res.status(400).json({
          error: 'Can only refresh waiting numbers',
          code: 'INVALID_STATUS_FOR_REFRESH',
          currentStatus: number.status
        });
      }

      // Check if number has not expired
      if (new Date() > new Date(number.expiry_date)) {
        return res.status(400).json({
          error: 'Cannot refresh expired number',
          code: 'NUMBER_EXPIRED'
        });
      }

      // Request new number via SMS-Activate API (setStatus with action 3 = REQUEST_RETRY)
      await smsActivateService.setStatus(
        number.activation_id,
        smsActivateService.getActionCode('REQUEST_RETRY')
      );

      // Get the new number details
      const statusResult = await smsActivateService.getStatus(number.activation_id);
      
      // Note: The API documentation shows that REQUEST_RETRY might give a new number
      // We need to check if we get updated number information
      let updatedNumber = number.phone_number;
      
      // For refresh, we typically extend the expiry time
      const newExpiry = new Date();
      newExpiry.setMinutes(newExpiry.getMinutes() + 20);

      // Update database with new expiry and reset any previous SMS data
      await pool.execute(
        `UPDATE number_purchases 
         SET expiry_date = ?, 
             sms_code = NULL, 
             sms_text = NULL,
             received_at = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        [newExpiry, id]
      );

      // Send WebSocket notification
      webSocketService.sendToUser(userId, {
        type: 'number_refreshed',
        data: {
          activationId: number.activation_id,
          phoneNumber: updatedNumber,
          purchaseId: id,
          newExpiryDate: newExpiry,
          service: number.service_code
        }
      });

      logger.info('✅ Number refreshed successfully:', {
        userId,
        activationId: number.activation_id,
        purchaseId: id
      });

      res.json({
        success: true,
        message: 'Number refreshed successfully',
        data: {
          newExpiryDate: newExpiry,
          phoneNumber: updatedNumber
        }
      });

    } catch (error) {
      logger.error('❌ Refresh number error:', error);
      res.status(500).json({
        error: 'Failed to refresh number',
        message: error.message
      });
    }
  }
);

// REPLACE the existing cancel endpoint in routes/numbers.js with this updated version:

// Enhanced cancel number with proper refund to user balance
router.post('/:id/cancel',
  authenticateToken,
  [
    require('express-validator').param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid number ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
      const pool = getPool();

      // Get number details
      const [numbers] = await pool.execute(
        'SELECT * FROM number_purchases WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (numbers.length === 0) {
        return res.status(404).json({
          error: 'Number not found',
          code: 'NUMBER_NOT_FOUND'
        });
      }

      const number = numbers[0];

      if (!['waiting', 'received'].includes(number.status)) {
        return res.status(400).json({
          error: 'Number cannot be cancelled in current status',
          code: 'INVALID_STATUS_FOR_CANCEL',
          currentStatus: number.status
        });
      }

      // Calculate time elapsed since purchase (for 4-minute rule validation)
      const purchaseTime = new Date(number.purchase_date).getTime();
      const currentTime = Date.now();
      const timeElapsed = (currentTime - purchaseTime) / 1000 / 60; // in minutes

      if (timeElapsed < 4) {
        return res.status(400).json({
          error: 'Cannot cancel within first 4 minutes of purchase',
          code: 'CANCEL_TOO_EARLY',
          timeElapsed: Math.floor(timeElapsed),
          minimumWait: 4
        });
      }

      // Start transaction for atomic operation
      await pool.execute('START TRANSACTION');

      try {
        // Cancel via SMS-Activate API
        if (number.activation_id) {
          await smsActivateService.setStatus(
            number.activation_id,
            smsActivateService.getActionCode('CANCEL_ACTIVATION')
          );
        }

        // Update number status to cancelled
        await pool.execute(
          'UPDATE number_purchases SET status = ?, updated_at = NOW() WHERE id = ?',
          ['cancelled', id]
        );

        // REFUND: Return the TOTAL amount user paid (real price + 100% bonus)
        const refundAmount = parseFloat(number.price || 0);

        if (refundAmount > 0) {
          // Get current balance
          const [currentBalance] = await pool.execute(
            'SELECT balance FROM user_demo_balances WHERE user_id = ?',
            [userId]
          );

          const balanceBefore = parseFloat(currentBalance[0]?.balance || 0);
          const balanceAfter = balanceBefore + refundAmount;

          // Update user balance
          await pool.execute(
            `UPDATE user_demo_balances 
             SET balance = balance + ?,
                 last_transaction_at = NOW()
             WHERE user_id = ?`,
            [refundAmount, userId]
          );

          // Add refund transaction record
          await pool.execute(
            `INSERT INTO transactions 
             (user_id, transaction_type, amount, balance_before, balance_after,
              reference_id, description, status, created_at)
             VALUES (?, 'refund', ?, ?, ?, ?, ?, 'completed', NOW())`,
            [
              userId,
              refundAmount,
              balanceBefore,
              balanceAfter,
              number.activation_id,
              `Refund for cancelled SMS number ${number.phone_number} (${number.service_code})`
            ]
          );

          logger.info('💰 Refund processed:', {
            userId,
            activationId: number.activation_id,
            refundAmount,
            balanceBefore,
            balanceAfter
          });
        }

        await pool.execute('COMMIT');

        // Send WebSocket notifications
        webSocketService.sendToUser(userId, {
          type: 'number_cancelled',
          data: {
            activationId: number.activation_id,
            phoneNumber: number.phone_number,
            purchaseId: id,
            refundAmount
          }
        });

        // Notify balance update
        if (refundAmount > 0) {
          const [newBalance] = await pool.execute(
            'SELECT balance FROM user_demo_balances WHERE user_id = ?',
            [userId]
          );

          webSocketService.notifyBalanceUpdated(userId, newBalance[0].balance, refundAmount);
        }

        logger.info('✅ Number cancelled successfully with refund:', {
          userId,
          activationId: number.activation_id,
          refundAmount,
          purchaseId: id
        });

        res.json({
          success: true,
          message: 'Number cancelled successfully',
          data: {
            refundAmount,
            newStatus: 'cancelled'
          }
        });

      } catch (cancelError) {
        await pool.execute('ROLLBACK');
        throw cancelError;
      }

    } catch (error) {
      logger.error('❌ Cancel error:', error);
      res.status(500).json({
        error: 'Failed to cancel number',
        message: error.message
      });
    }
  }
);

// Helper methods
function calculateTimeRemaining(expiryDate) {
  if (!expiryDate) return 0;

  const now = new Date();
  const expiry = new Date(expiryDate);
  const diff = expiry.getTime() - now.getTime();

  return Math.max(0, Math.floor(diff / 1000)); // Return seconds
}

function calculateDaysRemaining(endDate) {
  if (!endDate) return 0;

  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();

  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))); // Return days
}

function calculateRefund(number) {
  if (!number || !number.purchase_date || !number.price) return 0;

  const totalLifetime = 20 * 60 * 1000; // 20 minutes in ms
  const elapsed = Date.now() - new Date(number.purchase_date).getTime();

  if (elapsed >= totalLifetime) return 0; // No refund if time elapsed

  const remainingFraction = (totalLifetime - elapsed) / totalLifetime;
  return parseFloat((number.price * remainingFraction * 0.5).toFixed(4)); // 50% refund rate
}

module.exports = router;