// migrations/createPaymentTables.js - Complete payment tables setup for Monnify
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');

async function createPaymentTables() {
  const pool = getPool();

  try {
    logger.info('Creating/updating payment tables for Monnify integration...');

    // Main payment transactions table
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
        failure_reason TEXT,
        paid_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status),
        INDEX idx_payment_ref (payment_reference),
        INDEX idx_transaction_ref (transaction_reference),
        INDEX idx_created_at (created_at),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created payment_transactions table');

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
        reconciled_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_refs (transaction_reference, payment_reference),
        INDEX idx_reconciled (reconciled),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created orphan_payments table');

    // Payment analytics table (optional but useful)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payment_analytics (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        date DATE,
        total_successful INT DEFAULT 0,
        total_failed INT DEFAULT 0,
        total_amount DECIMAL(10, 2) DEFAULT 0,
        average_amount DECIMAL(10, 2) DEFAULT 0,
        payment_methods JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_date (user_id, date),
        INDEX idx_user_id (user_id),
        INDEX idx_date (date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created payment_analytics table');

    // Ensure account_details exists in payment_transactions
    await pool.execute(`
  ALTER TABLE payment_transactions 
  ADD COLUMN IF NOT EXISTS account_details JSON NULL AFTER checkout_url
`);


    // Balance discrepancies table for reconciliation
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS balance_discrepancies (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        current_balance DECIMAL(10, 2),
        calculated_balance DECIMAL(10, 2),
        difference DECIMAL(10, 2),
        resolved BOOLEAN DEFAULT FALSE,
        resolution_notes TEXT,
        resolved_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_resolved (resolved),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created balance_discrepancies table');

    // Webhook logs table for debugging
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        webhook_type VARCHAR(50),
        event_type VARCHAR(50),
        transaction_reference VARCHAR(100),
        payment_reference VARCHAR(100),
        payload JSON,
        signature_valid BOOLEAN,
        processed BOOLEAN DEFAULT FALSE,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_webhook_type (webhook_type),
        INDEX idx_event_type (event_type),
        INDEX idx_processed (processed),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('✅ Created webhook_logs table');

    // Update existing tables if needed

    // Add missing columns to sms_user_accounts if they don't exist
    const alterQueries = [
      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS total_deposited DECIMAL(10, 2) DEFAULT 0 AFTER balance`,

      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS last_deposit_at TIMESTAMP NULL AFTER total_deposited`,

      `ALTER TABLE sms_user_accounts 
       ADD COLUMN IF NOT EXISTS deposit_count INT DEFAULT 0 AFTER last_deposit_at`,

      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) AFTER status`,

      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS balance_before DECIMAL(10, 2) AFTER amount`,

      `ALTER TABLE transactions 
       ADD COLUMN IF NOT EXISTS balance_after DECIMAL(10, 2) AFTER balance_before`
    ];

    for (const query of alterQueries) {
      try {
        await pool.execute(query);
      } catch (error) {
        // Column might already exist, continue
        if (!error.message.includes('Duplicate column')) {
          logger.warn(`ALTER TABLE warning: ${error.message}`);
        }
      }
    }

    logger.info('✅ Updated existing tables with new columns');

    // Create indexes for better performance
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_payment_user_status 
       ON payment_transactions(user_id, status)`,

      `CREATE INDEX IF NOT EXISTS idx_transaction_user_type 
       ON transactions(user_id, transaction_type)`,

      `CREATE INDEX IF NOT EXISTS idx_sms_account_user 
       ON sms_user_accounts(user_id)`
    ];

    for (const query of indexQueries) {
      try {
        await pool.execute(query);
      } catch (error) {
        // Index might already exist
        if (!error.message.includes('Duplicate key')) {
          logger.warn(`CREATE INDEX warning: ${error.message}`);
        }
      }
    }

    logger.info('✅ Created performance indexes');

    logger.info('✅ All payment tables created/updated successfully');

    return { success: true };

  } catch (error) {
    logger.error('Failed to create payment tables:', error);
    throw error;
  }
}

// Add function to clean up old webhook logs
async function cleanupWebhookLogs(daysToKeep = 7) {
  const pool = getPool();

  try {
    const [result] = await pool.execute(
      `DELETE FROM webhook_logs 
       WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [daysToKeep]
    );

    logger.info(`Cleaned up ${result.affectedRows} old webhook logs`);
    return result.affectedRows;

  } catch (error) {
    logger.error('Failed to cleanup webhook logs:', error);
    throw error;
  }
}

// Add function to reconcile orphan payments
async function reconcileOrphanPayments() {
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
        // Try to find user by email
        const eventData = JSON.parse(orphan.event_data || '{}');
        const customerEmail = eventData.customer?.email || orphan.customer_email;

        if (customerEmail) {
          // Find user by email
          const [users] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [customerEmail]
          );

          if (users.length > 0) {
            const userId = users[0].id;

            // Create payment record
            await pool.execute(
              `INSERT INTO payment_transactions 
               (user_id, payment_reference, transaction_reference, amount, 
                amount_paid, status, payment_method, customer_email, 
                payment_description, paid_at, created_at)
               VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?, 'Reconciled orphan payment', NOW(), ?)`,
              [
                userId,
                orphan.payment_reference,
                orphan.transaction_reference,
                orphan.amount,
                orphan.amount,
                orphan.payment_method,
                customerEmail,
                orphan.created_at
              ]
            );

            // Update user balance
            await pool.execute(
              'UPDATE sms_user_accounts SET balance = balance + ? WHERE user_id = ?',
              [orphan.amount, userId]
            );

            // Mark as reconciled
            await pool.execute(
              'UPDATE orphan_payments SET reconciled = TRUE, reconciled_at = NOW() WHERE id = ?',
              [orphan.id]
            );

            reconciledCount++;
            logger.info(`Reconciled orphan payment ${orphan.transaction_reference} for user ${userId}`);
          }
        }
      } catch (reconcileError) {
        logger.error(`Failed to reconcile orphan payment ${orphan.id}:`, reconcileError);
      }
    }

    logger.info(`Reconciled ${reconciledCount} orphan payments`);
    return reconciledCount;

  } catch (error) {
    logger.error('Failed to reconcile orphan payments:', error);
    throw error;
  }
}

module.exports = {
  createPaymentTables,
  cleanupWebhookLogs,
  reconcileOrphanPayments
};