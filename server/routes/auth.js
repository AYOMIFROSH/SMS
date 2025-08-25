// routes/auth.js - FIXED: Cross-origin cookie handling for development
const express = require('express');
const bcrypt = require('bcryptjs');
const { getExistingDbPool, getPool } = require('../Config/database');
const { authenticateToken } = require('../middleware/auth');
const sessionService = require('../services/sessionService');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded:', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// Input validation middleware
const validateLogin = (req, res, next) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid credential format',
      code: 'INVALID_FORMAT'
    });
  }

  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'Username must be between 3-50 characters',
      code: 'INVALID_USERNAME_LENGTH'
    });
  }

  if (password.length < 6 || password.length > 128) {
    return res.status(400).json({
      success: false,
      error: 'Password must be between 6-128 characters',
      code: 'INVALID_PASSWORD_LENGTH'
    });
  }

  next();
};

// ✅ FIXED: Environment-aware cookie configuration
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // Production: Strict settings for HTTPS
    return {
      httpOnly: true,
      secure: true, // Require HTTPS
      sameSite: 'lax', // Allow cross-origin
      path: '/',
      // domain: process.env.COOKIE_DOMAIN
    };
  } else {
    // Development: Relaxed settings for HTTP localhost
    return {
      httpOnly: true,
      secure: false, // Allow HTTP
      sameSite: 'lax', // More permissive for same-site
      path: '/'
      // No domain for localhost
    };
  }
};

// POST /api/auth/login - FIXED for cross-origin development
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  const { username, password } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  try {
    logger.info('Login attempt:', { username, ip: clientIP });

    // Find user in existing database
    const existingPool = getExistingDbPool();
    const [users] = await existingPool.execute(
      `SELECT id, firstname, lastname, username, email, password, balance, status, last_login
       FROM users 
       WHERE (username = ? OR email = ?) AND status = 1 
       LIMIT 1`,
      [username, username]
    );

    if (users.length === 0) {
      logger.warn('Login failed - User not found:', { username, ip: clientIP });
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      logger.warn('Login failed - Invalid password:', { userId: user.id, username, ip: clientIP });
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    await existingPool.execute(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Ensure SMS account exists
    const pool = getPool();
    const [smsAccounts] = await pool.execute(
      'SELECT id FROM sms_user_accounts WHERE user_id = ?',
      [user.id]
    );

    if (smsAccounts.length === 0) {
      await pool.execute(
        'INSERT INTO sms_user_accounts (user_id, balance) VALUES (?, ?)',
        [user.id, user.balance || 0.00]
      );
      logger.info('Created SMS account:', { userId: user.id });
    }

    // Create session
    const session = await sessionService.createSession(user.id, clientIP, userAgent);

    // Log successful login
    await pool.execute(
      `INSERT INTO api_logs (user_id, endpoint, method, status_code, ip_address, user_agent, request_data)
       VALUES (?, '/api/auth/login', 'POST', 200, ?, ?, ?)`,
      [
        user.id,
        clientIP,
        userAgent,
        JSON.stringify({ username, loginTime: new Date().toISOString() })
      ]
    );

    // ✅ FIXED: Use environment-aware cookie configuration
    const cookieOptions = getCookieOptions();

    // Session cookie (long-lived)
    res.cookie('sessionToken', session.sessionToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Refresh token cookie
    res.cookie('refreshToken', session.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // ✅ Also set access token as cookie for easier frontend handling
    res.cookie('accessToken', session.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes (same as JWT expiry)
    });

    // ✅ Debug logging
    logger.info('🍪 Cookies set:', {
      environment: process.env.NODE_ENV,
      cookieOptions,
      tokensSet: {
        sessionToken: !!session.sessionToken,
        refreshToken: !!session.refreshToken,
        accessToken: !!session.accessToken
      }
    });

    logger.info('Login successful:', { userId: user.id, username, sessionId: session.sessionId });

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
    logger.error('Login error:', { error: error.message, username, ip: clientIP });
    res.status(500).json({
      success: false,
      error: 'Login failed due to server error',
      code: 'SERVER_ERROR'
    });
  }
});

// ✅ FIXED: Refresh endpoint with proper cookie handling
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    console.log("🔍 Refresh request:", { 
      hasRefreshToken: !!refreshToken,
      cookiesReceived: Object.keys(req.cookies || {}),
      userAgent: userAgent.substring(0, 50) + '...'
    });

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_MISSING'
      });
    }

    // Call the service to handle refresh
    const result = await sessionService.refreshAccessToken(refreshToken, clientIP, userAgent);

    if (!result || !result.success) {
      logger.warn('❌ Token refresh failed:', result?.message || 'Unknown error');
      
      // Clear cookies on failure
      const cookieOptions = getCookieOptions();
      res.clearCookie('sessionToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
      res.clearCookie('accessToken', cookieOptions);
      
      return res.status(401).json({
        success: false,
        error: result?.message || 'Refresh failed',
        code: 'REFRESH_FAILED'
      });
    }

    // Fetch user from DB
    const pool = getExistingDbPool();
    const [users] = await pool.execute(
      `SELECT id, username, email, firstname, lastname, balance, last_login as lastLogin
       FROM users WHERE id = ? LIMIT 1`,
      [result.userId]
    );

    if (!users.length) {
      logger.warn(`⚠️ User not found for ID: ${result.userId}`);
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = users[0];

    // ✅ Update access token cookie with new token
    const cookieOptions = getCookieOptions();
    res.cookie('accessToken', result.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000 // 15 minutes
    });

    logger.info('✅ Token refreshed successfully:', { 
      userId: result.userId, 
      sessionId: result.sessionId 
    });

    res.json({
      success: true,
      accessToken: result.accessToken,
      user,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    logger.error('❌ Refresh token error:', error);

    // Clear all cookies on error
    const cookieOptions = getCookieOptions();
    res.clearCookie('sessionToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);

    res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token',
      code: 'REFRESH_ERROR'
    });
  }
});

// Debug endpoint - Keep this temporarily
router.get('/debug/cookies', (req, res) => {
  const cookies = req.cookies;
  const headers = req.headers;

  console.log('🔍 Debug - Request cookies:', cookies);
  console.log('🔍 Debug - Request headers:', {
    authorization: headers.authorization,
    cookie: headers.cookie,
    'user-agent': headers['user-agent'],
    origin: headers.origin,
    host: headers.host
  });

  res.json({
    success: true,
    debug: {
      environment: process.env.NODE_ENV,
      cookieOptions: getCookieOptions(),
      cookies: {
        sessionToken: cookies?.sessionToken ? 'PRESENT' : 'MISSING',
        refreshToken: cookies?.refreshToken ? 'PRESENT' : 'MISSING',
        accessToken: cookies?.accessToken ? 'PRESENT' : 'MISSING',
        all: cookies
      },
      headers: {
        authorization: headers.authorization ? 'PRESENT' : 'MISSING',
        cookie: headers.cookie ? 'PRESENT' : 'MISSING',
        userAgent: headers['user-agent'],
        origin: headers.origin,
        host: headers.host
      },
      timestamp: new Date().toISOString(),
      ip: req.ip
    }
  });
});

// GET /api/auth/me - Get current user info
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
        total_spent: parseFloat(smsAccount[0].total_spent || 0),
        total_numbers_purchased: smsAccount[0].total_numbers_purchased || 0,
        account_status: smsAccount[0].account_status,
        has_api_key: !!smsAccount[0].has_api_key,
        created_at: smsAccount[0].sms_account_created
      } : null,
      recentActivity: recentActivity[0] || {
        recent_purchases: 0,
        successful_purchases: 0,
        week_spent: 0
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

// POST /api/auth/logout - User logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const sessionToken = req.user.sessionToken;
    const userId = req.user.id;

    // Revoke session
    if (sessionToken) {
      await sessionService.revokeSession(sessionToken);
    }

    // Log logout
    const pool = getPool();
    await pool.execute(
      `INSERT INTO api_logs (user_id, endpoint, method, status_code, ip_address, user_agent)
       VALUES (?, '/api/auth/logout', 'POST', 200, ?, ?)`,
      [
        userId,
        req.ip || req.connection.remoteAddress,
        req.headers['user-agent'] || 'Unknown'
      ]
    );

    // ✅ Clear cookies with proper options
    const cookieOptions = getCookieOptions();
    res.clearCookie('sessionToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);

    logger.info('User logged out:', { userId, sessionToken });

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);

    // Still clear cookies and return success
    const cookieOptions = getCookieOptions();
    res.clearCookie('sessionToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
});

// POST /api/auth/logout-all - Logout from all devices
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Revoke all user sessions
    await sessionService.revokeAllUserSessions(userId);

    // Clear current cookies
    const cookieOptions = getCookieOptions();
    res.clearCookie('sessionToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);

    logger.info('All user sessions revoked:', { userId });

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

// GET /api/auth/sessions - Get user's active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await sessionService.getUserSessions(req.user.id);

    res.json({
      success: true,
      sessions: sessions.map(session => ({
        id: session.id,
        ip_address: session.ip_address,
        user_agent: session.user_agent,
        created_at: session.created_at,
        updated_at: session.updated_at,
        expires_at: session.expires_at,
        is_current: session.id === req.user.sessionId
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

// DELETE /api/auth/sessions/:id - Revoke specific session
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.user.id;

    // Get session to verify ownership
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

// GET /api/auth/check - Check authentication status
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

// POST /api/auth/clear-cookies - Force clear all cookies (Keep for debugging)
router.post('/clear-cookies', (req, res) => {
  const cookieOptions = getCookieOptions();
  
  // Clear with current environment options
  res.clearCookie('sessionToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  res.clearCookie('accessToken', cookieOptions);

  // Also try clearing with different options as fallback
  const fallbackOptions = [
    { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
    { httpOnly: true, secure: false, sameSite: 'strict', path: '/' },
    { httpOnly: true, secure: true, sameSite: 'none', path: '/' },
    { path: '/' }
  ];

  fallbackOptions.forEach(options => {
    res.clearCookie('sessionToken', options);
    res.clearCookie('refreshToken', options);
    res.clearCookie('accessToken', options);
  });

  logger.info('🧹 All cookies cleared forcefully');

  res.json({
    success: true,
    message: 'All cookies cleared successfully',
    instruction: 'Please refresh the page and login again'
  });
});

module.exports = router;