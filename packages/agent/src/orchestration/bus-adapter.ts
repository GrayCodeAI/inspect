/**
 * MessageBus adapter for agent-to-agent communication.
 * Connects agent graph nodes to the services MessageBus for
 * inter-agent messaging, request/reply, and event broadcasting.
 */

import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/orchestration/bus-adapter");

/** Message envelope for agent communication */
export interface AgentMessage {
  id: string;
  type: "request" | "response" | "broadcast" | "notification";
  source: string;
  target?: string;
  topic: string;
  payload: unknown;
  correlationId?: string;
  timestamp: number;
  ttl?: number;
}

/** Handler for incoming agent messages */
export type AgentMessageHandler = (message: AgentMessage) => void | Promise<void>;

let messageIdCounter = 0;

/**
 * Adapter that provides pub/sub messaging between agent graph nodes.
 * Can be bridged to the services MessageBus for cross-package communication.
 */
export class AgentMessageBusAdapter {
  private subscribers = new Map<string, AgentMessageHandler[]>();
  private messageHistory: AgentMessage[] = [];
  private pendingReplies = new Map<
    string,
    { resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly maxHistory = 500;

  /**
   * Publish a message to a topic.
   */
  publish(message: Omit<AgentMessage, "id" | "timestamp">): void {
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg-${++messageIdCounter}-${Date.now()}`,
      timestamp: Date.now(),
    };

    // Store in history
    this.messageHistory.push(fullMessage);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    // Check for pending reply (only for response messages, not the original request)
    if (
      fullMessage.correlationId &&
      fullMessage.type === "response" &&
      this.pendingReplies.has(fullMessage.correlationId)
    ) {
      const pending = this.pendingReplies.get(fullMessage.correlationId)!;
      clearTimeout(pending.timer);
      this.pendingReplies.delete(fullMessage.correlationId);
      pending.resolve(fullMessage.payload);
      return;
    }

    // Dispatch to subscribers
    const handlers = this.subscribers.get(fullMessage.topic) ?? [];
    const wildcardHandlers = this.subscribers.get("*") ?? [];

    for (const handler of [...handlers, ...wildcardHandlers]) {
      try {
        const result = handler(fullMessage);
        if (result instanceof Promise) {
          result.catch((err) =>
            logger.warn("Agent message handler error", {
              topic: fullMessage.topic,
              error: String(err),
            }),
          );
        }
      } catch (err) {
        logger.warn("Agent message handler error", {
          topic: fullMessage.topic,
          error: String(err),
        });
      }
    }

    logger.debug("Published agent message", {
      id: fullMessage.id,
      type: fullMessage.type,
      topic: fullMessage.topic,
      source: fullMessage.source,
    });
  }

  /**
   * Subscribe to messages on a topic.
   * Returns an unsubscribe function.
   */
  subscribe(topic: string, handler: AgentMessageHandler): () => void {
    const handlers = this.subscribers.get(topic) ?? [];
    handlers.push(handler);
    this.subscribers.set(topic, handlers);

    return () => {
      const current = this.subscribers.get(topic) ?? [];
      const index = current.indexOf(handler);
      if (index >= 0) current.splice(index, 1);
    };
  }

  /**
   * Send a request and wait for a response.
   */
  async request(
    topic: string,
    payload: unknown,
    source: string,
    timeoutMs = 10_000,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const correlationId = `req-${++messageIdCounter}-${Date.now()}`;

      const timer = setTimeout(() => {
        this.pendingReplies.delete(correlationId);
        reject(new Error(`Request to "${topic}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingReplies.set(correlationId, { resolve, timer });

      this.publish({
        type: "request",
        source,
        topic,
        payload,
        correlationId,
      });
    });
  }

  /**
   * Reply to a request message.
   */
  reply(originalMessage: AgentMessage, payload: unknown, source: string): void {
    if (!originalMessage.correlationId) {
      throw new Error("Cannot reply to a message without correlationId");
    }

    this.publish({
      type: "response",
      source,
      target: originalMessage.source,
      topic: `${originalMessage.topic}.reply`,
      payload,
      correlationId: originalMessage.correlationId,
    });
  }

  /**
   * Get message history, optionally filtered by topic.
   */
  getHistory(topic?: string): AgentMessage[] {
    if (!topic) return [...this.messageHistory];
    return this.messageHistory.filter((m) => m.topic === topic);
  }

  /**
   * Get metrics about the message bus.
   */
  getMetrics(): {
    topics: number;
    subscribers: number;
    historySize: number;
    pendingReplies: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    for (const msg of this.messageHistory) {
      byType[msg.type] = (byType[msg.type] ?? 0) + 1;
    }

    let totalSubscribers = 0;
    for (const handlers of this.subscribers.values()) {
      totalSubscribers += handlers.length;
    }

    return {
      topics: this.subscribers.size,
      subscribers: totalSubscribers,
      historySize: this.messageHistory.length,
      pendingReplies: this.pendingReplies.size,
      byType,
    };
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.subscribers.clear();
    this.messageHistory.length = 0;
    for (const pending of this.pendingReplies.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingReplies.clear();
  }
}
