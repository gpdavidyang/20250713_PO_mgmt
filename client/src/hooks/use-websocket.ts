import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WorkflowEvent } from '../../../server/services/websocket-service';

export interface WebSocketNotification {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  data?: any;
  timestamp: Date;
}

export interface UseWebSocketOptions {
  userId?: string;
  enabled?: boolean;
  onWorkflowEvent?: (event: WorkflowEvent) => void;
  onNotification?: (notification: WebSocketNotification) => void;
  onMessage?: (event: MessageEvent) => void;
}

export interface WebSocketState {
  connected: boolean;
  authenticated: boolean;
  connecting: boolean;
  error: string | null;
  lastMessage?: any;
}

export function useWebSocket({
  userId,
  enabled = true,
  onWorkflowEvent,
  onNotification,
  onMessage
}: UseWebSocketOptions = {}) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    authenticated: false,
    connecting: false,
    error: null,
    lastMessage: null
  });

  // Track subscribed orders
  const subscribedOrders = useRef(new Set<number>());

  const connect = useCallback(() => {
    if (!enabled || !userId || socketRef.current?.connected) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    // Only connect in development (Vercel doesn't support WebSockets)
    const isDevelopment = window.location.hostname === 'localhost';
    if (!isDevelopment) {
      console.log('⚡ WebSocket disabled in production (Vercel limitations)');
      setState(prev => ({ 
        ...prev, 
        connecting: false, 
        error: 'WebSocket not available in production' 
      }));
      return;
    }

    const socket = io({
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected');
      setState(prev => ({ 
        ...prev, 
        connected: true, 
        connecting: false, 
        error: null 
      }));

      // Authenticate with user ID
      if (userId) {
        socket.emit('authenticate', { userId });
      }
    });

    socket.on('authenticated', (data: { success: boolean; user: any }) => {
      console.log('✅ WebSocket authenticated', data.user);
      setState(prev => ({ ...prev, authenticated: true }));
    });

    socket.on('authentication_error', (data: { error: string }) => {
      console.error('❌ WebSocket authentication failed:', data.error);
      setState(prev => ({ 
        ...prev, 
        authenticated: false, 
        error: data.error 
      }));
    });

    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        authenticated: false 
      }));
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
      setState(prev => ({ 
        ...prev, 
        connecting: false, 
        error: error.message 
      }));
    });

    socket.on('workflow_event', (event: WorkflowEvent) => {
      console.log('📢 Workflow event received:', event);
      onWorkflowEvent?.(event);
    });

    socket.on('notification', (notification: Omit<WebSocketNotification, 'timestamp'>) => {
      const fullNotification: WebSocketNotification = {
        ...notification,
        timestamp: new Date()
      };
      console.log('🔔 Notification received:', fullNotification);
      onNotification?.(fullNotification);
    });

    // Excel upload specific events
    socket.on('validation:started', (data: any) => {
      console.log('📊 Validation started:', data);
      const message = { type: 'validation:started', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('validation:progress', (data: any) => {
      console.log('📊 Validation progress:', data);
      const message = { type: 'validation:progress', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('validation:completed', (data: any) => {
      console.log('📊 Validation completed:', data);
      const message = { type: 'validation:completed', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('validation:error', (data: any) => {
      console.log('📊 Validation error:', data);
      const message = { type: 'validation:error', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('validation:updated', (data: any) => {
      console.log('📊 Validation updated:', data);
      const message = { type: 'validation:updated', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('ai:suggestions', (data: any) => {
      console.log('🤖 AI suggestions:', data);
      const message = { type: 'ai:suggestions', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('session:finalized', (data: any) => {
      console.log('✅ Session finalized:', data);
      const message = { type: 'session:finalized', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

    socket.on('session:cancelled', (data: any) => {
      console.log('❌ Session cancelled:', data);
      const message = { type: 'session:cancelled', ...data };
      setState(prev => ({ ...prev, lastMessage: message }));
      onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    });

  }, [enabled, userId, onWorkflowEvent, onNotification, onMessage]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState({
      connected: false,
      authenticated: false,
      connecting: false,
      error: null
    });
    subscribedOrders.current.clear();
  }, []);

  // Subscribe to order updates
  const subscribeToOrder = useCallback((orderId: number) => {
    if (socketRef.current?.connected && !subscribedOrders.current.has(orderId)) {
      socketRef.current.emit('subscribe_order', orderId);
      subscribedOrders.current.add(orderId);
      console.log(`📋 Subscribed to order ${orderId}`);
    }
  }, []);

  // Unsubscribe from order updates
  const unsubscribeFromOrder = useCallback((orderId: number) => {
    if (socketRef.current?.connected && subscribedOrders.current.has(orderId)) {
      socketRef.current.emit('unsubscribe_order', orderId);
      subscribedOrders.current.delete(orderId);
      console.log(`📋 Unsubscribed from order ${orderId}`);
    }
  }, []);

  // Auto-connect when userId is available
  useEffect(() => {
    if (userId && enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [userId, enabled, connect, disconnect]);

  return {
    ...state,
    isConnected: state.connected,
    lastMessage: state.lastMessage,
    connect,
    disconnect,
    subscribeToOrder,
    unsubscribeFromOrder,
    socket: socketRef.current
  };
}