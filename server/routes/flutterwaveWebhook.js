// routes/flutterwaveWebhook.js - Dedicated webhook handler
const express = require('express');
const rateLimit = require('express-rate-limit');
const flutterwaveService = require('../services/flutterwaveServices');
const logger = require('../utils/logger');
const webSocketService = require('../services/webhookService');
const { getPool } = require('../Config/database');
const router = express.Router();

// Raw body parser middleware for webhook signature validation
const getRawBody = (req, res, next) => {
  req.rawBody = '';
  req.setEncoding('utf8');

  req.on('data', (chunk) => {
    req.rawBody += chunk;
  });

  req.on('end', () => {
    next();
  });
};

// Webhook-specific rate limiter (more lenient than API)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // Allow 50 webhook calls per minute
  message: {
    success: false,
    error: 'Webhook rate limit exceeded',
    code: 'WEBHOOK_RATE_LIMIT'
  },
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use IP + user agent for rate limiting
    return `webhook:${req.ip}:${req.headers['user-agent']?.substring(0, 50) || 'unknown'}`;
  },
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === 'development';
  }
});

// POST /api/payments/flutterwave/webhook - Main webhook endpoint
router.post('/webhook', 
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const startTime = Date.now();
    const clientIP = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    try {
      // Parse the raw body
      let payload;
      try {
        payload = JSON.parse(req.body.toString('utf8'));
      } catch (parseError) {
        logger.error('Webhook payload parse error:', {
          error: parseError.message,
          body: req.body?.toString('utf8')?.substring(0, 500),
          ip: clientIP
        });
        return res.status(400).json({
          success: false,
          error: 'Invalid JSON payload',
          code: 'INVALID_JSON'
        });
      }

      // Get signature from header
      const signature = req.headers['verif-hash'] || 
                       req.headers['x-flutterwave-signature'] ||
                       req.headers['flw-signature'];

      if (!signature) {
        logger.warn('Webhook received without signature:', {
          ip: clientIP,
          userAgent,
          event: payload?.event,
          headers: Object.keys(req.headers)
        });
        return res.status(400).json({
          success: false,
          error: 'Missing webhook signature',
          code: 'MISSING_SIGNATURE'
        });
      }

      logger.info('Flutterwave webhook received:', {
        event: payload?.event,
        txRef: payload?.data?.tx_ref,
        flwTxId: payload?.data?.id,
        status: payload?.data?.status,
        ip: clientIP,
        userAgent: userAgent?.substring(0, 100)
      });

      // Add IP and user agent to payload for processing
      payload.meta = {
        ...payload.meta,
        ip_address: clientIP,
        user_agent: userAgent,
        received_at: new Date().toISOString()
      };

      // Process the webhook
      const result = await flutterwaveService.processWebhook(payload, signature, 'webhook');

      // Send WebSocket notifications for successful payments
      if (result.success && payload.event === 'charge.completed' && payload.data?.status === 'successful') {
        try {
          // Get user ID from the processed payment
          const pool = getPool();
          const [deposits] = await pool.execute(
            'SELECT user_id, usd_equivalent FROM payment_deposits WHERE tx_ref = ? AND status = "PAID_SETTLED"',
            [payload.data.tx_ref]
          );

          if (deposits.length > 0) {
            const deposit = deposits[0];
            
            // Notify successful payment
            webSocketService.notifyPaymentSuccessful(deposit.user_id, {
              paymentReference: payload.data.tx_ref,
              transactionReference: payload.data.flw_ref,
              amount: payload.data.amount,
              currency: payload.data.currency,
              paymentMethod: payload.data.payment_type,
              settlementStatus: 'COMPLETED'
            });

            // Notify balance update
            webSocketService.notifyBalanceUpdated(
              deposit.user_id, 
              deposit.usd_equivalent, 
              deposit.usd_equivalent
            );
          }
        } catch (wsError) {
          logger.error('WebSocket notification error:', wsError);
          // Don't fail the webhook for WebSocket errors
        }
      }

      const processingTime = Date.now() - startTime;

      logger.info('Webhook processing completed:', {
        success: result.success,
        error: result.error,
        processingTime: `${processingTime}ms`,
        event: payload?.event,
        txRef: payload?.data?.tx_ref
      });

      // Always return 200 for successful processing attempts
      // Flutterwave expects 200 status for successful webhook receipt
      res.status(200).json({
        success: true,
        message: 'Webhook received and processed',
        processing_time_ms: processingTime,
        webhook_id: result.webhookLogId
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Webhook processing fatal error:', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`,
        ip: clientIP,
        body: req.body?.toString('utf8')?.substring(0, 1000)
      });

      // Return 200 even for errors to prevent Flutterwave retries
      // Log the error but acknowledge receipt
      res.status(200).json({
        success: false,
        error: 'Webhook processing failed',
        message: 'Error logged for investigation',
        processing_time_ms: processingTime
      });
    }
  }
);

// GET /api/payments/flutterwave/webhook/test - Test webhook endpoint (development only)
router.get('/webhook/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({
    message: 'Flutterwave webhook endpoint is active',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    config: {
      webhook_url: `${req.protocol}://${req.get('host')}/api/payments/flutterwave/webhook`,
      signature_validation: process.env.FLW_SECRET_HASH ? 'enabled' : 'disabled',
      test_payload_url: `${req.protocol}://${req.get('host')}/api/payments/flutterwave/webhook/simulate`
    }
  });
});

// POST /api/payments/flutterwave/webhook/simulate - Simulate webhook (development only)
router.post('/webhook/simulate', express.json(), async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { tx_ref, status = 'successful', amount = 1000 } = req.body;

    if (!tx_ref) {
      return res.status(400).json({
        error: 'tx_ref is required for simulation'
      });
    }

    // Create test webhook payload
    const testPayload = {
      event: 'charge.completed',
      data: {
        id: Math.floor(Math.random() * 1000000),
        tx_ref: tx_ref,
        flw_ref: `FLW-MOCK-${Date.now()}`,
        amount: parseFloat(amount),
        currency: 'NGN',
        status: status,
        payment_type: 'card',
        created_at: new Date().toISOString(),
        account_id: 12345
      }
    };

    // Generate test signature
    const crypto = require('crypto');
    const testSignature = crypto
      .createHmac('sha256', process.env.FLW_SECRET_HASH || 'test-secret')
      .update(JSON.stringify(testPayload), 'utf8')
      .digest('hex');

    // Process the test webhook
    const result = await flutterwaveService.processWebhook(testPayload, testSignature, 'test_simulation');

    res.json({
      success: true,
      message: 'Test webhook simulated',
      payload: testPayload,
      result: result
    });

  } catch (error) {
    logger.error('Webhook simulation error:', error);
    res.status(500).json({
      success: false,
      error: 'Simulation failed',
      details: error.message
    });
  }
});

// GET /api/payments/flutterwave/webhook/logs - Get webhook logs (authenticated)
router.get('/webhook/logs', 
  require('../middleware/auth').authenticateToken,
  require('../middleware/auth').requireAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, event, processed } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const pool = getPool();
      let whereClause = '';
      const queryParams = [];

      if (event) {
        whereClause += 'WHERE event = ?';
        queryParams.push(event);
      }

      if (processed !== undefined) {
        whereClause += whereClause ? ' AND processed = ?' : 'WHERE processed = ?';
        queryParams.push(processed === 'true');
      }

      // Get total count
      const [countResult] = await pool.execute(
        `SELECT COUNT(*) as total FROM flutterwave_webhook_logs ${whereClause}`,
        queryParams
      );

      // Get logs
      const [logs] = await pool.execute(`
        SELECT 
          id, event, tx_ref, flw_tx_id, signature_valid, processed,
          processing_error, processing_time_ms, ip_address,
          created_at, processed_at
        FROM flutterwave_webhook_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...queryParams, parseInt(limit), offset]);

      const totalRecords = countResult[0].total;
      const totalPages = Math.ceil(totalRecords / parseInt(limit));

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total_records: totalRecords,
            total_pages: totalPages
          }
        }
      });

    } catch (error) {
      logger.error('Get webhook logs error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch webhook logs'
      });
    }
  }
);

// GET /api/payments/flutterwave/webhook/stats - Webhook statistics
router.get('/webhook/stats',
  require('../middleware/auth').authenticateToken,
  async (req, res) => {
    try {
      const pool = getPool();

      // Get webhook statistics for the last 24 hours
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_webhooks,
          COUNT(CASE WHEN processed = TRUE THEN 1 END) as processed_successfully,
          COUNT(CASE WHEN processed = FALSE THEN 1 END) as processing_failed,
          COUNT(CASE WHEN signature_valid = TRUE THEN 1 END) as valid_signatures,
          COUNT(CASE WHEN signature_valid = FALSE THEN 1 END) as invalid_signatures,
          AVG(processing_time_ms) as avg_processing_time,
          MAX(processing_time_ms) as max_processing_time,
          COUNT(DISTINCT event) as unique_events
        FROM flutterwave_webhook_logs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);

      // Get event breakdown
      const [eventBreakdown] = await pool.execute(`
        SELECT 
          event,
          COUNT(*) as count,
          COUNT(CASE WHEN processed = TRUE THEN 1 END) as processed
        FROM flutterwave_webhook_logs 
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        GROUP BY event
        ORDER BY count DESC
      `);

      const result = stats[0];
      const successRate = result.total_webhooks > 0 
        ? (result.processed_successfully / result.total_webhooks * 100).toFixed(2)
        : 0;

      res.json({
        success: true,
        data: {
          summary: {
            ...result,
            success_rate_percentage: parseFloat(successRate),
            avg_processing_time_formatted: `${Math.round(result.avg_processing_time || 0)}ms`
          },
          events: eventBreakdown,
          period: 'Last 24 hours',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Get webhook stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch webhook statistics'
      });
    }
  }
);

module.exports = router;