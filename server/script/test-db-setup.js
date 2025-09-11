// test-db-setup.js - Run this to test your database setup
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');

async function testDatabaseSetup() {
  try {
    const pool = getPool();
    
    console.log('🔍 Testing database connection...');
    await pool.execute('SELECT 1');
    console.log('✅ Database connection successful');
    
    // Check if payment_deposits table exists
    console.log('🔍 Checking payment_deposits table...');
    const [tableCheck] = await pool.execute(`
      SHOW TABLES LIKE 'payment_deposits'
    `);
    
    if (tableCheck.length === 0) {
      console.log('❌ payment_deposits table does not exist');
      console.log('💡 Create it with:');
      console.log(createTableSQL);
      return false;
    }
    
    console.log('✅ payment_deposits table exists');
    
    // Check table structure
    console.log('🔍 Checking table structure...');
    const [structure] = await pool.execute(`DESCRIBE payment_deposits`);
    
    const requiredColumns = [
      'user_id', 'tx_ref', 'ngn_amount', 'usd_equivalent', 'fx_rate',
      'payment_type', 'currency', 'customer_email', 'customer_name',
      'status', 'created_at'
    ];
    
    const existingColumns = structure.map(col => col.Field);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('❌ Missing columns:', missingColumns);
      return false;
    }
    
    console.log('✅ All required columns exist');
    
    // Test insert with minimal data
    console.log('🔍 Testing insert operation...');
    const testTxRef = `TEST_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    try {
      const [insertResult] = await pool.execute(`
        INSERT INTO payment_deposits (
          user_id, tx_ref, ngn_amount, usd_equivalent, fx_rate,
          payment_type, currency, customer_email, customer_name, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        9999, // test user_id
        testTxRef,
        1000.00,
        0.658,
        1520.00,
        'card',
        'NGN',
        'test@example.com',
        'Test User',
        'PENDING_UNSETTLED'
      ]);
      
      console.log('✅ Test insert successful, insertId:', insertResult.insertId);
      
      // Clean up test data
      await pool.execute('DELETE FROM payment_deposits WHERE tx_ref = ?', [testTxRef]);
      console.log('✅ Test data cleaned up');
      
    } catch (insertError) {
      console.log('❌ Insert test failed:', insertError.message);
      return false;
    }
    
    // Check other required tables
    console.log('🔍 Checking other required tables...');
    const requiredTables = [
      'user_demo_balances',
      'exchange_rates', 
      'payment_transaction_logs',
      'flutterwave_webhook_logs'
    ];
    
    for (const tableName of requiredTables) {
      const [tableExists] = await pool.execute(`SHOW TABLES LIKE '${tableName}'`);
      if (tableExists.length === 0) {
        console.log(`⚠️  Table ${tableName} does not exist (optional but recommended)`);
      } else {
        console.log(`✅ Table ${tableName} exists`);
      }
    }
    
    console.log('\n🎉 Database setup test completed successfully!');
    return true;
    
  } catch (error) {
    console.log('❌ Database test failed:', error.message);
    console.log('Error details:', error);
    return false;
  }
}

const createTableSQL = `
CREATE TABLE payment_deposits (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) NOT NULL,
  tx_ref varchar(100) NOT NULL UNIQUE,
  flw_tx_id varchar(50) DEFAULT NULL,
  flw_ref varchar(100) DEFAULT NULL,
  ngn_amount decimal(15,2) NOT NULL,
  usd_equivalent decimal(15,6) NOT NULL DEFAULT 0,
  fx_rate decimal(10,4) NOT NULL DEFAULT 0,
  charged_amount decimal(15,2) DEFAULT NULL,
  app_fee decimal(10,2) DEFAULT NULL,
  merchant_fee decimal(10,2) DEFAULT NULL,
  status enum('PENDING_UNSETTLED','PAID_SETTLED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING_UNSETTLED',
  payment_type varchar(20) NOT NULL DEFAULT 'card',
  currency varchar(10) NOT NULL DEFAULT 'NGN',
  customer_email varchar(255) NOT NULL,
  customer_name varchar(255) NOT NULL,
  customer_phone varchar(20) DEFAULT NULL,
  payment_link text DEFAULT NULL,
  checkout_token varchar(255) DEFAULT NULL,
  processor_response json DEFAULT NULL,
  meta json DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  paid_at timestamp NULL DEFAULT NULL,
  expires_at timestamp NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_tx_ref (tx_ref),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

// Run the test if this file is executed directly
if (require.main === module) {
  testDatabaseSetup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { testDatabaseSetup };