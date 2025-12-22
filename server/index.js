require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const csrf = require('csurf');
const http = require('http');
const favicon = require('serve-favicon');
const path = require('path');
const fs = require('fs');


const { setupRedis, getRedisClient } = require('./Config/redis');
const sessionService = require('./services/sessionService');
const logger = require('./utils/logger');
const webSocketService = require('./services/webhookService');
const mobileOptimizationMiddleware = require('./middleware/mobile');

const app = express();
const server = http.createServer(app);

// REMOVED: require('./cron/reconcileJob'); - moved to startServer() with error handling

const assetsPath = path.join(__dirname, 'assets');
app.use('/assets', express.static(assetsPath));

const icoPath = path.join(assetsPath, 'sms-buzzup.ico');
app.use(favicon(icoPath, { maxAge: 7 * 24 * 60 * 60 * 1000 }));

app.set('trust proxy', process.env.TRUST_PROXY || 1);
app.use(cookieParser());

// Enhanced Helmet Security Headers (relaxed for webhooks)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'https://mysmsnumber.vercel.app'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS Configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://mysmsnumber.vercel.app';

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'https://sms.fizzbuzzup.com',
      ...(process.env.NODE_ENV !== 'production' ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174'
      ] : [])
    ];

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization',
    'Cache-Control', 'X-CSRF-Token', 'CSRF-Token', 'x-csrf-token', 'csrf-token',
    'X-Mobile-Client', 'X-Mobile-Platform', 'Cache-Control', 'Pragma',
    'x-monnify-signature', 'monnify-signature', 'X-Monnify-Signature',
    'X-Access-Token', 'X-Session-Token', 'X-Refresh-Token', 'x-skip-auth-interceptor'
  ],
  exposedHeaders: ['X-CSRF-Token', 'X-Total-Count', 'X-Page-Count'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression({ level: 6, threshold: 1024 }));


app.use('/api/payments/flutterwave', require('./routes/flutterwaveWebhook'));

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // if you also accept form data


// Session Configuration
const sessionMiddleware = async () => {
  const redisClient = getRedisClient();

  const sessionConfig = {
    name: process.env.SESSION_COOKIE_NAME || 'sessionId',
    secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-minimum-32-chars',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      domain: process.env.NODE_ENV === 'production' ? ".fizzbuzzup.com" : undefined
    },
    store: undefined
  };

  if (redisClient && redisClient.isOpen) {
    sessionConfig.store = new RedisStore({
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400
    });
    logger.info('Using Redis for session storage');
  } else {
    logger.warn('Redis not available, using memory store for sessions');
  }

  return session(sessionConfig);
};

// Request logging middleware
app.use((req, res, next) => {
  req.requestId = require('crypto').randomUUID();
  const startTime = Date.now();

  // Skip logging for health checks and webhooks (already logged)
  if (!req.path.includes('/api/health') && !req.path.includes('/webhook/')) {
    logger.info('Incoming request:', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.substring(0, 100)
    });
  }

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (!req.path.includes('/api/health') && !req.path.includes('/webhook/')) {
      const level = res.statusCode >= 400 ? 'warn' : 'info';
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

// CSRF Protection Setup
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 3600000,
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? ".fizzbuzzup.com" : undefined
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  value: (req) => {
    return req.body._csrf ||
      req.query._csrf ||
      req.headers['x-csrf-token'] ||
      req.headers['csrf-token'];
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
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
      database: { connected: true },
      redis: { connected: getRedisClient()?.isOpen || false },
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

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({
    success: true,
    csrfToken: req.csrfToken(),
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
});

// In your route where you might want to check service status
app.get('/api/sms/background-status', csrfProtection, (req, res) => {
  try {
    const stats = smsBackgroundService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting SMS service stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status'
    });
  }
});


// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SMS Verification Dashboard API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    webhook: {
      flutterwave: '/api/payments/flutterwave',
      test: process.env.NODE_ENV === 'development' ? '/webhook-test' : undefined
    },
    endpoints: {
      health: '/api/health',
      webhookDebug: '/api/webhook/debug',
      documentation: '/api/docs',
      csrfToken: '/api/csrf-token'
    }
  });
});

// API Routes
app.use('/api/auth', mobileOptimizationMiddleware, require('./routes/auth'));
app.use('/api/dashboard', csrfProtection, require('./routes/dashboard'));
app.use('/api/numbers', csrfProtection, require('./routes/numbers'));
app.use('/api/services', require('./routes/services'));
app.use('/api/transactions', csrfProtection, require('./routes/transactions'));
app.use('/api/settings', csrfProtection, require('./routes/settings'));
app.use('/api/payments', csrfProtection, require('./routes/payment'));

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
    path: req.path
  });

  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token',
      code: 'CSRF_ERROR'
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS error',
      message: 'Origin not allowed'
    });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId
  });
});

let sessionCleanupInterval = null;
let settlementMonitorInterval = null;

// Server startup function
async function startServer() {
  try {
    logger.info('🚀 Starting Enhanced SMS Verification Server...');
    logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Validate environment variables
    const requiredEnvVars = [
      'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
      'EXISTING_DB_HOST', 'EXISTING_DB_USER', 'EXISTING_DB_PASSWORD', 'EXISTING_DB_NAME',
      'JWT_SECRET', 'SESSION_SECRET', 'SMS_ACTIVATE_API_KEY', 'FLW_SECRET_KEY',
      'FLW_PUBLIC_KEY', 'FLW_SECRET_HASH', 'FLW_ENCRYPTION_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
      console.error('❌ STARTUP ERROR:', errorMsg);
      logger.error('❌ STARTUP ERROR:', errorMsg);
      throw new Error(errorMsg);
    }

    try {
      const flutterwaveService = require('./services/flutterwaveServices');
      if (process.env.FLW_SECRET_KEY && process.env.FLW_PUBLIC_KEY && process.env.FLW_SECRET_HASH) {
        flutterwaveService.validateConfig();
        logger.info('✅ Flutterwave service configured and ready');
      } else {
        logger.warn('⚠️ Flutterwave service disabled - missing configuration');
      }
    } catch (flutterwaveError) {
      logger.error('❌ Flutterwave service initialization failed:', flutterwaveError.message);
    }

    // Setup Redis
    try {
      await setupRedis();
      logger.info('✅ Redis connected for session caching');
    } catch (redisError) {
      logger.warn('⚠️ Redis connection failed, using memory store:', redisError.message);
    }

    // Apply session middleware
    const sessionMid = await sessionMiddleware();
    app.use(sessionMid);
    logger.info('✅ Session middleware configured');

    // Initialize WebSocket
    webSocketService.initialize(server);
    logger.info('✅ WebSocket service initialized');

    // Start Reconciliation Cron Job
    try {
      require('./cron/reconcileJob');
      logger.info('✅ Reconciliation cron job started');
    } catch (cronError) {
      logger.error('❌ Reconciliation cron job failed:', cronError);
      console.error('⚠️ Warning: Reconciliation job disabled - non-critical');
    }

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '::', () => {
      logger.info(`
  ✅ Enhanced SMS Platform Server Running
  🌐 Port: ${PORT}  
  🏥 Health: http://localhost:${PORT}/api/health
  💳 Payment Provider: Flutterwave
  🎯 Flutterwave Webhook: http://localhost:${PORT}/api/payments/flutterwave/webhook
  📊 Flutterwave Health: http://localhost:${PORT}/api/flutterwave/health
  ${process.env.NODE_ENV === 'development' ? '🧪 Test Webhook: http://localhost:${PORT}/api/payments/flutterwave/webhook/test' : ''}
  📚 Docs: http://localhost:${PORT}/api/docs
  🖥️ Frontend: ${FRONTEND_URL}
  🔐 Security: Enhanced IP validation + CSRF + JWT
  💾 Sessions: ${getRedisClient()?.isOpen ? 'Redis' : 'Memory'}
  💰 Exchange Rate: Live USD/NGN conversion
  🔔 Real-time: WebSocket notifications enabled
  📈 Monitoring: Pending settlements tracking
`);
    });

    // Cleanup intervals
    setInterval(async () => {
      try {
        const cleaned = await sessionService.cleanupExpiredSessions();
        if (cleaned > 0) {
          logger.info(`🧹 Cleaned ${cleaned} expired sessions`);
        }
      } catch (error) {
        logger.warn('Session cleanup error:', error.message);
      }
    }, 60 * 60 * 1000);

  } catch (error) {
    logger.error('❌ Server startup failed:', error);
    console.error('❌ FATAL ERROR:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }

}

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`\n${signal} received, starting graceful shutdown...`);

  const { getPool, getExistingDbPool } = require('./Config/database');
  const { getRedisClient } = require('./Config/redis');

  try {
    // 1. Stop accepting new connections
    logger.info('⏹ Stopping server...');

    // 2. Clear all intervals first
    if (sessionCleanupInterval) {
      clearInterval(sessionCleanupInterval);
      sessionCleanupInterval = null;
      logger.info('✅ Session cleanup interval cleared');
    }

    if (settlementMonitorInterval) {
      clearInterval(settlementMonitorInterval);
      settlementMonitorInterval = null;
      logger.info('✅ Settlement monitoring interval cleared');
    }

    // 4. Close WebSocket connections
    const webSocketService = require('./services/webhookService');
    if (webSocketService.wss) {
      logger.info('⏹ Closing WebSocket connections...');
      webSocketService.wss.clients.forEach(ws => {
        ws.close(1000, 'Server shutting down');
      });
      logger.info('✅ WebSocket connections closed');
    }

    // 5. Wait for existing HTTP requests to complete (max 30s)
    logger.info('⏳ Waiting for existing requests to complete...');
    await new Promise(resolve => {
      const timeout = setTimeout(() => {
        logger.warn('⚠️ Shutdown timeout reached, forcing close');
        resolve();
      }, 30000);

      server.close(() => {
        clearTimeout(timeout);
        logger.info('✅ HTTP server closed');
        resolve();
      });
    });

    // 6. Close database connections
    const pool = getPool();
    const existingPool = getExistingDbPool();

    if (pool) {
      logger.info('⏹ Closing main database connection...');
      await pool.end();
      logger.info('✅ Main database connection closed');
    }

    if (existingPool) {
      logger.info('⏹ Closing existing database connection...');
      await existingPool.end();
      logger.info('✅ Existing database connection closed');
    }

    // 7. Close Redis connection
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
      logger.info('⏹ Closing Redis connection...');
      await redis.quit();
      logger.info('✅ Redis connection closed');
    }

    logger.info('✅ Graceful shutdown completed');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Shutdown error:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

module.exports = { app, server };