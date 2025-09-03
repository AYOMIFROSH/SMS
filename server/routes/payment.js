// routes/payment.js - Fixed verification route
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPool } = require('../Config/database');
const monnifyService = require('./monnifyService');
const webSocketService = require('../services/webhookService');
const { 
  rateLimiters, 
  handleValidationErrors,
  createRateLimiter
} = require('../middleware/security');
const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

// Apply rate limiting
router.use(rateLimiters.api);

// Initialize payment (deposit)
router.post('/deposit', 
  authenticateToken,
  createRateLimiter(60000, 5, 'Too many deposit requests'),
  [
    body('amount')
      .isFloat({ min: 100, max: 1000000 })
      .withMessage('Amount must be between ₦100 and ₦1,000,000'),
    body('paymentMethod')
      .optional()
      .isIn(['CARD', 'ACCOUNT_TRANSFER', 'USSD', 'PHONE_NUMBER'])
      .withMessage('Invalid payment method')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { amount } = req.body;
      const userId = req.user.id;

      logger.info('Creating deposit payment:', { 
        userId, 
        amount 
      });

      // Get user info from authenticated session
      const userInfo = {
        name: `${req.user.firstname || ''} ${req.user.lastname || ''}`.trim() || `User ${userId}`,
        email: req.user.email || `user${userId}@smsplatform.com`
      };

      // Initialize transaction with Monnify
      const paymentResult = await monnifyService.initializeTransaction(
        userId, 
        amount, 
        userInfo
      );

      // Send real-time notification
      webSocketService.sendToUser(userId, {
        type: 'payment_initiated',
        data: {
          paymentReference: paymentResult.paymentReference,
          amount: parseFloat(amount),
          checkoutUrl: paymentResult.checkoutUrl,
          accountDetails: paymentResult.accountDetails,
          expiresAt: paymentResult.expiresAt
        }
      });

      logger.info('Deposit payment created successfully:', {
        userId,
        paymentReference: paymentResult.paymentReference,
        amount
      });

      res.json({
        success: true,
        data: {
          paymentReference: paymentResult.paymentReference,
          transactionReference: paymentResult.transactionReference,
          amount: parseFloat(amount),
          currency: paymentResult.currency,
          checkoutUrl: paymentResult.checkoutUrl,
          accountDetails: paymentResult.accountDetails,
          expiresAt: paymentResult.expiresAt,
          status: 'PENDING'
        }
      });

    } catch (error) {
      logger.error('Deposit creation error:', error);
      
      if (error.message.includes('authentication')) {
        return res.status(503).json({
          success: false,
          error: 'Payment service temporarily unavailable',
          message: 'Please try again in a few moments'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to create deposit payment',
        message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// FIXED: Verify payment status
router.get('/verify/:reference',
  authenticateToken,
  [
    param('reference')
      .trim()
      .matches(/^[A-Za-z0-9_-]+$/)
      .withMessage('Invalid reference format')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reference } = req.params;
      const userId = req.user.id;
      const pool = getPool();

      logger.info('Verifying payment:', { reference, userId });

      // First, check our local database
      const [payments] = await pool.execute(
        `SELECT * FROM payment_transactions 
         WHERE (payment_reference = ? OR transaction_reference = ?) 
         AND user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [reference, reference, userId]
      );

      if (payments.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      const payment = payments[0];
      
      // If payment is already terminal, return current status
      if (['PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(payment.status)) {
        return res.json({
          success: true,
          data: {
            paymentReference: payment.payment_reference,
            transactionReference: payment.transaction_reference,
            amount: parseFloat(payment.amount),
            amountPaid: parseFloat(payment.amount_paid || 0),
            currency: payment.currency,
            status: payment.status,
            paymentMethod: payment.payment_method,
            paymentDescription: payment.payment_description,
            createdAt: payment.created_at,
            paidAt: payment.paid_at,
            expiresAt: payment.expires_at,
            failureReason: payment.failure_reason
          }
        });
      }

      // If pending and has transaction reference, check with Monnify
      if (payment.status === 'PENDING' && payment.transaction_reference) {
        try {
          logger.info('Checking with Monnify for payment status:', {
            transactionReference: payment.transaction_reference,
            paymentReference: payment.payment_reference
          });

          let monnifyStatus = null;
          
          // Try verifying by transaction reference first
          try {
            monnifyStatus = await monnifyService.verifyTransaction(payment.transaction_reference);
          } catch (transError) {
            logger.warn('Transaction reference verification failed, trying payment reference:', transError.message);
            
            // Try verifying by payment reference
            try {
              monnifyStatus = await monnifyService.verifyPaymentByReference(payment.payment_reference);
            } catch (payError) {
              logger.warn('Both verification methods failed:', {
                transError: transError.message,
                payError: payError.message
              });
            }
          }

          // If we got status from Monnify but it's still pending, just return local data
          // The webhook will handle any actual status updates
          if (monnifyStatus) {
            logger.info('Monnify status check result:', {
              reference,
              monnifyStatus: monnifyStatus.paymentStatus,
              localStatus: payment.status
            });
          }

        } catch (verifyError) {
          logger.error('Monnify verification error:', verifyError.message);
          // Continue with local data - don't fail the request
        }
      }

      // Return current database status
      res.json({
        success: true,
        data: {
          paymentReference: payment.payment_reference,
          transactionReference: payment.transaction_reference,
          amount: parseFloat(payment.amount),
          amountPaid: parseFloat(payment.amount_paid || 0),
          currency: payment.currency,
          status: payment.status,
          paymentMethod: payment.payment_method,
          paymentDescription: payment.payment_description,
          createdAt: payment.created_at,
          paidAt: payment.paid_at,
          expiresAt: payment.expires_at,
          failureReason: payment.failure_reason
        }
      });

    } catch (error) {
      logger.error('Payment verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify payment',
        message: error.message
      });
    }
  }
);

// Get payment history
router.get('/history',
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1, max: 1000 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        startDate,
        endDate
      } = req.query;

      const userId = req.user.id;
      const offset = (page - 1) * limit;
      const pool = getPool();

      // Build query
      let query = `
        SELECT pt.*, 
               t.balance_after as current_balance
        FROM payment_transactions pt
        LEFT JOIN transactions t ON pt.transaction_reference = t.reference_id
        WHERE pt.user_id = ?
      `;
      
      const params = [userId];
      
      if (status) {
        query += ' AND pt.status = ?';
        params.push(status);
      }
      
      if (startDate) {
        query += ' AND pt.created_at >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        query += ' AND pt.created_at <= ?';
        params.push(endDate);
      }
      
      query += ' ORDER BY pt.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const [payments] = await pool.execute(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM payment_transactions WHERE user_id = ?';
      const countParams = [userId];
      
      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }
      
      if (startDate) {
        countQuery += ' AND created_at >= ?';
        countParams.push(startDate);
      }
      
      if (endDate) {
        countQuery += ' AND created_at <= ?';
        countParams.push(endDate);
      }

      const [countResult] = await pool.execute(countQuery, countParams);

      // Get summary statistics
      const [stats] = await pool.execute(
        `SELECT 
          COUNT(*) as total_payments,
          SUM(CASE WHEN status = 'PAID' THEN amount_paid ELSE 0 END) as total_deposited,
          SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) as pending_amount,
          COUNT(CASE WHEN status = 'PAID' THEN 1 END) as successful_payments,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_payments
         FROM payment_transactions 
         WHERE user_id = ?`,
        [userId]
      );

      res.json({
        success: true,
        data: payments.map(payment => ({
          ...payment,
          amount: parseFloat(payment.amount || 0),
          amount_paid: parseFloat(payment.amount_paid || 0),
          current_balance: parseFloat(payment.current_balance || 0)
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limit)
        },
        summary: {
          total_payments: stats[0].total_payments,
          total_deposited: parseFloat(stats[0].total_deposited || 0),
          pending_amount: parseFloat(stats[0].pending_amount || 0),
          successful_payments: stats[0].successful_payments,
          failed_payments: stats[0].failed_payments
        }
      });

    } catch (error) {
      logger.error('Payment history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get payment history',
        message: error.message
      });
    }
  }
);

// Get user balance
router.get('/balance',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const pool = getPool();

      const [smsAccount] = await pool.execute(
        `SELECT balance, total_spent, total_numbers_purchased, account_status,
                total_deposited, deposit_count, last_deposit_at
         FROM sms_user_accounts 
         WHERE user_id = ?`,
        [userId]
      );

      if (smsAccount.length === 0) {
        // Create account if doesn't exist
        await pool.execute(
          `INSERT INTO sms_user_accounts (user_id, balance, account_status) 
           VALUES (?, 0, 'active')`,
          [userId]
        );
        
        return res.json({
          success: true,
          data: {
            balance: 0,
            currency: 'NGN',
            total_spent: 0,
            total_deposited: 0,
            total_numbers_purchased: 0,
            account_status: 'active'
          }
        });
      }

      res.json({
        success: true,
        data: {
          balance: parseFloat(smsAccount[0].balance || 0),
          currency: 'NGN',
          total_spent: parseFloat(smsAccount[0].total_spent || 0),
          total_deposited: parseFloat(smsAccount[0].total_deposited || 0),
          total_numbers_purchased: smsAccount[0].total_numbers_purchased || 0,
          account_status: smsAccount[0].account_status,
          deposit_count: smsAccount[0].deposit_count || 0,
          last_deposit_at: smsAccount[0].last_deposit_at
        }
      });

    } catch (error) {
      logger.error('Get balance error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get balance',
        message: error.message
      });
    }
  }
);

// Cancel pending payment
router.post('/:paymentReference/cancel',
  authenticateToken,
  [
    param('paymentReference')
      .matches(/^[A-Za-z0-9_-]+$/)
      .withMessage('Invalid payment reference format')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { paymentReference } = req.params;
      const userId = req.user.id;
      const pool = getPool();

      const [payments] = await pool.execute(
        'SELECT * FROM payment_transactions WHERE payment_reference = ? AND user_id = ?',
        [paymentReference, userId]
      );

      if (payments.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      const payment = payments[0];

      if (payment.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: 'Can only cancel pending payments',
          code: 'INVALID_PAYMENT_STATUS',
          currentStatus: payment.status
        });
      }

      await pool.execute(
        'UPDATE payment_transactions SET status = ?, updated_at = NOW() WHERE id = ?',
        ['CANCELLED', payment.id]
      );

      webSocketService.sendToUser(userId, {
        type: 'payment_cancelled',
        data: {
          paymentReference,
          amount: parseFloat(payment.amount)
        }
      });

      logger.info('Payment cancelled:', { userId, paymentReference });

      res.json({
        success: true,
        message: 'Payment cancelled successfully'
      });

    } catch (error) {
      logger.error('Payment cancellation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel payment',
        message: error.message
      });
    }
  }
);

module.exports = router;