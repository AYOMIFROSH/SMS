// migrations/migrateToSimplified.js - Fixed migration with missing columns
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');

async function runFlutterwaveMigration() {
  const pool = getPool();
  
  try {
    logger.info('🚀 Starting Flutterwave migration...');
    
    // Step 1: Create Flutterwave tables
    await createFlutterwaveTables(pool);
    
    // Step 2: Migrate existing data
    await migrateExistingData(pool);
    
    // Step 3: Create monitoring views
    await createMonitoringViews(pool);
    
    // Step 4: Set up initial configuration
    await setupInitialConfiguration(pool);
    
    logger.info('✅ Flutterwave migration completed successfully');
    return { success: true };
    
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    throw error;
  }
}

async function createFlutterwaveTables(pool) {
  logger.info('Creating Flutterwave tables...');
  
  const tables = [
    // Payment deposits table - FIXED: Added missing columns
    `CREATE TABLE IF NOT EXISTS payment_deposits (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      tx_ref VARCHAR(100) UNIQUE NOT NULL,
      flw_tx_id BIGINT NULL,
      flw_ref VARCHAR(100) NULL,
      ngn_amount DECIMAL(12, 2) NOT NULL,
      usd_equivalent DECIMAL(12, 6) NOT NULL,
      fx_rate DECIMAL(12, 6) NOT NULL,
      status ENUM('PENDING_UNSETTLED', 'PAID_SETTLED', 'FAILED', 'CANCELLED') DEFAULT 'PENDING_UNSETTLED',
      payment_type VARCHAR(50) DEFAULT 'card',
      currency VARCHAR(5) DEFAULT 'NGN',
      processor VARCHAR(50) DEFAULT 'flutterwave',
      customer_name VARCHAR(255) NULL,
      customer_email VARCHAR(255) NULL,
      customer_phone VARCHAR(20) NULL,
      charged_amount DECIMAL(12, 2) NULL,
      app_fee DECIMAL(12, 6) DEFAULT 0,
      merchant_fee DECIMAL(12, 6) DEFAULT 0,
      processor_response JSON NULL,
      auth_model VARCHAR(50) NULL,
      settlement_token VARCHAR(255) NULL,
      account_id INT NULL,
      narration TEXT NULL,
      payment_link TEXT NULL,
      checkout_token VARCHAR(255) NULL,
      expires_at TIMESTAMP NULL,
      meta JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_tx_ref (tx_ref),
      INDEX idx_flw_tx_id (flw_tx_id),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at),
      INDEX idx_user_status (user_id, status),
      INDEX idx_settlement_pending (status, created_at),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // User demo balances table - FIXED: Better precision
    `CREATE TABLE IF NOT EXISTS user_demo_balances (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      balance DECIMAL(12, 6) DEFAULT 0.000000,
      total_deposited DECIMAL(12, 6) DEFAULT 0.000000,
      total_spent DECIMAL(12, 6) DEFAULT 0.000000,
      pending_deposits DECIMAL(12, 6) DEFAULT 0.000000,
      last_deposit_at TIMESTAMP NULL,
      last_transaction_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_balance (balance)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Flutterwave webhook logs
    `CREATE TABLE IF NOT EXISTS flutterwave_webhook_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      event VARCHAR(100) NOT NULL,
      tx_ref VARCHAR(100) NULL,
      flw_tx_id BIGINT NULL,
      signature_header VARCHAR(1024) NULL,
      signature_valid BOOLEAN DEFAULT FALSE,
      raw_payload JSON NOT NULL,
      processed_data JSON NULL,
      processed BOOLEAN DEFAULT FALSE,
      processing_error TEXT NULL,
      processing_time_ms INT NULL,
      idempotency_key VARCHAR(100) NULL,
      duplicate_of INT NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL,
      INDEX idx_event (event),
      INDEX idx_tx_ref (tx_ref),
      INDEX idx_flw_tx_id (flw_tx_id),
      INDEX idx_processed (processed),
      INDEX idx_signature_valid (signature_valid),
      INDEX idx_created_at (created_at),
      INDEX idx_idempotency (idempotency_key),
      INDEX idx_ip_address (ip_address),
      UNIQUE KEY unique_idempotency (idempotency_key, event)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Exchange rates cache
    `CREATE TABLE IF NOT EXISTS exchange_rates (
      id INT PRIMARY KEY AUTO_INCREMENT,
      from_currency VARCHAR(5) NOT NULL,
      to_currency VARCHAR(5) NOT NULL,
      rate DECIMAL(12, 6) NOT NULL,
      source VARCHAR(50) DEFAULT 'exchangerate-api.com',
      bid DECIMAL(12, 6) NULL,
      ask DECIMAL(12, 6) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      UNIQUE KEY unique_currency_pair (from_currency, to_currency),
      INDEX idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Deposit attempts tracking
    `CREATE TABLE IF NOT EXISTS deposit_attempts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      tx_ref VARCHAR(100) NOT NULL,
      attempt_number INT DEFAULT 1,
      ngn_amount DECIMAL(12, 2) NOT NULL,
      payment_type VARCHAR(50) NOT NULL,
      status ENUM('INITIATED', 'REDIRECTED', 'COMPLETED', 'FAILED', 'TIMEOUT') DEFAULT 'INITIATED',
      error_message TEXT NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      INDEX idx_user_id (user_id),
      INDEX idx_tx_ref (tx_ref),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Payment transaction logs (for audit trail)
    `CREATE TABLE IF NOT EXISTS payment_transaction_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      tx_ref VARCHAR(100) NOT NULL,
      action VARCHAR(50) NOT NULL,
      status_before VARCHAR(50) NULL,
      status_after VARCHAR(50) NULL,
      amount DECIMAL(12, 6) NULL,
      metadata JSON NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_tx_ref (tx_ref),
      INDEX idx_action (action),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  ];

  for (const sql of tables) {
    await pool.execute(sql);
  }

  logger.info('✅ Flutterwave tables created');
}

async function migrateExistingData(pool) {
  logger.info('Migrating existing data...');

  // Insert initial exchange rate
  await pool.execute(`
    INSERT IGNORE INTO exchange_rates (from_currency, to_currency, rate, expires_at)
    VALUES ('USD', 'NGN', 1520.00, DATE_ADD(NOW(), INTERVAL 1 HOUR))
  `);

  // Create demo balance records for existing users
  await pool.execute(`
    INSERT IGNORE INTO user_demo_balances (user_id, balance, total_deposited)
    SELECT 
      s.user_id,
      COALESCE(s.balance, 0) / 1520.00 as balance,
      0
    FROM sms_user_accounts s
    WHERE s.user_id NOT IN (SELECT user_id FROM user_demo_balances)
  `);

  // Update sms_user_accounts with Flutterwave fields
  const alterQueries = [
    `ALTER TABLE sms_user_accounts 
     ADD COLUMN IF NOT EXISTS flw_customer_id VARCHAR(100) NULL AFTER api_key`,
    `ALTER TABLE sms_user_accounts 
     ADD COLUMN IF NOT EXISTS preferred_payment_method VARCHAR(50) DEFAULT 'card' AFTER flw_customer_id`,
    `ALTER TABLE sms_user_accounts 
     ADD INDEX IF NOT EXISTS idx_flw_customer_id (flw_customer_id)`
  ];

  for (const query of alterQueries) {
    try {
      await pool.execute(query);
    } catch (error) {
      if (!error.message.includes('Duplicate')) {
        logger.warn('Alter table warning:', error.message);
      }
    }
  }

  logger.info('✅ Data migration completed');
}

async function createMonitoringViews(pool) {
  logger.info('Creating monitoring views...');

  // Pending settlements monitor
  await pool.execute(`
    CREATE OR REPLACE VIEW pending_settlements_monitor AS
    SELECT 
      pd.id,
      pd.user_id,
      pd.tx_ref,
      pd.ngn_amount,
      pd.usd_equivalent,
      pd.status,
      pd.created_at,
      pd.expires_at,
      TIMESTAMPDIFF(HOUR, pd.created_at, NOW()) as hours_pending,
      CASE 
        WHEN pd.expires_at IS NOT NULL AND pd.expires_at < NOW() THEN 'EXPIRED'
        WHEN TIMESTAMPDIFF(HOUR, pd.created_at, NOW()) > 24 THEN 'STALE'
        ELSE 'ACTIVE'
      END as alert_status
    FROM payment_deposits pd
    WHERE pd.status = 'PENDING_UNSETTLED'
    ORDER BY pd.created_at DESC
  `);

  // Payment system health view
  await pool.execute(`
    CREATE OR REPLACE VIEW payment_system_health AS
    SELECT 
      'Deposits Today' as metric,
      COUNT(*) as value,
      'count' as type
    FROM payment_deposits 
    WHERE DATE(created_at) = CURDATE()
    
    UNION ALL
    
    SELECT 
      'Successful Today' as metric,
      COUNT(*) as value,
      'count' as type
    FROM payment_deposits 
    WHERE DATE(created_at) = CURDATE() AND status = 'PAID_SETTLED'
    
    UNION ALL
    
    SELECT 
      'Pending Settlements' as metric,
      COUNT(*) as value,
      'alert' as type
    FROM payment_deposits 
    WHERE status = 'PENDING_UNSETTLED'
    
    UNION ALL
    
    SELECT 
      'Old Pending (>24h)' as metric,
      COUNT(*) as value,
      'alert' as type
    FROM payment_deposits 
    WHERE status = 'PENDING_UNSETTLED' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    
    UNION ALL
    
    SELECT 
      'Webhook Success Rate (24h)' as metric,
      COALESCE(
        ROUND(
          (COUNT(CASE WHEN processed = TRUE THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 2
        ), 0
      ) as value,
      'percentage' as type
    FROM flutterwave_webhook_logs 
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  `);

  logger.info('✅ Monitoring views created');
}

async function setupInitialConfiguration(pool) {
  logger.info('Setting up initial configuration...');

  // Create configuration table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INT PRIMARY KEY AUTO_INCREMENT,
      config_key VARCHAR(100) UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      description TEXT,
      config_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
      is_sensitive BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_config_key (config_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Insert initial configuration
  const configs = [
    ['flutterwave_enabled', 'true', 'Enable Flutterwave payment processing', 'boolean'],
    ['default_currency', 'NGN', 'Default currency for deposits', 'string'],
    ['min_deposit_amount', '100', 'Minimum deposit amount in NGN', 'number'],
    ['max_deposit_amount', '1000000', 'Maximum deposit amount in NGN', 'number'],
    ['exchange_rate_cache_ttl', '3600', 'Exchange rate cache TTL in seconds', 'number'],
    ['webhook_retry_attempts', '3', 'Number of webhook retry attempts', 'number'],
    ['settlement_monitor_enabled', 'true', 'Enable settlement monitoring', 'boolean'],
    ['payment_timeout_minutes', '15', 'Payment session timeout in minutes', 'number'],
    ['fx_rate_margin', '0.01', 'FX rate margin percentage (1%)', 'number'],
    ['migration_completed_at', new Date().toISOString(), 'Migration completion timestamp', 'string']
  ];

  for (const [key, value, description, type] of configs) {
    await pool.execute(`
      INSERT IGNORE INTO system_config (config_key, config_value, description, config_type)
      VALUES (?, ?, ?, ?)
    `, [key, value, description, type]);
  }

  logger.info('✅ Initial configuration set');
}

// FIXED: Add table repair function for existing installations
async function repairExistingTables(pool) {
  logger.info('Repairing existing payment_deposits table...');
  
  try {
    // Check existing columns
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'payment_deposits' 
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    const existingColumns = columns.map(row => row.COLUMN_NAME);
    
    // Add missing columns
    const missingColumns = [
      ['payment_link', 'ADD COLUMN payment_link TEXT NULL AFTER narration'],
      ['checkout_token', 'ADD COLUMN checkout_token VARCHAR(255) NULL AFTER payment_link'],
      ['expires_at', 'ADD COLUMN expires_at TIMESTAMP NULL AFTER checkout_token'],
      ['pending_deposits', 'ADD COLUMN pending_deposits DECIMAL(12, 6) DEFAULT 0.000000 AFTER total_spent']
    ];
    
    for (const [columnName, alterQuery] of missingColumns) {
      if (!existingColumns.includes(columnName)) {
        await pool.execute(`ALTER TABLE payment_deposits ${alterQuery}`);
        logger.info(`Added missing column: ${columnName}`);
      }
    }
    
    // Add missing indexes
    const indexQueries = [
      'ALTER TABLE payment_deposits ADD INDEX IF NOT EXISTS idx_expires_at (expires_at)'
    ];
    
    for (const indexQuery of indexQueries) {
      try {
        await pool.execute(indexQuery);
      } catch (error) {
        if (!error.message.includes('Duplicate')) {
          logger.warn('Index creation warning:', error.message);
        }
      }
    }
    
    // Also repair user_demo_balances if needed
    const [userBalanceColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user_demo_balances' 
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    const userBalanceExisting = userBalanceColumns.map(row => row.COLUMN_NAME);
    
    if (!userBalanceExisting.includes('pending_deposits')) {
      await pool.execute(`
        ALTER TABLE user_demo_balances 
        ADD COLUMN pending_deposits DECIMAL(12, 6) DEFAULT 0.000000 AFTER total_spent
      `);
      logger.info('Added pending_deposits column to user_demo_balances');
    }
    
    logger.info('✅ Table repair completed');
    
  } catch (error) {
    logger.error('Table repair error:', error);
    // Don't throw - let migration continue
  }
}

// Health check function
async function getSystemHealth() {
  const pool = getPool();
  
  try {
    const [health] = await pool.execute('SELECT * FROM payment_system_health');
    const [pending] = await pool.execute('SELECT COUNT(*) as count FROM pending_settlements_monitor');
    
    return {
      metrics: health,
      pendingSettlements: pending[0].count,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Health check failed:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Cleanup old data
async function cleanupOldData(daysOld = 90) {
  const pool = getPool();
  
  try {
    logger.info(`Cleaning up data older than ${daysOld} days...`);
    
    // Archive old webhook logs
    const [result] = await pool.execute(`
      DELETE FROM flutterwave_webhook_logs 
      WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) 
      AND processed = TRUE
    `, [daysOld]);
    
    logger.info(`Cleaned up ${result.affectedRows} old webhook logs`);
    
    return { success: true, cleanedRecords: result.affectedRows };
  } catch (error) {
    logger.error('Cleanup failed:', error);
    throw error;
  }
}

// Helper function to validate user exists before payment operations
async function validateUserExists(userId) {
  const { getExistingDbPool } = require('../Config/database');
  const existingPool = getExistingDbPool();
  
  try {
    const [rows] = await existingPool.execute(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );
    return rows.length > 0;
  } catch (error) {
    logger.error('User validation error:', error);
    return false;
  }
}

module.exports = {
  runFlutterwaveMigration,
  repairExistingTables,
  getSystemHealth,
  cleanupOldData,
  validateUserExists
};