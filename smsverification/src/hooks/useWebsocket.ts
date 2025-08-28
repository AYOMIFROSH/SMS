// src/hooks/useWebSocket.ts - Secure WebSocket with proper session handling
import { useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { updateNumberStatus, addNewPurchase } from '@/store/slices/numbersSlice';
import { updateStats } from '@/store/slices/dashboardSlice';
import { tokenManager } from '@/api/client';
import toast from 'react-hot-toast';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
  userId?: number;
}

interface WebSocketConfig {
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
}

const DEFAULT_CONFIG: Required<WebSocketConfig> = {
  maxReconnectAttempts: 5,
  reconnectInterval: 3000,
  heartbeatInterval: 30000,
  connectionTimeout: 10000
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

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  const wsConfig = { ...DEFAULT_CONFIG, ...config };
  

  // Keep callback stable
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current !== undefined) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    if (heartbeatTimeoutRef.current !== undefined) {
      window.clearInterval(heartbeatTimeoutRef.current); // <- use clearInterval
      heartbeatTimeoutRef.current = undefined;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current !== undefined) {
      window.clearInterval(heartbeatTimeoutRef.current);
    }

    heartbeatTimeoutRef.current = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.warn('Failed to send heartbeat:', error);
        }
      }
    }, wsConfig.heartbeatInterval);
  }, [wsConfig.heartbeatInterval]);

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
      userId: String(user.id)
    });

    return `${wsUrl}?${params.toString()}`;
  }, [user?.id]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Verify message is for current user (security check)
    if (message.userId && user?.id && message.userId !== user.id) {
      console.warn('Received message for different user - ignoring');
      return;
    }

    console.log('WebSocket message:', message.type, message.data);

    switch (message.type) {
      case 'connection_established':
        console.log('WebSocket connection established');
        toast.success('Real-time updates connected', {
          icon: '🔗',
          duration: 2000
        });
        break;

      case 'sms_received':
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'received',
          code: message.data.code,
          smsText: message.data.smsText
        }));
        toast.success(`SMS received: ${message.data.code}`, { duration: 6000 });
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

      case 'pong':
        // Heartbeat response - connection is alive
        break;

      case 'auth_error':
        console.error('WebSocket authentication error:', message.data);
        setConnectionError('Authentication failed');
        // Don't trigger app-wide logout for WebSocket auth errors
        break;

      case 'error':
        console.error('WebSocket server error:', message.data);
        toast.error(message.data.message || 'Server error occurred');
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }

    // Call user-provided callback
    onMessageRef.current?.(message);
  }, [dispatch, user?.id]);


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

        // Attempt reconnection if appropriate
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

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        const messageToSend = {
          ...message,
          timestamp: new Date().toISOString(),
          userId: user?.id
        };

        wsRef.current.send(JSON.stringify(messageToSend));
        console.log('WebSocket message sent:', messageToSend.type);
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
      }
    } else {
      console.warn('Cannot send message - WebSocket not connected');
    }
  }, [user?.id]);

  const forceReconnect = useCallback(() => {
    console.log('Forcing WebSocket reconnection...');
    reconnectAttempts.current = 0;
    disconnect();
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

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
      disconnect();
    };
  }, [disconnect]);

  return {
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

    // Status helpers
    isReady: isConnected && connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    hasError: Boolean(connectionError),
  };
};

export default useWebSocket;
