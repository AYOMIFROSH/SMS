// cron/reconcileJob.js
const cron = require('node-cron');
const reconcileCancelledPayments = require('../script/reconcilePayments');
const logger = require('../utils/logger');

// Function to run reconciliation safely
async function runReconciliation(source = 'manual') {
  logger.info(`⏳ Starting reconciliation job (${source})...`);
  try {
    await reconcileCancelledPayments();
    logger.info(`✅ Reconciliation job (${source}) finished`);
  } catch (err) {
    logger.error(`❌ Reconciliation job (${source}) failed:`, err.message);
  }
}

// 1️⃣ Run once on startup
runReconciliation('startup');

// 2️⃣ Schedule to run every 3 hours
cron.schedule('0 */3 * * *', () => {
  runReconciliation('cron');
});
