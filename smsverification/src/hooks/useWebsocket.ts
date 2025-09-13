// src/hooks/useWebsocket.ts - Fixed unused variables and improved functionality
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { updateNumberStatus, addNewPurchase } from '@/store/slices/numbersSlice';
import { updateStats } from '@/store/slices/dashboardSlice';
import { tokenManager } from '@/api/client';
import toast from 'react-hot-toast';
import { toastWarning } from '@/utils/toastHelpers';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
  userId?: number;
  messageId?: string;
  priority?: 'low' | 'normal' | 'high';
}

interface WebSocketConfig {
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  enableMessageQueue?: boolean;
  maxQueueSize?: number;
  enableDeduplication?: boolean;
  enableMetrics?: boolean;
  messageCleanupInterval?: number; // Added this to the interface
}

interface ConnectionMetrics {
  connectTime: number | null;
  totalReconnects: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  averageLatency: number;
  lastPingTime: number | null;
}

const DEFAULT_CONFIG: Required<WebSocketConfig> = {
  maxReconnectAttempts: 5,
  reconnectInterval: 3000,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
  enableMessageQueue: true,
  maxQueueSize: 100,
  enableDeduplication: true,
  enableMetrics: true,
  messageCleanupInterval: 300000 // 5 minutes - cleanup old processed messages
};

// SINGLETON WEBSOCKET MANAGER - This prevents multiple connections
class GlobalWebSocketManager {
  private static instance: GlobalWebSocketManager | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimeout: number | undefined = undefined;
  private heartbeatTimeout: number | undefined = undefined;
  private messageCleanupInterval: number | undefined = undefined; // Fixed: Now properly used
  private reconnectAttempts = 0;
  private isConnecting = false;
  private messageQueue: WebSocketMessage[] = [];
  private processedMessages = new Set<string>();
  private pingTimes = new Map<string, number>();
  private subscribers = new Set<(data: any) => void>();
  private stateSubscribers = new Set<() => void>();
  private connectionShownOnce = false;
  private config: Required<WebSocketConfig> = DEFAULT_CONFIG; // Store config in instance

  // Connection state
  private isConnected = false;
  private connectionError: string | null = null;
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private metrics: ConnectionMetrics = {
    connectTime: null,
    totalReconnects: 0,
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    averageLatency: 0,
    lastPingTime: null
  };

  static getInstance(): GlobalWebSocketManager {
    if (!GlobalWebSocketManager.instance) {
      GlobalWebSocketManager.instance = new GlobalWebSocketManager();
    }
    return GlobalWebSocketManager.instance;
  }

  // Method to update configuration
  updateConfig(newConfig: Partial<WebSocketConfig>) {
    this.config = { ...this.config, ...newConfig };
    // Restart cleanup interval if it changed
    if (newConfig.messageCleanupInterval !== undefined) {
      this.startMessageCleanup();
    }
  }

  // Subscribe to messages
  subscribe(callback: (data: any) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Subscribe to state changes
  subscribeToState(callback: () => void): () => void {
    this.stateSubscribers.add(callback);
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  private notifyStateSubscribers() {
    this.stateSubscribers.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('State subscriber error:', error);
      }
    });
  }

  private notifyMessageSubscribers(message: WebSocketMessage) {
    // Message deduplication - only if enabled in config
    if (this.config.enableDeduplication && message.messageId && this.processedMessages.has(message.messageId)) {
      return;
    }

    if (this.config.enableDeduplication && message.messageId) {
      this.processedMessages.add(message.messageId);
      // Cleanup will be handled by the interval
    }

    this.subscribers.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error('Message subscriber error:', error);
      }
    });
  }

  // Fixed: Now properly implements message cleanup
  private startMessageCleanup() {
    if (this.messageCleanupInterval !== undefined) {
      window.clearInterval(this.messageCleanupInterval);
      this.messageCleanupInterval = undefined;
    }

    if (this.config.enableDeduplication) {
      this.messageCleanupInterval = window.setInterval(() => {
        // Keep only recent messages to prevent memory leaks
        if (this.processedMessages.size > 1000) {
          const messages = Array.from(this.processedMessages);
          this.processedMessages = new Set(messages.slice(-500));
        }
        
        // Also cleanup old ping times
        const now = Date.now();
        for (const [pingId, pingTime] of this.pingTimes.entries()) {
          if (now - pingTime > 60000) { // Remove pings older than 1 minute
            this.pingTimes.delete(pingId);
          }
        }
      }, this.config.messageCleanupInterval);
    }
  }

  // Get current state
  getState() {
    return {
      isConnected: this.isConnected,
      connectionError: this.connectionError,
      connectionState: this.connectionState,
      metrics: { ...this.metrics },
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.maxReconnectAttempts
    };
  }

  private getWebSocketUrl(user: any): string | null {
    if (!user?.id) {
      console.error("WebSocket: Missing user.id");
      return null;
    }

    const accessToken = tokenManager.getAccessToken();
    if (!accessToken) {
      console.error("WebSocket: Missing access token");
      return null;
    }

    const isProduction = !window.location.host.includes('localhost') &&
      !window.location.host.includes('127.0.0.1');

    let wsUrl: string;

    if (isProduction) {
      const serverUrl = import.meta.env.VITE_RENDER_SERVER_URL ||
        import.meta.env.VITE_API_BASE_URL;

      if (!serverUrl) {
        console.error('Production server URL not configured');
        return null;
      }

      const cleanUrl = serverUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
      const protocol = serverUrl.includes('https') ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${cleanUrl}/ws`;
    } else {
      const wsPort = import.meta.env.VITE_WS_PORT || '5000';
      wsUrl = `ws://localhost:${wsPort}/ws`;
    }

    const params = new URLSearchParams({
      token: accessToken,
      userId: String(user.id),
      compression: 'true',
      version: '2.0'
    });

    return `${wsUrl}?${params.toString()}`;
  }

  private clearTimeouts() {
    if (this.reconnectTimeout !== undefined) {
      window.clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.heartbeatTimeout !== undefined) {
      window.clearInterval(this.heartbeatTimeout);
      this.heartbeatTimeout = undefined;
    }

    // Fixed: Now properly clears message cleanup interval
    if (this.messageCleanupInterval !== undefined) {
      window.clearInterval(this.messageCleanupInterval);
      this.messageCleanupInterval = undefined;
    }
  }

  private startHeartbeat() {
    this.clearTimeouts();
    
    this.heartbeatTimeout = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const pingId = `ping_${Date.now()}_${Math.random()}`;
        const pingTime = Date.now();
        
        this.pingTimes.set(pingId, pingTime);
        this.ws.send(JSON.stringify({
          type: 'ping',
          messageId: pingId,
          timestamp: new Date().toISOString()
        }));
        
        this.metrics.lastPingTime = pingTime;
      }
    }, this.config.heartbeatInterval);

    // Start message cleanup when connection is established
    this.startMessageCleanup();
  }

  private processMessageQueue() {
    if (!this.config.enableMessageQueue || this.messageQueue.length === 0) return;
    
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    
    messages.forEach(message => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(message));
          if (this.config.enableMetrics) {
            this.metrics.totalMessagesSent++;
          }
        } catch (error) {
          console.error('Failed to send queued message:', error);
          if (this.messageQueue.length < this.config.maxQueueSize) {
            this.messageQueue.push(message);
          }
        }
      }
    });
  }

  connect(user: any, enabled: boolean = true) {
    // Return early if already connected or connecting
    if (!enabled || this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    
    if (!user?.id) return;

    const wsUrl = this.getWebSocketUrl(user);
    if (!wsUrl) {
      this.connectionError = 'Cannot construct WebSocket URL';
      this.connectionState = 'error';
      this.notifyStateSubscribers();
      return;
    }

    this.isConnecting = true;
    this.connectionState = 'connecting';
    this.connectionError = null;
    this.notifyStateSubscribers();

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close();
          this.connectionError = 'Connection timeout';
          this.connectionState = 'error';
          this.notifyStateSubscribers();
        }
      }, this.config.connectionTimeout);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        this.isConnecting = false;
        this.isConnected = true;
        this.connectionState = 'connected';
        this.connectionError = null;
        
        if (this.config.enableMetrics) {
          this.metrics.connectTime = Date.now();
          if (this.reconnectAttempts > 0) {
            this.metrics.totalReconnects++;
          }
        }
        
        this.reconnectAttempts = 0;

        // Only show connection toast once per session, not on every reconnect
        if (!this.connectionShownOnce) {
          toast.success('Real-time updates connected', {
            icon: '🔗',
            duration: 2000
          });
          this.connectionShownOnce = true;
        }

        this.startHeartbeat();
        this.notifyStateSubscribers();
        setTimeout(() => this.processMessageQueue(), 100);
      };

      socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (this.config.enableMetrics) {
            this.metrics.totalMessagesReceived++;
          }

          // Handle pong for latency calculation
          if (message.type === 'pong' && message.data?.messageId) {
            const pingTime = this.pingTimes.get(message.data.messageId);
            if (pingTime && this.config.enableMetrics) {
              const latency = Date.now() - pingTime;
              this.pingTimes.delete(message.data.messageId);
              
              this.metrics.averageLatency = this.metrics.averageLatency === 0 
                ? latency 
                : (this.metrics.averageLatency * 0.8) + (latency * 0.2);
            }
          }

          this.notifyMessageSubscribers(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.clearTimeouts();
        this.isConnecting = false;
        this.isConnected = false;
        this.connectionState = 'disconnected';
        this.notifyStateSubscribers();

        // Handle different close codes
        switch (event.code) {
          case 1008: // Policy violation (auth failure)
            this.connectionError = 'Authentication failed';
            return; // Don't attempt to reconnect

          case 1000: // Normal closure
          case 1001: // Going away
            return; // Don't attempt to reconnect for normal closures

          default:
            if (!event.wasClean) {
              this.connectionError = 'Connection lost unexpectedly';
            }
        }

        // Attempt reconnection
        if (enabled && this.reconnectAttempts < this.config.maxReconnectAttempts) {
          const delay = Math.min(
            this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts),
            30000
          );

          this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectAttempts++;
            this.connect(user, enabled);
          }, delay);
        } else if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
          this.connectionError = 'Failed to reconnect after maximum attempts';
          this.connectionState = 'error';
          this.notifyStateSubscribers();
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        this.connectionError = 'Connection error occurred';
        this.connectionState = 'error';
        this.notifyStateSubscribers();
      };

    } catch (error) {
      this.isConnecting = false;
      console.error('Failed to create WebSocket connection:', error);
      this.connectionError = 'Failed to create connection';
      this.connectionState = 'error';
      this.notifyStateSubscribers();
    }
  }

  disconnect() {
    this.clearTimeouts();
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      } else {
        this.ws.close();
      }

      this.ws = null;
    }

    this.isConnected = false;
    this.connectionState = 'disconnected';
    this.connectionError = null;
    this.notifyStateSubscribers();
  }

  sendMessage(message: any, priority: 'low' | 'normal' | 'high' = 'normal') {
    const messageToSend: WebSocketMessage = {
      ...message,
      timestamp: new Date().toISOString(),
      messageId: `msg_${Date.now()}_${Math.random()}`,
      priority
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(messageToSend));
        if (this.config.enableMetrics) {
          this.metrics.totalMessagesSent++;
        }
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        if (this.config.enableMessageQueue && this.messageQueue.length < this.config.maxQueueSize) {
          this.messageQueue.push(messageToSend);
        }
      }
    } else {
      if (this.config.enableMessageQueue && this.messageQueue.length < this.config.maxQueueSize) {
        this.messageQueue.push(messageToSend);
      }
    }
  }

  forceReconnect(user: any) {
    this.reconnectAttempts = 0;
    this.disconnect();
    setTimeout(() => this.connect(user, true), 1000);
  }
}

// Fixed: Now properly uses the config parameter
const useWebSocket = (
  onMessage?: (data: any) => void,
  enabled: boolean = true,
  config: WebSocketConfig = {} // Fixed: Now properly used
) => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, initialized } = useSelector((state: RootState) => state.auth);
  
  // Get singleton instance and apply config
  const wsManager = useMemo(() => {
    const manager = GlobalWebSocketManager.getInstance();
    // Apply config if provided
    if (Object.keys(config).length > 0) {
      manager.updateConfig(config);
    }
    return manager;
  }, []); // Don't include config in deps to avoid recreation

  // Update config when it changes
  useEffect(() => {
    if (Object.keys(config).length > 0) {
      wsManager.updateConfig(config);
    }
  }, [config, wsManager]);

  const [state, setState] = useState(() => wsManager.getState());

  // Keep callback stable
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribeState = wsManager.subscribeToState(() => {
      setState(wsManager.getState());
    });

    return unsubscribeState;
  }, [wsManager]);

  // Handle WebSocket messages - YOUR EXISTING MESSAGE HANDLING LOGIC
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Verify message is for current user (security check)
    if (message.userId && user?.id && message.userId !== user.id) {
      console.warn('Received message for different user - ignoring');
      return;
    }

    switch (message.type) {
      case 'connection_established':
        break;

      case 'pong':
        break;

      case 'sms_received':
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'received',
          code: message.data.code,
          smsText: message.data.smsText
        }));
        
        const duration = message.priority === 'high' ? 8000 : 6000;
        toast.success(`SMS received: ${message.data.code}`, { duration });
        break;

      case 'number_purchased':
        dispatch(addNewPurchase(message.data));
        toast.success('Number purchased successfully!', {
          icon: '🎉',
          duration: 4000
        });
        
        // Show pricing info if available
        if (message.data.pricing) {
          const { totalPrice } = message.data.pricing;
          setTimeout(() => {
            toast.success(`Total paid: $${totalPrice.toFixed(4)}`, {
              icon: '💰',
              duration: 3000
            });
          }, 1000);
        }
        break;

      case 'balance_updated':
        dispatch(updateStats({ balance: message.data.balance }));
        if (message.data.previousBalance !== undefined) {
          const diff = message.data.balance - message.data.previousBalance;
          if (diff > 0) {
            toast.success(`Balance increased by $${diff.toFixed(4)}`, {
              icon: '💰'
            });
          }
        }
        break;

      case 'number_expired':
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'expired'
        }));
        toast.error(`Number ${message.data.phoneNumber} expired`, {
          duration: 5000
        });
        break;

      case 'sms_webhook_update':
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: message.data.status,
          code: message.data.code,
          smsText: message.data.smsText
        }));
        break;

      case 'auth_error':
        console.error('WebSocket authentication error:', message.data);
        break;

      case 'error':
        console.error('WebSocket server error:', message.data);
        toast.error(message.data.message || 'Server error occurred');
        break;

      case 'system_status':
        break;

      case 'rate_limit_warning':
        toastWarning('Rate limit approaching - slowing down requests');
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }

    // Call user-provided callback
    onMessageRef.current?.(message);
  }, [dispatch, user?.id]);

  // Subscribe to messages
  useEffect(() => {
    const unsubscribeMessages = wsManager.subscribe(handleMessage);
    return unsubscribeMessages;
  }, [wsManager, handleMessage]);

  // Main connection management - Only connect if not already connected
  useEffect(() => {
    if (enabled && isAuthenticated && initialized && user) {
      wsManager.connect(user, true);
    }
    // Don't disconnect on unmount - let the singleton manage its lifecycle
  }, [enabled, isAuthenticated, initialized, user?.id, wsManager]);

  // Cleanup function for individual hook instances
  useEffect(() => {
    return () => {
      // Individual hooks don't disconnect the shared connection
      // The singleton manages its own lifecycle
    };
  }, []);

  const sendMessage = useCallback((message: any, priority: 'low' | 'normal' | 'high' = 'normal') => {
    wsManager.sendMessage(message, priority);
  }, [wsManager]);

  const forceReconnect = useCallback(() => {
    wsManager.forceReconnect(user);
  }, [wsManager, user]);

  return useMemo(() => ({
    isConnected: state.isConnected,
    connectionState: state.connectionState,
    connectionError: state.connectionError,
    reconnectAttempts: state.reconnectAttempts,
    maxReconnectAttempts: state.maxReconnectAttempts,
    connect: () => wsManager.connect(user, true),
    disconnect: () => {}, // Don't allow individual hooks to disconnect shared connection
    sendMessage,
    forceReconnect,
    isReady: state.isConnected && state.connectionState === 'connected',
    isConnecting: state.connectionState === 'connecting',
    hasError: Boolean(state.connectionError),
    metrics: state.metrics
  }), [state, wsManager, user, sendMessage, forceReconnect]);
};

export default useWebSocket;