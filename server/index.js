// index.js - Streamlined server with proper session management
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const http = require('http');

const { setupDatabase, initializeTables } = require('./Config/database');
const { setupRedis } = require('./Config/redis');
const sessionService = require('./services/sessionService');
const logger = require('./utils/logger');
const webSocketService = require('./services/webhookService');

// MUST initialize WS here
const app = express();
const server = http.createServer(app);
app.use(cookieParser());

// Trust proxy for accurate client IPs
app.set('trust proxy', process.env.TRUST_PROXY || 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Cookie parser - MUST be before routes

// Enhanced CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const corsOptions = {
  origin: function (origin, callback) {
    // allow non-browser clients (no origin) but for browser requests check exact origin
    if (!origin) return callback(null, true);
    if (origin === FRONTEND_URL) return callback(null, true);
    logger.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Origin','X-Requested-With','Content-Type','Accept','Authorization','Cache-Control'],
  exposedHeaders: ['X-Total-Count','X-Page-Count'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// Compression
app.use(compression({
  level: 6,
  threshold: 1024
}));

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store raw body for webhook verification
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// Request logging middleware
app.use((req, res, next) => {
  req.requestId = require('crypto').randomUUID();
  const startTime = Date.now();

  // Don't log health checks and static files
  if (!req.path.includes('/api/health')) {
    logger.info('Incoming request:', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.substring(0, 100),
      timestamp: new Date().toISOString()
    });
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    if (!req.path.includes('/api/health')) {
      logger[level]('Request completed:', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`
      });
    }
  });

  next();
});

// Health check endpoint (no auth required)
app.get('/api/health', async (req, res) => {
  try {
    // Get session statistics
    const sessionStats = await sessionService.getSessionStats();

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      },
      database: {
        connected: true // We'll assume connected if we got this far
      },
      sessions: sessionStats,
      requestId: req.requestId
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'ERROR',
      error: error.message,
      requestId: req.requestId
    });
  }
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/numbers', require('./routes/numbers'));
app.use('/api/services', require('./routes/services'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/settings', require('./routes/settings'));

// Session management endpoints
app.get('/api/sessions/stats', async (req, res) => {
  try {
    const stats = await sessionService.getSessionStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Session stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get session stats' });
  }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'SMS Verification Dashboard API',
    version: '1.0.0',
    description: 'Complete SMS verification service with session-based authentication',
    authentication: {
      type: 'Session-based with JWT access tokens',
      flow: [
        '1. POST /api/auth/login - Login and receive access token + HTTP-only cookies',
        '2. Include access token in Authorization: Bearer <token> header',
        '3. Cookies are automatically included for session management',
        '4. POST /api/auth/refresh - Refresh access token using refresh cookie',
        '5. POST /api/auth/logout - Clear session and cookies'
      ]
    },
    endpoints: {
      authentication: {
        'POST /api/auth/login': 'User login with credentials',
        'POST /api/auth/refresh': 'Refresh access token',
        'GET /api/auth/me': 'Get current user information',
        'GET /api/auth/check': 'Check authentication status',
        'POST /api/auth/logout': 'Logout current session',
        'POST /api/auth/logout-all': 'Logout from all devices',
        'GET /api/auth/sessions': 'Get user active sessions',
        'DELETE /api/auth/sessions/:id': 'Revoke specific session'
      },

      services: {
        'GET /api/services': 'Get available SMS services',
        'GET /api/services/countries': 'Get supported countries',
        'GET /api/services/operators/:country': 'Get operators by country',
        'GET /api/services/prices': 'Get pricing information'
      },
      numbers: {
        'POST /api/numbers/purchase': 'Purchase phone number',
        'GET /api/numbers/active': 'Get active numbers',
        'GET /api/numbers/history': 'Get purchase history'
      }
    },
    security: {
      sessionManagement: 'Database-backed sessions with automatic cleanup',
      cookies: 'HTTP-only, secure cookies for session/refresh tokens',
      accessTokens: 'Short-lived JWT tokens for API access',
      rateLimiting: 'Applied to authentication endpoints'
    }
  });
});


// Add this RIGHT AFTER the request logging middleware and BEFORE the health check endpoint:

// Root endpoint - API information
app.get('/', (req, res) => {
  res.json({
    name: 'SMS Verification Dashboard API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    message: 'Welcome to SMS Verification Dashboard API',
    endpoints: {
      health: '/api/health',
      documentation: '/api/docs',
      test: '/api/test/sms-activate'
    },
    environment: process.env.NODE_ENV || 'development',
    requestId: req.requestId
  });
});

// SMS-Activate API test endpoint
app.get('/api/test/sms-activate', async (req, res) => {
  try {
    const smsActivateService = require('./services/smsActivateServices');
    logger.info('Testing SMS-Activate API...');

    const results = {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      tests: {}
    };

    // Test balance
    try {
      const balance = await smsActivateService.getBalance();
      results.tests.balance = {
        success: true,
        data: balance,
        message: `Current balance: $${balance}`
      };
    } catch (error) {
      results.tests.balance = {
        success: false,
        error: error.message
      };
    }

    // Test services
    try {
      const services = await smsActivateService.getServices();
      results.tests.services = {
        success: true,
        count: Array.isArray(services) ? services.length : Object.keys(services).length,
        message: 'Services loaded successfully'
      };
    } catch (error) {
      results.tests.services = {
        success: false,
        error: error.message
      };
    }

    // Overall status
    const successCount = Object.values(results.tests).filter(test => test.success).length;
    const totalTests = Object.keys(results.tests).length;

    results.summary = {
      overallStatus: successCount >= totalTests * 0.5 ? 'HEALTHY' : 'DEGRADED',
      successRate: `${successCount}/${totalTests}`,
      percentage: Math.round((successCount / totalTests) * 100)
    };

    const statusCode = results.summary.overallStatus === 'HEALTHY' ? 200 : 503;
    res.status(statusCode).json(results);

  } catch (error) {
    logger.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      message: error.message,
      requestId: req.requestId
    });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    requestId: req.requestId,
    documentation: '/api/docs'
  });
});

// Global 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    requestId: req.requestId
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    ip: req.ip
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.details,
      requestId: req.requestId
    });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
      requestId: req.requestId
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS error',
      message: 'Origin not allowed',
      requestId: req.requestId
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON',
      requestId: req.requestId
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request too large',
      requestId: req.requestId
    });
  }

  process.on('uncaughtException', err => {
    console.error('UNCAUGHT EXCEPTION:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
  });

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

// Server startup
async function startServer() {
  try {
    logger.info('🚀 Starting SMS Verification Dashboard Server...');
    logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Validate required environment variables
    const requiredEnvVars = [
      'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
      'EXISTING_DB_HOST', 'EXISTING_DB_USER', 'EXISTING_DB_PASSWORD', 'EXISTING_DB_NAME',
      'JWT_SECRET', 'SMS_ACTIVATE_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    logger.info('✅ Environment variables validated');

    // Setup database

    process.on("unhandledRejection", (reason, p) => {
      console.error("Unhandled Rejection at: Promise", p, "reason:", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
    });


    try {
      await setupDatabase();
      console.log('✅ DB connection OK');
    } catch (err) {
      console.error('❌ DB connection failed:', err.message);
      process.exit(1);
    }

    // Setup Redis (optional)
    try {
      await setupRedis();
      logger.info('✅ Redis connected (session caching available)');
    } catch (redisError) {
      logger.warn('⚠️ Redis connection failed (continuing without Redis):', redisError.message);
    }

    // Clean up expired sessions on startup
    try {
      const cleanedCount = await sessionService.cleanupExpiredSessions();
      logger.info(`✅ Cleaned up ${cleanedCount} expired sessions`);
    } catch (cleanupError) {
      logger.warn('⚠️ Session cleanup warning:', cleanupError.message);
    }

    try {
      logger.info('🔧 Initializing WebSocket...');
      webSocketService.initialize(server);
      logger.info('✅ WebSocket initialized');
    } catch (wsError) {
      logger.error('WebSocket init failed:', wsError);
    }
    // Test SMS-Activate API connection
    try {
      const smsActivateService = require('./services/smsActivateServices');
      const balance = await smsActivateService.getBalance();
      logger.info(`✅ SMS-Activate API connected (Balance: ${balance})`);
    } catch (apiError) {
      logger.warn('⚠️ SMS-Activate API connection failed:', apiError.message);
      logger.warn('⚠️ SMS functionality will be limited');
    }

    // Start HTTP server
    server.listen(PORT, '::', () => {
      logger.info(`🎉 Server running on port ${PORT}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
      logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
      logger.info(`🔐 Session Management: Database-backed with HTTP-only cookies`);
      logger.info(`⚡ Access Tokens: JWT with ${process.env.JWT_EXPIRE || '15m'} expiry`);
      logger.info(`🍪 Cookies: ${process.env.NODE_ENV === 'production' ? 'Secure' : 'Development'} mode`);
    });
    

    // Set up session cleanup interval (every hour)
    setInterval(async () => {
      try {
        const cleanedCount = await sessionService.cleanupExpiredSessions();
        if (cleanedCount > 0) {
          logger.info(`🧹 Periodic cleanup: removed ${cleanedCount} expired sessions`);
        }
      } catch (error) {
        logger.warn('Periodic session cleanup failed:', error.message);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Log server readiness
    server.on('listening', () => {
      logger.info('🟢 Server is ready to accept connections');
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, initiating graceful shutdown...`);

  const shutdownTimer = setTimeout(() => {
    logger.error('❌ Forced shutdown due to timeout');
    process.exit(1);
  }, 30000); // 30 second timeout

  server.close(async (err) => {
    if (err) {
      logger.error('❌ Error during server shutdown:', err);
      clearTimeout(shutdownTimer);
      return process.exit(1);
    }

    logger.info('✅ HTTP server closed');

    try {
      // Close database connections
      const { getPool, getExistingDbPool } = require('./Config/database');
      const pool = getPool();
      const existingPool = getExistingDbPool();

      if (pool) {
        await pool.end();
        logger.info('✅ Main database connection closed');
      }

      if (existingPool) {
        await existingPool.end();
        logger.info('✅ Existing database connection closed');
      }

      // Close Redis connection
      try {
        const { getRedisClient } = require('./Config/redis');
        const redis = getRedisClient();
        if (redis) {
          await redis.quit();
          logger.info('✅ Redis connection closed');
        }
      } catch (redisError) {
        logger.warn('⚠️ Redis close warning:', redisError.message);
      }

      clearTimeout(shutdownTimer);
      logger.info('🟢 Graceful shutdown completed');
      process.exit(0);

    } catch (shutdownError) {
      logger.error('❌ Error during shutdown:', shutdownError);
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  });
};

// Process signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('❌ Uncaught Exception:', {
    error: err.message,
    stack: err.stack
  });

  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection:', {
    promise: promise,
    reason: reason
  });
});

// Start the server
startServer();

// Export for testing
module.exports = { app, server };