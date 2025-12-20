// routes/payment.js - Flutterwave payment routes
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { rateLimiters, validationRules, handleValidationErrors } = require('../middleware/security');
const flutterwaveService = require('../services/flutterwaveServices');
const { getPool, getExistingDbPool } = require('../Config/database');
const logger = require('../utils/logger');
const webSocketService = require('../services/webhookService');
const router = express.Router();

// Validation rules
const createDepositValidation = [
  body('amount')
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Amount must be between 100 and 1,000,000 NGN'),
  body('payment_type')
    .isIn(['card', 'bank', 'ussd', 'mobile'])
    .withMessage('Invalid payment type'),
  body('customer_email')
    .optional()
    .isEmail()
    .withMessage('Invalid email format'),
  body('customer_phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Invalid phone number format')
];

const verifyPaymentValidation = [
  param('txRef')
    .matches(/^SMS_\d+_\d+_[A-Z0-9]+$/)
    .withMessage('Invalid transaction reference format')
];

// Helper functions
const formatAmount = (amount, currency = 'USD') => {
  const symbol = currency === 'NGN' ? '₦' : '$';
  const decimals = currency === 'NGN' ? 2 : 4;
  return `${symbol}${parseFloat(amount).toFixed(decimals)}`;
};

const validateAmount = (amount) => {
  const numAmount = parseFloat(amount);
  
  if (isNaN(numAmount) || numAmount <= 0) {
    return { isValid: false, error: 'Amount must be a positive number' };
  }
  
  if (numAmount < 100) {
    return { isValid: false, error: 'Minimum deposit amount is ₦100' };
  }
  
  if (numAmount > 1000000) {
    return { isValid: false, error: 'Maximum deposit amount is ₦1,000,000' };
  }
  
  return { isValid: true };
};

// GET /api/payments/exchange-rate - Get current NGN/USD exchange rate
router.get('/exchange-rate', 
  rateLimiters.api,
  authenticateToken,
  async (req, res) => {
    try {
      const { from = 'USD', to = 'NGN' } = req.query;
      
      const fxResult = await flutterwaveService.getCurrentFxRate(from, to);
      
      res.json({
        success: true,
        data: {
          from_currency: from,
          to_currency: to,
          rate: fxResult.rate,
          source: fxResult.source,
          timestamp: new Date().toISOString(),
          formatted_rate: `1 ${from} = ${fxResult.rate.toFixed(2)} ${to}`
        }
      });

    } catch (error) {
      logger.error('Exchange rate fetch error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch exchange rate',
        code: 'FX_RATE_ERROR'
      });
    }
  }
);

// POST /api/payments/calculate-usd - Calculate USD equivalent for NGN amount
router.post('/calculate-usd',
  rateLimiters.api,
  authenticateToken,
  [
    body('amount').isFloat({ min: 100, max: 1000000 }).withMessage('Invalid amount')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { amount } = req.body;
      
      const validation = validateAmount(amount);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          code: 'INVALID_AMOUNT'
        });
      }

      const result = await flutterwaveService.calculateUSDEquivalent(amount);
      
      res.json({
        success: true,
        data: {
          ngn_amount: parseFloat(amount),
          usd_equivalent: result.usdEquivalent,
          fx_rate: result.fxRate,
          source: result.source,
          margin_percentage: result.margin,
          formatted_ngn: formatAmount(amount, 'NGN'),
          formatted_usd: formatAmount(result.usdEquivalent, 'USD'),
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('USD calculation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to calculate USD equivalent',
        code: 'CALCULATION_ERROR'
      });
    }
  }
);

// POST /api/payments/create-deposit - Create new deposit
router.post('/create-deposit',
  rateLimiters.api,
  authenticateToken,
  createDepositValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { amount, payment_type, customer_email, customer_phone } = req.body;
      const userId = req.user.id;
      const clientIP = req.ip;

      logger.info('Creating deposit:', {
        userId,
        amount,
        payment_type,
        ip: clientIP
      });

      // Validate amount
      const validation = validateAmount(amount);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          code: 'INVALID_AMOUNT'
        });
      }

      // Get user details for payment
      const existingPool = getExistingDbPool();
      const [users] = await existingPool.execute(
        'SELECT username, email, firstname, lastname FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const user = users[0];
      const customerEmail = customer_email || user.email;
      const customerName = `${user.firstname} ${user.lastname}`.trim() || user.username;

      // Calculate USD equivalent
      const fxResult = await flutterwaveService.calculateUSDEquivalent(amount);

      // Create payment session
      const paymentResult = await flutterwaveService.createPaymentSession({
        userId,
        amount,
        currency: 'NGN',
        paymentType: payment_type,
        customerEmail,
        customerName,
        customerPhone: customer_phone,
        meta: {
          ip_address: clientIP,
          user_agent: req.headers['user-agent'],
          user_id: userId,
          username: user.username
        }
      });

      // Update with calculated FX
      const pool = getPool();
      await pool.execute(`
        UPDATE payment_deposits 
        SET fx_rate = ?, usd_equivalent = ?
        WHERE tx_ref = ?
      `, [fxResult.fxRate, fxResult.usdEquivalent, paymentResult.tx_ref]);

      logger.info('Deposit created successfully:', {
        txRef: paymentResult.tx_ref,
        userId,
        usdEquivalent: fxResult.usdEquivalent
      });

      res.json({
        success: true,
        data: {
          tx_ref: paymentResult.tx_ref,
          payment_link: paymentResult.payment_link,
          checkout_token: paymentResult.checkout_token,
          expires_at: paymentResult.expires_at,
          ngn_amount: parseFloat(amount),
          usd_equivalent: fxResult.usdEquivalent,
          fx_rate: fxResult.fxRate,
          currency: 'NGN',
          payment_type,
          formatted_ngn: formatAmount(amount, 'NGN'),
          formatted_usd: formatAmount(fxResult.usdEquivalent, 'USD')
        },
        message: 'Payment session created successfully'
      });

    } catch (error) {
      logger.error('Create deposit error:', {
        error: error.message,
        userId: req.user?.id,
        amount: req.body?.amount
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create deposit',
        code: 'DEPOSIT_CREATION_FAILED',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// GET /api/payments/deposits - Get user's deposits with pagination
router.get('/deposits',
  rateLimiters.api,
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('status').optional().isIn(['PENDING_UNSETTLED', 'PAID_SETTLED', 'FAILED', 'CANCELLED']),
    query('start_date').optional().isISO8601().withMessage('Invalid start date'),
    query('end_date').optional().isISO8601().withMessage('Invalid end date')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      
      const { status, start_date, end_date } = req.query;

      const pool = getPool();
      let whereClause = 'WHERE user_id = ?';
      const queryParams = [userId];

      // Add filters
      if (status) {
        whereClause += ' AND status = ?';
        queryParams.push(status);
      }

      if (start_date) {
        whereClause += ' AND created_at >= ?';
        queryParams.push(start_date);
      }

      if (end_date) {
        whereClause += ' AND created_at <= ?';
        queryParams.push(end_date);
      }

      // Get total count
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM payment_deposits ${whereClause}`,
        queryParams
      );

      const totalRecords = countResult[0].total;
      const totalPages = Math.ceil(totalRecords / limit);

      // Get deposits
      const [deposits] = await pool.execute(`
        SELECT 
          id, tx_ref, flw_tx_id, flw_ref, ngn_amount, usd_equivalent, 
          fx_rate, status, payment_type, currency, customer_email, 
          customer_name, customer_phone, charged_amount, app_fee, 
          merchant_fee, payment_link, created_at, paid_at, expires_at
        FROM payment_deposits 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, limit, offset]);

      res.json({
        success: true,
        data: {
          deposits: deposits.map(deposit => ({
            ...deposit,
            formatted_ngn: formatAmount(deposit.ngn_amount, 'NGN'),
            formatted_usd: formatAmount(deposit.usd_equivalent, 'USD')
          })),
          pagination: {
            page,
            limit,
            total_records: totalRecords,
            total_pages: totalPages,
            has_next: page < totalPages,
            has_previous: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Get deposits error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch deposits',
        code: 'FETCH_DEPOSITS_ERROR'
      });
    }
  }
);

// GET /api/payments/balance - Get user balance and summary
router.get('/balance',
  rateLimiters.api,
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const pool = getPool();

      // Get or create balance record
      await pool.execute(`
        INSERT IGNORE INTO user_demo_balances (user_id, balance)
        VALUES (?, 0)
      `, [userId]);

      // Get balance and summary
      const [balanceResult] = await pool.execute(`
        SELECT 
          balance, total_deposited, total_spent, pending_deposits,
          last_deposit_at, last_transaction_at
        FROM user_demo_balances 
        WHERE user_id = ?
      `, [userId]);

      // Get deposits summary
      const [depositsSummary] = await pool.execute(`
        SELECT 
          COUNT(*) as total_payments,
          COUNT(CASE WHEN status = 'PAID_SETTLED' THEN 1 END) as successful_payments,
          COUNT(CASE WHEN status = 'PENDING_UNSETTLED' THEN 1 END) as pending_payments,
          COALESCE(SUM(CASE WHEN status = 'PENDING_UNSETTLED' THEN usd_equivalent ELSE 0 END), 0) as pending_amount,
          COALESCE(SUM(CASE WHEN status = 'PAID_SETTLED' THEN usd_equivalent ELSE 0 END), 0) as total_deposited_calculated
        FROM payment_deposits 
        WHERE user_id = ?
      `, [userId]);

      const balance = balanceResult[0];
      const summary = depositsSummary[0];

      res.json({
        success: true,
        data: {
          balance: {
            balance: parseFloat(balance.balance),
            total_deposited: parseFloat(balance.total_deposited),
            total_spent: parseFloat(balance.total_spent),
            pending_deposits: parseFloat(balance.pending_deposits),
            formatted_balance: formatAmount(balance.balance, 'USD'),
            last_deposit_at: balance.last_deposit_at,
            last_transaction_at: balance.last_transaction_at
          },
          summary: {
            total_payments: summary.total_payments,
            successful_payments: summary.successful_payments,
            pending_payments: summary.pending_payments,
            pending_amount: parseFloat(summary.pending_amount),
            success_rate: summary.total_payments > 0 
              ? Math.round((summary.successful_payments / summary.total_payments) * 100)
              : 0
          }
        }
      });

    } catch (error) {
      logger.error('Get balance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch balance',
        code: 'BALANCE_FETCH_ERROR'
      });
    }
  }
);

// POST /api/payments/verify/:txRef - Manually verify payment
router.post('/verify/:txRef',
  rateLimiters.api,
  authenticateToken,
  verifyPaymentValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { txRef } = req.params;
      const userId = req.user.id;

      const pool = getPool();

      // Check if deposit belongs to user
      const [deposits] = await pool.execute(
        'SELECT id, status, flw_tx_id, expires_at FROM payment_deposits WHERE tx_ref = ? AND user_id = ?',
        [txRef, userId]
      );

      if (deposits.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Deposit not found or access denied',
          code: 'DEPOSIT_NOT_FOUND'
        });
      }

      const deposit = deposits[0];

      if (deposit.status === 'PAID_SETTLED') {
        return res.json({
          success: true,
          message: 'Payment already verified and settled',
          data: { status: 'PAID_SETTLED' }
        });
      }

      // Check if payment is expired
      const now = new Date();
      const expiresAt = new Date(deposit.expires_at);
      const isExpired = now > expiresAt;

      if (isExpired && deposit.status === 'PENDING_UNSETTLED') {
        // Auto-cancel expired pending payment
        await pool.execute(
          'UPDATE payment_deposits SET status = ?, updated_at = NOW() WHERE tx_ref = ?',
          ['CANCELLED', txRef]
        );

        logger.info('Expired payment auto-cancelled:', { txRef, userId });

        return res.status(400).json({
          success: false,
          error: 'Payment session has expired. Please create a new payment.',
          code: 'PAYMENT_EXPIRED',
          data: {
            tx_ref: txRef,
            status: 'CANCELLED',
            action_required: 'create_new_payment'
          }
        });
      }

      // Use Flutterwave TX ID for verification if available
      const verifyId = deposit.flw_tx_id || txRef;
      
      logger.info('Manual payment verification:', {
        txRef,
        verifyId,
        userId,
        currentStatus: deposit.status
      });

      const verificationResult = await flutterwaveService.verifyTransaction(verifyId, 'manual');

      if (!verificationResult.success) {
        return res.status(400).json({
          success: false,
          error: verificationResult.error || 'Verification failed',
          code: 'VERIFICATION_FAILED'
        });
      }

      // Handle NOT_ACTIVATED status (payment was never initiated on Flutterwave)
      if (verificationResult.status === 'NOT_ACTIVATED') {
        // Mark as CANCELLED since user never completed checkout
        await pool.execute(
          'UPDATE payment_deposits SET status = ?, updated_at = NOW() WHERE tx_ref = ?',
          ['CANCELLED', txRef]
        );

        // Log the cancellation
        await pool.execute(`
          INSERT INTO payment_transaction_logs (
            user_id, tx_ref, action, status_before, status_after, metadata
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          userId, 
          txRef, 
          'auto_cancelled_not_activated', 
          'PENDING_UNSETTLED', 
          'CANCELLED',
          JSON.stringify({ 
            reason: 'Payment not activated on Flutterwave',
            verification_attempt: 'manual'
          })
        ]);

        logger.info('Payment cancelled - never activated:', { txRef, userId });

        return res.status(400).json({
          success: false,
          error: 'Payment was not completed. The checkout session was not activated.',
          code: 'PAYMENT_NOT_ACTIVATED',
          data: {
            tx_ref: txRef,
            status: 'CANCELLED',
            message: 'This payment was cancelled because it was never activated. Please create a new payment if you wish to proceed.',
            action_required: 'create_new_payment'
          }
        });
      }

      const txData = verificationResult.data;

      if (txData.status === 'successful') {
        // Process the successful payment
        const result = await flutterwaveService.processSuccessfulPayment(txData, 'manual_verify');

        // Send WebSocket notification
        if (result.success && !result.alreadyProcessed) {
          webSocketService.notifyPaymentSuccessful(userId, {
            paymentReference: txRef,
            transactionReference: txData.flw_ref,
            amount: txData.amount,
            currency: txData.currency,
            newBalance: result.newBalance,
            settlementStatus: 'COMPLETED'
          });

          webSocketService.notifyBalanceUpdated(userId, result.newBalance, result.usdEquivalent);
        }

        res.json({
          success: true,
          message: 'Payment verified and processed successfully',
          data: {
            tx_ref: txRef,
            status: 'PAID_SETTLED',
            amount_settled: txData.amount,
            usd_equivalent: result.usdEquivalent,
            fx_rate: result.fxRate,
            already_processed: result.alreadyProcessed || false
          }
        });
      } else {
        // Update status to failed if transaction failed
        await pool.execute(
          'UPDATE payment_deposits SET status = ?, updated_at = NOW() WHERE tx_ref = ?',
          ['FAILED', txRef]
        );

        // Log the failure
        await pool.execute(`
          INSERT INTO payment_transaction_logs (
            user_id, tx_ref, action, status_before, status_after, metadata
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
          userId, 
          txRef, 
          'payment_failed', 
          'PENDING_UNSETTLED', 
          'FAILED',
          JSON.stringify({ 
            flw_status: txData.status,
            verification_attempt: 'manual'
          })
        ]);

        logger.info('Payment marked as failed:', { txRef, userId, flwStatus: txData.status });

        res.status(400).json({
          success: false,
          error: `Payment verification failed: ${txData.status}`,
          code: 'PAYMENT_FAILED',
          data: {
            tx_ref: txRef,
            status: 'FAILED',
            flw_status: txData.status
          }
        });
      }

    } catch (error) {
      logger.error('Manual verification error:', {
        txRef: req.params.txRef,
        error: error.message,
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Verification failed due to server error',
        code: 'VERIFICATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);
// DELETE /api/payments/cancel/:txRef - Cancel pending payment
router.delete('/cancel/:txRef',
  rateLimiters.api,
  authenticateToken,
  verifyPaymentValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { txRef } = req.params;
      const userId = req.user.id;
      const pool = getPool();

      // Check if deposit belongs to user and is cancellable
      const [deposits] = await pool.execute(
        'SELECT id, status FROM payment_deposits WHERE tx_ref = ? AND user_id = ?',
        [txRef, userId]
      );

      if (deposits.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Deposit not found',
          code: 'DEPOSIT_NOT_FOUND'
        });
      }

      const deposit = deposits[0];

      if (deposit.status !== 'PENDING_UNSETTLED') {
        return res.status(400).json({
          success: false,
          error: `Cannot cancel payment with status: ${deposit.status}`,
          code: 'INVALID_STATUS_FOR_CANCELLATION'
        });
      }

      // Update status to cancelled
      await pool.execute(
        'UPDATE payment_deposits SET status = ?, updated_at = NOW() WHERE tx_ref = ?',
        ['CANCELLED', txRef]
      );

      // Log cancellation
      await pool.execute(`
        INSERT INTO payment_transaction_logs (
          user_id, tx_ref, action, status_before, status_after
        ) VALUES (?, ?, ?, ?, ?)
      `, [userId, txRef, 'cancelled_by_user', 'PENDING_UNSETTLED', 'CANCELLED']);

      logger.info('Payment cancelled by user:', { txRef, userId });

      res.json({
        success: true,
        message: 'Payment cancelled successfully',
        data: {
          tx_ref: txRef,
          status: 'CANCELLED'
        }
      });

    } catch (error) {
      logger.error('Cancel payment error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel payment',
        code: 'CANCELLATION_ERROR'
      });
    }
  }
);

// GET /api/payments/status/:txRef - Get payment status
router.get('/status/:txRef',
  rateLimiters.api,
  authenticateToken,
  verifyPaymentValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { txRef } = req.params;
      const userId = req.user.id;
      const pool = getPool();

      const [deposits] = await pool.execute(`
        SELECT 
          id, tx_ref, flw_tx_id, flw_ref, ngn_amount, usd_equivalent,
          fx_rate, status, payment_type, created_at, paid_at, expires_at,
          payment_link
        FROM payment_deposits 
        WHERE tx_ref = ? AND user_id = ?
      `, [txRef, userId]);

      if (deposits.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      const deposit = deposits[0];

      res.json({
        success: true,
        data: {
          tx_ref: deposit.tx_ref,
          status: deposit.status,
          ngn_amount: parseFloat(deposit.ngn_amount),
          usd_equivalent: parseFloat(deposit.usd_equivalent),
          fx_rate: parseFloat(deposit.fx_rate),
          payment_type: deposit.payment_type,
          created_at: deposit.created_at,
          paid_at: deposit.paid_at,
          expires_at: deposit.expires_at,
          payment_link: deposit.payment_link,
          formatted_ngn: formatAmount(deposit.ngn_amount, 'NGN'),
          formatted_usd: formatAmount(deposit.usd_equivalent, 'USD'),
          is_expired: deposit.expires_at ? new Date() > new Date(deposit.expires_at) : false
        }
      });

    } catch (error) {
      logger.error('Get payment status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment status',
        code: 'STATUS_FETCH_ERROR'
      });
    }
  }
);

// Add this temporary route to your routes/payment.js for testing
router.get('/test-flw-connection',
  rateLimiters.api,
  authenticateToken,
  async (req, res) => {
    try {
      logger.info('Testing Flutterwave connection via API endpoint...');
      
      // Test 1: Basic configuration check
      const configCheck = {
        has_public_key: !!process.env.FLW_PUBLIC_KEY,
        has_secret_key: !!process.env.FLW_SECRET_KEY,
        has_secret_hash: !!process.env.FLW_SECRET_HASH,
        public_key_format: process.env.FLW_PUBLIC_KEY ? process.env.FLW_PUBLIC_KEY.substring(0, 15) + '...' : 'missing',
        secret_key_format: process.env.FLW_SECRET_KEY ? process.env.FLW_SECRET_KEY.substring(0, 15) + '...' : 'missing',
        base_url: flutterwaveService.baseURL
      };

      // Test 2: Simple connection test
      let connectionTest;
      try {
        connectionTest = await flutterwaveService.testConnection();
      } catch (testError) {
        connectionTest = {
          success: false,
          error: testError.message,
          details: 'Connection test threw an exception'
        };
      }

      // Test 3: Try a direct axios call to verify credentials
      let directTest;
      try {
        const axios = require('axios');
        const directResponse = await axios.get('https://api.flutterwave.com/v3/banks/NG', {
          headers: {
            'Authorization': `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        directTest = {
          success: true,
          status: directResponse.status,
          data_count: Array.isArray(directResponse.data?.data) ? directResponse.data.data.length : 0,
          response_status: directResponse.data?.status
        };
      } catch (directError) {
        directTest = {
          success: false,
          error: directError.message,
          status: directError.response?.status,
          response_data: directError.response?.data
        };
      }

      res.json({
        success: true,
        message: 'Flutterwave connection test completed',
        tests: {
          config_check: configCheck,
          service_connection_test: connectionTest,
          direct_api_test: directTest
        },
        recommendations: connectionTest.success ? [
          'Connection successful! You can proceed with payment creation.'
        ] : [
          'Check if your FLW_SECRET_KEY is correct and active',
          'Verify your Flutterwave account is not suspended',
          'Ensure you\'re using the correct environment (test/live) keys'
        ]
      });
      
    } catch (error) {
      logger.error('Flutterwave connection test error:', error);
      res.status(500).json({
        success: false,
        error: 'Connection test failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

router.get('/checkout-status/:txRef',
  rateLimiters.api,
  authenticateToken,
  verifyPaymentValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { txRef } = req.params;
      const userId = req.user.id;
      const pool = getPool();

      const [deposits] = await pool.execute(
        `SELECT tx_ref, status, payment_link, expires_at, created_at 
         FROM payment_deposits 
         WHERE tx_ref = ? AND user_id = ?`,
        [txRef, userId]
      );

      if (deposits.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      const deposit = deposits[0];
      const now = new Date();
      const expiresAt = new Date(deposit.expires_at);
      const isExpired = now > expiresAt;

      res.json({
        success: true,
        data: {
          tx_ref: deposit.tx_ref,
          status: deposit.status,
          is_expired: isExpired,
          is_valid: deposit.status === 'PENDING_UNSETTLED' && !isExpired,
          payment_link: !isExpired ? deposit.payment_link : null,
          expires_at: deposit.expires_at,
          time_remaining_seconds: !isExpired ? Math.floor((expiresAt - now) / 1000) : 0
        }
      });

    } catch (error) {
      logger.error('Checkout status check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check checkout status'
      });
    }
  }
);

module.exports = router;