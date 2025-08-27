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
      window.clearInterval(heartbeatTimeoutRef.current);
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
      token: tokenManager.getAccessToken() as string,
      userId: String(user.id)
    });

    return `${wsUrl}?${params.toString()}`;
  }, [user?.id]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.userId && user?.id && message.userId !== user.id) {
      console.warn('Received message for different user - ignoring');
      return;
    }

    console.log('WebSocket message:', message.type, message.data);

    switch (message.type) {
      case 'connection_established':
        console.log('WebSocket connection established');
        toast.success('Real-time updates connected', { icon: '🔗', duration: 2000 });
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
        toast.success('Number purchased successfully!', { icon: '🎉', duration: 4000 });
        break;
      case 'balance_updated':
        dispatch(updateStats({ balance: message.data.balance }));
        if (message.data.previousBalance !== undefined) {
          const diff = message.data.balance - message.data.previousBalance;
          if (diff > 0) {
            toast.success(`Balance increased by $${diff.toFixed(4)}`, { icon: '💰' });
          }
        }
        break;
      case 'number_expired':
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'expired'
        }));
        toast.error(`Number ${message.data.phoneNumber} expired`, { duration: 5000 });
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
        // heartbeat
        break;
      case 'auth_error':
        console.error('WebSocket authentication error:', message.data);
        setConnectionError('Authentication failed');
        break;
      case 'error':
        console.error('WebSocket server error:', message.data);
        toast.error(message.data.message || 'Server error occurred');
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }

    onMessageRef.current?.(message);
  }, [dispatch, user?.id]);
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

      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close(1000, 'Client disconnect');
        } else {
          wsRef.current.close();
        }
      } catch (e) {
        // ignore close errors
      }

      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionState('disconnected');
    setConnectionError(null);
  }, [clearTimeouts]);

  // Attempt connection but ensure token is available (refresh if needed)
  const connect = useCallback(() => {
    if (!enabled) return;
    if (isConnecting.current || wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting or connected');
      return;
    }
    if (!initialized || !isAuthenticated || !user) {
      // ensure disconnected if not ready
      disconnect();
      return;
    }

    // Use an async IIFE so we do not make the callback itself async
    (async () => {
      isConnecting.current = true;
      setConnectionState('connecting');
      setConnectionError(null);

      // Try to get token from memory; if missing, attempt refresh via httpOnly cookie
      let accessToken = tokenManager.getAccessToken();
      if (!accessToken) {
        try {
          accessToken = await tokenManager.refreshToken(); // this sets tokenManager internally on success
          console.log('[useWebSocket] refreshToken result ->', !!accessToken);
        } catch (err) {
          accessToken = null;
        }
      }

      if (!accessToken) {
        console.error('WebSocket: no access token available for connection');
        isConnecting.current = false;
        setConnectionState('error');
        setConnectionError('Cannot construct WebSocket URL');
        return;
      }

      const wsUrl = getWebSocketUrl();
      if (!wsUrl) {
        console.error('WebSocket: getWebSocketUrl returned null after refresh');
        isConnecting.current = false;
        setConnectionState('error');
        setConnectionError('Cannot construct WebSocket URL');
        return;
      }

      // Prevent multiple concurrent connections
      if (wsRef.current?.readyState === WebSocket.CONNECTING ||
        wsRef.current?.readyState === WebSocket.OPEN) {
        isConnecting.current = false;
        return;
      }

      console.log('Connecting to WebSocket:', wsUrl.replace(/token=[^&]+/, 'token=***'));

      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

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

          switch (event.code) {
            case 1008:
              setConnectionError('Authentication failed');
              console.error('WebSocket authentication failed');
              return;
            case 1011:
              setConnectionError('Server error occurred');
              break;
            case 1000:
            case 1001:
              console.log('WebSocket closed normally');
              return;
            default:
              if (!event.wasClean) {
                setConnectionError('Connection lost unexpectedly');
              }
          }

          // Reconnect logic with backoff
          if (enabled && isAuthenticated && reconnectAttempts.current < wsConfig.maxReconnectAttempts) {
            const delay = Math.min(
              wsConfig.reconnectInterval * Math.pow(2, reconnectAttempts.current),
              30000
            );
            console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${wsConfig.maxReconnectAttempts})`);
            reconnectTimeoutRef.current = window.setTimeout(() => {
              if (!isConnecting.current && wsRef.current?.readyState !== WebSocket.OPEN) {
                reconnectAttempts.current++;
                connect();
              }
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
    })();
    // NOTE: include disconnect so we can call it inside connect above
  }, [enabled, initialized, isAuthenticated, user, getWebSocketUrl, handleMessage, startHeartbeat, clearTimeouts, wsConfig, disconnect]);



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
    setTimeout(() => connect(), 1000);
  }, [disconnect, connect]);

  // Try to connect when preconditions are met
  // Use a ref to track whether we've already connected
  const didConnectRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    if (isAuthenticated && initialized && user) {
      if (!didConnectRef.current) {
        connect();
        didConnectRef.current = true;
      }
    } else if (wsRef.current) {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, isAuthenticated, initialized, user?.id]);



  // Listen for token updates so we can (re)connect when token becomes available
  useEffect(() => {
    let timeout: number;
    const onTokenUpdated = () => {
      if (enabled && isAuthenticated && initialized && user && wsRef.current?.readyState !== WebSocket.OPEN) {
        clearTimeout(timeout);
        timeout = window.setTimeout(() => connect(), 500); // 500ms debounce
      }
    };
    window.addEventListener('auth:tokenUpdated', onTokenUpdated as EventListener);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('auth:tokenUpdated', onTokenUpdated as EventListener);
    };
  }, [enabled, isAuthenticated, initialized, user?.id, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionError,
    isConnected,
    connectionState,
    reconnectAttempts: reconnectAttempts.current,
    maxReconnectAttempts: wsConfig.maxReconnectAttempts,

    //Actions
    connect,
    disconnect,
    sendMessage,
    forceReconnect,

    // Status flags
    isReady: isConnected && connectionState === 'connected',
    isConnecting: connectionState === 'connecting',
    hasError: Boolean(connectionError),
  };
};

export default useWebSocket;
