// ============================================================================
// @inspect/api - Server-Sent Events (SSE) Manager
// ============================================================================

import type { ServerResponse } from "node:http";
import { generateId } from "@inspect/shared";
import type { SSEEvent } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("api/sse");

/** Connected SSE client */
export interface SSEClient {
  id: string;
  response: ServerResponse;
  connectedAt: number;
  lastEventAt: number;
  eventCount: number;
  channels: Set<string>;
}

/**
 * SSEManager handles Server-Sent Events connections.
 * Manages client connections, message broadcasting, and keepalive.
 */
export class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private keepAliveMs: number;
  private eventId: number = 0;

  constructor(options?: {
    /** Keep-alive interval in ms (default: 30000) */
    keepAliveMs?: number;
    /** Auto-start keep-alive (default: true) */
    autoStart?: boolean;
  }) {
    this.keepAliveMs = options?.keepAliveMs ?? 30_000;

    if (options?.autoStart !== false) {
      this.startKeepAlive();
    }
  }

  /**
   * Add a new SSE client connection.
   * Sets the appropriate headers and returns the client ID.
   */
  addClient(
    res: ServerResponse,
    channels?: string[],
  ): string {
    const clientId = generateId();

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Client-ID": clientId,
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connection event
    res.write(
      `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`,
    );

    const client: SSEClient = {
      id: clientId,
      response: res,
      connectedAt: Date.now(),
      lastEventAt: Date.now(),
      eventCount: 0,
      channels: new Set(channels ?? ["*"]),
    };

    this.clients.set(clientId, client);

    // Clean up on connection close
    res.on("close", () => {
      this.removeClient(clientId);
    });

    return clientId;
  }

  /**
   * Remove a client connection.
   */
  removeClient(id: string): boolean {
    const client = this.clients.get(id);
    if (!client) return false;

    try {
      if (!client.response.writableEnded) {
        client.response.end();
      }
    } catch (error) {
      logger.debug("SSE client cleanup error", { clientId: id, err: error instanceof Error ? error.message : String(error) });
    }

    this.clients.delete(id);
    return true;
  }

  /**
   * Send an event to a specific client.
   */
  sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    return this.writeEvent(client, event, data);
  }

  /**
   * Broadcast an event to all connected clients.
   * Optionally filter by channel.
   */
  broadcast(event: string, data: unknown, channel?: string): number {
    let sent = 0;

    for (const client of this.clients.values()) {
      // Check channel filter
      if (
        channel &&
        !client.channels.has("*") &&
        !client.channels.has(channel)
      ) {
        continue;
      }

      if (this.writeEvent(client, event, data)) {
        sent++;
      }
    }

    return sent;
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
   * Unsubscribe a client from a channel.
   */
  unsubscribe(clientId: string, channel: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.channels.delete(channel);
    return true;
  }

  /**
   * Get count of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all connected client IDs.
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get client info.
   */
  getClientInfo(
    id: string,
  ): Omit<SSEClient, "response"> | undefined {
    const client = this.clients.get(id);
    if (!client) return undefined;
    return {
      id: client.id,
      connectedAt: client.connectedAt,
      lastEventAt: client.lastEventAt,
      eventCount: client.eventCount,
      channels: client.channels,
    };
  }

  /**
   * Start the keep-alive interval.
   */
  startKeepAlive(): void {
    if (this.keepAliveInterval) return;
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, this.keepAliveMs);
  }

  /**
   * Stop the keep-alive interval.
   */
  stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Close all connections and clean up.
   */
  destroy(): void {
    this.stopKeepAlive();
    for (const [id] of this.clients) {
      this.removeClient(id);
    }
  }

  /**
   * Write an SSE event to a client.
   */
  private writeEvent(
    client: SSEClient,
    event: string,
    data: unknown,
  ): boolean {
    try {
      if (client.response.writableEnded) {
        this.clients.delete(client.id);
        return false;
      }

      const eventId = ++this.eventId;
      const dataStr =
        typeof data === "string" ? data : JSON.stringify(data);

      let message = `id: ${eventId}\n`;
      message += `event: ${event}\n`;

      // Split data across multiple lines if needed
      const lines = dataStr.split("\n");
      for (const line of lines) {
        message += `data: ${line}\n`;
      }
      message += "\n";

      client.response.write(message);
      client.lastEventAt = Date.now();
      client.eventCount++;
      return true;
    } catch (error) {
      logger.debug("SSE write failed, removing client", { clientId: client.id, err: error instanceof Error ? error.message : String(error) });
      this.clients.delete(client.id);
      return false;
    }
  }

  /**
   * Send a keep-alive comment to all clients.
   */
  private sendKeepAlive(): void {
    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        if (client.response.writableEnded) {
          deadClients.push(id);
          continue;
        }
        client.response.write(`: keepalive ${Date.now()}\n\n`);
      } catch (error) {
        logger.debug("SSE keepalive failed, marking client dead", { clientId: id, err: error instanceof Error ? error.message : String(error) });
        deadClients.push(id);
      }
    }

    // Clean up dead clients
    for (const id of deadClients) {
      this.clients.delete(id);
    }
  }
}
