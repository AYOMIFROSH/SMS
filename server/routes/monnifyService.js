// routes/monnifyService.js - Enhanced with complete Monnify API support
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');

class MonnifyService {
  constructor() {
    this.baseUrl = (process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com').replace(/\/+$/, '');
    this.apiKey = process.env.MONNIFY_API_KEY;
    this.secretKey = process.env.MONNIFY_SECRET_KEY;
    this.contractCode = process.env.MONNIFY_CONTRACT_CODE;
    this.currency = 'NGN';
    this.accessToken = null;
    this.tokenExpiry = null;

    // API endpoints
    this.endpoints = {
      auth: '/api/v1/auth/login',
      initTransaction: '/api/v1/merchant/transactions/init-transaction',
      queryTransaction: '/api/v1/merchant/transactions/query',
      getAllTransactions: '/api/v1/merchant/transactions',
      getSettlements: '/api/v1/merchant/settlements',
      walletBalance: '/api/v1/merchant/wallet-balance',
      bankTransfer: '/api/v1/merchant/bank-transfer',
    };

    this.validateConfiguration();

    logger.info('Enhanced Monnify Service initialized:', {
      environment: process.env.NODE_ENV,
      baseUrl: this.baseUrl,
      contractCode: this.contractCode,
      apiVersion: 'v2.0'
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

    // Validate base URL
    if (!this.baseUrl.includes('monnify.com')) {
      logger.warn('Invalid Monnify base URL detected');
    }
  }

  // Enhanced authentication with retry logic
  async authenticate(retryCount = 0) {
    const maxRetries = 3;

    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const credentials = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');

      const response = await axios.post(
        `${this.baseUrl}${this.endpoints.auth}`,
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

        logger.info('Monnify authentication successful', {
          tokenExpiry: new Date(this.tokenExpiry).toISOString(),
          environment: process.env.NODE_ENV
        });

        return this.accessToken;
      }

      throw new Error(response?.data?.responseMessage || 'Authentication failed');

    } catch (error) {
      logger.error('Monnify authentication error:', {
        error: error.message,
        retryCount,
        response: error.response?.data
      });

      // Retry authentication on failure
      if (retryCount < maxRetries && error.response?.status !== 401) {
        logger.info(`Retrying authentication (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.authenticate(retryCount + 1);
      }

      throw new Error(`Authentication failed after ${retryCount + 1} attempts: ${error.message}`);
    }
  }

  // Enhanced API request handler
  async makeRequest(method, endpoint, data = null, options = {}) {
    const maxRetries = 2;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        const token = await this.authenticate();

        const config = {
          method,
          url: `${this.baseUrl}${endpoint}`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
          },
          timeout: options.timeout || 45000,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        };

        if (data) config.data = data;

        const response = await axios(config);

        // Handle successful responses
        if (response.status === 200 && response.data?.requestSuccessful) {
          return response.data;
        }

        // Handle API errors
        if (response.status === 401) {
          this.accessToken = null;
          this.tokenExpiry = null;

          if (retryCount < maxRetries) {
            logger.warn('Token expired, retrying request');
            retryCount++;
            continue;
          }
        }

        // Handle other errors
        const errorMessage = response.data?.responseMessage || `HTTP ${response.status}`;
        throw new Error(errorMessage);

      } catch (error) {
        if (error.code === 'ECONNABORTED') {
          logger.warn('Request timeout, retrying...', { endpoint, retryCount });
        } else {
          logger.error('Monnify API request failed:', {
            method,
            endpoint,
            error: error.message,
            retryCount,
            status: error.response?.status
          });
        }

        if (retryCount >= maxRetries) {
          throw error;
        }

        retryCount++;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }
  }

  // Initialize transaction with enhanced data
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
        paymentMethods: ['CARD', 'ACCOUNT_TRANSFER', 'USSD', 'PHONE_NUMBER'],
        incomeSplitConfig: [], // For future revenue sharing if needed
        customerPhoneNumber: userInfo.phone || null
      };

      logger.info('Initializing Monnify transaction:', {
        userId,
        amount,
        paymentReference,
        customerEmail: payload.customerEmail
      });

      const response = await this.makeRequest(
        'POST',
        this.endpoints.initTransaction,
        payload
      );

      const transactionData = response?.responseBody || {};

      // Save to database with enhanced fields
      await pool.execute(
        `INSERT INTO payment_transactions 
   (user_id, payment_reference, transaction_reference, amount, currency, 
    status, customer_name, customer_email, checkout_url, account_details, 
    settlement_status, created_at, expires_at)
   VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, 'PENDING', NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
        [
          userId,
          paymentReference,
          transactionData.transactionReference,
          amount,
          this.currency,
          payload.customerName,
          payload.customerEmail,
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
      logger.error('Transaction initialization error:', {
        error: error.message,
        userId,
        amount
      });
      throw new Error(`Failed to initialize payment: ${error.message}`);
    }
  }

  // Enhanced transaction verification
  async verifyTransaction(transactionReference) {
    try {
      logger.info('Verifying transaction with Monnify:', { transactionReference });

      const encodedRef = encodeURIComponent(transactionReference);
      const response = await this.makeRequest(
        'GET',
        `${this.endpoints.queryTransaction}?paymentReference=${encodedRef}`
      );

      return response.responseBody;
    } catch (error) {
      logger.error('Transaction verification error:', {
        error: error.message,
        transactionReference
      });
      throw error;
    }
  }

  // Alternative verification by payment reference
  async verifyPaymentByReference(paymentReference) {
    try {
      logger.info('Verifying payment by reference:', { paymentReference });

      const encodedRef = encodeURIComponent(paymentReference);
      const response = await this.makeRequest(
        'GET',
        `${this.endpoints.queryTransaction}?paymentReference=${encodedRef}`
      );

      return response.responseBody;
    } catch (error) {
      logger.error('Payment verification by reference failed:', error.message);
      throw error;
    }
  }

  // NEW: Get all transactions with pagination
  async getAllTransactions(options = {}) {
    try {
      const {
        page = 0,
        size = 100,
        from = null,
        to = null
      } = options;

      let endpoint = `${this.endpoints.getAllTransactions}?page=${page}&size=${size}`;

      if (from) endpoint += `&from=${from}`;
      if (to) endpoint += `&to=${to}`;

      const response = await this.makeRequest('GET', endpoint);

      return {
        transactions: response.responseBody?.content || [],
        pagination: {
          page: response.responseBody?.pageable?.pageNumber || 0,
          size: response.responseBody?.pageable?.pageSize || size,
          totalElements: response.responseBody?.totalElements || 0,
          totalPages: response.responseBody?.totalPages || 0
        }
      };
    } catch (error) {
      logger.error('Failed to fetch all transactions:', error.message);
      throw error;
    }
  }

  // NEW: Get settlement information
  async getSettlements(options = {}) {
    try {
      const {
        page = 0,
        size = 50,
        from = null,
        to = null
      } = options;

      let endpoint = `${this.endpoints.getSettlements}?page=${page}&size=${size}`;

      if (from) endpoint += `&from=${from}`;
      if (to) endpoint += `&to=${to}`;

      logger.info('Fetching settlements from Monnify:', { page, size, from, to });

      const response = await this.makeRequest('GET', endpoint);

      return {
        settlements: response.responseBody?.content || [],
        pagination: {
          page: response.responseBody?.pageable?.pageNumber || 0,
          size: response.responseBody?.pageable?.pageSize || size,
          totalElements: response.responseBody?.totalElements || 0,
          totalPages: response.responseBody?.totalPages || 0
        }
      };
    } catch (error) {
      logger.error('Failed to fetch settlements:', error.message);
      throw error;
    }
  }

  // NEW: Get wallet balance
  async getWalletBalance() {
    try {
      const response = await this.makeRequest('GET', this.endpoints.walletBalance);

      return {
        availableBalance: response.responseBody?.availableBalance || 0,
        ledgerBalance: response.responseBody?.ledgerBalance || 0,
        currency: 'NGN'
      };
    } catch (error) {
      logger.error('Failed to fetch wallet balance:', error.message);
      throw error;
    }
  }

  // NEW: Initiate bank transfer (for withdrawals)
  async initiateBankTransfer(transferData) {
    try {
      const {
        amount,
        reference,
        narration,
        destinationBankCode,
        destinationAccountNumber,
        destinationAccountName,
        currency = 'NGN'
      } = transferData;

      const payload = {
        amount: parseFloat(amount),
        reference,
        narration,
        destinationBankCode,
        destinationAccountNumber,
        destinationAccountName,
        currency,
        sourceAccountNumber: this.contractCode // Using contract code as source
      };

      logger.info('Initiating bank transfer:', { reference, amount, destinationBankCode });

      const response = await this.makeRequest(
        'POST',
        this.endpoints.bankTransfer,
        payload
      );

      return response.responseBody;
    } catch (error) {
      logger.error('Bank transfer initiation failed:', error.message);
      throw error;
    }
  }

  // Enhanced webhook signature verification
  verifyWebhookSignature(rawBody, signature) {
    try {
      if (!signature || !this.secretKey) {
        logger.warn('Missing signature or secret key for webhook verification');
        return false;
      }

      // Handle different signature formats
      const cleanSignature = signature.replace(/^(monnify-signature:|x-monnify-signature:)/i, '').trim();

      const computed = crypto.createHmac('sha512', this.secretKey)
        .update(rawBody)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(cleanSignature, 'utf8'),
        Buffer.from(computed, 'utf8')
      );

      if (!isValid) {
        logger.warn('Webhook signature mismatch:', {
          expectedLength: computed.length,
          receivedLength: cleanSignature.length,
          environment: process.env.NODE_ENV
        });
      }

      return isValid;
    } catch (error) {
      logger.error('Signature verification error:', error.message);
      return false;
    }
  }

  // Enhanced payment reference generation
  generatePaymentReference(userId, prefix = 'SMS') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const userPart = String(userId).padStart(6, '0');
    return `${prefix}_${userPart}_${timestamp}_${random}`.toUpperCase();
  }

  // Transaction reference generation (for internal use)
  generateTransactionReference(prefix = 'TXN') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(6).toString('hex');
    return `${prefix}_${timestamp}_${random}`.toUpperCase();
  }

  // Get user balance from local database
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

  // NEW: Reconcile payments with Monnify
  async reconcilePayments(options = {}) {
    try {
      const {
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        endDate = new Date(),
        limit = 100
      } = options;

      logger.info('Starting payment reconciliation with Monnify', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      // Get transactions from Monnify
      const monnifyTransactions = await this.getAllTransactions({
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        size: limit
      });

      // Get local transactions for comparison
      const pool = getPool();
      const [localTransactions] = await pool.execute(
        `SELECT * FROM payment_transactions 
         WHERE created_at >= ? AND created_at <= ?
         ORDER BY created_at DESC`,
        [startDate, endDate]
      );

      const reconciliationResult = {
        monnify_count: monnifyTransactions.transactions.length,
        local_count: localTransactions.length,
        matched: 0,
        missing_local: [],
        missing_monnify: [],
        status_mismatches: []
      };

      // Compare transactions
      for (const monnifyTxn of monnifyTransactions.transactions) {
        const localTxn = localTransactions.find(
          local => local.transaction_reference === monnifyTxn.transactionReference ||
            local.payment_reference === monnifyTxn.paymentReference
        );

        if (localTxn) {
          reconciliationResult.matched++;

          // Check for status mismatches
          if (localTxn.status !== monnifyTxn.paymentStatus) {
            reconciliationResult.status_mismatches.push({
              reference: monnifyTxn.paymentReference,
              local_status: localTxn.status,
              monnify_status: monnifyTxn.paymentStatus
            });
          }
        } else {
          reconciliationResult.missing_local.push(monnifyTxn);
        }
      }

      // Find transactions in local DB but not in Monnify
      for (const localTxn of localTransactions) {
        const monnifyTxn = monnifyTransactions.transactions.find(
          monnify => monnify.transactionReference === localTxn.transaction_reference ||
            monnify.paymentReference === localTxn.payment_reference
        );

        if (!monnifyTxn) {
          reconciliationResult.missing_monnify.push(localTxn);
        }
      }

      logger.info('Payment reconciliation completed:', reconciliationResult);
      return reconciliationResult;

    } catch (error) {
      logger.error('Payment reconciliation failed:', error.message);
      throw error;
    }
  }

  // NEW: Get transaction analytics
  async getTransactionAnalytics(days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

      const monnifyData = await this.getAllTransactions({
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
        size: 1000
      });

      const transactions = monnifyData.transactions;

      const analytics = {
        total_transactions: transactions.length,
        successful_transactions: transactions.filter(t => t.paymentStatus === 'PAID').length,
        failed_transactions: transactions.filter(t => t.paymentStatus === 'FAILED').length,
        total_amount: transactions
          .filter(t => t.paymentStatus === 'PAID')
          .reduce((sum, t) => sum + parseFloat(t.amountPaid || 0), 0),
        average_amount: 0,
        payment_methods: {},
        daily_breakdown: {}
      };

      // Calculate average
      if (analytics.successful_transactions > 0) {
        analytics.average_amount = analytics.total_amount / analytics.successful_transactions;
      }

      // Group by payment method
      transactions.forEach(t => {
        if (t.paymentStatus === 'PAID') {
          const method = t.paymentMethod || 'UNKNOWN';
          analytics.payment_methods[method] = (analytics.payment_methods[method] || 0) + 1;
        }
      });

      // Daily breakdown
      transactions.forEach(t => {
        if (t.paymentStatus === 'PAID') {
          const date = t.paidOn ? t.paidOn.split('T')[0] : t.createdOn.split('T')[0];
          if (!analytics.daily_breakdown[date]) {
            analytics.daily_breakdown[date] = { count: 0, amount: 0 };
          }
          analytics.daily_breakdown[date].count++;
          analytics.daily_breakdown[date].amount += parseFloat(t.amountPaid || 0);
        }
      });

      return analytics;
    } catch (error) {
      logger.error('Failed to get transaction analytics:', error.message);
      throw error;
    }
  }

  // Health check with comprehensive status
  async healthCheck() {
    try {
      const startTime = Date.now();

      // Test authentication
      const token = await this.authenticate();

      // Test wallet balance endpoint
      let walletBalance = null;
      try {
        walletBalance = await this.getWalletBalance();
      } catch (balanceError) {
        logger.warn('Wallet balance check failed:', balanceError.message);
      }

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        authenticated: !!token,
        response_time_ms: responseTime,
        wallet_balance: walletBalance,
        environment: process.env.NODE_ENV,
        baseUrl: this.baseUrl,
        contractCode: this.contractCode,
        api_version: 'v1',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      };
    }
  }

  // NEW: Webhook event validator
  validateWebhookEvent(payload) {
    const requiredFields = ['eventType', 'eventData'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      return {
        isValid: false,
        errors: [`Missing required fields: ${missingFields.join(', ')}`]
      };
    }

    const eventData = payload.eventData;
    const errors = [];

    // Validate based on event type
    switch (payload.eventType) {
      case 'SUCCESSFUL_TRANSACTION':
      case 'FAILED_TRANSACTION':
        if (!eventData.transactionReference && !eventData.paymentReference) {
          errors.push('Missing transaction or payment reference');
        }
        break;

      case 'SETTLEMENT_COMPLETED':
      case 'SETTLEMENT_FAILED':
        if (!eventData.settlementReference) {
          errors.push('Missing settlement reference');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new MonnifyService();