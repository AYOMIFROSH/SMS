// middleware/security.js - Simplified security middleware
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Basic rate limiters
const rateLimiters = {
  // Authentication endpoints - strict limits
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { 
      success: false,
      error: 'Too many authentication attempts, please try again later',
      code: 'AUTH_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
      logger.warn('Auth rate limit exceeded:', { 
        ip: req.ip, 
        path: req.path,
        userAgent: req.headers['user-agent']
      });
      res.status(429).json({
        success: false,
        error: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT'
      });
    }
  }),

  // API endpoints - moderate limits
  api: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: {
      success: false,
      error: 'API rate limit exceeded',
      code: 'API_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/api/health';
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id ? `user:${req.user.id}` : req.ip;
    },
    handler: (req, res) => {
      logger.warn('API rate limit exceeded:', {
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
        method: req.method
      });
      res.status(429).json({
        success: false,
        error: 'API rate limit exceeded',
        code: 'API_RATE_LIMIT'
      });
    }
  }),

  
};

// Input validation rules
const validationRules = {
  login: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9._@-]+$/)
      .withMessage('Username must be 3-50 characters and contain only letters, numbers, dots, underscores, @ and hyphens'),
    body('password')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be 6-128 characters long')
  ],

  smsService: [
    body('service')
      .trim()
      .isLength({ min: 2, max: 20 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid service code format'),
    body('country')
      .optional()
      .trim()
      .isLength({ min: 1, max: 5 })
      .matches(/^[0-9]+$/)
      .withMessage('Country code must be numeric'),
    body('operator')
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid operator format')
  ],

  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be between 1 and 1000'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],

  activationId: [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Invalid activation ID')
  ],

  apiKey: [
    body('apiKey')
      .trim()
      .isLength({ min: 10, max: 200 })
      .matches(/^[a-zA-Z0-9]+$/)
      .withMessage('API key must be 10-200 alphanumeric characters')
  ]
};

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', {
      errors: errors.array(),
      path: req.path,
      userId: req.user?.id,
      ip: req.ip
    });

    return res.status(400).json({ 
      success: false,
      error: 'Validation failed', 
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      })),
      code: 'VALIDATION_ERROR'
    });
  }
  
  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Remove server identification
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });

  next();
};

// Request size limiter
const requestSizeLimiter = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxSizeBytes = parseFloat(maxSize) * 1024 * 1024;
    
    if (contentLength > maxSizeBytes) {
      logger.warn('Request too large:', {
        contentLength,
        maxSize,
        ip: req.ip,
        path: req.path
      });
      
      return res.status(413).json({ 
        success: false,
        error: 'Request too large',
        maxSize: maxSize,
        code: 'REQUEST_TOO_LARGE'
      });
    }
    
    next();
  };
};

// IP filtering middleware (basic)
const ipFilter = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Blacklist check
  const blacklistedIPs = process.env.BLACKLISTED_IPS?.split(',') || [];
  
  if (blacklistedIPs.includes(clientIP)) {
    logger.warn('Blocked request from blacklisted IP:', { ip: clientIP });
    return res.status(403).json({ 
      success: false,
      error: 'Access denied',
      code: 'IP_BLACKLISTED'
    });
  }

  next();
};

// Create custom rate limiter
const createRateLimiter = (windowMs, max, message, skipSuccessfulRequests = true) => {
  return rateLimit({
    windowMs,
    max,
    message: { 
      success: false,
      error: message,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: (req) => {
      return req.path === '/api/health';
    },
    keyGenerator: (req) => {
      return req.user?.id ? `user:${req.user.id}` : req.ip;
    },
    handler: (req, res) => {
      logger.warn('Rate limit exceeded:', {
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
        method: req.method
      });

      res.status(429).json({
        success: false,
        error: message || 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  });
};

// Sanitize input middleware
const sanitizeInput = (req, res, next) => {
  // Basic XSS prevention - remove script tags and dangerous patterns
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  if (req.query) {
    req.query = sanitize(req.query);
  }

  next();
};

module.exports = {
  rateLimiters,
  validationRules,
  handleValidationErrors,
  securityHeaders,
  ipFilter,
  requestSizeLimiter,
  createRateLimiter,
  sanitizeInput
};