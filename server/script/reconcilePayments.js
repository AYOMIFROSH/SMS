// scripts/reconcilePayments.js
const { setupDatabase, getPool } = require('../Config/database');
const flutterwaveService = require('../services/flutterwaveServices');
const logger = require('../utils/logger');

async function reconcileCancelledPayments() {
  await setupDatabase(); // ensure pools are ready
  const pool = getPool();

  try {
    // 1. Fetch cancelled or unsettled payments
    const [rows] = await pool.query(`
      SELECT id, user_id, tx_ref, flw_tx_id, status, ngn_amount, usd_equivalent 
      FROM payment_deposits 
      WHERE status IN ('CANCELLED', 'PENDING_UNSETTLED')
    `);

    logger.info(`Found ${rows.length} candidate transactions for reconciliation`);

    for (const tx of rows) {
      try {
        logger.info(`Reconciling transaction: ${tx.tx_ref} (current status: ${tx.status})`);

        // 2. Verify with Flutterwave API
        const flwResult = await flutterwaveService.verifyTransaction(tx.tx_ref, 'reconcile');

        if (flwResult.success && flwResult.data.status === 'successful') {
          // 3. Use the full payment processor (credits balances + logs)
          const result = await flutterwaveService.processSuccessfulPayment(flwResult.data, 'reconcile');

          if (result.success) {
            logger.info(`✅ Reconciled ${tx.tx_ref} -> PAID_SETTLED, user ${result.userId}, +$${result.usdEquivalent}`);
          } else {
            logger.warn(`⚠️ Could not process ${tx.tx_ref}, verify returned success but processing failed`);
          }
        } else {
          logger.debug(`No fix for ${tx.tx_ref}: FW status = ${flwResult.data?.status || 'not found'}`);
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
