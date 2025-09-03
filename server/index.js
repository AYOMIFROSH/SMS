// index.js - Fixed webhook endpoint with comprehensive debugging and IP validation
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

const { setupDatabase, initializeTables } = require('./Config/database');
const { setupRedis, getRedisClient } = require('./Config/redis');
const sessionService = require('./services/sessionService');
const logger = require('./utils/logger');
const webSocketService = require('./services/webhookService');
const monnifyService = require('./routes/monnifyService');
const paymentWebhookProcessor = require('./services/paymentWebhookProcessor');
const mobileOptimizationMiddleware = require('./middleware/mobile');

const app = express();
const server = http.createServer(app);

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

// Extract from index.js - Updated webhook endpoint

// Monnify IP whitelist
const MONNIFY_IPS = [
  '35.242.133.146', // Primary Monnify IP
  '::ffff:35.242.133.146', // IPv6 mapped IPv4
  '127.0.0.1', // Local testing
  '::1' // IPv6 localhost
];

// Helper to validate Monnify IP
const isValidMonnifyIP = (ip) => {
  const realIP = ip?.replace('::ffff:', '');
  
  // Allow localhost in development
  if (process.env.NODE_ENV === 'development') {
    if (ip === '127.0.0.1' || ip === '::1' || realIP === '127.0.0.1') {
      return true;
    }
  }
  
  return MONNIFY_IPS.includes(ip) || MONNIFY_IPS.includes(realIP);
};

// CRITICAL: Monnify Webhook endpoint with raw body handling
app.post('/webhook/monnify', 
  // Raw body parser for signature verification
  express.raw({ 
    type: 'application/json',
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }),
  async (req, res) => {
    const requestId = require('crypto').randomUUID();
    
    try {
      // Log incoming webhook
      const clientIP = req.ip || req.connection.remoteAddress;
      
      logger.info('Monnify webhook received', {
        requestId,
        clientIP,
        hasSignature: !!(req.headers['x-monnify-signature'] || 
                        req.headers['monnify-signature'] || 
                        req.headers['X-Monnify-Signature']),
        contentType: req.headers['content-type'],
        bodyLength: req.body?.length || 0
      });

      // IP Validation (optional but recommended)
      const isValidIP = isValidMonnifyIP(clientIP);
      
      if (!isValidIP && process.env.NODE_ENV === 'production') {
        logger.warn('Webhook rejected: Invalid IP', {
          requestId,
          clientIP
        });
        
        return res.status(403).json({ 
          success: false, 
          error: 'Forbidden',
          requestId 
        });
      }

      // Add request ID to headers for tracking
      req.headers['x-request-id'] = requestId;
      
      // Delegate to webhook processor
      await paymentWebhookProcessor.handleWebhook(req, res);
      
    } catch (error) {
      logger.error('Webhook route error', {
        requestId,
        error: error.message
      });
      
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error',
          requestId
        });
      }
    }
  }
);

// Development test endpoint
if (process.env.NODE_ENV === 'development') {
  app.post('/webhook/test-monnify', express.json(), async (req, res) => {
    logger.info('Test webhook triggered', { body: req.body });

    try {
      const testPayload = {
        eventType: 'SUCCESSFUL_TRANSACTION',
        eventData: {
          transactionReference: 'TEST_' + Date.now(),
          paymentReference: req.body.paymentReference || 'TEST_PAY_' + Date.now(),
          amountPaid: req.body.amount || 1000,
          paidOn: new Date().toISOString(),
          paymentMethod: 'ACCOUNT_TRANSFER',
          currency: 'NGN',
          paymentStatus: 'PAID',
          customer: {
            email: req.body.email || 'test@example.com',
            name: 'Test User'
          }
        }
      };

      req.body = testPayload;
      req.rawBody = JSON.stringify(testPayload);
      req.headers['x-monnify-signature'] = 'test-signature';
      
      await paymentWebhookProcessor.handleWebhook(req, res);
      
    } catch (error) {
      logger.error('Test webhook error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}



// Body parsing middleware for other endpoints
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    // Skip webhook endpoints
    if (req.path.includes('/webhook/')) return;
    req.rawBody = buf.toString('utf8');
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

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
      webhook: {
        endpoint: '/webhook/monnify',
        allowedIPs: MONNIFY_IPS,
        environment: process.env.NODE_ENV
      },
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

// Enhanced webhook debugging endpoint
app.get('/api/webhook/debug', (req, res) => {
  res.json({
    webhookEndpoint: '/webhook/monnify',
    testEndpoint: process.env.NODE_ENV === 'development' ? '/webhook/test-monnify' : null,
    allowedIPs: MONNIFY_IPS,
    environment: process.env.NODE_ENV,
    serverTime: new Date().toISOString(),
    expectedHeaders: [
      'x-monnify-signature',
      'monnify-signature',
      'X-Monnify-Signature'
    ],
    paymentService: {
      apiUrl: process.env.NODE_ENV === 'production' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com',
      hasApiKey: !!process.env.MONNIFY_API_KEY,
      hasSecretKey: !!process.env.MONNIFY_SECRET_KEY,
      hasContractCode: !!process.env.MONNIFY_CONTRACT_CODE
    }
  });
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SMS Verification Dashboard API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    webhook: {
      monnify: '/webhook/monnify',
      test: process.env.NODE_ENV === 'development' ? '/webhook/test-monnify' : undefined
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

// Server startup function
async function startServer() {
  try {
    logger.info('🚀 Starting Enhanced SMS Verification Server...');
    logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Validate environment variables
    const requiredEnvVars = [
      'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
      'EXISTING_DB_HOST', 'EXISTING_DB_USER', 'EXISTING_DB_PASSWORD', 'EXISTING_DB_NAME',
      'JWT_SECRET', 'SESSION_SECRET', 'SMS_ACTIVATE_API_KEY',
      'MONNIFY_API_KEY', 'MONNIFY_SECRET_KEY', 'MONNIFY_CONTRACT_CODE'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // Setup database
    await setupDatabase();
    await initializeTables();
    logger.info('✅ Database connected and initialized');

    // Setup Redis
    try {
      await setupRedis();
      logger.info('✅ Redis connected for session caching');
    } catch (redisError) {
      logger.warn('⚠️ Redis connection failed, using memory store:', redisError.message);
    }

    // Test Monnify service
    try {
      const monnifyHealth = await monnifyService.healthCheck();
      logger.info('✅ Monnify service health check:', monnifyHealth);
    } catch (monnifyError) {
      logger.warn('⚠️ Monnify service connection warning:', monnifyError.message);
    }

    // Apply session middleware
    const sessionMid = await sessionMiddleware();
    app.use(sessionMid);
    logger.info('✅ Session middleware configured');

    // Initialize WebSocket
    webSocketService.initialize(server);
    logger.info('✅ WebSocket service initialized');

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, '::', () => {
      logger.info(`
        ✅ Enhanced SMS Platform Server Running
        🌐 Port: ${PORT}
        🏥 Health: http://localhost:${PORT}/api/health
        🔧 Webhook Debug: http://localhost:${PORT}/api/webhook/debug
        🎯 Monnify Webhook: http://localhost:${PORT}/webhook/monnify
        ${process.env.NODE_ENV === 'development' ? '🧪 Test Webhook: http://localhost:${PORT}/webhook/test-monnify' : ''}
        📚 Docs: http://localhost:${PORT}/api/docs
        🖥️ Frontend: ${FRONTEND_URL}
        🔐 Security: Enhanced IP validation + CSRF + JWT
        💾 Sessions: ${getRedisClient()?.isOpen ? 'Redis' : 'Memory'}
        💳 Payments: Monnify Enhanced Integration
        🚨 Allowed IPs: ${MONNIFY_IPS.join(', ')}
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
    
    // 2. Close WebSocket connections
    const webSocketService = require('./services/webhookService');
    if (webSocketService.wss) {
      webSocketService.wss.clients.forEach(ws => {
        ws.close(1000, 'Server shutting down');
      });
    }
    
    // 3. Wait for existing requests to complete (max 30s)
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 30000);
      server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
    // 4. Close database connections
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
    
    // 5. Close Redis connection
    const redis = getRedisClient();
    if (redis && redis.isOpen) {
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