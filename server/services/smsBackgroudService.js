// // services/smsBackgroundService.js - Real-time SMS checking service
// const { getPool } = require('../Config/database');
// const smsActivateService = require('./smsActivateServices');
// const webSocketService = require('./webhookService');
// const logger = require('../utils/logger');

// class SmsBackgroundService {
//   constructor() {
//     this.isRunning = false;
//     this.interval = null;
//     this.checkIntervalMs = 10000; // 10 seconds
//     this.maxConcurrentChecks = 50; // Limit concurrent API calls
//   }

//   start() {
//     if (this.isRunning) {
//       logger.warn('SMS Background Service already running');
//       return;
//     }

//     this.isRunning = true;
//     logger.info('🔄 Starting SMS Background Service - checking every 10 seconds');

//     this.interval = setInterval(async () => {
//       try {
//         await this.checkActiveNumbers();
//       } catch (error) {
//         logger.error('SMS Background Service error:', error);
//       }
//     }, this.checkIntervalMs);
//   }

//   stop() {
//     if (this.interval) {
//       clearInterval(this.interval);
//       this.interval = null;
//     }
//     this.isRunning = false;
//     logger.info('🛑 SMS Background Service stopped');
//   }

//   async checkActiveNumbers() {
//     const pool = getPool();
    
//     try {
//       // Get all waiting numbers that haven't expired
//       const [activeNumbers] = await pool.execute(
//         `SELECT * FROM number_purchases 
//          WHERE status = 'waiting' 
//          AND expiry_date > NOW() 
//          AND activation_id IS NOT NULL
//          ORDER BY purchase_date DESC
//          LIMIT ?`,
//         [this.maxConcurrentChecks]
//       );

//       if (activeNumbers.length === 0) {
//         return; // No active numbers to check
//       }

//       logger.info(`📱 Checking ${activeNumbers.length} active numbers for SMS`);

//       // Process numbers in batches to avoid overwhelming SMS-Activate API
//       const batchSize = 5;
//       for (let i = 0; i < activeNumbers.length; i += batchSize) {
//         const batch = activeNumbers.slice(i, i + batchSize);
        
//         // Process batch concurrently
//         await Promise.all(
//           batch.map(number => this.checkSingleNumber(number))
//         );

//         // Small delay between batches to respect API limits
//         if (i + batchSize < activeNumbers.length) {
//           await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//       }

//     } catch (error) {
//       logger.error('Error fetching active numbers:', error);
//     }
//   }

//   async checkSingleNumber(number) {
//     const pool = getPool();
    
//     try {
//       // Check status with SMS-Activate API
//       const statusResult = await smsActivateService.getStatus(number.activation_id);
      
//       // SMS received!
//       if (statusResult.code && statusResult.code !== number.sms_code) {
//         logger.info('📨 SMS received for activation:', {
//           activationId: number.activation_id,
//           userId: number.user_id,
//           code: statusResult.code,
//           phoneNumber: number.phone_number
//         });

//         // Update database
//         await pool.execute(
//           `UPDATE number_purchases 
//            SET sms_code = ?, 
//                sms_text = ?, 
//                status = 'received', 
//                received_at = NOW()
//            WHERE id = ?`,
//           [statusResult.code, statusResult.text || null, number.id]
//         );

//         // Send real-time WebSocket notification to user
//         webSocketService.sendToUser(number.user_id, {
//           type: 'sms_received',
//           data: {
//             activationId: number.activation_id,
//             code: statusResult.code,
//             smsText: statusResult.text,
//             purchaseId: number.id,
//             phoneNumber: number.phone_number,
//             service: number.service_code,
//             timestamp: new Date().toISOString()
//           },
//           priority: 'high' // High priority for SMS notifications
//         });

//         return true; // SMS was received
//       }

//       // Check if number has expired
//       if (new Date() > new Date(number.expiry_date)) {
//         logger.info('⏰ Number expired:', {
//           activationId: number.activation_id,
//           userId: number.user_id,
//           phoneNumber: number.phone_number
//         });

//         // Update to expired status
//         await pool.execute(
//           'UPDATE number_purchases SET status = ? WHERE id = ?',
//           ['expired', number.id]
//         );

//         // Notify user about expiry
//         webSocketService.sendToUser(number.user_id, {
//           type: 'number_expired',
//           data: {
//             activationId: number.activation_id,
//             phoneNumber: number.phone_number,
//             purchaseId: number.id,
//             service: number.service_code
//           }
//         });

//         return true; // Status changed
//       }

//       return false; // No change

//     } catch (error) {
//       // Don't log every single API error to avoid spam
//       if (!error.message.includes('NO_ACTIVATION') && !error.message.includes('STATUS_')) {
//         logger.error('Error checking number status:', {
//           activationId: number.activation_id,
//           error: error.message
//         });
//       }
//       return false;
//     }
//   }

//   // Get service statistics
//   getStats() {
//     return {
//       isRunning: this.isRunning,
//       checkInterval: this.checkIntervalMs,
//       maxConcurrentChecks: this.maxConcurrentChecks
//     };
//   }

//   // Update check interval (in milliseconds)
//   setCheckInterval(intervalMs) {
//     if (intervalMs < 5000) {
//       throw new Error('Check interval cannot be less than 5 seconds');
//     }

//     this.checkIntervalMs = intervalMs;
    
//     if (this.isRunning) {
//       this.stop();
//       this.start();
//     }

//     logger.info(`SMS Background Service interval updated to ${intervalMs}ms`);
//   }
// }

// // Export singleton instance
// module.exports = new SmsBackgroundService();