// services/reconciliationService.js
const cron = require('node-cron');
const paymentWebhookProcessor = require('./paymentWebhookProcessor');
const monnifyService = require('../routes/monnifyService');

class ReconciliationService {
    start() {
        // Run every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            try {
                logger.info('Starting automated reconciliation...');
                
                // Reconcile payments
                const paymentResult = await monnifyService.reconcilePayments({
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
                });
                
                // Reconcile orphan payments
                const orphanResult = await paymentWebhookProcessor.reconcileOrphanPayments();
                
                // Clean up old logs
                const cleanupResult = await paymentWebhookProcessor.cleanupExpiredPayments();
                
                logger.info('Automated reconciliation completed:', {
                    payments: paymentResult,
                    orphans: orphanResult,
                    cleanup: cleanupResult
                });
                
            } catch (error) {
                logger.error('Automated reconciliation failed:', error);
            }
        });
        
        logger.info('Reconciliation service started');
    }
}

module.exports = new ReconciliationService();