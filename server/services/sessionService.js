// services/sessionService.js - HOTFIX for expiry calculation
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getPool } = require('../Config/database');
const logger = require('../utils/logger');

class SessionService {
  constructor() {
    this.accessTokenExpiry = process.env.JWT_EXPIRE || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRE || '7d';
    this.sessionTokenExpiry = process.env.SESSION_EXPIRE || '30d';
  }

  // Generate secure random token
  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // 🚨 FIXED: Calculate expiry timestamp properly with explicit parsing
  calculateExpiry(duration) {
    const now = new Date();
    let millisToAdd = 0;
    
    // Parse duration string more carefully
    const durationStr = String(duration).trim();
    const match = durationStr.match(/^(\d+)([mhd])$/);
    
    if (!match) {
      logger.warn(`Invalid duration format: ${duration}, defaulting to 15 minutes`);
      return new Date(now.getTime() + (15 * 60 * 1000)); // 15 minutes default
    }
    
    const [, amount, unit] = match;
    const num = parseInt(amount, 10);
    
    switch (unit) {
      case 'm': // minutes
        millisToAdd = num * 60 * 1000;
        break;
      case 'h': // hours
        millisToAdd = num * 60 * 60 * 1000;
        break;
      case 'd': // days
        millisToAdd = num * 24 * 60 * 60 * 1000;
        break;
      default:
        logger.warn(`Unknown duration unit: ${unit}, defaulting to 15 minutes`);
        millisToAdd = 15 * 60 * 1000;
    }
    
    const result = new Date(now.getTime() + millisToAdd);
    
    // 🔍 Debug logging
    logger.info(`Duration calculation: ${duration} -> ${num}${unit} -> +${millisToAdd}ms -> ${result.toISOString()}`);
    
    return result;
  }

  // 🚨 HOTFIX: Create session with explicit expiry handling
  async createSession(userId, ipAddress, userAgent) {
    try {
      const pool = getPool();

      // 1. Clean up any existing expired sessions for this user FIRST
      await pool.execute(
        'DELETE FROM user_sessions WHERE user_id = ? AND (expires_at < NOW() OR refresh_expires_at < NOW())',
        [userId]
      );

      // 2. Generate secure tokens
      const sessionToken = this.generateSecureToken();
      const refreshToken = this.generateSecureToken();

      const accessToken = jwt.sign(
        {
          userId,
          sessionToken,
          type: 'access',
          iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_SECRET,
        { expiresIn: this.accessTokenExpiry }
      );

      // 3. Calculate expiries with explicit validation
      const sessionExpiry = this.calculateExpiry(this.sessionTokenExpiry); // 30 days
      const refreshExpiry = this.calculateExpiry(this.refreshTokenExpiry); // 7 days

      // 4. Validate expiry dates before insertion
      const now = new Date();
      if (sessionExpiry <= now) {
        throw new Error(`Invalid session expiry calculated: ${sessionExpiry.toISOString()}`);
      }
      if (refreshExpiry <= now) {
        throw new Error(`Invalid refresh expiry calculated: ${refreshExpiry.toISOString()}`);
      }

      // 5. Format dates for MySQL (explicit formatting)
      const sessionExpiryStr = sessionExpiry.toISOString().slice(0, 19).replace('T', ' ');
      const refreshExpiryStr = refreshExpiry.toISOString().slice(0, 19).replace('T', ' ');

      logger.info('🕐 Session expiry calculation:', {
        sessionTokenExpiry: this.sessionTokenExpiry,
        refreshTokenExpiry: this.refreshTokenExpiry,
        calculatedSessionExpiry: sessionExpiryStr,
        calculatedRefreshExpiry: refreshExpiryStr,
        currentTime: now.toISOString()
      });

      // 6. Insert session with explicit date formatting
      const [result] = await pool.execute(`
        INSERT INTO user_sessions (
          user_id, session_token, refresh_token, access_token, 
          expires_at, refresh_expires_at, ip_address, user_agent, is_active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        userId, sessionToken, refreshToken, accessToken,
        sessionExpiryStr, refreshExpiryStr, ipAddress, userAgent
      ]);

      const sessionId = result.insertId;

      // 7. Verify insertion by reading back the data
      const [verification] = await pool.execute(
        'SELECT expires_at, refresh_expires_at FROM user_sessions WHERE id = ?',
        [sessionId]
      );

      if (verification.length === 0) {
        throw new Error('Session was not created successfully');
      }

      const inserted = verification[0];
      logger.info('✅ Session created and verified:', { 
        userId, 
        sessionId,
        insertedSessionExpiry: inserted.expires_at,
        insertedRefreshExpiry: inserted.refresh_expires_at
      });

      return {
        sessionId,
        userId,
        sessionToken,
        accessToken,
        refreshToken,
        expiresAt: sessionExpiry,
        refreshExpiresAt: refreshExpiry
      };
    } catch (error) {
      logger.error('❌ Session creation error:', error);
      throw error;
    }
  }

  // 🚨 FIXED: Refresh with better session lookup
  async refreshAccessToken(refreshToken, ipAddress, userAgent) {
    try {
      const pool = getPool();
      
      if (!refreshToken) {
        return { success: false, message: 'No refresh token provided' };
      }

      logger.info("🔍 Refresh token request:", { refreshToken });

      // Find valid session with more detailed logging
      const [rows] = await pool.execute(
        `SELECT 
           id, user_id, expires_at, refresh_expires_at, is_active,
           expires_at > NOW() as session_valid,
           refresh_expires_at > NOW() as refresh_valid
         FROM user_sessions 
         WHERE refresh_token = ?
         LIMIT 1`,
        [refreshToken]
      );

      if (rows.length === 0) {
        logger.warn("❌ No session found for refresh token");
        return { success: false, message: 'Invalid refresh token' };
      }

      const session = rows[0];
      
      logger.info("🔍 Found session:", {
        sessionId: session.id,
        userId: session.user_id,
        isActive: !!session.is_active,
        sessionValid: !!session.session_valid,
        refreshValid: !!session.refresh_valid,
        expiresAt: session.expires_at,
        refreshExpiresAt: session.refresh_expires_at
      });

      // Check session validity
      if (!session.is_active) {
        logger.warn("❌ Session is inactive");
        return { success: false, message: 'Session is inactive' };
      }

      if (!session.refresh_valid) {
        logger.warn("❌ Refresh token expired");
        return { success: false, message: 'Refresh token expired' };
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          userId: session.user_id,
          sessionToken: session.session_token,
          type: 'access',
          iat: Math.floor(Date.now() / 1000)
        },
        process.env.JWT_SECRET,
        { expiresIn: this.accessTokenExpiry }
      );

      // Extend session expiry
      const newSessionExpiry = this.calculateExpiry(this.sessionTokenExpiry);
      const newSessionExpiryStr = newSessionExpiry.toISOString().slice(0, 19).replace('T', ' ');

      await pool.execute(
        `UPDATE user_sessions 
         SET access_token = ?, expires_at = ?, user_agent = ?, ip_address = ?, updated_at = NOW()
         WHERE id = ?`,
        [newAccessToken, newSessionExpiryStr, userAgent, ipAddress, session.id]
      );

      logger.info('✅ Token refresh successful');

      return {
        success: true,
        accessToken: newAccessToken,
        userId: session.user_id,
        sessionId: session.id,
        message: 'Token refreshed successfully'
      };

    } catch (error) {
      logger.error('❌ Refresh access token error:', error);
      return {
        success: false,
        message: 'Token refresh failed',
        error: error.message
      };
    }
  }

  // Rest of your existing methods remain the same...
  async validateSession(sessionToken) {
    try {
      const pool = getPool();
      
      const [sessions] = await pool.execute(`
        SELECT id, user_id, expires_at 
        FROM user_sessions 
        WHERE session_token = ? AND is_active = TRUE AND expires_at > NOW()
      `, [sessionToken]);

      return sessions.length > 0 ? sessions[0] : null;
    } catch (error) {
      logger.error('Validate session error:', error);
      return null;
    }
  }

  async revokeSession(sessionToken) {
    try {
      const pool = getPool();
      await pool.execute(`
        UPDATE user_sessions 
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
        WHERE session_token = ?
      `, [sessionToken]);
      return true;
    } catch (error) {
      logger.error('Revoke session error:', error);
      return false;
    }
  }

  async revokeAllUserSessions(userId) {
    try {
      const pool = getPool();
      await pool.execute(`
        UPDATE user_sessions 
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `, [userId]);
      return true;
    } catch (error) {
      logger.error('Revoke all sessions error:', error);
      return false;
    }
  }

  async cleanupExpiredSessions(userId = null) {
    try {
      const pool = getPool();
      let query = 'DELETE FROM user_sessions WHERE (expires_at < NOW() OR refresh_expires_at < NOW())';
      let params = [];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      const [result] = await pool.execute(query, params);
      
      if (result.affectedRows > 0) {
        logger.info('Expired sessions cleaned up', { 
          count: result.affectedRows, 
          userId 
        });
      }

      return result.affectedRows;
    } catch (error) {
      logger.error('Cleanup sessions error:', error);
      return 0;
    }
  }

  async getUserSessions(userId) {
    try {
      const pool = getPool();
      const [sessions] = await pool.execute(`
        SELECT id, ip_address, user_agent, created_at, updated_at, expires_at
        FROM user_sessions 
        WHERE user_id = ? AND is_active = TRUE AND expires_at > NOW()
        ORDER BY updated_at DESC
      `, [userId]);
      return sessions;
    } catch (error) {
      logger.error('Get user sessions error:', error);
      return [];
    }
  }

  async updateSessionActivity(sessionToken) {
    try {
      const pool = getPool();
      await pool.execute(`
        UPDATE user_sessions 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE session_token = ? AND is_active = TRUE
      `, [sessionToken]);
      return true;
    } catch (error) {
      logger.error('Update session activity error:', error);
      return false;
    }
  }

  async getSessionStats() {
    try {
      const pool = getPool();
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN is_active = TRUE AND expires_at > NOW() THEN 1 END) as active_sessions,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(CASE WHEN expires_at < NOW() OR refresh_expires_at < NOW() THEN 1 END) as expired_sessions
        FROM user_sessions
      `);

      return stats[0] || {
        total_sessions: 0,
        active_sessions: 0,
        unique_users: 0,
        expired_sessions: 0
      };
    } catch (error) {
      logger.error('Get session stats error:', error);
      return null;
    }
  }
}

module.exports = new SessionService();