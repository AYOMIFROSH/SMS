// services/paymentWebhookProcessor.js - FIXED webhook processor
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

      // Log webhook for debugging
      await this.logWebhook(payload, requestId, !!signature);

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
        error: error.message,
        stack: error.stack
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  }

  async logWebhook(payload, requestId, signatureValid) {
    try {
      const pool = getPool();
      
      await pool.execute(
        `INSERT INTO webhook_logs
         (webhook_type, event_type, transaction_reference, payment_reference,
          payload, signature_valid, processed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())`,
        [
          'monnify',
          payload.eventType || 'unknown',
          payload.eventData?.transactionReference || null,
          payload.eventData?.paymentReference || null,
          JSON.stringify(payload),
          signatureValid
        ]
      );
    } catch (error) {
      logger.error('Failed to log webhook', { requestId, error: error.message });
    }
  }

  enqueueWebhook(payload, requestId) {
    const key = this.getWebhookKey(payload, requestId);
    
    if (this.processedWebhooks.has(key)) {
      logger.info('Duplicate webhook skipped', { key, eventType: payload.eventType });
      return;
    }

    this.webhookQueue.push({ payload, requestId, key });
    setImmediate(() => this.processQueue());
  }

  getWebhookKey(payload, requestId) {
    const eventType = payload.eventType;
    const eventData = payload.eventData || {};
    
    switch (eventType) {
      case 'SETTLEMENT_COMPLETED':
        return `settlement_${eventData.settlementReference || requestId}`;
      case 'SUCCESSFUL_TRANSACTION':
      case 'FAILED_TRANSACTION':
      case 'REVERSED_TRANSACTION':
        return `payment_${eventData.transactionReference || eventData.paymentReference || requestId}`;
      default:
        return `${eventType}_${requestId}`;
    }
  }

  async processQueue() {
    if (this.processing || this.webhookQueue.length === 0) return;
    
    this.processing = true;

    while (this.webhookQueue.length > 0) {
      const item = this.webhookQueue.shift();
      
      try {
        const result = await this.processWebhook(item.payload, item.requestId);
        
        if (result?.processed) {
          this.processedWebhooks.add(item.key);
        }
        
        if (this.processedWebhooks.size > 1000) {
          const entries = Array.from(this.processedWebhooks);
          entries.slice(0, 500).forEach(e => this.processedWebhooks.delete(e));
        }
      } catch (error) {
        logger.error('Queue processing error', {
          requestId: item.requestId,
          eventType: item.payload?.eventType,
          error: error.message
        });
        
        await this.updateWebhookLog(item.requestId, false, error.message);
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
      paymentReference: eventData?.paymentReference
    });

    let result;
    
    switch (eventType) {
      case 'SUCCESSFUL_TRANSACTION':
        result = await this.handleSuccessfulTransaction(eventData, requestId);
        break;
      
      case 'FAILED_TRANSACTION':
        result = await this.handleFailedTransaction(eventData, requestId);
        break;
      
      case 'REVERSED_TRANSACTION':
        result = await this.handleReversedTransaction(eventData, requestId);
        break;
      
      case 'SETTLEMENT_COMPLETED':
        result = await this.handleSettlementCompleted(eventData, requestId);
        break;
        
      case 'SETTLEMENT_FAILED':
        result = await this.handleSettlementFailed(eventData, requestId);
        break;
      
      default:
        logger.warn('Unknown webhook event type', { eventType, requestId });
        await this.logUnknownEvent(payload, requestId);
        result = { processed: false, reason: 'Unknown event type' };
    }

    await this.updateWebhookLog(requestId, result?.processed || false, result?.reason);

    return result;
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
        fee,
        settlementAmount
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

        // Get current balance
        const [balanceResult] = await pool.execute(
          'SELECT balance FROM sms_user_accounts WHERE user_id = ? LIMIT 1',
          [payment.user_id]
        );
        const previousBalance = parseFloat(balanceResult[0]?.balance || 0);

        // FIXED: Update payment record with settlement status set to PENDING initially
        await pool.execute(
          `UPDATE payment_transactions 
           SET status = 'PAID',
               amount_paid = ?,
               payment_method = ?,
               paid_at = ?,
               payment_status = ?,
               monnify_transaction_reference = ?,
               settlement_amount = ?,
               transaction_fee = ?,
               settlement_status = 'PENDING',
               updated_at = NOW()
           WHERE id = ?`,
          [
            amountPaid,
            paymentMethod,
            paidOn ? new Date(paidOn) : new Date(),
            paymentStatus || 'PAID',
            transactionReference,
            settlementAmount || null,
            fee || null,
            payment.id
          ]
        );

        // Update user balance
        let newBalance;
        if (balanceResult.length === 0) {
          await pool.execute(
            `INSERT INTO sms_user_accounts 
             (user_id, balance, account_status, total_deposited, deposit_count, last_deposit_at)
             VALUES (?, ?, 'active', ?, 1, NOW())`,
            [payment.user_id, amountPaid, amountPaid]
          );
          newBalance = parseFloat(amountPaid);
        } else {
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

        // FIXED: Send payment notifications with proper settlement status
        this.sendPaymentNotifications(payment.user_id, {
          type: 'payment_successful',
          paymentReference: paymentReference || transactionReference,
          transactionReference,
          amount: parseFloat(amountPaid),
          amountPaid: parseFloat(amountPaid),
          currency: currency || 'NGN',
          paymentMethod,
          newBalance,
          previousBalance,
          fee: fee ? parseFloat(fee) : null,
          settlementAmount: settlementAmount ? parseFloat(settlementAmount) : null,
          settlementStatus: 'PENDING' // FIXED: Initially PENDING
        });

        logger.info('Payment processed successfully', {
          requestId,
          userId: payment.user_id,
          amount: amountPaid,
          newBalance,
          transactionReference,
          settlementStatus: 'PENDING'
        });

        return { 
          processed: true, 
          userId: payment.user_id, 
          amount: amountPaid, 
          newBalance,
          settlementStatus: 'PENDING'
        };

      } catch (dbError) {
        await pool.execute('ROLLBACK');
        throw dbError;
      }

    } catch (error) {
      logger.error('Failed to handle successful transaction', {
        requestId,
        error: error.message,
        transactionReference: eventData?.transactionReference
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
        responseMessage,
        responseCode
      } = eventData;

      const pool = getPool();
      
      const [result] = await pool.execute(
        `UPDATE payment_transactions 
         SET status = 'FAILED',
             failure_reason = ?,
             payment_status = ?,
             response_code = ?,
             updated_at = NOW()
         WHERE payment_reference = ? OR transaction_reference = ?`,
        [
          responseMessage || 'Payment failed',
          paymentStatus || 'FAILED',
          responseCode || null,
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
            reason: responseMessage || 'Payment failed',
            responseCode
          });
        }

        logger.info('Failed transaction processed', {
          requestId,
          transactionReference,
          reason: responseMessage
        });

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
               settlement_status = 'FAILED',
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
          'UPDATE sms_user_accounts SET balance = ?, updated_at = NOW() WHERE user_id = ?',
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

        logger.info('Transaction reversed successfully', {
          requestId,
          transactionReference,
          amount: reversalAmount
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

  // FIXED: Handle settlement completion properly
  async handleSettlementCompleted(eventData, requestId) {
    const pool = getPool();
    
    try {
      const {
        settlementReference,
        settlementId,
        amount: settlementAmount,
        settlementDate,
        batchReference,
        transactionCount,
        merchantId,
        transactionReferences = []
      } = eventData;

      logger.info('Processing settlement completion', {
        requestId,
        settlementReference,
        settlementAmount,
        transactionCount
      });

      await pool.execute('START TRANSACTION');

      try {
        // Insert settlement log
        await pool.execute(
          `INSERT INTO settlement_logs 
           (settlement_reference, settlement_id, merchant_id, amount, 
            settlement_date, batch_reference, transaction_count, 
            settlement_data, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', NOW())
           ON DUPLICATE KEY UPDATE
             amount = VALUES(amount),
             settlement_date = VALUES(settlement_date),
             transaction_count = VALUES(transaction_count),
             settlement_data = VALUES(settlement_data),
             status = 'COMPLETED',
             updated_at = NOW()`,
          [
            settlementReference,
            settlementId,
            merchantId,
            settlementAmount,
            settlementDate ? new Date(settlementDate) : new Date(),
            batchReference,
            transactionCount || transactionReferences.length,
            JSON.stringify(eventData)
          ]
        );

        // FIXED: Update payment transactions settlement status
        if (transactionReferences && transactionReferences.length > 0) {
          const placeholders = transactionReferences.map(() => '?').join(',');
          
          const [updateResult] = await pool.execute(
            `UPDATE payment_transactions 
             SET settlement_reference = ?,
                 settlement_date = ?,
                 settlement_status = 'COMPLETED',
                 updated_at = NOW()
             WHERE (transaction_reference IN (${placeholders}) OR monnify_transaction_reference IN (${placeholders}))
             AND status = 'PAID'`,
            [
              settlementReference,
              settlementDate ? new Date(settlementDate) : new Date(),
              ...transactionReferences,
              ...transactionReferences // For both transaction_reference and monnify_transaction_reference
            ]
          );

          logger.info(`Updated ${updateResult.affectedRows} transactions with settlement info`, {
            settlementReference,
            transactionReferences
          });

          // FIXED: Notify users about settlement completion
          if (updateResult.affectedRows > 0) {
            const [affectedPayments] = await pool.execute(
              `SELECT DISTINCT user_id FROM payment_transactions 
               WHERE settlement_reference = ? 
               AND settlement_status = 'COMPLETED'`,
              [settlementReference]
            );

            // Send settlement notifications to affected users
            for (const payment of affectedPayments) {
              this.sendPaymentNotifications(payment.user_id, {
                type: 'settlement_completed',
                settlementReference,
                settlementAmount: parseFloat(settlementAmount),
                settlementDate,
                transactionCount: updateResult.affectedRows
              });
            }
          }
        } else {
          // FIXED: Update recent PAID transactions without specific references
          const [updateResult] = await pool.execute(
            `UPDATE payment_transactions 
             SET settlement_reference = ?,
                 settlement_date = ?,
                 settlement_status = 'COMPLETED',
                 updated_at = NOW()
             WHERE status = 'PAID'
             AND settlement_status = 'PENDING'
             AND paid_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
             ORDER BY paid_at ASC
             LIMIT ?`,
            [
              settlementReference,
              settlementDate ? new Date(settlementDate) : new Date(),
              transactionCount || 100
            ]
          );

          logger.info(`Updated ${updateResult.affectedRows} recent transactions with settlement info`, {
            settlementReference
          });
        }

        await pool.execute('COMMIT');

        return { 
          processed: true, 
          settlementReference,
          amount: settlementAmount,
          transactionCount
        };

      } catch (dbError) {
        await pool.execute('ROLLBACK');
        throw dbError;
      }

    } catch (error) {
      logger.error('Failed to handle settlement completion', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  async handleSettlementFailed(eventData, requestId) {
    const pool = getPool();
    
    try {
      const {
        settlementReference,
        settlementId,
        amount: settlementAmount,
        failureReason,
        batchReference,
        transactionCount
      } = eventData;

      logger.warn('Processing settlement failure', {
        requestId,
        settlementReference,
        failureReason
      });

      await pool.execute(
        `INSERT INTO settlement_logs 
         (settlement_reference, settlement_id, amount, batch_reference, 
          transaction_count, settlement_data, status, failure_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'FAILED', ?, NOW())
         ON DUPLICATE KEY UPDATE
           status = 'FAILED',
           failure_reason = VALUES(failure_reason),
           updated_at = NOW()`,
        [
          settlementReference,
          settlementId,
          settlementAmount,
          batchReference,
          transactionCount,
          JSON.stringify(eventData),
          failureReason
        ]
      );

      // Update payment transactions settlement status to FAILED
      const [updateResult] = await pool.execute(
        `UPDATE payment_transactions 
         SET settlement_status = 'FAILED',
             updated_at = NOW()
         WHERE settlement_reference = ?
         OR (status = 'PAID' AND settlement_status = 'PENDING')`,
        [settlementReference]
      );

      logger.info(`Marked ${updateResult.affectedRows} transactions as settlement failed`);

      return { 
        processed: true, 
        status: 'settlement_failed',
        settlementReference,
        reason: failureReason
      };

    } catch (error) {
      logger.error('Failed to handle settlement failure', {
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  async logUnknownEvent(payload, requestId) {
    try {
      const pool = getPool();
      
      await pool.execute(
        `INSERT INTO unknown_webhook_events
         (event_type, event_data, request_id, created_at)
         VALUES (?, ?, ?, NOW())`,
        [
          payload.eventType || 'unknown',
          JSON.stringify(payload),
          requestId
        ]
      );
      
      logger.warn('Unknown webhook event logged for investigation', {
        requestId,
        eventType: payload.eventType
      });
    } catch (error) {
      logger.error('Failed to log unknown event', {
        requestId,
        error: error.message
      });
    }
  }

  async updateWebhookLog(requestId, processed, errorMessage = null) {
    try {
      const pool = getPool();
      
      await pool.execute(
        `UPDATE webhook_logs 
         SET processed = ?, error_message = ?, updated_at = NOW()
         WHERE JSON_EXTRACT(payload, '$.requestId') = ?
         OR created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY created_at DESC LIMIT 1`,
        [processed, errorMessage, requestId]
      );
    } catch (error) {
      logger.error('Failed to update webhook log', { requestId, error: error.message });
    }
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

  // FIXED: Enhanced payment notifications with settlement status
  sendPaymentNotifications(userId, data) {
    try {
      logger.info('Sending payment notifications', {
        userId,
        type: data.type,
        reference: data.paymentReference || data.transactionReference,
        settlementStatus: data.settlementStatus
      });

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

        case 'payment_reversed':
          webSocketService.notifyPaymentReversed(userId, data);
          if (data.newBalance !== undefined) {
            webSocketService.notifyBalanceUpdated(userId, data.newBalance, -data.reversalAmount);
          }
          break;

        case 'settlement_completed':
          webSocketService.notifySettlementCompleted(userId, data);
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
}

module.exports = new PaymentWebhookProcessor();