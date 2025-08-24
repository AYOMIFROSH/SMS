// routes/transactions.js
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');

const router = express.Router();

// Get transactions
router.get('/', authenticateToken, async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const userId = req.user.id;
  const offset = (page - 1) * limit;

  try {
    const pool = getPool();
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [userId];

    if (type) {
      query += ' AND transaction_type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [transactions] = await pool.execute(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?';
    const countParams = [userId];
    
    if (type) {
      countQuery += ' AND transaction_type = ?';
      countParams.push(type);
    }

    const [countResult] = await pool.execute(countQuery, countParams);

    res.json({
      data: transactions,
      total: countResult[0].total,
      page: parseInt(page),
      totalPages: Math.ceil(countResult[0].total / limit)
    });
  } catch (error) {
    logger.error('Transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Add manual deposit (for admin or manual balance addition)
router.post('/deposit', authenticateToken, async (req, res) => {
  const { amount, description } = req.body;
  const userId = req.user.id;

  try {
    const pool = getPool();
    
    // Get current balance
    const [userAccount] = await pool.execute(
      'SELECT balance FROM sms_user_accounts WHERE user_id = ?',
      [userId]
    );

    const currentBalance = userAccount[0]?.balance || 0;
    const newBalance = parseFloat(currentBalance) + parseFloat(amount);

    // Start transaction
    await pool.execute('START TRANSACTION');

    try {
      // Update balance
      await pool.execute(
        'UPDATE sms_user_accounts SET balance = ? WHERE user_id = ?',
        [newBalance, userId]
      );

      // Add transaction record
      await pool.execute(
        `INSERT INTO transactions 
         (user_id, transaction_type, amount, balance_before, balance_after, description, status)
         VALUES (?, 'deposit', ?, ?, ?, ?, 'completed')`,
        [userId, amount, currentBalance, newBalance, description || 'Manual deposit']
      );

      await pool.execute('COMMIT');

      res.json({
        success: true,
        newBalance,
        amount: parseFloat(amount)
      });
    } catch (error) {
      await pool.execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Deposit error:', error);
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

module.exports = router;