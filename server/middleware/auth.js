// middleware/auth.js - Enhanced with security fixes
const jwt = require('jsonwebtoken');
const { getExistingDbPool, getPool } = require('../Config/database');
const sessionService = require('../services/sessionService');
const logger = require('../utils/logger');
const { getRedisClient } = require('../Config/redis');

// Enhanced token extraction with multiple fallbacks
const extractToken = (req) => {
  let token = null;
  const source = { from: null };

  // 1) Authorization header (preferred)
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
    source.from = 'header';
  }

  // 2) Cookies (fallback)
  if (!token && req.cookies) {
    token = req.cookies.accessToken || req.cookies.sessionToken || null;
    if (token) source.from = 'cookie';
  }

  // 3) Query parameter (development only)
  if (!token && process.env.NODE_ENV !== 'production' && req.query?.token) {
    token = req.query.token;
    source.from = 'query';
  }

  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Token extraction:', {
      hasAuthHeader: !!authHeader,
      hasCookies: !!req.cookies,
      cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
      tokenFound: !!token,
      tokenSource: source.from
    });
  }

  return { token, source: source.from };
};

// Main authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const { token, source } = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      logger.warn('JWT verification failed:', {
        error: jwtError.message,
        tokenType: jwtError.name,
        source
      });

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Access token expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid access token',
        code: 'TOKEN_INVALID'
      });
    }

    // Extract user ID and session token
    const userId = decoded.userId ?? decoded.user_id ?? decoded.sub;
    const sessionToken = decoded.sessionToken ?? decoded.session_token ?? null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload',
        code: 'TOKEN_INVALID_PAYLOAD'
      });
    }

    // Check token blacklist (for logout functionality)
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      const blacklisted = await redis.get(`blacklist:token:${token.substring(0, 20)}`);
      if (blacklisted) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked',
          code: 'TOKEN_REVOKED'
        });
      }
    }

    // Fetch user from database
    const existingPool = getExistingDbPool();
    const [users] = await existingPool.execute(
      'SELECT id, username, email, firstname, lastname, balance, status FROM users WHERE id = ? AND status = 1',
      [userId]
    );

    if (users.length === 0) {
      logger.warn('User not found or inactive:', { userId });
      return res.status(401).json({
        success: false,
        error: 'User not found or account inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = users[0];

    // Initialize req.user
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      balance: parseFloat(user.balance || 0),
      sessionToken: sessionToken || null,
      sessionId: null
    };

    // Validate session if sessionToken present
    if (sessionToken) {
      const pool = getPool();
      const [sessions] = await pool.execute(
        `SELECT id, expires_at, is_active 
         FROM user_sessions 
         WHERE session_token = ? AND user_id = ? AND is_active = TRUE`,
        [sessionToken, userId]
      );

      if (sessions.length === 0) {
        logger.warn('Session not found:', { userId, sessionToken: sessionToken.substring(0, 10) });
        return res.status(401).json({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      const session = sessions[0];

      if (new Date() > new Date(session.expires_at)) {
        logger.warn('Session expired:', {
          userId,
          sessionId: session.id,
          expiresAt: session.expires_at
        });
        return res.status(401).json({
          success: false,
          error: 'Session expired',
          code: 'SESSION_EXPIRED'
        });
      }

      // Update session activity
      await pool.execute(
        'UPDATE user_sessions SET updated_at = NOW() WHERE id = ?',
        [session.id]
      );

      req.user.sessionId = session.id;
      req.user.sessionToken = sessionToken;
    }

    // Add request metadata
    req.auth = {
      tokenSource: source,
      userId: user.id,
      sessionId: req.user.sessionId
    };

    next();

  } catch (error) {
    logger.error('Authentication middleware error:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    return res.status(500).json({
      success: false,
      error: 'Authentication failed due to server error',
      code: 'AUTH_SERVER_ERROR'
    });
  }
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  const { token } = extractToken(req);
  
  if (!token) {
    req.user = null;
    return next();
  }

  // Create a mock response to capture authentication result
  const mockRes = {
    status: () => mockRes,
    json: () => mockRes
  };

  await authenticateToken(req, mockRes, (err) => {
    if (err) {
      req.user = null;
    }
    next();
  });
};

// Require active session
const requireActiveSession = async (req, res, next) => {
  await authenticateToken(req, res, (err) => {
    if (err) return;

    if (!req.user || !req.user.sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Active session required',
        code: 'SESSION_REQUIRED'
      });
    }

    next();
  });
};

// Admin role check
const requireAdmin = async (req, res, next) => {
  await authenticateToken(req, res, async (err) => {
    if (err) return;

    // Check admin status from database or configuration
    const pool = getExistingDbPool();
    const [admins] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND role = "admin"',
      [req.user.id]
    ).catch(() => [[]]);

    if (admins.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
  });
};

// API key authentication (for external services)
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_KEY_MISSING'
      });
    }

    // Validate API key from database
    const pool = getPool();
    const [accounts] = await pool.execute(
      'SELECT user_id FROM sms_user_accounts WHERE api_key = ? AND account_status = "active"',
      [apiKey]
    );

    if (accounts.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    // Get user details
    const existingPool = getExistingDbPool();
    const [users] = await existingPool.execute(
      'SELECT id, username, email, firstname, lastname, balance FROM users WHERE id = ?',
      [accounts[0].user_id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = users[0];
    req.auth = {
      type: 'api_key',
      userId: users[0].id
    };

    next();

  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Rate limiting by user
const createUserRateLimit = (windowMs = 60000, maxRequests = 60) => {
  const userRequests = new Map();

  return async (req, res, next) => {
    // Skip if no user
    if (!req.user) return next();

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (userRequests.has(userId)) {
      const requests = userRequests.get(userId);
      const validRequests = requests.filter(time => time > windowStart);
      userRequests.set(userId, validRequests);
    }

    // Check rate limit
    const currentRequests = userRequests.get(userId) || [];

    if (currentRequests.length >= maxRequests) {
      const resetTime = new Date(currentRequests[0] + windowMs);
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        resetTime: resetTime.toISOString()
      });
    }

    // Add current request
    currentRequests.push(now);
    userRequests.set(userId, currentRequests);

    next();
  };
};

// Validate specific permissions
const requirePermission = (permission) => {
  return async (req, res, next) => {
    await authenticateToken(req, res, async (err) => {
      if (err) return;

      // Check user permissions from database
      const pool = getPool();
      const [permissions] = await pool.execute(
        `SELECT permission FROM user_permissions 
         WHERE user_id = ? AND permission = ? AND granted = TRUE`,
        [req.user.id, permission]
      ).catch(() => [[]]);

      if (permissions.length === 0) {
        return res.status(403).json({
          success: false,
          error: `Permission required: ${permission}`,
          code: 'PERMISSION_DENIED'
        });
      }

      next();
    });
  };
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireActiveSession,
  requireAdmin,
  authenticateApiKey,
  createUserRateLimit,
  requirePermission,
  extractToken
};