// services/websocketService.js - FIXED with payment notification methods
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { getPool } = require('../Config/database');

class WebSocketService {
  constructor() {
    this.clients = new Map();
    this.heartbeatInterval = 30000;
    this.cleanupInterval = 60000;
    this.wss = null;
  }

  initialize(server) {
    if (this.wss) return;

    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
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

    this.startHeartbeat();
    this.startCleanup();

    logger.info('WebSocket service initialized with payment notifications');
  }

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

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const decodedUserId = decoded && (decoded.userId || decoded.id || decoded.sub);
      
      if (!decodedUserId || String(decodedUserId) !== String(userIdParam)) {
        logger.warn('WebSocket connection rejected: user ID mismatch', { decodedUserId, userIdParam });
        return false;
      }

      info.req.userId = String(userIdParam);
      info.req.user = decoded;
      return true;
    } catch (error) {
      logger.warn('WebSocket verification failed:', error?.message || error);
      return false;
    }
  }

  handleConnection(ws, req) {
    const userId = req?.userId;
    if (!userId) {
      logger.warn('WebSocket connection missing userId after verification');
      try { ws.close(1008, 'Authentication required'); } catch (_) {}
      return;
    }

    logger.info(`WebSocket connected for user: ${userId}`);
    this.clients.set(userId, ws);

    ws.on('message', (data) => {
      try {
        this.handleMessage(ws, userId, data);
      } catch (err) {
        logger.error('Error in message handler:', err);
      }
    });

    ws.on('close', (code, reason) => {
      try {
        this.handleDisconnect(userId, code, reason);
      } catch (err) {
        logger.error('Error in close handler:', err);
      }
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for user ${userId}:`, error?.message || error);
    });

    this.sendToUser(userId, {
      type: 'connection_established',
      data: { 
        userId, 
        timestamp: new Date().toISOString(),
        features: ['payments', 'sms', 'settlements']
      }
    });

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
          this.sendToUser(userId, { 
            type: 'pong', 
            data: { 
              timestamp: Date.now(),
              messageId: message.messageId
            } 
          });
          break;

        case 'subscribe_payments':
          this.sendToUser(userId, { 
            type: 'subscribed', 
            data: { topic: 'payments', timestamp: new Date().toISOString() } 
          });
          break;

        case 'get_connection_info':
          this.sendToUser(userId, {
            type: 'connection_info',
            data: {
              userId,
              connected: true,
              connectedAt: new Date().toISOString(),
              clientCount: this.clients.size
            }
          });
          break;

        default:
          logger.warn(`Unknown WebSocket message type: ${message.type}`, { userId });
      }
    } catch (error) {
      logger.error(`Failed to parse WebSocket message from user ${userId}:`, error?.message || error);
    }
  }

  handleDisconnect(userId, code, reason) {
    try {
      if (!userId) return;
      
      this.clients.delete(String(userId));
      logger.info(`WebSocket disconnected for user: ${userId}`, { code, reason: reason?.toString() });

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

      if (!client || client.readyState !== WebSocket.OPEN) {
        logger.debug('sendToUser: websocket not available', { userId: key, type: message?.type });
        return false;
      }

      const enrichedMessage = {
        ...message,
        timestamp: new Date().toISOString(),
        userId: parseInt(userId),
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      const payload = JSON.stringify(enrichedMessage);

      client.send(payload, (err) => {
        if (err) {
          logger.error('ws.send callback error', { userId: key, err: err.message || err });
          this.clients.delete(key);
        }
      });

      return true;
    } catch (err) {
      logger.error('sendToUser unexpected error:', err?.message || err);
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

  // FIXED: Payment notification methods
  notifyPaymentSuccessful(userId, data) {
    return this.sendToUser(userId, {
      type: 'payment_successful',
      data: {
        paymentReference: data.paymentReference,
        transactionReference: data.transactionReference,
        amount: data.amount,
        amountPaid: data.amountPaid,
        currency: data.currency || 'NGN',
        paymentMethod: data.paymentMethod,
        newBalance: data.newBalance,
        previousBalance: data.previousBalance,
        fee: data.fee,
        settlementAmount: data.settlementAmount,
        settlementStatus: data.settlementStatus || 'PENDING',
        timestamp: new Date().toISOString()
      }
    });
  }

  notifyPaymentFailed(userId, data) {
    return this.sendToUser(userId, {
      type: 'payment_failed',
      data: {
        paymentReference: data.paymentReference,
        transactionReference: data.transactionReference,
        amount: data.amount,
        reason: data.reason,
        responseCode: data.responseCode,
        timestamp: new Date().toISOString()
      }
    });
  }

  notifyPaymentReversed(userId, data) {
    return this.sendToUser(userId, {
      type: 'payment_reversed',
      data: {
        transactionReference: data.transactionReference,
        paymentReference: data.paymentReference,
        reversalAmount: data.reversalAmount,
        reason: data.reason,
        newBalance: data.newBalance,
        timestamp: new Date().toISOString()
      }
    });
  }

  notifyBalanceUpdated(userId, newBalance, changeAmount = 0) {
    return this.sendToUser(userId, {
      type: 'balance_updated',
      data: {
        balance: parseFloat(newBalance),
        change: parseFloat(changeAmount),
        timestamp: new Date().toISOString()
      }
    });
  }

  // FIXED: Settlement notification methods
  notifySettlementCompleted(userId, data) {
    return this.sendToUser(userId, {
      type: 'settlement_completed',
      data: {
        settlementReference: data.settlementReference,
        settlementAmount: data.settlementAmount,
        settlementDate: data.settlementDate,
        transactionCount: data.transactionCount,
        timestamp: new Date().toISOString()
      }
    });
  }

  notifySettlementFailed(userId, data) {
    return this.sendToUser(userId, {
      type: 'settlement_failed',
      data: {
        settlementReference: data.settlementReference,
        failureReason: data.failureReason,
        timestamp: new Date().toISOString()
      }
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
        logger.warn('Heartbeat iteration error:', err?.message || err);
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
        logger.warn('Cleanup iteration error:', err?.message || err);
      }
    }, this.cleanupInterval);
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      totalConnections: this.wss?.clients?.size || 0
    };
  }

  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }

  getConnectionCount() {
    return this.clients.size;
  }
}

module.exports = new WebSocketService();