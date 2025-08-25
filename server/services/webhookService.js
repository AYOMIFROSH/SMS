// services/websocketService.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');

class WebSocketService {
  constructor() {
    this.clients = new Map(); // userId (string) -> WebSocket
    this.heartbeatInterval = 30000; // 30 seconds
    this.cleanupInterval = 60000; // 1 minute
    this.wss = null;
  }

  initialize(server) {
    if (this.wss) return; // already initialized

    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      // verifyClient is synchronous here to match ws expectations
      verifyClient: (info, done) => {
        try {
          const ok = this.verifyClientSync(info);
          done(ok);
        } catch (err) {
          logger.error('verifyClient threw error:', err);
          done(false);
        }
      }
    });

    this.wss.on('connection', (ws, req) => {
      try {
        this.handleConnection(ws, req);
      } catch (err) {
        logger.error('Unhandled error in connection handler:', err);
        try { ws.close(1011, 'Server error'); } catch (_) {}
      }
    });

    this.wss.on('error', (err) => {
      logger.error('WebSocket.Server error:', err);
    });

    // Start heartbeat and cleanup intervals
    this.startHeartbeat();
    this.startCleanup();

    logger.info('WebSocket service initialized');
  }

  // synchronous verifier (ws expects sync verifyClient callback)
  verifyClientSync(info) {
    try {
      const reqUrl = info.req && info.req.url ? info.req.url : '';
      const url = new URL(reqUrl, 'http://localhost');
      const token = url.searchParams.get('token');
      const userIdParam = url.searchParams.get('userId');

      if (!token || !userIdParam) {
        logger.warn('WebSocket connection rejected: missing token or userId', { url: reqUrl });
        return false;
      }

      // Verify JWT token (this can throw)
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // decoded may not have userId
      const decodedUserId = decoded && (decoded.userId || decoded.id || decoded.sub);
      if (!decodedUserId) {
        logger.warn('WebSocket connection rejected: token decoded but no userId found', { url: reqUrl });
        return false;
      }

      // Compare as strings but only after verifying values exist
      if (String(decodedUserId) !== String(userIdParam)) {
        logger.warn('WebSocket connection rejected: user ID mismatch', { decodedUserId, userIdParam });
        return false;
      }

      // Attach verified info for use in handleConnection
      info.req.userId = String(userIdParam);
      info.req.user = decoded;
      return true;
    } catch (error) {
      logger.warn('WebSocket verification failed:', error && error.message ? error.message : error);
      return false;
    }
  }

  handleConnection(ws, req) {
    // guard: ensure req.userId is present
    const userId = req && req.userId ? String(req.userId) : null;
    if (!userId) {
      logger.warn('Incoming WS connection missing userId after verifyClient - closing', { url: req?.url, ip: req?.socket?.remoteAddress });
      try { ws.close(1008, 'Authentication required'); } catch (_) {}
      return;
    }

    logger.info(`WebSocket connected for user: ${userId}`);

    // Store client connection (store key as string)
    this.clients.set(userId, ws);

    // Setup message handlers with defensive wrappers
    ws.on('message', (data) => {
      try {
        this.handleMessage(ws, userId, data);
      } catch (err) {
        logger.error('Error in message handler:', err);
      }
    });

    ws.on('close', (code, reason) => {
      try {
        this.handleDisconnect(userId);
      } catch (err) {
        logger.error('Error in close handler:', err);
      }
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for user ${userId}:`, error && error.message ? error.message : error);
    });

    // Send connection confirmation (safe send)
    this.sendToUser(userId, {
      type: 'connection_established',
      data: { userId, timestamp: new Date().toISOString() }
    });

    // Setup ping/pong for connection health
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  }

  handleMessage(ws, userId, data) {
    try {
      const msgText = typeof data === 'string' ? data : data.toString();
      const message = JSON.parse(msgText);
      logger.info(`WebSocket message from user ${userId}:`, message.type);

      switch (message.type) {
        case 'ping':
          this.sendToUser(userId, { type: 'pong', data: { timestamp: Date.now() } });
          break;
        case 'subscribe_numbers':
          // User wants to subscribe to number updates
          this.sendToUser(userId, { type: 'subscribed', data: { topic: 'numbers' } });
          break;
        default:
          logger.warn(`Unknown WebSocket message type: ${message.type}`, { userId });
      }
    } catch (error) {
      logger.error(`Failed to parse WebSocket message from user ${userId}:`, error && error.message ? error.message : error);
    }
  }

  handleDisconnect(userId) {
    try {
      if (!userId) return;
      this.clients.delete(String(userId));
      logger.info(`WebSocket disconnected for user: ${userId}`);
    } catch (err) {
      logger.error('Error during handleDisconnect:', err);
    }
  }

  sendToUser(userId, message) {
    try {
      if (!userId) {
        logger.warn('sendToUser called with invalid userId', { userId, messageType: message?.type });
        return false;
      }
      const key = String(userId);
      const client = this.clients.get(key);

      if (!client) {
        logger.warn('sendToUser: no websocket found for user', { userId: key });
        return false;
      }

      // Ensure connection is open
      if (client.readyState !== WebSocket.OPEN) {
        logger.warn('sendToUser: websocket not open', { userId: key, readyState: client.readyState });
        // cleanup stale reference
        this.clients.delete(key);
        return false;
      }

      // Safe stringify
      const payload = (typeof message === 'string') ? message : JSON.stringify(message);

      client.send(payload, (err) => {
        if (err) {
          logger.error('ws.send callback error', { userId: key, err: err.message || err });
          // remove client to avoid repeated failures
          this.clients.delete(key);
        }
      });

      return true;
    } catch (err) {
      logger.error('sendToUser unexpected error:', err && err.message ? err.message : err);
      return false;
    }
  }

  broadcast(message, excludeUserId = null) {
    let sentCount = 0;
    for (const [userId, client] of this.clients.entries()) {
      try {
        if (excludeUserId && String(userId) === String(excludeUserId)) continue;
        if (this.sendToUser(userId, message)) sentCount++;
      } catch (err) {
        logger.warn('broadcast: failed to send to user', { userId, err: err?.message || err });
      }
    }
    logger.info(`Broadcast message sent to ${sentCount} clients`);
  }

  // Specific message types for SMS operations
  notifyNumberPurchased(userId, data) {
    return this.sendToUser(userId, {
      type: 'number_purchased',
      data: {
        activationId: data.activationId,
        number: data.number,
        service: data.service,
        country: data.country,
        timestamp: new Date().toISOString()
      }
    });
  }

  notifySmsReceived(userId, data) {
    return this.sendToUser(userId, {
      type: 'sms_received',
      data: {
        activationId: data.activationId,
        code: data.code,
        timestamp: new Date().toISOString()
      }
    });
  }

  notifyBalanceUpdated(userId, balance) {
    return this.sendToUser(userId, {
      type: 'balance_updated',
      data: {
        balance: parseFloat(balance),
        timestamp: new Date().toISOString()
      }
    });
  }

  notifyNumberExpired(userId, activationId) {
    return this.sendToUser(userId, {
      type: 'number_expired',
      data: {
        activationId,
        timestamp: new Date().toISOString()
      }
    });
  }

  notifyWebhookUpdate(userId, data) {
    return this.sendToUser(userId, {
      type: 'sms_webhook_update',
      data
    });
  }

  startHeartbeat() {
    if (!this.wss) return;
    setInterval(() => {
      try {
        this.wss.clients?.forEach((ws) => {
          if (ws.isAlive === false) {
            try { ws.terminate(); } catch (e) {}
            return;
          }
          ws.isAlive = false;
          try { ws.ping(); } catch (e) {}
        });
      } catch (err) {
        logger.warn('Heartbeat iteration error:', err && err.message ? err.message : err);
      }
    }, this.heartbeatInterval);
  }

  startCleanup() {
    setInterval(() => {
      try {
        for (const [userId, client] of this.clients.entries()) {
          if (!client || client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            this.clients.delete(userId);
          }
        }
      } catch (err) {
        logger.warn('Cleanup iteration error:', err && err.message ? err.message : err);
      }
    }, this.cleanupInterval);
  }

  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }

  getConnectionCount() {
    return this.clients.size;
  }
}

module.exports = new WebSocketService();
