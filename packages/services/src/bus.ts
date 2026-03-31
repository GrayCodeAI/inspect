// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/bus.ts - Inter-Service Message Bus
// ──────────────────────────────────────────────────────────────────────────────

import { generateId } from "@inspect/shared";

import { generateId } from "@inspect/shared";

/** Message priority */
export type MessagePriority = "low" | "normal" | "high" | "critical";

/** Bus message */
export interface BusMessage {
  id: string;
  topic: string;
  payload: unknown;
  source: string;
  target?: string;
  priority: MessagePriority;
  correlationId?: string;
  replyTo?: string;
  timestamp: number;
  ttl?: number;
  retry?: { count: number; maxRetries: number; delayMs: number };
}

/** Message handler */
export type BusHandler = (message: BusMessage) => void | Promise<void>;

/** Message filter */
export type BusFilter = (message: BusMessage) => boolean;

/**
 * Inter-service message bus for asynchronous communication.
 * Supports pub/sub, request/reply, priority queues, and dead letter handling.
 */
export class MessageBus {
  private topics: Map<string, BusHandler[]> = new Map();
  private deadLetter: BusMessage[] = [];
  private pendingReplies: Map<
    string,
    { resolve: (msg: BusMessage) => void; timeout: ReturnType<typeof setTimeout> }
  > = new Map();
  private messageHistory: BusMessage[] = [];
  private maxHistory = 1000;

  /**
   * Publish a message to a topic.
   */
  publish(message: Omit<BusMessage, "id" | "timestamp">): string {
    const full: BusMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };

    // Store in history
    this.messageHistory.push(full);
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    // Check TTL
    if (full.ttl && full.ttl <= 0) {
      this.sendToDeadLetter(full, "TTL expired");
      return full.id;
    }

    // Deliver to topic handlers
    const handlers = this.topics.get(full.topic) ?? [];
    if (handlers.length === 0 && !full.target) {
      this.sendToDeadLetter(full, "No handlers for topic");
      return full.id;
    }

    for (const handler of handlers) {
      try {
        handler(full);
      } catch (error) {
        this.handleRetry(full, error);
      }
    }

    return full.id;
  }

  /**
   * Subscribe to a topic.
   */
  subscribe(topic: string, handler: BusHandler): () => void {
    const handlers = this.topics.get(topic) ?? [];
    handlers.push(handler);
    this.topics.set(topic, handlers);
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  /**
   * Subscribe with a filter.
   */
  subscribeFiltered(topic: string, filter: BusFilter, handler: BusHandler): () => void {
    return this.subscribe(topic, (msg) => {
      if (filter(msg)) handler(msg);
    });
  }

  /**
   * Request/reply pattern.
   */
  async request(
    topic: string,
    payload: unknown,
    source: string,
    timeoutMs: number = 5000,
  ): Promise<BusMessage> {
    const correlationId = generateId();
    const replyTopic = `reply.${correlationId}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingReplies.delete(correlationId);
        reject(new Error(`Request to ${topic} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingReplies.set(correlationId, { resolve, timeout });

      this.subscribe(replyTopic, (msg) => {
        const pending = this.pendingReplies.get(correlationId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingReplies.delete(correlationId);
          pending.resolve(msg);
        }
      });

      this.publish({
        topic,
        payload,
        source,
        priority: "normal",
        correlationId,
        replyTo: replyTopic,
      });
    });
  }

  /**
   * Reply to a request.
   */
  reply(original: BusMessage, payload: unknown, source: string): void {
    if (!original.replyTo) return;
    this.publish({
      topic: original.replyTo,
      payload,
      source,
      priority: "normal",
      correlationId: original.correlationId,
    });
  }

  /**
   * Get dead letter queue.
   */
  getDeadLetter(): BusMessage[] {
    return [...this.deadLetter];
  }

  /**
   * Replay dead letter messages.
   */
  replayDeadLetter(): number {
    const messages = [...this.deadLetter];
    this.deadLetter = [];
    for (const msg of messages) {
      this.publish(msg);
    }
    return messages.length;
  }

  /**
   * Get message history.
   */
  getHistory(topic?: string): BusMessage[] {
    if (!topic) return [...this.messageHistory];
    return this.messageHistory.filter((m) => m.topic === topic);
  }

  /**
   * Get bus metrics.
   */
  getMetrics(): { topics: number; handlers: number; deadLetter: number; history: number } {
    let handlers = 0;
    for (const h of this.topics.values()) handlers += h.length;
    return {
      topics: this.topics.size,
      handlers,
      deadLetter: this.deadLetter.length,
      history: this.messageHistory.length,
    };
  }

  private sendToDeadLetter(message: BusMessage, reason: string): void {
    this.deadLetter.push({ ...message, payload: { original: message.payload, reason } });
  }

  private handleRetry(message: BusMessage, error: unknown): void {
    if (message.retry && message.retry.count < message.retry.maxRetries) {
      setTimeout(() => {
        this.publish({
          ...message,
          retry: { ...message.retry!, count: message.retry!.count + 1 },
        });
      }, message.retry.delayMs);
    } else {
      this.sendToDeadLetter(message, `Handler error: ${error}`);
    }
  }
}
