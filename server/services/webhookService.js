// services/websocketService.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');

class WebSocketService {
  constructor() {
    this.clients = new Map(); // userId -> WebSocket
    this.heartbeatInterval = 30000; // 30 seconds
    this.cleanupInterval = 60000; // 1 minute
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Start heartbeat and cleanup intervals
    this.startHeartbeat();
    this.startCleanup();
    
    logger.info('WebSocket service initialized');
  }

  async verifyClient(info) {
    try {
      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const userId = url.searchParams.get('userId');

      if (!token || !userId) {
        logger.warn('WebSocket connection rejected: missing token or userId');
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.userId.toString() !== userId) {
        logger.warn('WebSocket connection rejected: user ID mismatch');
        return false;
      }

      // Store user info for later use
      info.req.userId = userId;
      info.req.user = decoded;
      return true;
    } catch (error) {
      logger.error('WebSocket verification failed:', error);
      return false;
    }
  }

  handleConnection(ws, req) {
    const userId = req.userId;
    logger.info(`WebSocket connected for user: ${userId}`);

    // Store client connection
    this.clients.set(userId, ws);

    // Setup message handlers
    ws.on('message', (data) => this.handleMessage(ws, userId, data));
    ws.on('close', () => this.handleDisconnect(userId));
    ws.on('error', (error) => logger.error(`WebSocket error for user ${userId}:`, error));
    
    // Send connection confirmation
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
      const message = JSON.parse(data);
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
          logger.warn(`Unknown WebSocket message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Failed to parse WebSocket message from user ${userId}:`, error);
    }
  }

  handleDisconnect(userId) {
    this.clients.delete(userId);
    logger.info(`WebSocket disconnected for user: ${userId}`);
  }

  sendToUser(userId, message) {
    const client = this.clients.get(userId.toString());
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
        return true;
      } catch (error) {
        logger.error(`Failed to send WebSocket message to user ${userId}:`, error);
        this.clients.delete(userId.toString());
        return false;
      }
    }
    return false;
  }

  broadcast(message, excludeUserId = null) {
    let sentCount = 0;
    for (const [userId, client] of this.clients.entries()) {
      if (excludeUserId && userId === excludeUserId.toString()) continue;
      
      if (this.sendToUser(userId, message)) {
        sentCount++;
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
    setInterval(() => {
      this.wss?.clients?.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, this.heartbeatInterval);
  }

  startCleanup() {
    setInterval(() => {
      // Clean up dead connections
      for (const [userId, client] of this.clients.entries()) {
        if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
          this.clients.delete(userId);
        }
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