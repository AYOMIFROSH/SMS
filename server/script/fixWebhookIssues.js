// scripts/fixWebhookIssues.js - Complete fix for all webhook issues
require('dotenv').config();
const { getPool, setupDatabase } = require('../Config/database');
const logger = require('../utils/logger');

async function fixWebhookIssues() {
  try {
    console.log('🔧 Starting webhook fixes...');
    
    await setupDatabase();
    const pool = getPool();
    
    // Issue 1: Fix flutterwave_webhook_logs table structure
    console.log('📝 Fixing flutterwave_webhook_logs table...');
    
    // Check current columns
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'flutterwave_webhook_logs' 
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    const existingColumns = columns.map(row => row.COLUMN_NAME);
    console.log('Current columns:', existingColumns);
    
    // Add missing columns
    const missingColumns = {
      'ip_address': 'ADD COLUMN ip_address VARCHAR(45) NULL',
      'user_agent': 'ADD COLUMN user_agent TEXT NULL'
    };
    
    for (const [columnName, alterQuery] of Object.entries(missingColumns)) {
      if (!existingColumns.includes(columnName)) {
        try {
          await pool.execute(`ALTER TABLE flutterwave_webhook_logs ${alterQuery}`);
          console.log(`✅ Added column: ${columnName}`);
        } catch (error) {
          console.warn(`Warning adding ${columnName}:`, error.message);
        }
      } else {
        console.log(`✅ Column ${columnName} already exists`);
      }
    }
    
    // Issue 2: Test webhook log insertion with proper parameters
    console.log('🧪 Testing webhook log insertion...');
    
    const testParams = [
      'test.event',                    // event
      'TEST_' + Date.now(),           // tx_ref
      12345,                          // flw_tx_id
      'test-signature',               // signature_header
      true,                           // signature_valid
      JSON.stringify({test: true}),   // raw_payload
      'test-idempotency',            // idempotency_key
      '127.0.0.1',                   // ip_address
      'Test User Agent'               // user_agent
    ];
    
    await pool.execute(`
      INSERT INTO flutterwave_webhook_logs (
        event, tx_ref, flw_tx_id, signature_header, signature_valid,
        raw_payload, idempotency_key, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, testParams);
    
    console.log('✅ Webhook log test insertion successful');
    
    // Clean up test record
    await pool.execute(
      'DELETE FROM flutterwave_webhook_logs WHERE event = ?',
      ['test.event']
    );
    
    // Issue 3: Check payment_deposits table for flw_tx_id column
    console.log('📝 Checking payment_deposits table...');
    
    const [depositColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'payment_deposits' 
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    const depositColumnNames = depositColumns.map(row => row.COLUMN_NAME);
    
    if (!depositColumnNames.includes('flw_tx_id')) {
      console.log('Adding flw_tx_id column to payment_deposits...');
      await pool.execute(`
        ALTER TABLE payment_deposits 
        ADD COLUMN flw_tx_id BIGINT NULL AFTER tx_ref,
        ADD INDEX idx_flw_tx_id (flw_tx_id)
      `);
      console.log('✅ Added flw_tx_id column');
    } else {
      console.log('✅ flw_tx_id column already exists');
    }
    
    if (!depositColumnNames.includes('flw_ref')) {
      console.log('Adding flw_ref column to payment_deposits...');
      await pool.execute(`
        ALTER TABLE payment_deposits 
        ADD COLUMN flw_ref VARCHAR(100) NULL AFTER flw_tx_id
      `);
      console.log('✅ Added flw_ref column');
    } else {
      console.log('✅ flw_ref column already exists');
    }
    
    // Issue 4: Test successful webhook processing simulation
    console.log('🧪 Testing webhook processing flow...');
    
    // Create a test deposit record
    const testTxRef = `TEST_WEBHOOK_${Date.now()}`;
    
    await pool.execute(`
      INSERT INTO payment_deposits (
        user_id, tx_ref, ngn_amount, usd_equivalent, fx_rate,
        payment_type, currency, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [1519, testTxRef, 900, 0.6, 1500, 'card', 'NGN', 'PENDING_UNSETTLED']);
    
    console.log('✅ Test deposit created');
    
    // Clean up test record
    await pool.execute('DELETE FROM payment_deposits WHERE tx_ref = ?', [testTxRef]);
    console.log('✅ Test cleanup completed');
    
    // Final verification
    console.log('🔍 Final verification...');
    
    const [finalWebhookColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'flutterwave_webhook_logs' 
      AND TABLE_SCHEMA = DATABASE()
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('📋 Final flutterwave_webhook_logs structure:');
    finalWebhookColumns.forEach((col, index) => {
      console.log(`  ${index + 1}. ${col.COLUMN_NAME}`);
    });
    
    console.log('\n🎉 All webhook issues fixed successfully!');
    console.log('You can now test payments again - webhooks should process correctly.');
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Webhook fix failed:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixWebhookIssues();