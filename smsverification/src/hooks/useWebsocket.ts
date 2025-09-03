// src/hooks/useWebSocket.ts - Enhanced with additional security and performance features
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
  messageId?: string; // NEW: For message deduplication
  priority?: 'low' | 'normal' | 'high'; // NEW: Message priority
}

interface WebSocketConfig {
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  enableMessageQueue?: boolean; // NEW: Queue messages when disconnected
  maxQueueSize?: number; // NEW: Limit queued messages
  enableDeduplication?: boolean; // NEW: Prevent duplicate messages
  enableCompression?: boolean; // NEW: Message compression
  enableMetrics?: boolean; // NEW: Connection metrics
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
  enableCompression: false,
  enableMetrics: true
};

const useWebSocket = (
  onMessage?: (data: any) => void,
  enabled: boolean = true,
  config: WebSocketConfig = {}
) => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, initialized } = useSelector((state: RootState) => state.auth);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | undefined>(undefined);
  const heartbeatTimeoutRef = useRef<number | undefined>(undefined);
  const reconnectAttempts = useRef<number>(0);
  const isConnecting = useRef<boolean>(false);

  // NEW: Enhanced state management
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  // NEW: Message queue for offline messages
  const messageQueue = useRef<WebSocketMessage[]>([]);
  
  // NEW: Message deduplication
  const processedMessages = useRef<Set<string>>(new Set());
  const messageCleanupInterval = useRef<number | undefined>(undefined);
  
  // NEW: Connection metrics
  const [metrics, setMetrics] = useState<ConnectionMetrics>({
    connectTime: null,
    totalReconnects: 0,
    totalMessagesSent: 0,
    totalMessagesReceived: 0,
    averageLatency: 0,
    lastPingTime: null
  });
  
  // NEW: Latency tracking
  const pingTimes = useRef<Map<string, number>>(new Map());

  const wsConfig = { ...DEFAULT_CONFIG, ...config };

  // Keep callback stable
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // NEW: Message deduplication cleanup
  useEffect(() => {
    if (wsConfig.enableDeduplication) {
      messageCleanupInterval.current = window.setInterval(() => {
        // Clean up old message IDs (keep last 1000)
        if (processedMessages.current.size > 1000) {
          const messages = Array.from(processedMessages.current);
          processedMessages.current = new Set(messages.slice(-500));
        }
      }, 300000); // Clean every 5 minutes

      return () => {
        if (messageCleanupInterval.current) {
          window.clearInterval(messageCleanupInterval.current);
        }
      };
    }
  }, [wsConfig.enableDeduplication]);

  const clearTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current !== undefined) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    if (heartbeatTimeoutRef.current !== undefined) {
      window.clearInterval(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = undefined;
    }
  }, []);

  // NEW: Enhanced heartbeat with latency tracking
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current !== undefined) {
      window.clearInterval(heartbeatTimeoutRef.current);
    }

    heartbeatTimeoutRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          const pingId = `ping_${Date.now()}_${Math.random()}`;
          const pingTime = Date.now();
          
          if (wsConfig.enableMetrics) {
            pingTimes.current.set(pingId, pingTime);
          }

          wsRef.current.send(JSON.stringify({
            type: 'ping',
            messageId: pingId,
            timestamp: new Date().toISOString()
          }));

          setMetrics(prev => ({ ...prev, lastPingTime: pingTime }));
        } catch (error) {
          console.warn('Failed to send heartbeat:', error);
        }
      }
    }, wsConfig.heartbeatInterval);
  }, [wsConfig.heartbeatInterval, wsConfig.enableMetrics]);

  // NEW: Process message queue when connected
  const processMessageQueue = useCallback(() => {
    if (!wsConfig.enableMessageQueue || messageQueue.current.length === 0) return;
    
    console.log(`Processing ${messageQueue.current.length} queued messages`);
    
    const messages = [...messageQueue.current];
    messageQueue.current = [];
    
    messages.forEach(message => {
      try {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(message));
          setMetrics(prev => ({
            ...prev,
            totalMessagesSent: prev.totalMessagesSent + 1
          }));
        }
      } catch (error) {
        console.error('Failed to send queued message:', error);
        // Re-queue the message if it failed
        if (messageQueue.current.length < wsConfig.maxQueueSize) {
          messageQueue.current.push(message);
        }
      }
    });
  }, [wsConfig.enableMessageQueue, wsConfig.maxQueueSize]);

  const getWebSocketUrl = useCallback((): string | null => {
    if (!user?.id) {
      console.error("WebSocket: Missing user.id");
      return null;
    }

    const accessToken = tokenManager.getAccessToken();
    if (!accessToken) {
      console.error("WebSocket: Missing access token");
      return null;
    }

    // Determine environment and construct URL
    const isProduction = !window.location.host.includes('localhost') &&
      !window.location.host.includes('127.0.0.1');

    let wsUrl: string;

    if (isProduction) {
      const serverUrl = import.meta.env.VITE_RENDER_SERVER_URL ||
        import.meta.env.VITE_API_BASE_URL

      if (!serverUrl) {
        console.error('Production server URL not configured');
        return null;
      }

      const cleanUrl = serverUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
      const protocol = serverUrl.includes('https') ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${cleanUrl}/ws`;
    } else {
      // Development
      const wsPort = import.meta.env.VITE_WS_PORT || '5000';
      wsUrl = `ws://localhost:${wsPort}/ws`;
    }

    // Add authentication parameters
    const params = new URLSearchParams({
      token: accessToken,
      userId: String(user.id),
      // NEW: Add client capabilities
      compression: wsConfig.enableCompression.toString(),
      version: '2.0' // NEW: Protocol version
    });

    return `${wsUrl}?${params.toString()}`;
  }, [user?.id, wsConfig.enableCompression]);

  // NEW: Enhanced message handling with deduplication and priority
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Update metrics
    if (wsConfig.enableMetrics) {
      setMetrics(prev => ({
        ...prev,
        totalMessagesReceived: prev.totalMessagesReceived + 1
      }));
    }

    // NEW: Message deduplication
    if (wsConfig.enableDeduplication && message.messageId) {
      if (processedMessages.current.has(message.messageId)) {
        console.log('Duplicate message ignored:', message.messageId);
        return;
      }
      processedMessages.current.add(message.messageId);
    }

    // Verify message is for current user (security check)
    if (message.userId && user?.id && message.userId !== user.id) {
      console.warn('Received message for different user - ignoring');
      return;
    }

    console.log('WebSocket message:', message.type, message.data);

    switch (message.type) {
      case 'connection_established':
        console.log('WebSocket connection established');
        setMetrics(prev => ({ ...prev, connectTime: Date.now() }));
        toast.success('Real-time updates connected', {
          icon: '🔗',
          duration: 2000
        });
        // NEW: Process queued messages after connection
        setTimeout(processMessageQueue, 100);
        break;

      case 'pong':
        // NEW: Enhanced latency calculation
        if (wsConfig.enableMetrics && message.data?.messageId) {
          const pingTime = pingTimes.current.get(message.data.messageId);
          if (pingTime) {
            const latency = Date.now() - pingTime;
            pingTimes.current.delete(message.data.messageId);
            
            setMetrics(prev => ({
              ...prev,
              averageLatency: prev.averageLatency === 0 
                ? latency 
                : (prev.averageLatency * 0.8) + (latency * 0.2) // Exponential moving average
            }));
          }
        }
        break;

      case 'sms_received':
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'received',
          code: message.data.code,
          smsText: message.data.smsText
        }));
        
        // NEW: Priority-based notifications
        const duration = message.priority === 'high' ? 8000 : 6000;
        toast.success(`SMS received: ${message.data.code}`, { duration });
        break;

      case 'number_purchased':
        dispatch(addNewPurchase(message.data));
        toast.success('Number purchased successfully!', {
          icon: '🎉',
          duration: 4000
        });
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
        setConnectionError('Authentication failed');
        break;

      case 'error':
        console.error('WebSocket server error:', message.data);
        toast.error(message.data.message || 'Server error occurred');
        break;

      // NEW: System health messages
      case 'system_status':
        console.log('System status update:', message.data);
        break;

      case 'rate_limit_warning':
        toastWarning('Rate limit approaching - slowing down requests');
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }

    // Call user-provided callback
    onMessageRef.current?.(message);
  }, [dispatch, user?.id, processMessageQueue, wsConfig.enableDeduplication, wsConfig.enableMetrics]);

  const connect = useCallback(() => {
    // Check preconditions
    if (!enabled || isConnecting.current) return;
    if (!initialized || !isAuthenticated || !user) return;

    const wsUrl = getWebSocketUrl();
    if (!wsUrl) {
      setConnectionError('Cannot construct WebSocket URL');
      return;
    }

    // Prevent multiple concurrent connections
    if (wsRef.current?.readyState === WebSocket.CONNECTING ||
      wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnecting.current = true;
    setConnectionState('connecting');
    setConnectionError(null);

    console.log('Connecting to WebSocket:', wsUrl.replace(/token=[^&]+/, 'token=***'));

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      // Connection timeout
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.error('WebSocket connection timeout');
          socket.close();
          setConnectionError('Connection timeout');
          setConnectionState('error');
        }
      }, wsConfig.connectionTimeout);

      socket.onopen = () => {
        clearTimeout(connectionTimeout);
        isConnecting.current = false;
        reconnectAttempts.current = 0;

        setIsConnected(true);
        setConnectionState('connected');
        setConnectionError(null);

        // NEW: Update reconnect metrics
        if (wsConfig.enableMetrics && reconnectAttempts.current > 0) {
          setMetrics(prev => ({
            ...prev,
            totalReconnects: prev.totalReconnects + 1
          }));
        }

        startHeartbeat();
        console.log('WebSocket connected successfully');
      };

      socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        clearTimeouts();
        isConnecting.current = false;

        setIsConnected(false);
        setConnectionState('disconnected');

        console.log(`WebSocket closed: ${event.code} - ${event.reason}`);

        // Handle different close codes
        switch (event.code) {
          case 1008: // Policy violation (auth failure)
            setConnectionError('Authentication failed');
            console.error('WebSocket authentication failed');
            return; // Don't attempt to reconnect

          case 1011: // Server error
            setConnectionError('Server error occurred');
            break;

          case 1000: // Normal closure
          case 1001: // Going away
            console.log('WebSocket closed normally');
            return; // Don't attempt to reconnect for normal closures

          default:
            if (!event.wasClean) {
              setConnectionError('Connection lost unexpectedly');
            }
        }

        // Attempt reconnection with exponential backoff
        if (enabled && isAuthenticated &&
          reconnectAttempts.current < wsConfig.maxReconnectAttempts) {

          const delay = Math.min(
            wsConfig.reconnectInterval * Math.pow(2, reconnectAttempts.current),
            30000
          );

          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${wsConfig.maxReconnectAttempts})`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= wsConfig.maxReconnectAttempts) {
          setConnectionError('Failed to reconnect after maximum attempts');
          setConnectionState('error');
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnecting.current = false;
        setConnectionError('Connection error occurred');
        setConnectionState('error');
      };

    } catch (error) {
      isConnecting.current = false;
      console.error('Failed to create WebSocket connection:', error);
      setConnectionError('Failed to create connection');
      setConnectionState('error');
    }
  }, [enabled, initialized, isAuthenticated, user, getWebSocketUrl, handleMessage, startHeartbeat, clearTimeouts, wsConfig]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket...');

    clearTimeouts();
    isConnecting.current = false;
    reconnectAttempts.current = 0;

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;

      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Client disconnect');
      } else {
        wsRef.current.close();
      }

      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionState('disconnected');
    setConnectionError(null);
  }, [clearTimeouts]);

  // NEW: Enhanced sendMessage with queueing and priority
  const sendMessage = useCallback((message: any, priority: 'low' | 'normal' | 'high' = 'normal') => {
    const messageToSend: WebSocketMessage = {
      ...message,
      timestamp: new Date().toISOString(),
      userId: user?.id,
      messageId: `msg_${Date.now()}_${Math.random()}`,
      priority
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(messageToSend));
        console.log('WebSocket message sent:', messageToSend.type);
        
        if (wsConfig.enableMetrics) {
          setMetrics(prev => ({
            ...prev,
            totalMessagesSent: prev.totalMessagesSent + 1
          }));
        }
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        
        // NEW: Queue message if sending fails and queueing is enabled
        if (wsConfig.enableMessageQueue && messageQueue.current.length < wsConfig.maxQueueSize) {
          messageQueue.current.push(messageToSend);
          console.log('Message queued for retry');
        }
      }
    } else {
      // NEW: Queue message when not connected
      if (wsConfig.enableMessageQueue && messageQueue.current.length < wsConfig.maxQueueSize) {
        messageQueue.current.push(messageToSend);
        console.log('Message queued - WebSocket not connected');
      } else {
        console.warn('Cannot send message - WebSocket not connected and queue disabled/full');
      }
    }
  }, [user?.id, wsConfig.enableMessageQueue, wsConfig.maxQueueSize, wsConfig.enableMetrics]);

  const forceReconnect = useCallback(() => {
    console.log('Forcing WebSocket reconnection...');
    reconnectAttempts.current = 0;
    disconnect();
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

  // NEW: Clear message queue
  const clearMessageQueue = useCallback(() => {
    messageQueue.current = [];
    console.log('Message queue cleared');
  }, []);

  // NEW: Get connection health info
  const getConnectionHealth = useCallback(() => {
    return {
      isHealthy: isConnected && connectionState === 'connected' && !connectionError,
      latency: metrics.averageLatency,
      uptime: metrics.connectTime ? Date.now() - metrics.connectTime : 0,
      messagesSent: metrics.totalMessagesSent,
      messagesReceived: metrics.totalMessagesReceived,
      reconnectCount: metrics.totalReconnects,
      queuedMessages: messageQueue.current.length
    };
  }, [isConnected, connectionState, connectionError, metrics]);

  // Main connection effect
  useEffect(() => {
    if (enabled && isAuthenticated && initialized && user) {
      connect();
    } else {
      disconnect();
    }

    return disconnect;
  }, [enabled, isAuthenticated, initialized, user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (messageCleanupInterval.current) {
        window.clearInterval(messageCleanupInterval.current);
      }
      disconnect();
    };
  }, [disconnect]);

  // NEW: Memoized return object to prevent unnecessary re-renders
  return useMemo(() => ({
    // Connection state
    isConnected,
    connectionState,
    connectionError,
    reconnectAttempts: reconnectAttempts.current,
    maxReconnectAttempts: wsConfig.maxReconnectAttempts,

    // Actions
    connect,
    disconnect,
    sendMessage,
    forceReconnect,
    clearMessageQueue, // NEW

    // Status helpers
    isReady: isConnected && connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    hasError: Boolean(connectionError),

    // NEW: Enhanced features
    metrics,
    getConnectionHealth,
    queueSize: messageQueue.current.length,
    
    // NEW: Configuration
    config: wsConfig
  }), [
    isConnected,
    connectionState, 
    connectionError,
    wsConfig.maxReconnectAttempts,
    connect,
    disconnect,
    sendMessage,
    forceReconnect,
    clearMessageQueue,
    metrics,
    getConnectionHealth,
    wsConfig
  ]);
};

export default useWebSocket;