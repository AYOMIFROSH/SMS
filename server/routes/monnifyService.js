// services/monnifyService.js - Fixed with correct Monnify API endpoints
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');

class MonnifyService {
  constructor() {
    this.baseUrl = process.env.MONNIFY_BASE_URL.replace(/\/+$/, '');
    this.apiKey = process.env.MONNIFY_API_KEY;
    this.secretKey = process.env.MONNIFY_SECRET_KEY;
    this.contractCode = process.env.MONNIFY_CONTRACT_CODE;
    this.currency = 'NGN';
    this.accessToken = null;
    this.tokenExpiry = null;

    this.validateConfiguration();
    
    logger.info('Monnify Service initialized:', {
      environment: process.env.NODE_ENV,
      baseUrl: this.baseUrl,
      contractCode: this.contractCode
    });
  }

  validateConfiguration() {
    const requiredVars = ['MONNIFY_API_KEY', 'MONNIFY_SECRET_KEY', 'MONNIFY_CONTRACT_CODE'];
    const missing = requiredVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
      const msg = `Missing Monnify configuration: ${missing.join(', ')}`;
      if (process.env.NODE_ENV === 'production') {
        throw new Error(msg);
      } else {
        logger.warn(msg + ' — continuing in development mode');
      }
    }
  }

  // Authentication
  async authenticate() {
    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const credentials = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');

      const response = await axios.post(
        `${this.baseUrl}/api/v1/auth/login`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${credentials}`
          },
          timeout: 30000
        }
      );

      if (response?.data?.requestSuccessful) {
        this.accessToken = response.data.responseBody?.accessToken;
        this.tokenExpiry = Date.now() + (50 * 60 * 1000); // 50 minutes
        logger.info('Monnify authentication successful');
        return this.accessToken;
      }

      throw new Error(response?.data?.responseMessage || 'Authentication failed');
    } catch (error) {
      logger.error('Monnify authentication error:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  // Make API request
  async makeRequest(method, endpoint, data = null) {
    try {
      const token = await this.authenticate();

      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 45000
      };

      if (data) config.data = data;

      const response = await axios(config);

      if (!response?.data?.requestSuccessful) {
        throw new Error(response?.data?.responseMessage || 'Request failed');
      }

      return response.data;
    } catch (error) {
      logger.error('Monnify API request failed:', {
        method,
        endpoint,
        error: error.message
      });

      if (error.response?.status === 401) {
        this.accessToken = null;
        this.tokenExpiry = null;
      }

      throw error;
    }
  }

  // Initialize transaction
  async initializeTransaction(userId, amount, userInfo = {}) {
    const pool = getPool();
    
    try {
      const paymentReference = this.generatePaymentReference(userId);

      const payload = {
        amount: parseFloat(amount),
        customerName: userInfo.name || `User ${userId}`,
        customerEmail: userInfo.email || `user${userId}@smsplatform.com`,
        paymentReference,
        paymentDescription: `SMS Platform Deposit - ₦${amount}`,
        currencyCode: this.currency,
        contractCode: this.contractCode,
        redirectUrl: `${process.env.FRONTEND_URL}/transactions/success?ref=${paymentReference}`,
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER', 'USSD', 'PHONE_NUMBER']
      };

      logger.info('Initializing Monnify transaction:', {
        userId,
        amount,
        paymentReference
      });

      const response = await this.makeRequest(
        'POST',
        '/api/v1/merchant/transactions/init-transaction',
        payload
      );

      const transactionData = response?.responseBody || {};

      // Save to database
      await pool.execute(
        `INSERT INTO payment_transactions 
         (user_id, payment_reference, transaction_reference, amount, currency, 
          status, customer_name, customer_email, payment_description, 
          checkout_url, account_details, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
        [
          userId,
          paymentReference,
          transactionData.transactionReference,
          amount,
          this.currency,
          payload.customerName,
          payload.customerEmail,
          payload.paymentDescription,
          transactionData.checkoutUrl,
          JSON.stringify(transactionData.accountDetails || null)
        ]
      );

      return {
        success: true,
        paymentReference,
        transactionReference: transactionData.transactionReference,
        checkoutUrl: transactionData.checkoutUrl,
        amount: parseFloat(amount),
        currency: this.currency,
        status: 'PENDING',
        accountDetails: transactionData.accountDetails,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      };
    } catch (error) {
      logger.error('Transaction initialization error:', error.message);
      throw new Error(`Failed to initialize payment: ${error.message}`);
    }
  }

  // FIXED: Correct verification endpoint
  async verifyTransaction(transactionReference) {
    try {
      logger.info('Verifying transaction with Monnify:', { transactionReference });
      
      // Use the correct endpoint format
      const encodedRef = encodeURIComponent(transactionReference);
      const response = await this.makeRequest(
        'GET',
        `/api/v1/merchant/transactions/query?paymentReference=${encodedRef}`
      );
      
      return response.responseBody;
    } catch (error) {
      logger.error('Transaction verification error:', error.message);
      
      // Try alternative endpoint if first fails
      try {
        logger.info('Trying alternative verification endpoint');
        const encodedRef = encodeURIComponent(transactionReference);
        const response = await this.makeRequest(
          'GET',
          `/api/v2/transactions/${encodedRef}`
        );
        return response.responseBody;
      } catch (secondError) {
        logger.error('Both verification endpoints failed:', {
          primary: error.message,
          alternative: secondError.message
        });
        throw error; // Throw original error
      }
    }
  }

  // Alternative: Verify by payment reference instead of transaction reference
  async verifyPaymentByReference(paymentReference) {
    try {
      logger.info('Verifying payment by reference:', { paymentReference });
      
      const encodedRef = encodeURIComponent(paymentReference);
      const response = await this.makeRequest(
        'GET',
        `/api/v1/merchant/transactions/query?paymentReference=${encodedRef}`
      );
      
      return response.responseBody;
    } catch (error) {
      logger.error('Payment verification by reference failed:', error.message);
      throw error;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(rawBody, signature) {
    try {
      if (!signature || !this.secretKey) {
        return false;
      }

      const computed = crypto.createHmac('sha512', this.secretKey)
        .update(rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(computed, 'utf8')
      );
    } catch (error) {
      logger.error('Signature verification error:', error.message);
      return false;
    }
  }

  // Generate payment reference
  generatePaymentReference(userId, prefix = 'SMS') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${userId}_${timestamp}_${random}`.toUpperCase();
  }

  // Get user balance
  async getUserBalance(userId) {
    try {
      const pool = getPool();
      const [result] = await pool.execute(
        'SELECT balance FROM sms_user_accounts WHERE user_id = ?',
        [userId]
      );
      return parseFloat(result[0]?.balance || 0);
    } catch (error) {
      logger.error('Get user balance error:', error.message);
      return 0;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const token = await this.authenticate();
      return {
        status: 'healthy',
        authenticated: !!token,
        environment: process.env.NODE_ENV,
        baseUrl: this.baseUrl,
        contractCode: this.contractCode
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        environment: process.env.NODE_ENV
      };
    }
  }
}

module.exports = new MonnifyService();