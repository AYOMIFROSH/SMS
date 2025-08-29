// services/monnifyService.js - COMPREHENSIVE MONNIFY PAYMENT INTEGRATION
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');
const cacheService = require('./cacheServices');

class MonnifyService {
  constructor() {
    // Monnify Configuration
    this.baseURL = process.env.MONNIFY_BASE_URL || 'https://api.monnify.com';
    this.sandboxURL = 'https://sandbox.monnify.com'; // For testing
    this.apiKey = process.env.MONNIFY_API_KEY;
    this.secretKey = process.env.MONNIFY_SECRET_KEY;
    this.contractCode = process.env.MONNIFY_CONTRACT_CODE;
    this.walletId = process.env.MONNIFY_WALLET_ID;
    
    // Environment check
    this.isProduction = process.env.NODE_ENV === 'production';
    this.currentBaseURL = this.isProduction ? this.baseURL : this.sandboxURL;
    
    // Rate limiting and retry configuration
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
    
    // Webhook verification
    this.webhookSecret = process.env.MONNIFY_WEBHOOK_SECRET;
    
    logger.info('Monnify Service initialized:', {
      environment: this.isProduction ? 'production' : 'sandbox',
      baseURL: this.currentBaseURL
    });
  }

  // Authentication - Generate Bearer Token
  async authenticate() {
    try {
      const cacheKey = 'monnify:auth_token';
      const cached = await cacheService.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return cached.token;
      }

      const authString = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');
      
      const response = await axios.post(
        `${this.currentBaseURL}/api/v1/auth/login`,
        {},
        {
          headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data.requestSuccessful) {
        const { accessToken, expiresIn } = response.data.responseBody;
        const expiryTime = Date.now() + (expiresIn * 1000) - 300000; // 5 minutes buffer
        
        // Cache token
        await cacheService.set(cacheKey, {
          token: accessToken,
          expires: expiryTime
        }, expiresIn - 300); // Cache for slightly less than expiry

        logger.info('Monnify authentication successful');
        return accessToken;
      }
      
      throw new Error('Authentication failed');
    } catch (error) {
      logger.error('Monnify authentication error:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  // Make authenticated API request with retry logic
  async makeRequest(method, endpoint, data = null, retryCount = 0) {
    try {
      const token = await this.authenticate();
      
      const config = {
        method: method.toUpperCase(),
        url: `${this.currentBaseURL}/api/v1/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 seconds for transactions
      };

      if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        config.data = data;
      }

      logger.info('Monnify API Request:', {
        method: method.toUpperCase(),
        endpoint,
        hasData: !!data
      });

      const response = await axios(config);
      
      logger.info('Monnify API Response:', {
        endpoint,
        success: response.data.requestSuccessful,
        status: response.status
      });

      return response.data;
    } catch (error) {
      logger.error('Monnify API Error:', {
        endpoint,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        retryCount
      });

      // Retry logic for specific errors
      if (retryCount < this.retryAttempts && this.shouldRetry(error)) {
        await this.delay(this.retryDelay * (retryCount + 1));
        return this.makeRequest(method, endpoint, data, retryCount + 1);
      }

      throw this.enhanceError(error);
    }
  }

  // Initialize one-time payment for user deposits
  async initializePayment({ 
    amount, 
    userId, 
    customerName, 
    customerEmail,
    paymentDescription = "SMS Platform Balance Top-up",
    currencyCode = "NGN",
    paymentMethods = ["CARD", "ACCOUNT_TRANSFER", "USSD"],
    redirectUrl = null
  }) {
    try {
      const paymentReference = this.generatePaymentReference('DEP', userId);
      
      const paymentData = {
        amount: parseFloat(amount),
        customerName,
        customerEmail,
        paymentReference,
        paymentDescription,
        currencyCode,
        contractCode: this.contractCode,
        redirectUrl: redirectUrl || `${process.env.FRONTEND_URL}/dashboard?payment=success`,
        paymentMethods,
        incomeSplitConfig: [], // Can be configured for commission splits
        metaData: {
          userId: userId.toString(),
          platform: 'SMS_PLATFORM',
          type: 'BALANCE_TOPUP',
          timestamp: new Date().toISOString()
        }
      };

      logger.info('Initializing Monnify payment:', {
        userId,
        amount,
        reference: paymentReference
      });

      const response = await this.makeRequest('POST', 'merchant/transactions/init-transaction', paymentData);

      if (response.requestSuccessful) {
        const { 
          transactionReference,
          paymentReference: monnifyPaymentRef,
          checkoutUrl,
          enabledPaymentMethod
        } = response.responseBody;

        // Store pending transaction in database
        const pool = getPool();
        await pool.execute(
          `INSERT INTO monnify_transactions 
           (user_id, payment_reference, transaction_reference, amount, status, 
            payment_description, customer_email, created_at)
           VALUES (?, ?, ?, ?, 'PENDING', ?, ?, NOW())`,
          [userId, paymentReference, transactionReference, amount, paymentDescription, customerEmail]
        );

        return {
          success: true,
          paymentReference,
          transactionReference,
          checkoutUrl,
          amount,
          enabledPaymentMethods: enabledPaymentMethod
        };
      }

      throw new Error('Payment initialization failed');
    } catch (error) {
      logger.error('Initialize payment error:', error);
      throw error;
    }
  }

  // Verify payment status
  async verifyPayment(transactionReference) {
    try {
      logger.info('Verifying payment:', { transactionReference });

      const response = await this.makeRequest('GET', `merchant/transactions/query?paymentReference=${transactionReference}`);

      if (response.requestSuccessful) {
        const transaction = response.responseBody;
        
        return {
          success: true,
          transactionReference: transaction.transactionReference,
          paymentReference: transaction.paymentReference,
          amount: transaction.amountPaid,
          fee: transaction.fee,
          status: transaction.paymentStatus,
          paymentMethod: transaction.paymentMethod,
          paidOn: transaction.paidOn,
          customer: {
            email: transaction.customer?.email,
            name: transaction.customer?.name
          }
        };
      }

      return { success: false, error: 'Verification failed' };
    } catch (error) {
      logger.error('Verify payment error:', error);
      throw error;
    }
  }

  // Process successful payment and update user balance
  async processSuccessfulPayment(transactionReference) {
    const pool = getPool();
    
    try {
      await pool.execute('START TRANSACTION');

      // Get transaction details from our database
      const [transactions] = await pool.execute(
        'SELECT * FROM monnify_transactions WHERE transaction_reference = ?',
        [transactionReference]
      );

      if (transactions.length === 0) {
        throw new Error('Transaction not found in database');
      }

      const transaction = transactions[0];
      
      if (transaction.status === 'PAID') {
        logger.info('Transaction already processed:', { transactionReference });
        await pool.execute('COMMIT');
        return { success: true, message: 'Already processed' };
      }

      // Verify with Monnify
      const verification = await this.verifyPayment(transaction.payment_reference);
      
      if (!verification.success || verification.status !== 'PAID') {
        throw new Error('Payment verification failed');
      }

      // Update user balance
      const amount = parseFloat(verification.amount);
      await pool.execute(
        `INSERT INTO sms_user_accounts (user_id, balance) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE balance = balance + ?`,
        [transaction.user_id, amount, amount]
      );

      // Create transaction record
      await pool.execute(
        `INSERT INTO transactions 
         (user_id, transaction_type, amount, reference_id, description, status, created_at)
         VALUES (?, 'deposit', ?, ?, ?, 'completed', NOW())`,
        [
          transaction.user_id,
          amount,
          transactionReference,
          `Balance deposit via Monnify - ${verification.paymentMethod}`
        ]
      );

      // Update Monnify transaction status
      await pool.execute(
        `UPDATE monnify_transactions 
         SET status = 'PAID', amount_paid = ?, fee = ?, payment_method = ?, paid_at = NOW()
         WHERE transaction_reference = ?`,
        [amount, verification.fee || 0, verification.paymentMethod, transactionReference]
      );

      await pool.execute('COMMIT');

      // Send notification via WebSocket if available
      const webSocketService = require('./webhookService');
      webSocketService.notifyBalanceUpdated(transaction.user_id, amount);

      logger.info('Payment processed successfully:', {
        userId: transaction.user_id,
        amount,
        transactionReference
      });

      return {
        success: true,
        userId: transaction.user_id,
        amount,
        newBalance: await this.getUserBalance(transaction.user_id),
        transactionReference
      };

    } catch (error) {
      await pool.execute('ROLLBACK');
      logger.error('Process payment error:', error);
      throw error;
    }
  }

  // Initiate disbursement for SMS-Activate payments
  async initiateDisbursement({
    amount,
    destinationBankCode,
    destinationAccountNumber,
    destinationAccountName,
    narration,
    userId,
    reference = null
  }) {
    try {
      const disbursementReference = reference || this.generatePaymentReference('DISB', userId);
      
      const disbursementData = {
        amount: parseFloat(amount),
        reference: disbursementReference,
        narration: narration || 'SMS Service Payment',
        destinationBankCode,
        destinationAccountNumber,
        destinationAccountName,
        currency: 'NGN',
        sourceAccountNumber: this.walletId || 'your-monnify-wallet-id'
      };

      logger.info('Initiating disbursement:', {
        userId,
        amount,
        reference: disbursementReference,
        destination: destinationAccountNumber
      });

      const response = await this.makeRequest('POST', 'disbursements/single', disbursementData);

      if (response.requestSuccessful) {
        const { reference: transactionReference, status } = response.responseBody;
        
        // Log disbursement in database
        const pool = getPool();
        await pool.execute(
          `INSERT INTO disbursements 
           (user_id, reference, amount, destination_account, status, narration, created_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [userId, transactionReference, amount, destinationAccountNumber, status, narration]
        );

        return {
          success: true,
          reference: transactionReference,
          status,
          amount
        };
      }

      throw new Error('Disbursement failed');
    } catch (error) {
      logger.error('Disbursement error:', error);
      throw error;
    }
  }

  // Get account balance
  async getAccountBalance() {
    try {
      const response = await this.makeRequest('GET', 'disbursements/wallet-balance');
      
      if (response.requestSuccessful) {
        return {
          success: true,
          availableBalance: response.responseBody.availableBalance,
          ledgerBalance: response.responseBody.ledgerBalance
        };
      }
      
      return { success: false, error: 'Failed to get balance' };
    } catch (error) {
      logger.error('Get balance error:', error);
      throw error;
    }
  }

  // Get user balance from database
  async getUserBalance(userId) {
    try {
      const pool = getPool();
      const [result] = await pool.execute(
        'SELECT balance FROM sms_user_accounts WHERE user_id = ?',
        [userId]
      );
      
      return result.length > 0 ? parseFloat(result[0].balance || 0) : 0;
    } catch (error) {
      logger.error('Get user balance error:', error);
      return 0;
    }
  }

  // Webhook verification
  verifyWebhookSignature(payload, signature) {
    try {
      if (!this.webhookSecret) {
        logger.warn('Webhook secret not configured');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha512', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Webhook signature verification error:', error);
      return false;
    }
  }

  // Process webhook notification
  async processWebhook(eventType, eventData) {
    try {
      logger.info('Processing Monnify webhook:', { eventType });

      switch (eventType) {
        case 'SUCCESSFUL_TRANSACTION':
          return await this.handleSuccessfulTransaction(eventData);
        case 'FAILED_TRANSACTION':
          return await this.handleFailedTransaction(eventData);
        case 'SUCCESSFUL_DISBURSEMENT':
          return await this.handleSuccessfulDisbursement(eventData);
        case 'FAILED_DISBURSEMENT':
          return await this.handleFailedDisbursement(eventData);
        default:
          logger.warn('Unknown webhook event type:', eventType);
          return { success: false, error: 'Unknown event type' };
      }
    } catch (error) {
      logger.error('Webhook processing error:', error);
      throw error;
    }
  }

  // Handle successful transaction webhook
  async handleSuccessfulTransaction(eventData) {
    const { transactionReference, amountPaid, customer, paymentMethod } = eventData;
    
    try {
      const result = await this.processSuccessfulPayment(transactionReference);
      
      logger.info('Webhook transaction processed:', {
        transactionReference,
        amountPaid,
        customerEmail: customer?.email
      });

      return result;
    } catch (error) {
      logger.error('Handle successful transaction error:', error);
      throw error;
    }
  }

  // Handle failed transaction webhook
  async handleFailedTransaction(eventData) {
    const { transactionReference, paymentReference } = eventData;
    
    try {
      const pool = getPool();
      await pool.execute(
        'UPDATE monnify_transactions SET status = ? WHERE transaction_reference = ? OR payment_reference = ?',
        ['FAILED', transactionReference, paymentReference]
      );

      logger.info('Transaction marked as failed:', { transactionReference });
      return { success: true };
    } catch (error) {
      logger.error('Handle failed transaction error:', error);
      throw error;
    }
  }

  // Handle successful disbursement webhook
  async handleSuccessfulDisbursement(eventData) {
    const { reference, amount } = eventData;
    
    try {
      const pool = getPool();
      await pool.execute(
        'UPDATE disbursements SET status = ? WHERE reference = ?',
        ['SUCCESS', reference]
      );

      logger.info('Disbursement completed:', { reference, amount });
      return { success: true };
    } catch (error) {
      logger.error('Handle successful disbursement error:', error);
      throw error;
    }
  }

  // Handle failed disbursement webhook
  async handleFailedDisbursement(eventData) {
    const { reference, amount, failureReason } = eventData;
    
    try {
      const pool = getPool();
      await pool.execute(
        'UPDATE disbursements SET status = ?, failure_reason = ? WHERE reference = ?',
        ['FAILED', failureReason, reference]
      );

      logger.error('Disbursement failed:', { reference, amount, failureReason });
      return { success: true };
    } catch (error) {
      logger.error('Handle failed disbursement error:', error);
      throw error;
    }
  }

  // Utility methods
  generatePaymentReference(type, userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${type}_${userId}_${timestamp}_${random}`;
  }

  shouldRetry(error) {
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'];
    
    return (
      retryableStatusCodes.includes(error.response?.status) ||
      retryableErrors.includes(error.code) ||
      (error.response?.status === 401 && error.config?.url?.includes('auth/login'))
    );
  }

  enhanceError(error) {
    if (error.response?.data) {
      const { responseMessage, responseCode } = error.response.data;
      return new Error(`Monnify API Error: ${responseMessage || 'Unknown error'} (${responseCode || error.response.status})`);
    }
    
    if (error.code === 'ENOTFOUND') {
      return new Error('Network error: Unable to connect to Monnify API');
    }
    
    return error;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get transaction history
  async getTransactionHistory({ page = 1, size = 50, from = null, to = null }) {
    try {
      let endpoint = `merchant/transactions/search?page=${page}&size=${size}`;
      
      if (from) endpoint += `&from=${from}`;
      if (to) endpoint += `&to=${to}`;

      const response = await this.makeRequest('GET', endpoint);
      
      if (response.requestSuccessful) {
        return {
          success: true,
          data: response.responseBody.content || [],
          totalPages: response.responseBody.totalPages || 0,
          totalElements: response.responseBody.totalElements || 0
        };
      }
      
      return { success: false, error: 'Failed to get transaction history' };
    } catch (error) {
      logger.error('Get transaction history error:', error);
      throw error;
    }
  }
}

module.exports = new MonnifyService();