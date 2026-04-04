// ──────────────────────────────────────────────────────────────────────────────
// @inspect/quality - WebSocket Mock Handler (MSW-inspired)
// ──────────────────────────────────────────────────────────────────────────────

import type {
  WsHandler,
  WsConnection,
  WsConnectionState,
  WsMessage,
  WsMockConfig,
  WsRecording,
  WsDirection,
} from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/ws-mock");

/** WebSocket message handler function */
export type WsMessageHandlerFn = (conn: WsConnection, message: WsMessage) => void | Promise<void>;

/** Builder for WebSocket mock handlers */
export class WsMockBuilder {
  private config: WsMockConfig = {
    handlers: [],
    onUnhandledConnection: "silent",
    recordMessages: false,
  };

  /**
   * Add a handler for a WebSocket URL pattern.
   */
  on(url: string | RegExp): WsHandlerBuilder {
    return new WsHandlerBuilder(this, url);
  }

  /**
   * Add a handler directly.
   */
  addHandler(handler: WsHandler): this {
    this.config.handlers.push(handler);
    return this;
  }

  /**
   * Set unhandled connection behavior.
   */
  unhandled(behavior: "passthrough" | "reject" | "silent"): this {
    this.config.onUnhandledConnection = behavior;
    return this;
  }

  /**
   * Enable message recording.
   */
  record(): this {
    this.config.recordMessages = true;
    return this;
  }

  /**
   * Set callback for unhandled messages.
   */
  onUnhandled(cb: (url: string, message: WsMessage) => void): this {
    this.config.onUnhandledMessage = cb;
    return this;
  }

  build(): WsMockConfig {
    return { ...this.config };
  }
}

/**
 * Builder for a single WebSocket handler.
 */
export class WsHandlerBuilder {
  private parent: WsMockBuilder;
  private handler: WsHandler;

  constructor(parent: WsMockBuilder, url: string | RegExp) {
    this.parent = parent;
    this.handler = { url };
  }

  /**
   * Handle connection open.
   */
  onConnection(cb: (conn: WsConnection) => void | Promise<void>): this {
    this.handler.onConnection = cb;
    return this;
  }

  /**
   * Handle incoming messages.
   */
  onMessage(cb: (conn: WsConnection, message: WsMessage) => void | Promise<void>): this {
    this.handler.onMessage = cb;
    return this;
  }

  /**
   * Handle connection close.
   */
  onClose(cb: (conn: WsConnection, code: number, reason: string) => void): this {
    this.handler.onClose = cb;
    return this;
  }

  /**
   * Handle errors.
   */
  onError(cb: (conn: WsConnection, error: Error) => void): this {
    this.handler.onError = cb;
    return this;
  }

  /**
   * Finalize and return to parent builder.
   */
  done(): WsMockBuilder {
    this.parent.addHandler(this.handler);
    return this.parent;
  }
}

/**
 * Create a WebSocket mock configuration using a fluent API.
 *
 * Usage:
 * ```ts
 * const wsConfig = ws()
 *   .on("ws://localhost:8080/chat")
 *   .onConnection((conn) => conn.send("Welcome!"))
 *   .onMessage((conn, msg) => conn.broadcast(msg.data))
 *   .done()
 *   .record()
 *   .build();
 * ```
 */
export function ws(): WsMockBuilder {
  return new WsMockBuilder();
}

/**
 * WebSocket message matcher.
 */
export class WsMessageMatcher {
  /**
   * Match by message type (text/binary).
   */
  static byType(type: WsMessage["type"]): (msg: WsMessage) => boolean {
    return (msg) => msg.type === type;
  }

  /**
   * Match by text content (exact or contains).
   */
  static byContent(pattern: string | RegExp): (msg: WsMessage) => boolean {
    return (msg) => {
      if (msg.type !== "text") return false;
      const text = typeof msg.data === "string" ? msg.data : msg.data.toString();
      if (typeof pattern === "string") return text.includes(pattern);
      return pattern.test(text);
    };
  }

  /**
   * Match by JSON payload field.
   */
  static byJsonField(field: string, value: unknown): (msg: WsMessage) => boolean {
    return (msg) => {
      if (msg.type !== "text") return false;
      try {
        const text = typeof msg.data === "string" ? msg.data : msg.data.toString();
        const json = JSON.parse(text) as Record<string, unknown>;
        return json[field] === value;
      } catch (error) {
        logger.debug("Failed to parse WebSocket message as JSON for field matching", {
          field,
          error,
        });
        return false;
      }
    };
  }

  /**
   * Match by direction (client/server).
   */
  static byDirection(direction: WsDirection): (msg: WsMessage) => boolean {
    return (msg) => msg.direction === direction;
  }
}

/**
 * WebSocket mock connection for testing.
 */
export class MockWsConnection implements WsConnection {
  url: string;
  state: WsConnectionState = "open";
  metadata: Record<string, unknown> = {};
  private messages: WsMessage[] = [];
  private messageHandler?: WsMessageHandlerFn;
  private closeHandler?: (code: number, reason: string) => void;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string | Buffer): void {
    this.messages.push({
      direction: "server",
      type: typeof data === "string" ? "text" : "binary",
      data,
      timestamp: Date.now(),
    });
  }

  close(code: number = 1000, reason: string = ""): void {
    this.state = "closing";
    this.closeHandler?.(code, reason);
    this.state = "closed";
  }

  broadcast(data: string | Buffer): void {
    this.send(data);
  }

  /** Simulate receiving a message from the client */
  simulateMessage(data: string | Buffer): void {
    const message: WsMessage = {
      direction: "client",
      type: typeof data === "string" ? "text" : "binary",
      data,
      timestamp: Date.now(),
    };
    this.messages.push(message);
    this.messageHandler?.(this, message);
  }

  /** Set message handler */
  setMessageHandler(handler: WsMessageHandlerFn): void {
    this.messageHandler = handler;
  }

  /** Set close handler */
  setCloseHandler(handler: (code: number, reason: string) => void): void {
    this.closeHandler = handler;
  }

  /** Get all sent messages */
  getMessages(): WsMessage[] {
    return [...this.messages];
  }
}

/**
 * WebSocket message recorder for replay.
 */
export class WsRecorder {
  private recordings: Map<string, WsRecording> = new Map();
  private active = false;

  start(): void {
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  record(url: string, message: WsMessage): void {
    if (!this.active) return;

    let recording = this.recordings.get(url);
    if (!recording) {
      recording = { url, messages: [], connectionTime: Date.now() };
      this.recordings.set(url, recording);
    }
    recording.messages.push(message);
  }

  getRecordings(): WsRecording[] {
    return Array.from(this.recordings.values());
  }

  getRecording(url: string): WsRecording | undefined {
    return this.recordings.get(url);
  }

  clear(): void {
    this.recordings.clear();
  }

  /**
   * Export recordings as JSON for replay.
   */
  export(): string {
    return JSON.stringify(this.getRecordings(), null, 2);
  }

  /**
   * Import recordings from JSON.
   */
  import(json: string): void {
    const recordings = JSON.parse(json) as WsRecording[];
    for (const r of recordings) {
      this.recordings.set(r.url, r);
    }
  }
}
