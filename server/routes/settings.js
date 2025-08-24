// routes/settings.js
const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getPool } = require('../Config/database');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

const router = express.Router();

// Get user settings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    const [settings] = await pool.execute(
      'SELECT api_key, account_status, created_at, updated_at FROM sms_user_accounts WHERE user_id = ?',
      [userId]
    );

    const userSettings = settings[0] || {};
    
    // Don't send the actual API key, just indicate if it exists
    res.json({
      hasApiKey: !!userSettings.api_key,
      accountStatus: userSettings.account_status,
      createdAt: userSettings.created_at,
      updatedAt: userSettings.updated_at
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update API key
router.put('/api-key', authenticateToken, async (req, res) => {
  const { apiKey } = req.body;
  const userId = req.user.id;

  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    const pool = getPool();
    const encryptedKey = encrypt(apiKey.trim());

    await pool.execute(
      'UPDATE sms_user_accounts SET api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [encryptedKey, userId]
    );

    res.json({ success: true, message: 'API key updated successfully' });
  } catch (error) {
    logger.error('Update API key error:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Remove API key
router.delete('/api-key', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    await pool.execute(
      'UPDATE sms_user_accounts SET api_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [userId]
    );

    res.json({ success: true, message: 'API key removed successfully' });
  } catch (error) {
    logger.error('Remove API key error:', error);
    res.status(500).json({ error: 'Failed to remove API key' });
  }
});

// Add/Remove favorite service
router.post('/favorites', authenticateToken, async (req, res) => {
  const { serviceCode, countryCode } = req.body;
  const userId = req.user.id;

  try {
    const pool = getPool();
    
    await pool.execute(
      'INSERT IGNORE INTO user_favorites (user_id, service_code, country_code) VALUES (?, ?, ?)',
      [userId, serviceCode, countryCode]
    );

    res.json({ success: true, message: 'Favorite added' });
  } catch (error) {
    logger.error('Add favorite error:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/favorites', authenticateToken, async (req, res) => {
  const { serviceCode, countryCode } = req.query;
  const userId = req.user.id;

  try {
    const pool = getPool();
    
    await pool.execute(
      'DELETE FROM user_favorites WHERE user_id = ? AND service_code = ? AND country_code = ?',
      [userId, serviceCode, countryCode]
    );

    res.json({ success: true, message: 'Favorite removed' });
  } catch (error) {
    logger.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// Get user favorites
router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    const [favorites] = await pool.execute(
      'SELECT service_code, country_code, created_at FROM user_favorites WHERE user_id = ?',
      [userId]
    );

    res.json(favorites);
  } catch (error) {
    logger.error('Get favorites error:', error);
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

module.exports = router;
