// ============================================================================
// @inspect/api - WebSocket Manager (Raw Implementation)
// ============================================================================

import * as crypto from "node:crypto";
import type { IncomingMessage, Server as HTTPServer } from "node:http";
import type { Socket } from "node:net";
import { generateId } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("api/websocket");

/** WebSocket client */
export interface WSClient {
  id: string;
  socket: Socket;
  connectedAt: number;
  lastMessageAt: number;
  channels: Set<string>;
  isAlive: boolean;
}

/** WebSocket message */
export interface WSMessage {
  type: string;
  data: unknown;
  channel?: string;
  clientId?: string;
}

/** WebSocket message handler */
export type WSMessageHandler = (clientId: string, message: WSMessage) => void | Promise<void>;

/** WebSocket opcode constants */
const OPCODE_TEXT = 0x01;
const OPCODE_BINARY = 0x02;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;

/**
 * WebSocketManager upgrades HTTP connections to WebSocket using the raw
 * protocol handshake (RFC 6455). Implements frame parsing, message
 * broadcasting, and ping/pong for keepalive.
 */
export class WebSocketManager {
  private clients: Map<string, WSClient> = new Map();
  private messageHandler?: WSMessageHandler;
  private onConnectHandler?: (clientId: string) => void;
  private onDisconnectHandler?: (clientId: string) => void;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pingIntervalMs: number;

  constructor(options?: { pingIntervalMs?: number }) {
    this.pingIntervalMs = options?.pingIntervalMs ?? 30_000;
  }

  /**
   * Attach WebSocket upgrade handling to an HTTP server.
   */
  attach(server: HTTPServer): void {
    server.on("upgrade", (req, socket, head) => {
      this.handleUpgrade(req, socket as Socket, head);
    });

    this.startPingInterval();
  }

  /**
   * Set the message handler.
   */
  onMessage(handler: WSMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Set the connect handler.
   */
  onConnect(handler: (clientId: string) => void): void {
    this.onConnectHandler = handler;
  }

  /**
   * Set the disconnect handler.
   */
  onDisconnect(handler: (clientId: string) => void): void {
    this.onDisconnectHandler = handler;
  }

  /**
   * Send a message to a specific client.
   */
  send(clientId: string, message: WSMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    return this.writeFrame(client.socket, JSON.stringify(message), OPCODE_TEXT);
  }

  /**
   * Broadcast a message to all connected clients.
   * Optionally filter by channel.
   */
  broadcast(message: WSMessage, channel?: string): number {
    const payload = JSON.stringify(message);
    let sent = 0;

    for (const client of this.clients.values()) {
      if (channel && !client.channels.has("*") && !client.channels.has(channel)) {
        continue;
      }

      if (this.writeFrame(client.socket, payload, OPCODE_TEXT)) {
        sent++;
      }
    }

    return sent;
  }

  /**
   * Close a specific client connection.
   */
  close(clientId: string, code: number = 1000, reason: string = ""): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Send close frame
    const closePayload = Buffer.alloc(2 + Buffer.byteLength(reason));
    closePayload.writeUInt16BE(code, 0);
    closePayload.write(reason, 2);
    this.writeFrame(client.socket, closePayload, OPCODE_CLOSE);

    client.socket.end();
    this.clients.delete(clientId);

    if (this.onDisconnectHandler) {
      this.onDisconnectHandler(clientId);
    }
  }

  /**
   * Get connected client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client IDs.
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Subscribe a client to a channel.
   */
  subscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.channels.add(channel);
    return true;
  }

  /**
   * Clean up all connections.
   */
  destroy(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const [id] of this.clients) {
      this.close(id, 1001, "Server shutting down");
    }
  }

  /**
   * Handle the WebSocket upgrade handshake (RFC 6455).
   */
  private handleUpgrade(req: IncomingMessage, socket: Socket, _head: Buffer): void {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    // Verify upgrade headers
    const upgradeHeader = req.headers.upgrade;
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    // Generate accept key per RFC 6455
    const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const acceptKey = crypto
      .createHash("sha1")
      .update(key + WEBSOCKET_GUID)
      .digest("base64");

    // Send upgrade response
    const response = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");

    socket.write(response);

    // Register client
    const clientId = generateId();
    const client: WSClient = {
      id: clientId,
      socket,
      connectedAt: Date.now(),
      lastMessageAt: Date.now(),
      channels: new Set(["*"]),
      isAlive: true,
    };

    this.clients.set(clientId, client);

    if (this.onConnectHandler) {
      this.onConnectHandler(clientId);
    }

    // Handle incoming data
    let buffer = Buffer.alloc(0);

    socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      // Process all complete frames in the buffer
      while (buffer.length >= 2) {
        const result = this.parseFrame(buffer);
        if (!result) break; // Incomplete frame

        buffer = buffer.subarray(result.totalLength);
        this.handleFrame(client, result.opcode, result.payload);
      }
    });

    socket.on("close", () => {
      this.clients.delete(clientId);
      if (this.onDisconnectHandler) {
        this.onDisconnectHandler(clientId);
      }
    });

    socket.on("error", () => {
      this.clients.delete(clientId);
    });
  }

  /**
   * Parse a WebSocket frame from a buffer.
   * Returns null if the frame is incomplete.
   */
  private parseFrame(buffer: Buffer): {
    opcode: number;
    payload: Buffer;
    totalLength: number;
  } | null {
    if (buffer.length < 2) return null;

    const firstByte = buffer[0];
    const secondByte = buffer[1];

    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      if (buffer.length < 4) return null;
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      if (buffer.length < 10) return null;
      // Read 64-bit length but enforce a maximum frame size of 16MB
      const highBits = buffer.readUInt32BE(2);
      const lowBits = buffer.readUInt32BE(6);
      if (highBits !== 0 || lowBits > 16 * 1024 * 1024) {
        throw new Error(
          `WebSocket frame too large: ${highBits > 0 ? "exceeds 4GB" : `${lowBits} bytes`}. Maximum is 16MB.`,
        );
      }
      payloadLength = lowBits;
      offset = 10;
    }

    const maskLength = masked ? 4 : 0;
    const totalLength = offset + maskLength + payloadLength;

    if (buffer.length < totalLength) return null;

    let payload: Buffer;

    if (masked) {
      const maskKey = buffer.subarray(offset, offset + 4);
      const maskedData = buffer.subarray(offset + 4, offset + 4 + payloadLength);
      payload = Buffer.alloc(payloadLength);
      for (let i = 0; i < payloadLength; i++) {
        payload[i] = maskedData[i] ^ maskKey[i % 4];
      }
    } else {
      payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
    }

    return { opcode, payload, totalLength };
  }

  /**
   * Handle a parsed WebSocket frame.
   */
  private handleFrame(client: WSClient, opcode: number, payload: Buffer): void {
    switch (opcode) {
      case OPCODE_TEXT:
      case OPCODE_BINARY: {
        client.lastMessageAt = Date.now();
        const text = payload.toString("utf-8");

        try {
          const message = JSON.parse(text) as WSMessage;

          // Handle built-in messages
          if (message.type === "subscribe" && typeof message.data === "string") {
            client.channels.add(message.data);
            return;
          }
          if (message.type === "unsubscribe" && typeof message.data === "string") {
            client.channels.delete(message.data);
            return;
          }

          if (this.messageHandler) {
            Promise.resolve(this.messageHandler(client.id, message)).catch((err) => {
              logger.error("WebSocket message handler error", { error: err });
            });
          }
        } catch (error) {
          logger.debug("Non-JSON WebSocket message received", { error });
          if (this.messageHandler) {
            Promise.resolve(
              this.messageHandler(client.id, {
                type: "raw",
                data: text,
              }),
            ).catch((err) => {
              logger.error("WebSocket message handler error", { error: err });
            });
          }
        }
        break;
      }

      case OPCODE_PING:
        // Respond with pong
        this.writeFrame(client.socket, payload, OPCODE_PONG);
        client.isAlive = true;
        break;

      case OPCODE_PONG:
        client.isAlive = true;
        break;

      case OPCODE_CLOSE:
        this.clients.delete(client.id);
        // Echo close frame
        this.writeFrame(client.socket, payload, OPCODE_CLOSE);
        client.socket.end();
        if (this.onDisconnectHandler) {
          this.onDisconnectHandler(client.id);
        }
        break;
    }
  }

  /**
   * Write a WebSocket frame to a socket.
   * Server frames are NOT masked (per RFC 6455).
   */
  private writeFrame(socket: Socket, data: Buffer | string, opcode: number): boolean {
    try {
      if (socket.destroyed) return false;

      const payload = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
      const length = payload.length;

      let header: Buffer;

      if (length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | opcode; // FIN + opcode
        header[1] = length;
      } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(length, 6);
      }

      socket.write(Buffer.concat([header, payload]));
      return true;
    } catch (error) {
      logger.debug("Failed to send WebSocket frame", { error });
      return false;
    }
  }

  /**
   * Start the ping interval for keepalive.
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [id, client] of this.clients) {
        if (!client.isAlive) {
          // No pong received since last ping - disconnect
          this.clients.delete(id);
          client.socket.destroy();
          if (this.onDisconnectHandler) {
            this.onDisconnectHandler(id);
          }
          continue;
        }

        client.isAlive = false;
        this.writeFrame(client.socket, Buffer.alloc(0), OPCODE_PING);
      }
    }, this.pingIntervalMs);
  }
}
