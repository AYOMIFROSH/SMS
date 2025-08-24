// src/hooks/useWebSocket.ts - Enhanced with better security and error handling
import { useEffect, useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { updateNumberStatus, addNewPurchase } from '@/store/slices/numbersSlice';
import { updateStats } from '@/store/slices/dashboardSlice';
import { tokenManager } from '@/api/client';
import toast from 'react-hot-toast';

type OnMessageCb = (data: any) => void;

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
  userId?: number;
}

/**
 * useWebSocket(onMessage?, enabled = true)
 * - onMessage: optional callback for user-land handling
 * - enabled: boolean, if false the hook will not open a connection (useful to defer until auth ready)
 */
const useWebSocket = (onMessage?: OnMessageCb, enabled = true) => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, initialized } = useSelector((state: RootState) => state.auth);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Keep callback in ref to avoid re-creating socket when the callback changes
  const onMessageRef = useRef<OnMessageCb | undefined>(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Connect logic (safe to call repeatedly; it guards against duplicate sockets)
  const connect = useCallback(() => {
    // Respect explicit enabled flag and that auth initialization is done
    if (!enabled) {
      console.log('❌ WebSocket: Disabled via "enabled" flag - skipping connection');
      return;
    }
    if (!initialized) {
      console.log('❌ WebSocket: Auth not initialized yet - skipping connection');
      return;
    }
    if (!isAuthenticated || !user) {
      console.log('❌ WebSocket: Not authenticated, skipping connection');
      return;
    }

    // Avoid creating multiple sockets if one is already open/connecting
    if (wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
         wsRef.current.readyState === WebSocket.CONNECTING)) {
      console.log('⚠️ WebSocket: Connection already exists');
      return;
    }

   const accessToken = tokenManager.getAccessToken();
if (!accessToken) {
  console.log('❌ WebSocket: No access token available');
  return;
}

    // Use secure WebSocket URL in production
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Remove port from host (if present) then attach configured WS port to avoid double-port issues
    const hostNoPort = window.location.host.replace(/:\d+$/, '');
    const wsPort = import.meta.env.VITE_WS_PORT || '5000';
    const wsUrl = `${protocol}//${hostNoPort}:${wsPort}/ws?token=${encodeURIComponent(accessToken)}&userId=${encodeURIComponent(String(user.id))}`;

    try {
      console.log('🔌 WebSocket: Attempting to connect...', { wsUrl });
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('✅ WebSocket: Connected successfully');
        reconnectAttempts.current = 0;
        setIsConnected(true);
        setConnectionError(null);

        // Send ping to verify connection
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          } catch (e) {
            console.warn('⚠️ WebSocket: Error sending ping', e);
          }
        }
      };

      socket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', message);

          // Verify message is for current user
          if (message.userId && message.userId !== user.id) {
            console.warn('⚠️ WebSocket: Received message for different user');
            return;
          }

          // Internal handling
          handleWebSocketMessage(message);

          // User-provided callback (if any)
          onMessageRef.current?.(message);
        } catch (error) {
          console.error('❌ WebSocket: Failed to parse message:', error);
        }
      };

      socket.onclose = (event) => {
        console.log(`🔌 WebSocket: Disconnected (code: ${event.code}, reason: ${event.reason})`);
        setIsConnected(false);

        // Handle authentication policy violation specially
        if (event.code === 1008) {
          setConnectionError('Authentication failed');
          console.error('❌ WebSocket: Authentication failed (1008)');
          // Emit a logout event so the app can react if needed
          window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason: 'ws_auth_failed' } }));
          return;
        }

        if (event.code === 1011) {
          setConnectionError('Server error occurred');
          console.error('❌ WebSocket: Server error (1011)');
        }

        // Reconnect with exponential backoff if allowed
        if (isAuthenticated && reconnectAttempts.current < maxReconnectAttempts) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 WebSocket: Reconnecting in ${timeout}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, timeout);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError('Failed to reconnect after maximum attempts');
          console.error('❌ WebSocket: Max reconnection attempts reached');
        }
      };

      socket.onerror = (err) => {
        console.error('❌ WebSocket error:', err);
        setConnectionError('Connection error occurred');
      };

      // Set a connection timeout to avoid hanging forever
      const connectionTimeout = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.error('❌ WebSocket: Connection timeout');
          try { socket.close(); } catch (e) { /* ignore */ }
          setConnectionError('Connection timeout');
        }
      }, 10000);

      socket.addEventListener('open', () => {
        window.clearTimeout(connectionTimeout);
      });
    } catch (error) {
      console.error('❌ WebSocket: Failed to create connection:', error);
      setIsConnected(false);
      setConnectionError('Failed to create connection');
    }
  }, [enabled, initialized, isAuthenticated, user]);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'connection_established':
        console.log('✅ WebSocket: Connection established');
        toast.success('Real-time updates connected', { icon: '🔗', duration: 2000 });
        break;

      case 'sms_received':
        console.log('📱 WebSocket: SMS received', message.data);
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'received',
          code: message.data.code,
          smsText: message.data.smsText
        }));
        toast.success(`SMS received: ${message.data.code}`, {
          duration: 6000
        });
        break;

      case 'number_purchased':
        console.log('🛒 WebSocket: Number purchased', message.data);
        dispatch(addNewPurchase(message.data));
        toast.success('Number purchased successfully!', { icon: '🎉', duration: 4000 });
        break;

      case 'balance_updated':
        console.log('💰 WebSocket: Balance updated', message.data);
        dispatch(updateStats({ balance: message.data.balance }));
        if (message.data.previousBalance !== undefined) {
          const diff = message.data.balance - message.data.previousBalance;
          if (diff > 0) {
            toast.success(`Balance increased by $${diff.toFixed(4)}`, { icon: '💰' });
          }
        }
        break;

      case 'number_expired':
        console.log('⏰ WebSocket: Number expired', message.data);
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: 'expired'
        }));
        toast.error(`Number ${message.data.phoneNumber} expired`, { duration: 5000 });
        break;

      case 'sms_webhook_update':
        console.log('🔄 WebSocket: SMS webhook update', message.data);
        dispatch(updateNumberStatus({
          activationId: message.data.activationId,
          status: message.data.status,
          code: message.data.code,
          smsText: message.data.smsText
        }));
        break;

      case 'pong':
        console.log('🏓 WebSocket: Pong received');
        break;

      case 'error':
        console.error('❌ WebSocket: Server error:', message.data);
        toast.error(message.data.message || 'Server error occurred');
        break;

      default:
        console.log('❓ WebSocket: Unknown message type:', message.type);
    }
  }, [dispatch]);

  const disconnect = useCallback(() => {
    console.log('🔌 WebSocket: Disconnecting...');
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      try {
        wsRef.current.close(1000, 'User disconnection');
      } catch (e) {
        console.warn('WebSocket close error:', e);
      }
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionError(null);
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const messageToSend = {
          ...message,
          timestamp: new Date().toISOString(),
          userId: user?.id
        };
        wsRef.current.send(JSON.stringify(messageToSend));
        console.log('📤 WebSocket: Message sent:', messageToSend);
      } catch (error) {
        console.error('❌ WebSocket: Failed to send message:', error);
      }
    } else {
      console.warn('⚠️ WebSocket: Cannot send message - not connected');
    }
  }, [user?.id]);

  // Setup connection/disconnection based on auth state & enabled flag
  useEffect(() => {
    if (enabled && isAuthenticated && initialized && user) {
      connect();
    } else {
      // If not enabled or not authenticated, ensure we are disconnected
      disconnect();
    }

    return () => {
      // ensure we clean up when dependencies change
      disconnect();
    };
  }, [enabled, isAuthenticated, initialized, user?.id, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    sendMessage,
    reconnectAttempts: reconnectAttempts.current,
    maxReconnectAttempts
  };
};

export default useWebSocket;
