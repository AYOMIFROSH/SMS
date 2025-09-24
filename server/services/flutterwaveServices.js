// services/flutterwaveServices.js - ENHANCED with proper transaction verification
const axios = require('axios');
const crypto = require('crypto');
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');
require('dotenv').config();


class FlutterwaveService {
  constructor() {
    this.publicKey = process.env.FLW_PUBLIC_KEY;
    this.secretKey = process.env.FLW_SECRET_KEY;
    this.secretHash = process.env.FLW_SECRET_HASH;
    this.encryptionKey = process.env.FLW_ENCRYPTION_KEY;

    // Use v3 API URLs
    this.baseURL = process.env.NODE_ENV === 'production'
      ? 'https://api.flutterwave.com/v3'
      : 'https://api.flutterwave.com/v3';

    this.validateConfig();

    // Setup axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secretKey}`,
      }
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Flutterwave API Request:', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          headers: { ...config.headers, Authorization: 'Bearer [REDACTED]' }
        });
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Flutterwave API Response:', {
          status: response.status,
          url: `${response.config.baseURL}${response.config.url}`,
          data: response.data
        });
        return response;
      },
      (error) => {
        logger.error('Flutterwave API Error:', {
          status: error.response?.status,
          url: `${error.config?.baseURL}${error.config?.url}`,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  validateConfig() {
    const requiredVars = {
      'FLW_PUBLIC_KEY': this.publicKey,
      'FLW_SECRET_KEY': this.secretKey,
      'FLW_SECRET_HASH': this.secretHash
    };

    const missing = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(`Missing required Flutterwave environment variables: ${missing.join(', ')}`);
    }

    // Validate key formats
    if (!this.publicKey.startsWith('FLWPUBK-')) {
      throw new Error('Invalid FLW_PUBLIC_KEY format. Should start with FLWPUBK-');
    }

    if (!this.secretKey.startsWith('FLWSECK-')) {
      throw new Error('Invalid FLW_SECRET_KEY format. Should start with FLWSECK-');
    }

    logger.info('✅ Flutterwave configuration validated');
  }

  // Generate unique transaction reference
  generateTxRef(userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SMS_${userId}_${timestamp}_${random}`;
  }

  // Validate webhook signature
  validateWebhookSignature(payload, signature) {
    if (!signature || !this.secretHash) {
      logger.warn('Missing signature or secret hash for webhook validation');
      return false;
    }
    const isValid = signature === this.secretHash;
    logger.debug('Webhook signature validation:', { provided: signature, expected: this.secretHash, isValid });
    return isValid;
  }


  // Create payment session
  async createPaymentSession({
    userId,
    amount,
    currency = 'NGN',
    paymentType = 'card',
    customerEmail,
    customerName,
    customerPhone,
    redirectUrl,
    meta = {}
  }) {
    try {
      const txRef = this.generateTxRef(userId);
      const pool = getPool();

      logger.info('Creating Flutterwave payment session:', {
        userId,
        amount,
        currency,
        paymentType,
        txRef
      });

      // Calculate expiration (15 minutes from now)
      const expiresAt = new Date(Date.now() + (15 * 60 * 1000));

      // Prepare payment payload according to v3 API specs
      const payload = {
        tx_ref: txRef,
        amount: parseFloat(amount).toString(),
        currency: currency.toUpperCase(),
        redirect_url: redirectUrl || `${process.env.FRONTEND_URL}/transactions?status=success&tx_ref=${txRef}`,
        refresh_url: `${process.env.BACKEND_URL}/api/payments/refresh-checkout/${txRef}`,
        payment_options: this.getPaymentOptions(paymentType),
        customer: {
          email: customerEmail || 'customer@example.com',
          name: customerName || 'SMS Platform User',
          phonenumber: customerPhone || ''
        },
        customizations: {
          title: 'SMS Verification Platform',
          description: 'Account Balance Top-up',
          logo: 'https://your-domain.com/logo.png'
        },
        meta: {
          user_id: userId.toString(),
          payment_type: paymentType,
          platform: 'sms-verification',
          ...meta
        }
      };

      logger.info('Making Flutterwave payment request:', {
        txRef,
        amount: payload.amount,
        currency: payload.currency
      });

      // Make request to v3 endpoint
      const response = await this.client.post('/payments', payload);

      if (response.data?.status === 'success' && response.data?.data?.link) {
        const { data: flwData } = response.data;

        // Store in database with proper null handling
        const dbParams = [
          userId,                                           // user_id
          txRef,                                           // tx_ref
          amount,                                          // ngn_amount
          0,                                              // usd_equivalent (will be calculated)
          0,                                              // fx_rate (will be fetched)
          paymentType,                                    // payment_type
          currency,                                       // currency
          customerEmail || null,                          // customer_email
          customerName || null,                           // customer_name
          customerPhone || null,                          // customer_phone
          flwData.link,                                   // payment_link
          flwData.hosted_link || null,                    // checkout_token
          expiresAt,                                      // expires_at
          JSON.stringify(response.data),                  // processor_response
          JSON.stringify(meta),                           // meta
          'PENDING_UNSETTLED'                            // status
        ];

        await pool.execute(`
          INSERT INTO payment_deposits (
            user_id, tx_ref, ngn_amount, usd_equivalent, fx_rate, 
            payment_type, currency, customer_email, customer_name, 
            customer_phone, payment_link, checkout_token, expires_at,
            processor_response, meta, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, dbParams);

        // Log transaction creation
        const logParams = [
          userId,
          txRef,
          'created',
          JSON.stringify({ amount, currency, paymentType }),
          meta?.ip_address || null
        ];

        await pool.execute(`
          INSERT INTO payment_transaction_logs (
            user_id, tx_ref, action, metadata, ip_address
          ) VALUES (?, ?, ?, ?, ?)
        `, logParams);

        logger.info('Payment session created successfully:', {
          txRef,
          paymentLink: flwData.link,
          userId
        });

        return {
          success: true,
          tx_ref: txRef,
          payment_link: flwData.link,
          checkout_token: flwData.hosted_link || null,
          expires_at: expiresAt.toISOString(),
          amount,
          currency
        };

      } else {
        throw new Error(response.data?.message || 'Failed to create payment session');
      }

    } catch (error) {
      logger.error('Create payment session error:', {
        error: error.message,
        response: error.response?.data,
        userId,
        amount,
        status: error.response?.status
      });

      // More specific error messages
      if (error.response?.status === 401) {
        throw new Error('Invalid Flutterwave API credentials. Check your secret key.');
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid payment data: ${error.response?.data?.message || 'Bad request'}`);
      }

      throw new Error(
        error.response?.data?.message ||
        error.message ||
        'Failed to create payment session'
      );
    }
  }

  async verifyTransaction(txId, source = 'manual') {
    try {
      logger.info('Verifying Flutterwave transaction:', { txId, source });

      // If txId looks like our tx_ref format, try to resolve it to flw_tx_id
      if (txId.startsWith('SMS_')) {
        const pool = getPool();
        const [deposits] = await pool.execute(
          'SELECT flw_tx_id, tx_ref, status FROM payment_deposits WHERE tx_ref = ?',
          [txId]
        );

        if (deposits.length === 0) {
          logger.warn('Deposit not found for tx_ref:', txId);
          return { success: false, error: 'Payment not found in our records' };
        }

        const deposit = deposits[0];

        if (!deposit.flw_tx_id) {
          // 🔄 fallback: query Flutterwave by tx_ref
          logger.warn('No Flutterwave transaction ID in DB, fetching by tx_ref:', txId);
          const resp = await this.client.get(`/transactions?tx_ref=${txId}`);

          if (resp.data?.status === 'success' && resp.data?.data?.length > 0) {
            const tx = resp.data.data[0];

            // Update DB with flw_tx_id and flw_ref
            await pool.execute(
              'UPDATE payment_deposits SET flw_tx_id = ?, flw_ref = ? WHERE tx_ref = ?',
              [tx.id, tx.flw_ref, txId]
            );

            logger.info('Backfilled flw_tx_id for deposit:', {
              txRef: txId,
              flwTxId: tx.id,
              flwRef: tx.flw_ref
            });

            txId = tx.id; // continue with Flutterwave verify below
          } else {
            return { success: false, error: 'Transaction not found on Flutterwave by tx_ref' };
          }
        } else {
          // Use the stored flw_tx_id
          txId = deposit.flw_tx_id;
          logger.info('Using Flutterwave transaction ID for verification:', {
            originalTxRef: deposit.tx_ref,
            flwTxId: txId
          });
        }
      }

      // ✅ Now verify using flw_tx_id
      const response = await this.client.get(`/transactions/${txId}/verify`);

      if (response.data?.status === 'success') {
        const transaction = response.data.data;

        logger.info('Transaction verification response:', {
          txId: transaction.id,
          txRef: transaction.tx_ref,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency
        });

        return { success: true, data: transaction };
      } else {
        logger.warn('Transaction verification failed:', response.data);
        return {
          success: false,
          error: response.data?.message || 'Transaction verification failed'
        };
      }

    } catch (error) {
      logger.error('Transaction verification error:', {
        txId,
        error: error.message,
        response: error.response?.data
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Verification failed'
      };
    }
  }


  // Process successful payment
  async processSuccessfulPayment(webhookData, source = 'webhook') {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const { tx_ref: txRef, id: flwTxId } = webhookData;

      logger.info('Processing successful payment:', {
        txRef,
        flwTxId,
        amount: webhookData.amount,
        currency: webhookData.currency,
        source
      });

      // Check if payment already processed (idempotency)
      const [existing] = await connection.execute(
        'SELECT id, status FROM payment_deposits WHERE tx_ref = ? AND status = "PAID_SETTLED"',
        [txRef]
      );

      if (existing.length > 0) {
        logger.info('Payment already processed (idempotent):', { txRef, existingId: existing[0].id });
        await connection.commit();
        return {
          success: true,
          alreadyProcessed: true,
          depositId: existing[0].id
        };
      }

      // Get deposit record
      const [deposits] = await connection.execute(
        'SELECT * FROM payment_deposits WHERE tx_ref = ?',
        [txRef]
      );

      if (deposits.length === 0) {
        throw new Error(`Deposit record not found for tx_ref: ${txRef}`);
      }

      const deposit = deposits[0];

      // Calculate USD equivalent using current FX rate
      let fxRate, usdEquivalent;
      if (webhookData.currency === 'NGN') {
        const fxResult = await this.getCurrentFxRate('USD', 'NGN');
        fxRate = fxResult.rate;
        usdEquivalent = webhookData.amount / fxRate;
      } else {
        fxRate = 1;
        usdEquivalent = webhookData.amount;
      }

      // Update deposit record
      await connection.execute(`
        UPDATE payment_deposits 
        SET 
          status = 'PAID_SETTLED',
          flw_tx_id = ?,
          flw_ref = ?,
          charged_amount = ?,
          fx_rate = ?,
          usd_equivalent = ?,
          paid_at = NOW(),
          processor_response = JSON_MERGE_PATCH(
            COALESCE(processor_response, '{}'),
            ?
          ),
          updated_at = NOW()
        WHERE tx_ref = ?
      `, [
        flwTxId,
        webhookData.flw_ref || null,
        webhookData.amount_settled || webhookData.amount,
        fxRate,
        usdEquivalent,
        JSON.stringify(webhookData),
        txRef
      ]);

      // Credit user balance
      await connection.execute(`
        INSERT INTO user_demo_balances (user_id, balance, total_deposited, last_deposit_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          balance = balance + ?,
          total_deposited = total_deposited + ?,
          last_deposit_at = NOW(),
          updated_at = NOW()
      `, [
        deposit.user_id,
        usdEquivalent,
        usdEquivalent,
        usdEquivalent,
        usdEquivalent
      ]);

      // Log transaction completion
      await connection.execute(`
        INSERT INTO payment_transaction_logs (
          user_id, tx_ref, action, status_after, amount, metadata
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        deposit.user_id,
        txRef,
        'settlement_completed',
        'PAID_SETTLED',
        usdEquivalent,
        JSON.stringify({
          flw_tx_id: flwTxId,
          fx_rate: fxRate,
          source,
          settled_amount: webhookData.amount_settled || webhookData.amount
        })
      ]);

      await connection.commit();

      logger.info('Payment processed successfully:', {
        txRef,
        userId: deposit.user_id,
        usdEquivalent,
        fxRate,
        flwTxId
      });

      return {
        success: true,
        depositId: deposit.id,
        userId: deposit.user_id,
        usdEquivalent,
        fxRate,
        ngnAmount: webhookData.amount
      };

    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      logger.error('Process payment error:', {
        error: error.message,
        stack: error.stack,
        webhookData
      });

      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  // Get current exchange rate
  async getCurrentFxRate(from = 'USD', to = 'NGN') {
    const pool = getPool();

    try {
      // Check cache first
      const [cached] = await pool.execute(`
        SELECT rate, expires_at FROM exchange_rates 
        WHERE from_currency = ? AND to_currency = ? AND expires_at > NOW()
      `, [from, to]);

      if (cached.length > 0) {
        logger.debug('Using cached exchange rate:', {
          from, to, rate: cached[0].rate
        });
        return { rate: parseFloat(cached[0].rate), source: 'cache' };
      }

      // Fetch fresh rate from exchangerate-api.com
      logger.info('Fetching fresh exchange rate:', { from, to });

      const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${from}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'SMS-Platform/1.0'
        }
      });

      if (response.data && response.data.rates && response.data.rates[to]) {
        const rate = parseFloat(response.data.rates[to]);
        const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour

        // Cache the rate
        await pool.execute(`
          INSERT INTO exchange_rates (from_currency, to_currency, rate, expires_at)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            rate = VALUES(rate),
            expires_at = VALUES(expires_at),
            created_at = NOW()
        `, [from, to, rate, expiresAt]);

        logger.info('Exchange rate fetched and cached:', {
          from, to, rate, source: 'exchangerate-api'
        });

        return { rate, source: 'live' };
      } else {
        throw new Error('Invalid exchange rate response');
      }

    } catch (error) {
      logger.error('Exchange rate fetch error:', error);

      // Fallback to last known rate
      const [fallback] = await pool.execute(`
        SELECT rate FROM exchange_rates 
        WHERE from_currency = ? AND to_currency = ?
        ORDER BY created_at DESC LIMIT 1
      `, [from, to]);

      if (fallback.length > 0) {
        logger.warn('Using fallback exchange rate:', {
          from, to, rate: fallback[0].rate
        });
        return { rate: parseFloat(fallback[0].rate), source: 'fallback' };
      }

      // Hard fallback
      const hardcodedRates = {
        'USD-NGN': 1520.00,
        'NGN-USD': 0.000658
      };

      const key = `${from}-${to}`;
      if (hardcodedRates[key]) {
        logger.warn('Using hardcoded fallback rate:', { from, to, rate: hardcodedRates[key] });
        return { rate: hardcodedRates[key], source: 'hardcoded' };
      }

      throw new Error(`Unable to get exchange rate for ${from}/${to}`);
    }
  }

  // Calculate USD equivalent with margin
  async calculateUSDEquivalent(ngnAmount) {
    try {
      const fxResult = await this.getCurrentFxRate('USD', 'NGN');
      const margin = parseFloat(process.env.FX_RATE_MARGIN || '0.01'); // 1% margin

      const adjustedRate = fxResult.rate * (1 + margin);
      const usdEquivalent = ngnAmount / adjustedRate;

      return {
        usdEquivalent: parseFloat(usdEquivalent.toFixed(6)),
        fxRate: parseFloat(adjustedRate.toFixed(6)),
        source: fxResult.source,
        margin: margin * 100
      };
    } catch (error) {
      logger.error('USD equivalent calculation error:', error);
      throw error;
    }
  }

  // Get payment options based on type
  getPaymentOptions(paymentType) {
    const options = {
      card: 'card',
      bank: 'banktransfer',
      ussd: 'ussd',
      mobile: 'mobilemoneyghana,mpesa',
      all: 'card,banktransfer,ussd,mobilemoneyghana,mpesa'
    };

    return options[paymentType] || options.card;
  }

  // ADDED: Monitor pending settlements function (was missing)
  async monitorPendingSettlements() {
    const pool = getPool();

    try {
      // Get settlements that have been pending for more than 30 minutes
      const [pendingSettlements] = await pool.execute(`
        SELECT id, user_id, tx_ref, ngn_amount, created_at,
               TIMESTAMPDIFF(MINUTE, created_at, NOW()) as minutes_pending
        FROM payment_deposits 
        WHERE status = 'PENDING_UNSETTLED' 
        AND created_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
        ORDER BY created_at ASC
      `);

      if (pendingSettlements.length > 0) {
        logger.warn(`Found ${pendingSettlements.length} settlements pending for >30 minutes`, {
          settlements: pendingSettlements.map(s => ({
            txRef: s.tx_ref,
            minutesPending: s.minutes_pending
          }))
        });

        // You could add logic here to auto-verify these payments
        // or send notifications to admins
      }

      return {
        success: true,
        pendingCount: pendingSettlements.length,
        settlements: pendingSettlements
      };

    } catch (error) {
      logger.error('Monitor pending settlements error:', error);
      throw error;
    }
  }

  // Simple health check
  async healthCheck() {
    try {
      // Check database connectivity and configuration
      const pool = getPool();
      await pool.execute('SELECT 1');

      return {
        healthy: true,
        configuration: 'valid',
        database: 'connected',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Flutterwave health check failed:', error);
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Main webhook processing method
  async processWebhook(payload, signature, source = 'webhook') {
    const pool = getPool();
    const startTime = Date.now();

    try {
      const isSignatureValid = this.validateWebhookSignature(payload, signature);
      const idempotencyKey = `${payload.event}_${payload.data?.tx_ref || payload.data?.id}_${Date.now()}`;

      // FIXED: Log webhook receipt with proper null handling
      const webhookLogParams = [
        payload.event,
        payload.data?.tx_ref || null,
        payload.data?.id || null,
        signature,
        isSignatureValid,
        JSON.stringify(payload),
        idempotencyKey,
        source === 'webhook' ? (payload.meta?.ip_address || null) : null,
        source === 'webhook' ? (payload.meta?.user_agent || null) : null
      ];

      const [logResult] = await pool.execute(`
        INSERT INTO flutterwave_webhook_logs (
          event, tx_ref, flw_tx_id, signature_header, signature_valid,
          raw_payload, idempotency_key, ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, webhookLogParams);

      const webhookLogId = logResult.insertId;
      let processed = false;
      let error = null;

      try {
        if (!isSignatureValid && source === 'webhook') {
          throw new Error('Invalid webhook signature');
        }

        switch (payload.event) {
          case 'charge.completed':
            if (payload.data?.status === 'successful') {
              await this.processSuccessfulPayment(payload.data, source);
              processed = true;
            } else {
              logger.warn('Charge completed but not successful:', {
                status: payload.data?.status,
                txRef: payload.data?.tx_ref
              });
            }
            break;

          case 'transfer.completed':
            processed = true;
            break;

          default:
            logger.info('Unhandled webhook event:', payload.event);
            processed = true;
        }

      } catch (processingError) {
        error = processingError.message;
        logger.error('Webhook processing error:', {
          event: payload.event,
          error: processingError.message,
          txRef: payload.data?.tx_ref
        });
      }

      // Update webhook log
      const processingTime = Date.now() - startTime;
      await pool.execute(`
        UPDATE flutterwave_webhook_logs 
        SET 
          processed = ?,
          processing_error = ?,
          processing_time_ms = ?,
          processed_at = NOW()
        WHERE id = ?
      `, [processed, error, processingTime, webhookLogId]);

      return {
        success: processed,
        error: error,
        processingTime: processingTime,
        webhookLogId: webhookLogId
      };

    } catch (error) {
      logger.error('Webhook processing fatal error:', {
        error: error.message,
        payload: payload,
        source
      });

      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }
}

module.exports = new FlutterwaveService();