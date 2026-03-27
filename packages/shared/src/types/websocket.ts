// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - WebSocket Mocking Types
// ──────────────────────────────────────────────────────────────────────────────

/** WebSocket message direction */
export type WsDirection = "client" | "server";

/** WebSocket message type */
export interface WsMessage {
  direction: WsDirection;
  type: "text" | "binary";
  data: string | Buffer;
  timestamp: number;
}

/** WebSocket connection state */
export type WsConnectionState = "connecting" | "open" | "closing" | "closed";

/** WebSocket handler definition */
export interface WsHandler {
  /** URL pattern to match (glob or regex string) */
  url: string | RegExp;
  /** Handler for connection open */
  onConnection?: (conn: WsConnection) => void | Promise<void>;
  /** Handler for incoming messages */
  onMessage?: (conn: WsConnection, message: WsMessage) => void | Promise<void>;
  /** Handler for connection close */
  onClose?: (conn: WsConnection, code: number, reason: string) => void;
  /** Handler for errors */
  onError?: (conn: WsConnection, error: Error) => void;
}

/** WebSocket connection interface for mocking */
export interface WsConnection {
  /** Connection URL */
  url: string;
  /** Connection state */
  state: WsConnectionState;
  /** Send a message to the client */
  send: (data: string | Buffer) => void;
  /** Close the connection */
  close: (code?: number, reason?: string) => void;
  /** Broadcast to all connections on same URL */
  broadcast: (data: string | Buffer) => void;
  /** Connection metadata */
  metadata: Record<string, unknown>;
}

/** WebSocket mock configuration */
export interface WsMockConfig {
  /** Handlers for WebSocket connections */
  handlers: WsHandler[];
  /** What to do with unhandled connections */
  onUnhandledConnection?: "passthrough" | "reject" | "silent";
  /** Callback for unhandled messages */
  onUnhandledMessage?: (url: string, message: WsMessage) => void;
  /** Enable message recording */
  recordMessages?: boolean;
}

/** Recorded WebSocket interaction */
export interface WsRecording {
  url: string;
  messages: WsMessage[];
  connectionTime: number;
  disconnectTime?: number;
  duration?: number;
}
