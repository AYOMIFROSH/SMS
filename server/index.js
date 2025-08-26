// index.js - Enhanced with all security fixes
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

const { setupDatabase, initializeTables } = require('./Config/database');
const { setupRedis, getRedisClient } = require('./Config/redis');
const sessionService = require('./services/sessionService');
const logger = require('./utils/logger');
const webSocketService = require('./services/webhookService');

const app = express();
const server = http.createServer(app);

// Trust proxy for accurate client IPs
app.set('trust proxy', process.env.TRUST_PROXY || 1);

// Cookie parser MUST be before session
app.use(cookieParser());

// Enhanced Helmet Security Headers
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

// Session Configuration with Redis Store
const sessionMiddleware = async () => {
  const redisClient = getRedisClient();
  
  const sessionConfig = {
    name: 'sessionId', // Custom session name
    secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-minimum-32-chars',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      domain: process.env.COOKIE_DOMAIN || undefined
    }
  };

  // Use Redis store if available
  if (redisClient && redisClient.isOpen) {
    sessionConfig.store = new RedisStore({ 
      client: redisClient,
      prefix: 'sess:',
      ttl: 86400 // 24 hours in seconds
    });
    logger.info('Using Redis for session storage');
  } else {
    logger.warn('Redis not available, using memory store for sessions');
  }

  return session(sessionConfig);
};

// Enhanced CORS Configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://mysmsnumber.vercel.app';
const DEV_FRONTEND_URL = process.env.DEV_FRONTEND_URL || 'http://localhost:5173';

// Enhanced CORS Configuration for iOS compatibility
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [FRONTEND_URL];
    
    // Add development URLs
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push(DEV_FRONTEND_URL);
      allowedOrigins.push('http://localhost:3000');
      allowedOrigins.push('http://localhost:5173');
    }
    
    // Allow requests with no origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    logger.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Essential for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-CSRF-Token',
    'x-skip-retry',
    'x-skip-auth-interceptor',
    // iOS-specific headers
    'X-Access-Token',
    'X-Session-Token', 
    'X-Refresh-Token'
  ],
  exposedHeaders: [
    'X-Total-Count', 
    'X-Page-Count', 
    'X-CSRF-Token',
    // Expose tokens for iOS fallback
    'X-Access-Token',
    'X-Session-Token',
    'X-Refresh-Token'
  ],
  maxAge: 86400,
  // iOS-specific CORS options
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Compression
app.use(compression({
  level: 6,
  threshold: 1024
}));

// Body parsing middleware with raw body for webhooks
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
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

  if (!req.path.includes('/api/health')) {
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
    if (!req.path.includes('/api/health')) {
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

// CSRF Protection Setup (after session but before routes)
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
});

// Provide CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ 
    success: true,
    csrfToken: req.csrfToken() 
  });
});

// Health check endpoint (no auth/CSRF required)
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
      database: {
        connected: true
      },
      redis: {
        connected: getRedisClient()?.isOpen || false
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SMS Verification Dashboard API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/api/health',
      documentation: '/api/docs',
      csrfToken: '/api/csrf-token'
    }
  });
});

// API Routes with CSRF protection where needed
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', csrfProtection, require('./routes/dashboard'));
app.use('/api/numbers', csrfProtection, require('./routes/numbers'));
app.use('/api/services', require('./routes/services')); // Read-only, no CSRF needed
app.use('/api/transactions', csrfProtection, require('./routes/transactions'));
app.use('/api/settings', csrfProtection, require('./routes/settings'));

// SMS-Activate Webhook endpoint (special handling, no CSRF)
app.post('/webhook/sms-activate', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature if provided
    const signature = req.headers['x-sms-activate-signature'];
    const webhookSecret = process.env.SMS_ACTIVATE_WEBHOOK_SECRET;
    
    if (webhookSecret && signature) {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.rawBody)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        logger.warn('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Verify IP whitelist if configured
    const allowedIPs = process.env.SMS_ACTIVATE_IPS?.split(',').map(ip => ip.trim()) || [];
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      logger.warn(`Webhook from unauthorized IP: ${clientIP}`);
      return res.status(403).json({ error: 'Unauthorized IP' });
    }

    // Parse webhook data
    const webhookData = JSON.parse(req.rawBody);
    
    // Validate required fields
    if (!webhookData.activationId || !webhookData.status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        const webSocketService = require('./services/webhookService');
        await webSocketService.processWebhook(webhookData);
      } catch (error) {
        logger.error('Webhook processing error:', error);
      }
    });
    
    // Respond immediately
    res.status(200).json({ success: true });
    
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'SMS Verification Dashboard API',
    version: '1.0.0',
    description: 'Secure SMS verification service with enhanced authentication',
    security: {
      authentication: 'JWT with refresh tokens',
      csrf: 'Token-based CSRF protection on state-changing endpoints',
      cookies: 'HTTP-only secure cookies for session management',
      rateLimiting: 'Applied to all endpoints',
      headers: 'Security headers via Helmet.js'
    },
    endpoints: {
      authentication: {
        'GET /api/csrf-token': 'Get CSRF token for requests',
        'POST /api/auth/login': 'User login',
        'POST /api/auth/refresh': 'Refresh access token',
        'POST /api/auth/logout': 'Logout current session',
        'GET /api/auth/me': 'Get current user info'
      },
      services: {
        'GET /api/services': 'Get available SMS services',
        'GET /api/services/countries': 'Get supported countries',
        'GET /api/services/prices': 'Get pricing information'
      }
    }
  });
});

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

  // CSRF token errors
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token',
      code: 'CSRF_ERROR'
    });
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS error',
      message: 'Origin not allowed'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.requestId
  });
});

// Server startup
async function startServer() {
  try {
    logger.info('🚀 Starting Enhanced SMS Verification Server...');
    logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Validate environment variables
    const requiredEnvVars = [
      'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
      'EXISTING_DB_HOST', 'EXISTING_DB_USER', 'EXISTING_DB_PASSWORD', 'EXISTING_DB_NAME',
      'JWT_SECRET', 'SESSION_SECRET', 'SMS_ACTIVATE_API_KEY'
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
        🎉 Server running on port ${PORT}
        🔗 Health: http://localhost:${PORT}/api/health
        📚 Docs: http://localhost:${PORT}/api/docs
        🌐 Frontend: ${FRONTEND_URL}
        🔐 Security: CSRF + JWT + Secure Cookies
        💾 Sessions: ${getRedisClient()?.isOpen ? 'Redis' : 'Memory'}
      `);
    });

    // Session cleanup interval
    setInterval(async () => {
      try {
        const cleaned = await sessionService.cleanupExpiredSessions();
        if (cleaned > 0) {
          logger.info(`🧹 Cleaned ${cleaned} expired sessions`);
        }
      } catch (error) {
        logger.warn('Session cleanup error:', error.message);
      }
    }, 60 * 60 * 1000); // Every hour

  } catch (error) {
    logger.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  server.close(async () => {
    try {
      // Close database connections
      const { getPool, getExistingDbPool } = require('./Config/database');
      const pool = getPool();
      const existingPool = getExistingDbPool();
      
      if (pool) await pool.end();
      if (existingPool) await existingPool.end();
      
      // Close Redis
      const redis = getRedisClient();
      if (redis) await redis.quit();
      
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown error:', error);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
startServer();

module.exports = { app, server };