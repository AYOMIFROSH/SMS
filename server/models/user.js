// models/User.js
const { getPool, getExistingDbPool } = require('../Config/database');
const logger = require('../utils/logger');

class User {
  // Create SMS user account (in fizzbuzz_app)
  static async createSmsAccount(userId) {
    try {
      const pool = getPool();
      const [result] = await pool.execute(
        'INSERT INTO sms_user_accounts (user_id) VALUES (?)',
        [userId]
      );
      return result.insertId;
    } catch (error) {
      logger.error('Create SMS account error:', error);
      throw error;
    }
  }

  // Find user by email (from fizzbuzz_upmax)
  static async findByEmail(email) {
    try {
      const existingPool = getExistingDbPool();
      const [rows] = await existingPool.execute(
        'SELECT id, firstname, lastname, username, email, password, balance FROM users WHERE email = ?',
        [email]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('Find by email error:', error);
      return null;
    }
  }

  // Find user by username (from fizzbuzz_upmax)
  static async findByUsername(username) {
    try {
      const existingPool = getExistingDbPool();
      const [rows] = await existingPool.execute(
        'SELECT id, firstname, lastname, username, email, password, balance FROM users WHERE username = ?',
        [username]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('Find by username error:', error);
      return null;
    }
  }

  // Find user by ID (from fizzbuzz_upmax)
  static async findById(id) {
    try {
      const existingPool = getExistingDbPool();
      const [rows] = await existingPool.execute(
        'SELECT id, firstname, lastname, username, email, balance FROM users WHERE id = ?',
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('Find by ID error:', error);
      return null;
    }
  }

  // Get SMS account info (from fizzbuzz_app)
  static async getSmsAccount(userId) {
    try {
      const pool = getPool();
      const [rows] = await pool.execute(
        'SELECT * FROM sms_user_accounts WHERE user_id = ?',
        [userId]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('Get SMS account error:', error);
      return null;
    }
  }

  // Update SMS account balance (in fizzbuzz_app)
  static async updateSmsBalance(userId, newBalance) {
    try {
      const pool = getPool();
      await pool.execute(
        'UPDATE sms_user_accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [newBalance, userId]
      );
      return true;
    } catch (error) {
      logger.error('Update SMS balance error:', error);
      return false;
    }
  }

  // Decrement SMS account balance (in fizzbuzz_app)
  static async decrementSmsBalance(userId, amount) {
    try {
      const pool = getPool();
      const [result] = await pool.execute(
        'UPDATE sms_user_accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND balance >= ?',
        [amount, userId, amount]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('Decrement SMS balance error:', error);
      return false;
    }
  }
}

module.exports = User;
