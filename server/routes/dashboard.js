const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPool } = require('../Config/database');
const smsActivateService = require('../services/smsActivateServices');
const logger = require('../utils/logger');

const router = express.Router();

// Get dashboard stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    // Get user account info
    const [accountData] = await pool.execute(
      'SELECT * FROM sms_user_accounts WHERE user_id = ?',
      [userId]
    );

    // Get active numbers count
    const [activeNumbers] = await pool.execute(
      `SELECT COUNT(*) as count FROM number_purchases 
       WHERE user_id = ? AND status IN ('waiting', 'received')`,
      [userId]
    );

    // Get today's purchases
    const [todayPurchases] = await pool.execute(
      `SELECT COUNT(*) as count, SUM(price) as total 
       FROM number_purchases 
       WHERE user_id = ? AND DATE(purchase_date) = CURDATE()`,
      [userId]
    );

    // Get success rate
    const [successRate] = await pool.execute(
      `SELECT 
        COUNT(CASE WHEN status = 'used' THEN 1 END) * 100.0 / COUNT(*) as rate
       FROM number_purchases 
       WHERE user_id = ?`,
      [userId]
    );

    const [spent] = await pool.execute(
      `SELECT COALESCE(SUM(price), 0) as total 
   FROM number_purchases 
   WHERE user_id = ?`,
      [userId]
    );

    // Get balance from SMS-Activate if API key exists
    let apiBalance = 0;
    if (accountData[0]?.api_key) {
      try {
        apiBalance = await smsActivateService.getBalance();
      } catch (error) {
        logger.error('Failed to get API balance:', error);
      }
    }

    res.json({
      balance: apiBalance,
      activeNumbers: activeNumbers[0].count,
      todayPurchases: todayPurchases[0].count || 0,
      todaySpent: todayPurchases[0].total || 0,
      successRate: successRate[0].rate || 0,
      totalNumbers: accountData[0]?.total_numbers_purchased || 0,
      totalSpent: parseFloat(spent?.[0]?.total ?? 0)
    });
  } catch (error) {
    logger.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get recent activity
router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    const [activities] = await pool.execute(
      `SELECT 
        np.id, np.phone_number, np.service_name, np.status, 
        np.purchase_date, np.price, np.country_code
       FROM number_purchases np
       WHERE np.user_id = ?
       ORDER BY np.purchase_date DESC
       LIMIT 10`,
      [userId]
    );

    res.json(activities);
  } catch (error) {
    logger.error('Activity error:', error);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

module.exports = router;