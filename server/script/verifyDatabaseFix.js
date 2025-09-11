// scripts/verifyDatabaseFix.js - Check if database fix was applied
require('dotenv').config();
const { getPool, setupDatabase } = require('../Config/database');

async function verifyDatabaseFix() {
  try {
    await setupDatabase();
    const pool = getPool();
    
    console.log('🔍 Verifying database fix...');
    
    // Check payment_deposits table structure
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'payment_deposits' 
      AND TABLE_SCHEMA = DATABASE()
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('\n📋 payment_deposits table structure:');
    columns.forEach((col, index) => {
      console.log(`  ${index + 1}. ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? '(NULL)' : '(NOT NULL)'}${col.COLUMN_DEFAULT ? ` DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });
    
    // Check required columns
    const columnNames = columns.map(col => col.COLUMN_NAME);
    const requiredColumns = [
      'user_id', 'tx_ref', 'ngn_amount', 'usd_equivalent', 'fx_rate',
      'payment_type', 'currency', 'customer_email', 'customer_name',
      'customer_phone', 'payment_link', 'checkout_token', 'expires_at',
      'processor_response', 'meta', 'status'
    ];
    
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('\n❌ Missing required columns:', missingColumns);
      return { success: false, missingColumns };
    }
    
    console.log('\n✅ All required columns present');
    
    // Check other required tables
    const requiredTables = [
      'payment_transaction_logs',
      'user_demo_balances', 
      'exchange_rates',
      'flutterwave_webhook_logs'
    ];
    
    for (const tableName of requiredTables) {
      const [tableExists] = await pool.execute(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      `, [tableName]);
      
      if (tableExists.length === 0) {
        console.log(`❌ Missing table: ${tableName}`);
        return { success: false, missingTable: tableName };
      }
    }
    
    console.log('✅ All required tables exist');
    
    // Check if exchange rate exists
    const [exchangeRates] = await pool.execute(
      'SELECT * FROM exchange_rates WHERE from_currency = "USD" AND to_currency = "NGN"'
    );
    
    if (exchangeRates.length === 0) {
      console.log('⚠️  No exchange rate found, inserting default...');
      await pool.execute(`
        INSERT INTO exchange_rates (from_currency, to_currency, rate, expires_at)
        VALUES ('USD', 'NGN', 1520.00, DATE_ADD(NOW(), INTERVAL 1 HOUR))
      `);
      console.log('✅ Default exchange rate inserted');
    } else {
      console.log(`✅ Exchange rate found: 1 USD = ${exchangeRates[0].rate} NGN`);
    }
    
    // Test insertion with the exact parameters that were failing
    console.log('\n🧪 Testing parameter binding...');
    const testTxRef = `TEST_PARAM_${Date.now()}`;
    
    try {
      const testParams = [
        1519,                                         // user_id (your actual user ID)
        testTxRef,                                   // tx_ref
        8000.00,                                     // ngn_amount (your test amount)
        5.263,                                       // usd_equivalent
        1520.00,                                     // fx_rate
        'card',                                      // payment_type
        'NGN',                                       // currency
        null,                                        // customer_email - testing null
        null,                                        // customer_name - testing null  
        null,                                        // customer_phone - testing null
        'https://checkout.flutterwave.com/v3/hosted/pay/test123', // payment_link
        null,                                        // checkout_token - testing null
        new Date(Date.now() + 900000),               // expires_at
        JSON.stringify({test: 'response'}),          // processor_response
        JSON.stringify({ip_address: null}),          // meta - testing null in JSON
        'PENDING_UNSETTLED'                          // status
      ];
      
      await pool.execute(`
        INSERT INTO payment_deposits (
          user_id, tx_ref, ngn_amount, usd_equivalent, fx_rate,
          payment_type, currency, customer_email, customer_name,
          customer_phone, payment_link, checkout_token, expires_at,
          processor_response, meta, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, testParams);
      
      console.log('✅ Parameter binding test successful');
      
      // Test the transaction logs table too
      await pool.execute(`
        INSERT INTO payment_transaction_logs (
          user_id, tx_ref, action, metadata, ip_address
        ) VALUES (?, ?, ?, ?, ?)
      `, [1519, testTxRef, 'test_created', JSON.stringify({test: true}), null]);
      
      console.log('✅ Transaction logs test successful');
      
      // Clean up test records
      await pool.execute('DELETE FROM payment_deposits WHERE tx_ref = ?', [testTxRef]);
      await pool.execute('DELETE FROM payment_transaction_logs WHERE tx_ref = ?', [testTxRef]);
      console.log('✅ Test records cleaned up');
      
    } catch (error) {
      console.error('❌ Parameter binding test failed:', error);
      return { success: false, error: error.message };
    }
    
    console.log('\n🎉 Database verification completed successfully!');
    console.log('The undefined parameter binding issue should now be resolved.');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    return { success: false, error: error.message };
  } finally {
    process.exit(0);
  }
}

verifyDatabaseFix();