// migrations/enhancedPaymentSchema.js - Complete payment schema with settlement support
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');

async function createEnhancedPaymentTables() {
  const pool = getPool();

  try {
    logger.info('Creating enhanced payment tables for complete Monnify integration...');

    // Enhanced payment transactions table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        payment_reference VARCHAR(100) UNIQUE NOT NULL,
        transaction_reference VARCHAR(100) UNIQUE,
        monnify_transaction_reference VARCHAR(100),
        amount DECIMAL(10, 2) NOT NULL,
        amount_paid DECIMAL(10, 2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'NGN',
        status ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED') DEFAULT 'PENDING',
        payment_status VARCHAR(50),
        payment_method VARCHAR(50),
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(20),
        payment_description TEXT,
        checkout_url TEXT,
        account_details JSON,
        
        -- Settlement fields
        settlement_reference VARCHAR(100),
        settlement_date TIMESTAMP NULL,
        settlement_status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
        settlement_amount DECIMAL(10, 2),
        transaction_fee DECIMAL(10, 2),
        
        -- Response fields
        response_code VARCHAR(20),
        failure_reason TEXT,
        
        -- Timestamps
        paid_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        -- Indexes for performance
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_settlement_status (settlement_status),
        INDEX idx_payment_ref (payment_reference),
        INDEX idx_transaction_ref (transaction_reference),
        INDEX idx_settlement_ref (settlement_reference),
        INDEX idx_created_at (created_at),
        INDEX idx_paid_at (paid_at),
        INDEX idx_expires_at (expires_at),
        INDEX idx_user_status (user_id, status),
        INDEX idx_settlement_date (settlement_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created/updated payment_transactions table');

    // Settlement logs table for detailed settlement tracking
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS settlement_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        settlement_reference VARCHAR(100) UNIQUE NOT NULL,
        settlement_id VARCHAR(100),
        merchant_id VARCHAR(100),
        amount DECIMAL(10, 2) NOT NULL,
        settlement_date TIMESTAMP NULL,
        batch_reference VARCHAR(100),
        transaction_count INT DEFAULT 0,
        settlement_data JSON,
        failure_reason TEXT,
        status ENUM('COMPLETED', 'FAILED', 'PENDING') DEFAULT 'PENDING',
        
        -- Settlement analytics
        total_fees DECIMAL(10, 2) DEFAULT 0,
        net_settlement DECIMAL(10, 2),
        currency VARCHAR(10) DEFAULT 'NGN',
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_settlement_ref (settlement_reference),
        INDEX idx_status (status),
        INDEX idx_settlement_date (settlement_date),
        INDEX idx_batch_ref (batch_reference),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created settlement_logs table');

    // Enhanced webhook logs table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        webhook_type VARCHAR(50) NOT NULL DEFAULT 'monnify',
        event_type VARCHAR(50) NOT NULL,
        transaction_reference VARCHAR(100),
        payment_reference VARCHAR(100),
        settlement_reference VARCHAR(100),
        payload JSON NOT NULL,
        signature_valid BOOLEAN DEFAULT FALSE,
        processed BOOLEAN DEFAULT FALSE,
        error_message TEXT,
        processing_time_ms INT,
        retry_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        
        INDEX idx_webhook_type (webhook_type),
        INDEX idx_event_type (event_type),
        INDEX idx_processed (processed),
        INDEX idx_created_at (created_at),
        INDEX idx_transaction_ref (transaction_reference),
        INDEX idx_payment_ref (payment_reference),
        INDEX idx_settlement_ref (settlement_reference),
        INDEX idx_type_processed (webhook_type, processed, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created webhook_logs table');

    // Orphan payments table for reconciliation
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS orphan_payments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        transaction_reference VARCHAR(100),
        payment_reference VARCHAR(100),
        amount DECIMAL(10, 2),
        payment_method VARCHAR(50),
        customer_email VARCHAR(255),
        event_data JSON,
        reconciled BOOLEAN DEFAULT FALSE,
        reconciled_user_id INT NULL,
        reconciled_at TIMESTAMP NULL,
        investigation_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY unique_refs (transaction_reference, payment_reference),
        INDEX idx_reconciled (reconciled),
        INDEX idx_customer_email (customer_email),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created orphan_payments table');

    // Unknown webhook events for investigation
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS unknown_webhook_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        event_type VARCHAR(100) NOT NULL,
        event_data JSON NOT NULL,
        request_id VARCHAR(100),
        investigated BOOLEAN DEFAULT FALSE,
        investigation_notes TEXT,
        investigated_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_event_type (event_type),
        INDEX idx_investigated (investigated),
        INDEX idx_created_at (created_at),
        INDEX idx_request_id (request_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created unknown_webhook_events table');

    // Payment analytics table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payment_analytics (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        date DATE NOT NULL,
        total_successful INT DEFAULT 0,
        total_failed INT DEFAULT 0,
        total_amount DECIMAL(10, 2) DEFAULT 0,
        total_fees DECIMAL(10, 2) DEFAULT 0,
        average_amount DECIMAL(10, 2) DEFAULT 0,
        payment_methods JSON,
        settlement_amount DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY unique_user_date (user_id, date),
        INDEX idx_user_id (user_id),
        INDEX idx_date (date),
        INDEX idx_user_date (user_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created payment_analytics table');

    // Balance discrepancies table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS balance_discrepancies (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        current_balance DECIMAL(10, 2),
        calculated_balance DECIMAL(10, 2),
        difference DECIMAL(10, 2),
        discrepancy_type ENUM('payment', 'settlement', 'manual') DEFAULT 'payment',
        resolved BOOLEAN DEFAULT FALSE,
        resolution_notes TEXT,
        resolved_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_user_id (user_id),
        INDEX idx_resolved (resolved),
        INDEX idx_created_at (created_at),
        INDEX idx_discrepancy_type (discrepancy_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created balance_discrepancies table');

    // Update existing tables with new columns
    const alterQueries = [
      // Add settlement columns to payment_transactions if missing
      `ALTER TABLE payment_transactions 
       ADD COLUMN IF NOT EXISTS settlement_reference VARCHAR(100) AFTER monnify_transaction_reference`,
      
      `ALTER TABLE payment_transactions 
       ADD COLUMN IF NOT EXISTS settlement_date TIMESTAMP NULL AFTER settlement_reference`,
      
      `ALTER TABLE payment_transactions 
       ADD COLUMN IF NOT EXISTS settlement_status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING' AFTER settlement_date`,
       
      `ALTER TABLE payment_transactions 
       ADD COLUMN IF NOT EXISTS settlement_amount DECIMAL(10, 2) AFTER settlement_status`,
       
      `ALTER TABLE payment_transactions 
       ADD COLUMN IF NOT EXISTS transaction_fee DECIMAL(10, 2) AFTER settlement_amount`,
       
      `ALTER TABLE payment_transactions 
       ADD COLUMN IF NOT EXISTS response_code VARCHAR(20) AFTER transaction_fee`,

      // Enhance sms_user_accounts
      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS total_deposited DECIMAL(10, 2) DEFAULT 0 AFTER balance`,

      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS last_deposit_at TIMESTAMP NULL AFTER total_deposited`,

      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS deposit_count INT DEFAULT 0 AFTER last_deposit_at`,
       
      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS total_fees_paid DECIMAL(10, 2) DEFAULT 0 AFTER deposit_count`,

      // Enhance transactions table
      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) AFTER status`,

      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS balance_before DECIMAL(10, 2) AFTER amount`,

      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS balance_after DECIMAL(10, 2) AFTER balance_before`,
       
      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS settlement_reference VARCHAR(100) AFTER reference_id`,
       
      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS transaction_fee DECIMAL(10, 2) AFTER settlement_reference`
    ];

    for (const query of alterQueries) {
      try {
        await pool.execute(query);
      } catch (error) {
        if (!error.message.includes('Duplicate column')) {
          logger.warn(`ALTER TABLE warning: ${error.message}`);
        }
      }
    }

    logger.info('✅ Updated existing tables with new columns');

    // Create performance indexes
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_payment_user_status 
       ON payment_transactions(user_id, status)`,

      `CREATE INDEX IF NOT EXISTS idx_payment_settlement 
       ON payment_transactions(settlement_reference, settlement_status)`,

      `CREATE INDEX IF NOT EXISTS idx_payment_settlement_date 
       ON payment_transactions(settlement_date)`,

      `CREATE INDEX IF NOT EXISTS idx_transaction_user_type 
       ON transactions(user_id, transaction_type)`,

      `CREATE INDEX IF NOT EXISTS idx_sms_account_user 
       ON sms_user_accounts(user_id)`,
       
      `CREATE INDEX IF NOT EXISTS idx_webhook_logs_type_processed 
       ON webhook_logs(webhook_type, processed, created_at)`
    ];

    for (const query of indexQueries) {
      try {
        await pool.execute(query);
      } catch (error) {
        if (!error.message.includes('Duplicate key')) {
          logger.warn(`CREATE INDEX warning: ${error.message}`);
        }
      }
    }

    logger.info('✅ Created performance indexes');

    logger.info('✅ Enhanced payment schema creation completed successfully');
    return { success: true };

  } catch (error) {
    logger.error('Failed to create enhanced payment schema:', error);
    throw error;
  }
}

// Function to migrate existing data to new schema
async function migrateExistingPaymentData() {
  const pool = getPool();
  
  try {
    logger.info('Migrating existing payment data to enhanced schema...');

    // Update settlement status for old payments
    await pool.execute(`
      UPDATE payment_transactions 
      SET settlement_status = 'COMPLETED'
      WHERE status = 'PAID' 
      AND settlement_status IS NULL
      AND paid_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    // Set default settlement status for recent payments
    await pool.execute(`
      UPDATE payment_transactions 
      SET settlement_status = 'PENDING'
      WHERE status = 'PAID' 
      AND settlement_status IS NULL
      AND paid_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    // Update failed/cancelled payments settlement status
    await pool.execute(`
      UPDATE payment_transactions 
      SET settlement_status = 'FAILED'
      WHERE status IN ('FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED') 
      AND settlement_status = 'PENDING'
    `);

    logger.info('✅ Migration of existing payment data completed');
    return { success: true };

  } catch (error) {
    logger.error('Failed to migrate existing payment data:', error);
    throw error;
  }
}

// Function to cleanup old logs and maintain performance
async function maintainPaymentTables() {
  const pool = getPool();
  
  try {
    logger.info('Running payment table maintenance...');

    // Cleanup old webhook logs (keep 30 days)
    const [webhookResult] = await pool.execute(`
      DELETE FROM webhook_logs 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND processed = TRUE
    `);

    // Cleanup old unknown webhook events (keep investigated ones longer)
    const [unknownResult] = await pool.execute(`
      DELETE FROM unknown_webhook_events 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
      AND investigated = TRUE
    `);

    // Archive old payment analytics (older than 1 year)
    // You might want to export these to a data warehouse instead
    
    logger.info(`Maintenance completed: ${webhookResult.affectedRows} webhook logs, ${unknownResult.affectedRows} unknown events cleaned`);

    return {
      webhookLogs: webhookResult.affectedRows,
      unknownEvents: unknownResult.affectedRows
    };

  } catch (error) {
    logger.error('Payment table maintenance failed:', error);
    throw error;
  }
}

// Function to get comprehensive payment system health
async function getPaymentSystemHealth() {
  const pool = getPool();
  
  try {
    // Recent webhook activity
    const [webhookStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_webhooks,
        COUNT(CASE WHEN processed = TRUE THEN 1 END) as processed_webhooks,
        COUNT(CASE WHEN event_type = 'SUCCESSFUL_TRANSACTION' THEN 1 END) as payment_webhooks,
        COUNT(CASE WHEN event_type = 'SETTLEMENT_COMPLETED' THEN 1 END) as settlement_webhooks
      FROM webhook_logs 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    // Payment processing stats
    const [paymentStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN settlement_status = 'PENDING' THEN 1 END) as pending_settlements,
        SUM(CASE WHEN status = 'PAID' THEN amount_paid ELSE 0 END) as total_processed
      FROM payment_transactions 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);

    // Orphan payments count
    const [orphanStats] = await pool.execute(`
      SELECT COUNT(*) as orphan_count
      FROM orphan_payments 
      WHERE reconciled = FALSE
    `);

    return {
      webhook_activity: webhookStats[0],
      payment_activity: paymentStats[0],
      orphan_payments: orphanStats[0].orphan_count,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Failed to get payment system health:', error);
    return {
      webhook_activity: { total_webhooks: 0, processed_webhooks: 0 },
      payment_activity: { total_payments: 0, successful_payments: 0 },
      orphan_payments: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  createEnhancedPaymentTables,
  migrateExistingPaymentData,
  maintainPaymentTables,
  getPaymentSystemHealth
};