// scripts/reconcilePayments.js
const { setupDatabase, getPool } = require('../Config/database');
const flutterwaveService = require('../services/flutterwaveServices');
const logger = require('../utils/logger');
require('dotenv').config();

async function reconcileCancelledPayments() {
  await setupDatabase();
  const pool = getPool();

  try {
    // Only fetch transactions that have a flw_tx_id (payment was initiated with Flutterwave)
    const [rows] = await pool.query(`
      SELECT id, user_id, tx_ref, flw_tx_id, status, ngn_amount, usd_equivalent 
      FROM payment_deposits 
      WHERE status IN ('CANCELLED', 'PENDING_UNSETTLED')
        AND flw_tx_id IS NOT NULL
    `);

    logger.info(`Found ${rows.length} candidate transactions for reconciliation`);

    for (const tx of rows) {
      try {
        logger.info(`Reconciling transaction: ${tx.tx_ref} (current status: ${tx.status})`);

        // Verify with Flutterwave API
        const flwResult = await flutterwaveService.verifyTransaction(tx.tx_ref, 'reconcile');

        if (flwResult.success && flwResult.data.status === 'successful') {
          const result = await flutterwaveService.processSuccessfulPayment(flwResult.data, 'reconcile');

          if (result.success) {
            logger.info(`✅ Reconciled ${tx.tx_ref} -> PAID_SETTLED, user ${result.userId}, +$${result.usdEquivalent}`);
          } else {
            logger.warn(`⚠️ Could not process ${tx.tx_ref}, verify returned success but processing failed`);
          }
        } else if (flwResult.data && (flwResult.data.status === 'failed' || flwResult.data.status === 'cancelled')) {
          // Mark as FAILED if Flutterwave confirms it failed
          await pool.query(
            `UPDATE payment_deposits SET status = 'FAILED', updated_at = NOW() WHERE id = ?`,
            [tx.id]
          );
          logger.info(`❌ Marked ${tx.tx_ref} as FAILED (Flutterwave status: ${flwResult.data.status})`);
        } else if (!flwResult.success) {
          // Transaction not found on Flutterwave (expired/invalid)
          await pool.query(
            `UPDATE payment_deposits SET status = 'FAILED', updated_at = NOW() WHERE id = ?`,
            [tx.id]
          );
          logger.info(`❌ Marked ${tx.tx_ref} as FAILED (not found on Flutterwave)`);
        } else {
          logger.debug(`No action for ${tx.tx_ref}: FW status = ${flwResult.data?.status || 'unknown'}`);
        }
      } catch (err) {
        logger.error(`Error verifying tx_ref ${tx.tx_ref}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('Reconciliation failed:', err.message);
  }
}

// Run script if executed directly
if (require.main === module) {
  reconcileCancelledPayments().then(() => {
    logger.info('Reconciliation script completed');
    process.exit(0);
  });
}

module.exports = reconcileCancelledPayments;