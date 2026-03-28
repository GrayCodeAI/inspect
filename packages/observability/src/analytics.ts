// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Analytics & Telemetry
// ──────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "node:crypto";
import { createLogger } from "./logging.js";

const logger = createLogger("observability/analytics");
import type { AnalyticsEvent, AnalyticsEventCategory } from "@inspect/shared";

/** Predefined event types */
export const ANALYTICS_EVENTS = {
  // Session events
  "session:started": { category: "session" as const, action: "started" },
  "session:ended": { category: "session" as const, action: "ended" },

  // Plan events
  "plan:generated": { category: "plan" as const, action: "generated" },
  "plan:approved": { category: "plan" as const, action: "approved" },

  // Run events
  "run:started": { category: "run" as const, action: "started" },
  "run:completed": { category: "run" as const, action: "completed" },
  "run:failed": { category: "run" as const, action: "failed" },

  // Step events
  "step:started": { category: "step" as const, action: "started" },
  "step:completed": { category: "step" as const, action: "completed" },

  // Browser events
  "browser:launched": { category: "browser" as const, action: "launched" },
  "browser:closed": { category: "browser" as const, action: "closed" },

  // Agent events
  "agent:tool_called": { category: "agent" as const, action: "tool_called" },

  // Flow events
  "flow:saved": { category: "flow" as const, action: "saved" },
} as const;

/** Valid event name type */
export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

/** Analytics provider interface */
export interface AnalyticsProvider {
  /** Provider name */
  name: string;
  /** Send a batch of events */
  sendBatch(events: AnalyticsEvent[]): Promise<void>;
  /** Identify a user */
  identify(userId: string, traits: Record<string, unknown>): Promise<void>;
  /** Shut down the provider */
  shutdown(): Promise<void>;
}

/** PostHog provider configuration */
export interface PostHogConfig {
  /** PostHog API key */
  apiKey: string;
  /** PostHog API host (default: https://app.posthog.com) */
  host?: string;
  /** Batch size before flushing (default: 20) */
  batchSize?: number;
  /** Flush interval in ms (default: 30000) */
  flushIntervalMs?: number;
}

/** Analytics configuration */
export interface AnalyticsConfig {
  /** PostHog configuration (if using PostHog) */
  posthog?: PostHogConfig;
  /** Custom providers */
  providers?: AnalyticsProvider[];
  /** Maximum queue size before auto-flush (default: 100) */
  maxQueueSize?: number;
  /** Auto-flush interval in ms (default: 30000) */
  flushIntervalMs?: number;
}

/**
 * PostHog analytics provider. Sends events via the PostHog HTTP API.
 */
export class PostHogProvider implements AnalyticsProvider {
  readonly name = "posthog";
  private apiKey: string;
  private host: string;

  constructor(config: PostHogConfig) {
    this.apiKey = config.apiKey;
    this.host = config.host ?? "https://app.posthog.com";
  }

  async sendBatch(events: AnalyticsEvent[]): Promise<void> {
    const batch = events.map((event) => ({
      event: `${event.category}:${event.action}`,
      properties: {
        ...event.metadata,
        label: event.label,
        value: event.value,
        timestamp: new Date(event.timestamp).toISOString(),
      },
      timestamp: new Date(event.timestamp).toISOString(),
    }));

    const url = `${this.host}/batch/`;
    const body = JSON.stringify({
      api_key: this.apiKey,
      batch,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`PostHog API error: ${response.status} ${text}`);
      }
    } catch (error) {
      // Silently fail on telemetry errors - never break the user's workflow
      if (error instanceof Error && error.name !== "AbortError") {
        // Log but don't throw
      }
    }
  }

  async identify(userId: string, traits: Record<string, unknown>): Promise<void> {
    const url = `${this.host}/capture/`;
    const body = JSON.stringify({
      api_key: this.apiKey,
      distinct_id: userId,
      event: "$identify",
      properties: { $set: traits },
    });

    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      logger.debug("Failed to send analytics event", { error });
    }
  }

  async shutdown(): Promise<void> {
    // No persistent connections to close
  }
}

/**
 * Analytics is the main telemetry tracker. It queues events, batches them,
 * and sends them to configured providers (PostHog, custom). Respects the
 * INSPECT_TELEMETRY=false environment variable for opt-out.
 */
export class Analytics {
  private queue: AnalyticsEvent[] = [];
  private providers: AnalyticsProvider[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  private maxQueueSize: number;
  private flushIntervalMs: number;
  private enabled: boolean;
  private userId: string | undefined;
  private sessionId: string;
  private flushing: boolean = false;

  constructor(config?: AnalyticsConfig) {
    // Check INSPECT_TELEMETRY env var for opt-out
    const telemetryEnv = process.env.INSPECT_TELEMETRY;
    this.enabled = telemetryEnv !== "false" && telemetryEnv !== "0";

    this.maxQueueSize = config?.maxQueueSize ?? 100;
    this.flushIntervalMs = config?.flushIntervalMs ?? 30_000;
    this.sessionId = randomUUID();

    // Configure PostHog if provided
    if (config?.posthog && this.enabled) {
      this.providers.push(new PostHogProvider(config.posthog));
    }

    // Add custom providers
    if (config?.providers) {
      this.providers.push(...config.providers);
    }

    // Start auto-flush timer
    if (this.enabled && this.providers.length > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(() => {});
      }, this.flushIntervalMs);

      // Unref so the timer doesn't prevent process exit
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }
    }
  }

  /**
   * Track an analytics event.
   *
   * @param event - Event name from ANALYTICS_EVENTS or a custom event object
   * @param metadata - Additional event metadata
   */
  track(
    event: AnalyticsEventName | { category: AnalyticsEventCategory; action: string },
    metadata?: { label?: string; value?: number; metadata?: Record<string, unknown> },
  ): void {
    if (!this.enabled) return;

    const eventDef = typeof event === "string" ? ANALYTICS_EVENTS[event] : event;

    const analyticsEvent: AnalyticsEvent = {
      category: eventDef.category,
      action: eventDef.action,
      label: metadata?.label,
      value: metadata?.value,
      metadata: {
        ...metadata?.metadata,
        sessionId: this.sessionId,
        userId: this.userId,
      },
      timestamp: Date.now(),
    };

    this.queue.push(analyticsEvent);

    // Auto-flush if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Identify the current user for analytics attribution.
   *
   * @param userId - Unique user identifier
   * @param traits - User traits (e.g. plan, version, etc.)
   */
  async identify(
    userId: string,
    traits: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.enabled) return;

    this.userId = userId;

    await Promise.allSettled(
      this.providers.map((provider) => provider.identify(userId, traits)),
    );
  }

  /**
   * Flush all queued events to providers.
   * Events are sent in batches to all configured providers.
   */
  async flush(): Promise<void> {
    if (!this.enabled || this.queue.length === 0 || this.flushing) return;

    this.flushing = true;
    const events = [...this.queue];
    this.queue = [];

    try {
      await Promise.allSettled(
        this.providers.map((provider) => provider.sendBatch(events)),
      );
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Shut down analytics: flush remaining events and stop timers.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Final flush
    await this.flush();

    // Shut down providers
    await Promise.allSettled(
      this.providers.map((provider) => provider.shutdown()),
    );
  }

  /**
   * Get the current queue size.
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if telemetry is enabled.
   */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the current session ID.
   */
  get currentSessionId(): string {
    return this.sessionId;
  }

  /**
   * Enable or disable telemetry at runtime.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}
