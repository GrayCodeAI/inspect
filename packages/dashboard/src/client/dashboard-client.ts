// ──────────────────────────────────────────────────────────────────────────────
// @inspect/dashboard - Dashboard WebSocket Client
// Browser client for connecting to the dashboard WebSocket server
// ──────────────────────────────────────────────────────────────────────────────

import type { DashboardMessage } from "../types/index.js";

export interface DashboardClientConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnects?: number;
}

export interface DashboardClientInterface {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(sessionId: string): void;
  unsubscribe(sessionId: string): void;
  getHistory(): void;
  onMessage(handler: (message: DashboardMessage) => void): void;
  onConnect(handler: () => void): void;
  onDisconnect(handler: () => void): void;
  isConnected(): boolean;
}

export function createDashboardClient(config: DashboardClientConfig): DashboardClientInterface {
  let ws: WebSocket | null = null;
  let connected = false;
  let reconnectCount = 0;
  const messageHandlers: Array<(message: DashboardMessage) => void> = [];
  const connectHandlers: Array<() => void> = [];
  const disconnectHandlers: Array<() => void> = [];
  const subscribedSessions = new Set<string>();

  const reconnectInterval = config.reconnectInterval ?? 5000;
  const maxReconnects = config.maxReconnects ?? 10;

  const connect = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      ws = new WebSocket(config.url);

      ws.onopen = () => {
        connected = true;
        reconnectCount = 0;
        connectHandlers.forEach((h) => h());

        // Re-subscribe to previously subscribed sessions
        subscribedSessions.forEach((sessionId) => {
          ws?.send(JSON.stringify({ type: "subscribe", sessionId }));
        });

        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as DashboardMessage;
          messageHandlers.forEach((h) => h(message));
        } catch (error) {
          console.error("Failed to parse dashboard message:", error);
        }
      };

      ws.onclose = () => {
        connected = false;
        disconnectHandlers.forEach((h) => h());

        // Auto-reconnect
        if (reconnectCount < maxReconnects) {
          reconnectCount++;
          setTimeout(() => {
            console.log(`Reconnecting... (${reconnectCount}/${maxReconnects})`);
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        console.error("Dashboard WebSocket error:", error);
        reject(error);
      };
    });
  };

  const disconnect = (): void => {
    ws?.close();
    ws = null;
    connected = false;
  };

  const subscribe = (sessionId: string): void => {
    subscribedSessions.add(sessionId);
    if (connected && ws) {
      ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    }
  };

  const unsubscribe = (sessionId: string): void => {
    subscribedSessions.delete(sessionId);
    if (connected && ws) {
      ws.send(JSON.stringify({ type: "unsubscribe", sessionId }));
    }
  };

  const getHistory = (): void => {
    if (connected && ws) {
      ws.send(JSON.stringify({ type: "get:history" }));
    }
  };

  const onMessage = (handler: (message: DashboardMessage) => void): void => {
    messageHandlers.push(handler);
  };

  const onConnect = (handler: () => void): void => {
    connectHandlers.push(handler);
  };

  const onDisconnect = (handler: () => void): void => {
    disconnectHandlers.push(handler);
  };

  const isConnected = (): boolean => connected;

  return {
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    getHistory,
    onMessage,
    onConnect,
    onDisconnect,
    isConnected,
  };
}
