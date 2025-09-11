// routes/auth.js - Enhanced with all security fixes
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getExistingDbPool, getPool } = require('../Config/database');
const { authenticateToken } = require('../middleware/auth');
const sessionService = require('../services/sessionService');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Enhanced rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use combination of IP and username for more accurate limiting
    const username = req.body?.username || 'unknown';
    return `${req.ip}:${username}`;
  },
  skipSuccessfulRequests: true
});

// Refresh rate limiter (more lenient)
const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 attempts
  skipSuccessfulRequests: true
});

// Input validation middleware
const loginValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9._@-]+$/)
    .withMessage('Invalid username format'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Invalid password format')
];

// Helper function to get cookie options based on environment
// Helper function to get cookie options based on environment
const getCookieOptions = (req) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Safe user-agent extraction
  const userAgent = req?.headers?.['user-agent'] || '';
  const isIOS = /iPad|iPhone|iPod|CriOS|FxiOS/.test(userAgent);
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);

  const baseOptions = {
    httpOnly: true,
    secure: isProduction,
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? ".fizzbuzzup.com" : undefined
  };

  // Production cross-origin setup
  if (isProduction) {
    return {
      ...baseOptions,
      sameSite: 'none',
      secure: true, // Required for sameSite: 'none'
      // iOS-specific enhancements
      ...(isIOS && {
        partitioned: true,
        priority: 'high'
      }),

      ...(isMobile && {
        partitioned: true, 
        priority: 'high'
      })
    };
  }

  // Development setup
  return {
    ...baseOptions,
    sameSite: 'lax',
    secure: false
  };
};

// Updated setAuthCookies function (req optional, default to {})
const setAuthCookies = (res, tokens, req) => {
  const cookieOptions = getCookieOptions(req);
  const userAgent = req?.headers?.['user-agent'] || '';
  const isIOS = /iPad|iPhone|iPod|CriOS|FxiOS/.test(userAgent);

  // Set cookies with appropriate expiry
  res.cookie('sessionToken', tokens.sessionToken, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  res.cookie('refreshToken', tokens.refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh' // Restrict path
  });

  res.cookie('accessToken', tokens.accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  // iOS fallback - send tokens in headers
  if (isIOS) {
    res.set({
      'X-Access-Token': tokens.accessToken,
      'X-Session-Token': tokens.sessionToken,
      'X-Refresh-Token': tokens.refreshToken
    });
  }
};

// Clear all auth cookies (req optional)
const clearAuthCookies = (res, req) => {
  const cookieOptions = getCookieOptions(req);

  // Clear all auth cookies
  res.clearCookie('sessionToken', cookieOptions);
  res.clearCookie('refreshToken', { 
    ...cookieOptions, 
    path: '/api/auth/refresh' 
  });
  res.clearCookie('accessToken', cookieOptions);

  // Also clear common variations
  res.clearCookie('accessToken', { ...cookieOptions, path: '/' });
  res.clearCookie('refreshToken', { ...cookieOptions, path: '/' });
};


// POST /api/auth/login
router.post('/login', authLimiter, loginValidation, async (req, res) => {
        console.log("DEBUG login body:", req.body);
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    logger.info('Login attempt:', { username, ip: clientIP });

    // Check for account lockout (implement Redis-based lockout tracking)
    const { getRedisClient } = require('../Config/redis');
    const redis = getRedisClient();
    
    if (redis && redis.isOpen) {
      const lockoutKey = `lockout:${username}`;
      const lockoutData = await redis.get(lockoutKey);
      
      if (lockoutData) {
        const lockout = JSON.parse(lockoutData);
        if (lockout.lockedUntil > Date.now()) {
          const remainingTime = Math.ceil((lockout.lockedUntil - Date.now()) / 1000 / 60);
          return res.status(423).json({
            success: false,
            error: `Account temporarily locked. Try again in ${remainingTime} minutes`,
            code: 'ACCOUNT_LOCKED'
          });
        }
      }
    }

    // Find user in database
    const existingPool = getExistingDbPool();
    const [users] = await existingPool.execute(
      `SELECT id, firstname, lastname, username, email, password, balance, status, last_login
       FROM users 
       WHERE (username = ? OR email = ?) AND status = 1 
       LIMIT 1`,
      [username, username]
    );

    if (users.length === 0) {
      // Track failed attempt
      if (redis && redis.isOpen) {
        const attemptKey = `attempts:${username}`;
        const attempts = await redis.incr(attemptKey);
        await redis.expire(attemptKey, 900); // 15 minutes
        
        if (attempts >= 5) {
          // Lock account for 30 minutes after 5 failed attempts
          const lockoutKey = `lockout:${username}`;
          await redis.setEx(lockoutKey, 1800, JSON.stringify({
            lockedUntil: Date.now() + (30 * 60 * 1000),
            attempts: attempts
          }));
        }
      }
      
      logger.warn('Login failed - User not found:', { username, ip: clientIP });
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // Track failed attempt (same as above)
      if (redis && redis.isOpen) {
        const attemptKey = `attempts:${username}`;
        const attempts = await redis.incr(attemptKey);
        await redis.expire(attemptKey, 900);
        
        if (attempts >= 5) {
          const lockoutKey = `lockout:${username}`;
          await redis.setEx(lockoutKey, 1800, JSON.stringify({
            lockedUntil: Date.now() + (30 * 60 * 1000),
            attempts: attempts
          }));
        }
      }
      
      logger.warn('Login failed - Invalid password:', { userId: user.id, ip: clientIP });
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_PASSWORD'
      });
    }

    // Clear failed attempts on successful login
    if (redis && redis.isOpen) {
      await redis.del(`attempts:${username}`);
      await redis.del(`lockout:${username}`);
    }

    // Update last login
    await existingPool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Ensure SMS account exists
    const pool = getPool();
    const [smsAccounts] = await pool.execute(
      'SELECT id, api_key FROM sms_user_accounts WHERE user_id = ?',
      [user.id]
    );

    if (smsAccounts.length === 0) {
      await pool.execute(
        'INSERT INTO sms_user_accounts (user_id, balance) VALUES (?, ?)',
        [user.id, user.balance || 0.00]
      );
      logger.info('Created SMS account for user:', { userId: user.id });
    }

    // Create session
    const session = await sessionService.createSession(user.id, clientIP, userAgent);

    // Store refresh token in Redis for validation
    if (redis && redis.isOpen) {
      await redis.setEx(
        `refresh_token:${user.id}`,
        604800, // 7 days
        session.refreshToken
      );
    }

    // Set authentication cookies
    setAuthCookies(res, session);

    // Log successful login
    await pool.execute(
      `INSERT INTO api_logs (user_id, endpoint, method, status_code, ip_address, user_agent)
       VALUES (?, '/api/auth/login', 'POST', 200, ?, ?)`,
      [user.id, clientIP, userAgent]
    );

    logger.info('Login successful:', { 
      userId: user.id, 
      username, 
      sessionId: session.sessionId 
    });

    // Send response
    res.json({
      success: true,
      message: 'Login successful',
      accessToken: session.accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        balance: parseFloat(user.balance || 0),
        lastLogin: user.last_login
      },
      session: {
        id: session.sessionId,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed due to server error',
      code: 'SERVER_ERROR'
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_MISSING'
      });
    }

    // Verify refresh token in Redis
    const { getRedisClient } = require('../Config/redis');
    const redis = getRedisClient();
    
    if (redis && redis.isOpen) {
      // Find user ID associated with this refresh token
      const keys = await redis.keys('refresh_token:*');
      let userId = null;
      
      for (const key of keys) {
        const storedToken = await redis.get(key);
        if (storedToken === refreshToken) {
          userId = key.split(':')[1];
          break;
        }
      }
      
      if (!userId) {
        clearAuthCookies(res);
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
    }

    // Refresh the access token
    const result = await sessionService.refreshAccessToken(refreshToken, clientIP, userAgent);

    if (!result || !result.success) {
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        error: result?.message || 'Token refresh failed',
        code: 'REFRESH_FAILED'
      });
    }

    // Get user data
    const existingPool = getExistingDbPool();
    const [users] = await existingPool.execute(
      `SELECT id, username, email, firstname, lastname, balance, last_login
       FROM users WHERE id = ? AND status = 1`,
      [result.userId]
    );

    if (users.length === 0) {
      clearAuthCookies(res);
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = users[0];

    // Update access token cookie
    const cookieOptions = getCookieOptions();
    res.cookie('accessToken', result.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    logger.info('Token refreshed successfully:', { 
      userId: result.userId, 
      sessionId: result.sessionId 
    });

    res.json({
      success: true,
      accessToken: result.accessToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        balance: parseFloat(user.balance || 0),
        lastLogin: user.last_login
      },
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    logger.error('Refresh token error:', error);
    clearAuthCookies(res);
    res.status(401).json({
      success: false,
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();

    // Get SMS account info
    const [smsAccount] = await pool.execute(
      `SELECT balance, total_spent, total_numbers_purchased, account_status, 
              api_key IS NOT NULL as has_api_key, created_at as sms_account_created
       FROM sms_user_accounts WHERE user_id = ?`,
      [req.user.id]
    );

    // Get recent activity
    const [recentActivity] = await pool.execute(
      `SELECT 
         COUNT(*) as recent_purchases,
         COUNT(CASE WHEN status = 'used' THEN 1 END) as successful_purchases,
         SUM(CASE WHEN purchase_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN price ELSE 0 END) as week_spent
       FROM number_purchases 
       WHERE user_id = ? AND purchase_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [req.user.id]
    );

    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        firstname: req.user.firstname,
        lastname: req.user.lastname,
        balance: req.user.balance
      },
      smsAccount: smsAccount[0] ? {
        balance: parseFloat(smsAccount[0].balance || 0),
        totalSpent: parseFloat(smsAccount[0].total_spent || 0),
        totalNumbersPurchased: smsAccount[0].total_numbers_purchased || 0,
        accountStatus: smsAccount[0].account_status,
        hasApiKey: !!smsAccount[0].has_api_key,
        createdAt: smsAccount[0].sms_account_created
      } : null,
      recentActivity: recentActivity[0] || {
        recentPurchases: 0,
        successfulPurchases: 0,
        weekSpent: 0
      }
    });

  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information',
      code: 'SERVER_ERROR'
    });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const sessionToken = req.user.sessionToken;
    const userId = req.user.id;

    // Revoke session
    if (sessionToken) {
      await sessionService.revokeSession(sessionToken);
    }

    // Clear refresh token from Redis
    const { getRedisClient } = require('../Config/redis');
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.del(`refresh_token:${userId}`);
    }

    // Log logout
    const pool = getPool();
    await pool.execute(
      `INSERT INTO api_logs (user_id, endpoint, method, status_code, ip_address, user_agent)
       VALUES (?, '/api/auth/logout', 'POST', 200, ?, ?)`,
      [userId, req.ip, req.headers['user-agent']]
    );

    // Clear cookies
    clearAuthCookies(res);

    logger.info('User logged out:', { userId });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
});

// POST /api/auth/logout-all
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Revoke all sessions
    await sessionService.revokeAllUserSessions(userId);

    // Clear all refresh tokens from Redis
    const { getRedisClient } = require('../Config/redis');
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      await redis.del(`refresh_token:${userId}`);
      // Clear any other user-specific keys
      const keys = await redis.keys(`user:${userId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }

    // Clear cookies
    clearAuthCookies(res);

    logger.info('All sessions revoked:', { userId });

    res.json({
      success: true,
      message: 'Logged out from all devices successfully'
    });

  } catch (error) {
    logger.error('Logout all error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout from all devices',
      code: 'LOGOUT_ALL_FAILED'
    });
  }
});

// GET /api/auth/sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await sessionService.getUserSessions(req.user.id);

    res.json({
      success: true,
      sessions: sessions.map(session => ({
        id: session.id,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        expiresAt: session.expires_at,
        isCurrent: session.id === req.user.sessionId
      }))
    });

  } catch (error) {
    logger.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sessions',
      code: 'GET_SESSIONS_FAILED'
    });
  }
});

// DELETE /api/auth/sessions/:id
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verify session ownership
    const pool = getPool();
    const [sessions] = await pool.execute(
      'SELECT session_token FROM user_sessions WHERE id = ? AND user_id = ?',
      [sessionId, userId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Revoke session
    await sessionService.revokeSession(sessions[0].session_token);

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });

  } catch (error) {
    logger.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke session',
      code: 'REVOKE_SESSION_FAILED'
    });
  }
});

// GET /api/auth/check
router.get('/check', authenticateToken, (req, res) => {
  res.json({
    success: true,
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      firstname: req.user.firstname,
      lastname: req.user.lastname
    },
    session: {
      id: req.user.sessionId,
      token: req.user.sessionToken
    }
  });
});

// POST /api/auth/verify-2fa (if implementing 2FA)
router.post('/verify-2fa', authLimiter, authenticateToken, async (req, res) => {
  // Implement 2FA verification logic here
  res.status(501).json({
    success: false,
    error: '2FA not yet implemented',
    code: 'NOT_IMPLEMENTED'
  });
});

module.exports = router;