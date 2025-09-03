// services/paymentWebhookProcessor.js - Fixed webhook processor with proper notifications
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');
const webSocketService = require('./webhookService');
const monnifyService = require('../routes/monnifyService');

class PaymentWebhookProcessor {
  constructor() {
    this.processedWebhooks = new Set();
    this.webhookQueue = [];
    this.processing = false;
  }

  async handleWebhook(req, res) {
    const requestId = req.headers['x-request-id'] || require('crypto').randomUUID();
    
    try {
      const rawBody = req.rawBody || req.body;
      if (!rawBody) {
        logger.error('Webhook missing body', { requestId });
        return res.status(400).json({
          success: false,
          error: 'Missing request body'
        });
      }

      const rawString = Buffer.isBuffer(rawBody) 
        ? rawBody.toString('utf8') 
        : typeof rawBody === 'string' 
          ? rawBody 
          : JSON.stringify(rawBody);

      const signature = req.headers['x-monnify-signature'] || 
                       req.headers['monnify-signature'] || 
                       req.headers['X-Monnify-Signature'];

      logger.info('Processing webhook', {
        requestId,
        hasSignature: !!signature,
        bodyLength: rawString.length
      });

      // Verify signature
      if (!monnifyService.verifyWebhookSignature(rawString, signature)) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('Invalid webhook signature', { requestId });
          return res.status(401).json({
            success: false,
            error: 'Invalid signature'
          });
        }
        logger.warn('Invalid signature (ignored in dev mode)');
      }

      let payload;
      try {
        payload = typeof rawBody === 'object' && !Buffer.isBuffer(rawBody) 
          ? rawBody 
          : JSON.parse(rawString);
      } catch (error) {
        logger.error('Failed to parse webhook', { requestId, error: error.message });
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON'
        });
      }

      // Respond immediately to prevent timeout
      res.status(200).json({
        success: true,
        message: 'Webhook received',
        requestId
      });

      // Process async
      this.enqueueWebhook(payload, requestId);
      
    } catch (error) {
      logger.error('Webhook handler error', {
        requestId,
        error: error.message
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  }

  enqueueWebhook(payload, requestId) {
    const key = payload?.eventData?.transactionReference || 
                payload?.eventData?.paymentReference || 
                requestId;
    
    if (this.processedWebhooks.has(key)) {
      logger.info('Duplicate webhook skipped', { key });
      return;
    }

    this.webhookQueue.push({ payload, requestId, key });
    setImmediate(() => this.processQueue());
  }

  async processQueue() {
    if (this.processing || this.webhookQueue.length === 0) return;
    
    this.processing = true;

    while (this.webhookQueue.length > 0) {
      const item = this.webhookQueue.shift();
      
      try {
        await this.processWebhook(item.payload, item.requestId);
        this.processedWebhooks.add(item.key);
        
        if (this.processedWebhooks.size > 1000) {
          const entries = Array.from(this.processedWebhooks);
          entries.slice(0, 500).forEach(e => this.processedWebhooks.delete(e));
        }
      } catch (error) {
        logger.error('Queue processing error', {
          requestId: item.requestId,
          error: error.message
        });
      }
    }

    this.processing = false;
  }

  async processWebhook(payload, requestId) {
    const { eventType, eventData } = payload;
    
    logger.info('Processing webhook event', {
      requestId,
      eventType,
      transactionReference: eventData?.transactionReference,
      paymentReference: eventData?.paymentReference,
      amount: eventData?.amountPaid || eventData?.amount
    });

    switch (eventType) {
      case 'SUCCESSFUL_TRANSACTION':
        return await this.handleSuccessfulTransaction(eventData, requestId);
      
      case 'FAILED_TRANSACTION':
        return await this.handleFailedTransaction(eventData, requestId);
      
      case 'REVERSED_TRANSACTION':
        return await this.handleReversedTransaction(eventData, requestId);
      
      case 'REFUND_COMPLETED':
        return await this.handleRefundCompleted(eventData, requestId);
      
      default:
        logger.warn('Unknown webhook event type', { eventType, requestId });
        return { processed: false, reason: 'Unknown event type' };
    }
  }

  async handleSuccessfulTransaction(eventData, requestId) {
    const pool = getPool();
    
    try {
      const {
        transactionReference,
        paymentReference,
        amountPaid,
        paidOn,
        paymentMethod,
        currency,
        paymentStatus,
        customer
      } = eventData;

      await pool.execute('START TRANSACTION');
      
      try {
        // Find payment record
        const [payments] = await pool.execute(
          `SELECT * FROM payment_transactions 
           WHERE payment_reference = ? OR transaction_reference = ?
           LIMIT 1`,
          [paymentReference, transactionReference]
        );

        if (!payments || payments.length === 0) {
          await pool.execute('ROLLBACK');
          await this.logOrphanPayment(eventData, requestId);
          return { processed: false, reason: 'Payment not found' };
        }

        const payment = payments[0];

        if (payment.status === 'PAID') {
          await pool.execute('ROLLBACK');
          logger.info('Payment already processed', { paymentReference, requestId });
          return { processed: false, reason: 'Already processed' };
        }

        // Get current balance before update
        const [balanceResult] = await pool.execute(
          'SELECT balance FROM sms_user_accounts WHERE user_id = ? LIMIT 1',
          [payment.user_id]
        );
        const previousBalance = parseFloat(balanceResult[0]?.balance || 0);

        // Update payment record
        await pool.execute(
          `UPDATE payment_transactions 
           SET status = 'PAID',
               amount_paid = ?,
               payment_method = ?,
               paid_at = ?,
               payment_status = ?,
               monnify_transaction_reference = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [
            amountPaid,
            paymentMethod,
            paidOn ? new Date(paidOn) : new Date(),
            paymentStatus || 'PAID',
            transactionReference,
            payment.id
          ]
        );

        // Update user balance
        let newBalance;
        if (balanceResult.length === 0) {
          // Create account
          await pool.execute(
            `INSERT INTO sms_user_accounts 
             (user_id, balance, account_status, total_deposited, deposit_count, last_deposit_at)
             VALUES (?, ?, 'active', ?, 1, NOW())`,
            [payment.user_id, amountPaid, amountPaid]
          );
          newBalance = parseFloat(amountPaid);
        } else {
          // Update balance
          newBalance = previousBalance + parseFloat(amountPaid);
          
          await pool.execute(
            `UPDATE sms_user_accounts 
             SET balance = ?,
                 total_deposited = COALESCE(total_deposited, 0) + ?,
                 deposit_count = COALESCE(deposit_count, 0) + 1,
                 last_deposit_at = NOW(),
                 updated_at = NOW()
             WHERE user_id = ?`,
            [newBalance, amountPaid, payment.user_id]
          );
        }

        // Create transaction record
        await pool.execute(
          `INSERT INTO transactions 
           (user_id, transaction_type, amount, balance_before, balance_after,
            reference_id, description, status, payment_method, created_at)
           VALUES (?, 'deposit', ?, ?, ?, ?, ?, 'completed', ?, NOW())`,
          [
            payment.user_id,
            amountPaid,
            previousBalance,
            newBalance,
            transactionReference,
            `Deposit via ${paymentMethod || 'UNKNOWN'}`,
            paymentMethod
          ]
        );

        await pool.execute('COMMIT');

        // FIXED: Send immediate WebSocket notifications
        this.sendPaymentNotifications(payment.user_id, {
          type: 'payment_successful',
          paymentReference: paymentReference || transactionReference,
          transactionReference,
          amount: parseFloat(amountPaid),
          amountPaid: parseFloat(amountPaid),
          currency: currency || 'NGN',
          paymentMethod,
          newBalance,
          previousBalance
        });

        logger.info('Payment processed and notifications sent', {
          requestId,
          userId: payment.user_id,
          amount: amountPaid,
          newBalance
        });

        return { 
          processed: true, 
          userId: payment.user_id, 
          amount: amountPaid, 
          newBalance 
        };

      } catch (dbError) {
        await pool.execute('ROLLBACK');
        throw dbError;
      }

    } catch (error) {
      logger.error('Failed to handle successful transaction', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  async handleFailedTransaction(eventData, requestId) {
    try {
      const {
        transactionReference,
        paymentReference,
        paymentStatus,
        responseMessage
      } = eventData;

      const pool = getPool();
      
      const [result] = await pool.execute(
        `UPDATE payment_transactions 
         SET status = 'FAILED',
             failure_reason = ?,
             payment_status = ?,
             updated_at = NOW()
         WHERE payment_reference = ? OR transaction_reference = ?`,
        [
          responseMessage || 'Payment failed',
          paymentStatus || 'FAILED',
          paymentReference,
          transactionReference
        ]
      );

      if (result.affectedRows > 0) {
        const [payments] = await pool.execute(
          'SELECT user_id FROM payment_transactions WHERE payment_reference = ? OR transaction_reference = ?',
          [paymentReference, transactionReference]
        );

        if (payments.length > 0) {
          this.sendPaymentNotifications(payments[0].user_id, {
            type: 'payment_failed',
            paymentReference: paymentReference || transactionReference,
            transactionReference,
            amount: parseFloat(eventData.amount || 0),
            reason: responseMessage || 'Payment failed'
          });
        }

        return { processed: true, status: 'failed' };
      }

      await this.logOrphanPayment(eventData, requestId);
      return { processed: false, reason: 'Payment not found' };

    } catch (error) {
      logger.error('Failed to handle failed transaction', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  async handleReversedTransaction(eventData, requestId) {
    const pool = getPool();
    
    try {
      const {
        transactionReference,
        reversalAmount,
        reversalReference,
        reversalReason
      } = eventData;

      await pool.execute('START TRANSACTION');
      
      try {
        const [payments] = await pool.execute(
          'SELECT * FROM payment_transactions WHERE transaction_reference = ? OR monnify_transaction_reference = ?',
          [transactionReference, transactionReference]
        );

        if (!payments || payments.length === 0) {
          await pool.execute('ROLLBACK');
          return { processed: false, reason: 'Original payment not found' };
        }

        const payment = payments[0];

        if (payment.status !== 'PAID') {
          await pool.execute('ROLLBACK');
          return { processed: false, reason: 'Can only reverse paid transactions' };
        }

        await pool.execute(
          `UPDATE payment_transactions 
           SET status = 'REVERSED',
               failure_reason = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [reversalReason || 'Transaction reversed', payment.id]
        );

        // Get current balance
        const [balanceResult] = await pool.execute(
          'SELECT balance FROM sms_user_accounts WHERE user_id = ?',
          [payment.user_id]
        );
        const currentBalance = parseFloat(balanceResult[0]?.balance || 0);
        const newBalance = Math.max(0, currentBalance - parseFloat(reversalAmount));

        // Update balance
        await pool.execute(
          'UPDATE sms_user_accounts SET balance = ? WHERE user_id = ?',
          [newBalance, payment.user_id]
        );

        // Create reversal transaction
        await pool.execute(
          `INSERT INTO transactions 
           (user_id, transaction_type, amount, balance_before, balance_after,
            reference_id, description, status, created_at)
           VALUES (?, 'refund', ?, ?, ?, ?, ?, 'completed', NOW())`,
          [
            payment.user_id,
            -Math.abs(reversalAmount),
            currentBalance,
            newBalance,
            reversalReference || transactionReference,
            `Payment reversal: ${reversalReason || 'N/A'}`
          ]
        );

        await pool.execute('COMMIT');

        // Send reversal notification
        this.sendPaymentNotifications(payment.user_id, {
          type: 'payment_reversed',
          transactionReference,
          paymentReference: payment.payment_reference,
          reversalAmount: parseFloat(reversalAmount),
          reason: reversalReason,
          newBalance
        });

        return { processed: true, status: 'reversed' };

      } catch (dbError) {
        await pool.execute('ROLLBACK');
        throw dbError;
      }

    } catch (error) {
      logger.error('Failed to handle reversal', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  async handleRefundCompleted(eventData, requestId) {
    logger.info('Processing refund', { requestId, ...eventData });
    return this.handleReversedTransaction(eventData, requestId);
  }

  async logOrphanPayment(eventData, requestId) {
    try {
      const pool = getPool();
      
      await pool.execute(
        `INSERT INTO orphan_payments
         (transaction_reference, payment_reference, amount, 
          payment_method, customer_email, event_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           event_data = VALUES(event_data),
           updated_at = NOW()`,
        [
          eventData.transactionReference,
          eventData.paymentReference,
          eventData.amountPaid || eventData.amount,
          eventData.paymentMethod,
          eventData.customer?.email,
          JSON.stringify(eventData)
        ]
      );
      
      logger.warn('Orphan payment logged', {
        requestId,
        paymentReference: eventData.paymentReference,
        transactionReference: eventData.transactionReference
      });
    } catch (error) {
      logger.error('Failed to log orphan payment', {
        requestId,
        error: error.message
      });
    }
  }

  // FIXED: Proper WebSocket notification sender
  sendPaymentNotifications(userId, data) {
    try {
      logger.info('Sending payment notifications', {
        userId,
        type: data.type,
        reference: data.paymentReference || data.transactionReference
      });

      // Send specific payment notification based on type
      switch (data.type) {
        case 'payment_successful':
          webSocketService.notifyPaymentSuccessful(userId, data);
          if (data.newBalance !== undefined) {
            webSocketService.notifyBalanceUpdated(userId, data.newBalance, data.amount);
          }
          break;

        case 'payment_failed':
          webSocketService.notifyPaymentFailed(userId, data);
          break;

        case 'payment_cancelled':
          webSocketService.notifyPaymentCancelled(userId, data);
          break;

        case 'payment_reversed':
          webSocketService.notifyPaymentReversed(userId, data);
          if (data.newBalance !== undefined) {
            webSocketService.notifyBalanceUpdated(userId, data.newBalance, -data.reversalAmount);
          }
          break;

        default:
          logger.warn('Unknown payment notification type', { type: data.type });
      }

    } catch (error) {
      logger.error('Failed to send payment notifications', {
        userId,
        error: error.message
      });
    }
  }

  async cleanupExpiredPayments() {
    try {
      const pool = getPool();
      
      const [result] = await pool.execute(`
        UPDATE payment_transactions 
        SET status = 'EXPIRED', 
            updated_at = NOW()
        WHERE status = 'PENDING'
          AND expires_at < NOW()
          AND expires_at IS NOT NULL
      `);

      if (result.affectedRows > 0) {
        logger.info(`Marked ${result.affectedRows} payments as expired`);
      }
      
      return result.affectedRows;
    } catch (error) {
      logger.error('Cleanup expired payments error:', error.message);
      return 0;
    }
  }

  async reconcileOrphanPayments() {
    const pool = getPool();
    
    try {
      const [orphans] = await pool.execute(
        `SELECT * FROM orphan_payments 
         WHERE reconciled = FALSE 
         ORDER BY created_at ASC 
         LIMIT 100`
      );

      let reconciledCount = 0;

      for (const orphan of orphans) {
        try {
          const eventData = JSON.parse(orphan.event_data || '{}');
          const customerEmail = eventData.customer?.email || orphan.customer_email;

          if (!customerEmail) continue;

          // Find user by email from existing database
          const { getExistingDbPool } = require('../Config/database');
          const existingPool = getExistingDbPool();
          
          const [users] = await existingPool.execute(
            'SELECT id FROM users WHERE email = ?',
            [customerEmail]
          );

          if (users.length === 0) continue;

          const userId = users[0].id;

          // Process as successful payment
          await this.handleSuccessfulTransaction({
            ...eventData,
            userId
          }, `reconcile_${orphan.id}`);

          // Mark as reconciled
          await pool.execute(
            'UPDATE orphan_payments SET reconciled = TRUE, reconciled_at = NOW() WHERE id = ?',
            [orphan.id]
          );

          reconciledCount++;
          
          logger.info('Orphan payment reconciled', {
            orphanId: orphan.id,
            userId,
            amount: orphan.amount
          });
          
        } catch (error) {
          logger.error(`Failed to reconcile orphan ${orphan.id}:`, error.message);
        }
      }

      logger.info(`Reconciled ${reconciledCount} orphan payments`);
      return reconciledCount;

    } catch (error) {
      logger.error('Orphan reconciliation error:', error.message);
      return 0;
    }
  }
}

module.exports = new PaymentWebhookProcessor();