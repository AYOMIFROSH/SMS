// middleware/auth.js - FIXED for cross-origin cookie handling
const jwt = require('jsonwebtoken');
const { getExistingDbPool, getPool } = require('../Config/database');
const sessionService = require('../services/sessionService');
const logger = require('../utils/logger');

// ✅ FIXED: Enhanced token extraction with multiple fallbacks
const authenticateToken = async (req, res, next) => {
  try {
    let token = null;

    // 1) Try Authorization header first (Bearer token)
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    // 2) Try cookies - multiple cookie names for flexibility
    if (!token && req.cookies) {
      token = req.cookies.accessToken || req.cookies.sessionToken || null;
    }

    // 3) Development/testing fallback: query parameter
    if (!token && process.env.NODE_ENV !== 'production' && req.query?.token) {
      token = req.query.token;
    }

    // 4) Log token source for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Token extraction:', {
        hasAuthHeader: !!authHeader,
        hasCookies: !!req.cookies,
        cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
        tokenFound: !!token,
        tokenSource: token ? (authHeader.startsWith('Bearer ') ? 'header' : 'cookie') : 'none'
      });
    }

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
        tokenType: jwtError.name
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

    // Extract user ID and session token from JWT payload
    const userId = decoded.userId ?? decoded.user_id ?? decoded.sub;
    const sessionToken = decoded.sessionToken ?? decoded.session_token ?? null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload',
        code: 'TOKEN_INVALID_PAYLOAD'
      });
    }

    // Fetch user from existing database
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

    // Session validation if sessionToken is present
    if (sessionToken) {
      const pool = getPool();
      const [sessions] = await pool.execute(
        `SELECT id, expires_at, is_active 
         FROM user_sessions 
         WHERE session_token = ? AND user_id = ?`,
        [sessionToken, userId]
      );

      if (sessions.length === 0) {
        logger.warn('Session not found:', { userId, sessionToken });
        return res.status(401).json({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND'
        });
      }

      const session = sessions[0];

      if (!session.is_active) {
        logger.warn('Session is inactive:', { userId, sessionToken });
        return res.status(401).json({
          success: false,
          error: 'Session is inactive',
          code: 'SESSION_INACTIVE'
        });
      }

      if (new Date() > new Date(session.expires_at)) {
        logger.warn('Session expired:', { 
          userId, 
          sessionToken, 
          expiresAt: session.expires_at 
        });
        return res.status(401).json({
          success: false,
          error: 'Session expired',
          code: 'SESSION_EXPIRED'
        });
      }

      // Update session activity
      try {
        await pool.execute(
          'UPDATE user_sessions SET updated_at = NOW() WHERE id = ?', 
          [session.id]
        );
      } catch (updateError) {
        logger.warn('Failed to update session activity:', updateError.message);
      }

      req.user.sessionId = session.id;
      req.user.sessionToken = sessionToken;
    }

    // Debug logging for development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('✅ User authenticated:', {
        userId: user.id,
        username: user.username,
        endpoint: req.path,
        method: req.method,
        hasSession: !!sessionToken
      });
    }

    return next();

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
async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const hasAnyToken = Boolean(
    authHeader || 
    req.cookies?.accessToken || 
    req.cookies?.sessionToken || 
    req.query?.token
  );

  if (!hasAnyToken) return next();

  try {
    await authenticateToken(req, res, next);
  } catch (err) {
    logger.warn('Optional auth failed:', err?.message || err);
    return next(); // continue without user
  }
}

// Require active session
async function requireActiveSession(req, res, next) {
  try {
    await authenticateToken(req, res, next);

    if (!req.user || !req.user.sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Active session required',
        code: 'SESSION_REQUIRED'
      });
    }

    next();
  } catch (error) {
    logger.error('Session validation error:', error);
    return res.status(401).json({
      success: false,
      error: 'Session validation failed',
      code: 'SESSION_VALIDATION_ERROR'
    });
  }
}

// Admin role check
async function requireAdmin(req, res, next) {
  await new Promise((resolve, reject) => {
    authenticateToken(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Check if user is admin (implement your admin logic here)
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
}

// Rate limiting by user ID (more accurate than IP)
function createUserRateLimit(windowMs = 60000, maxRequests = 60) {
  const userRequests = new Map();

  return async (req, res, next) => {
    // First authenticate to get user ID
    try {
      await new Promise((resolve, reject) => {
        authenticateToken(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      return; // Auth middleware will handle the error
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean old requests
    if (userRequests.has(userId)) {
      const requests = userRequests.get(userId);
      const validRequests = requests.filter(time => time > windowStart);
      userRequests.set(userId, validRequests);
    }

    // Get current requests
    const currentRequests = userRequests.get(userId) || [];

    if (currentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        resetTime: new Date(currentRequests[0] + windowMs).toISOString()
      });
    }

    // Add current request
    currentRequests.push(now);
    userRequests.set(userId, currentRequests);

    next();
  };
}

// ✅ FIXED: Validate session token from cookies (alternative method)
async function validateSessionCookie(req, res, next) {
  try {
    const sessionToken = req.cookies?.sessionToken;
    
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        error: 'Session cookie required',
        code: 'SESSION_COOKIE_MISSING'
      });
    }

    const session = await sessionService.validateSession(sessionToken);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session',
        code: 'INVALID_SESSION'
      });
    }

    // Get user info
    const existingPool = getExistingDbPool();
    const [rows] = await existingPool.execute(
      'SELECT id, username, email, firstname, lastname, balance, status FROM users WHERE id = ?',
      [session.user_id]
    );

    if (!rows || rows.length === 0 || rows[0].status !== 1) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = rows[0];

    // ✅ FIXED: Initialize req.user properly
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      balance: parseFloat(user.balance || 0),
      sessionToken,
      sessionId: session.id
    };
    req.userId = user.id;

    await sessionService.updateSessionActivity(sessionToken);
    next();
  } catch (error) {
    logger.error('Session cookie validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Session validation failed',
      code: 'SESSION_ERROR'
    });
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireActiveSession,
  requireAdmin,
  createUserRateLimit,
  validateSessionCookie
};