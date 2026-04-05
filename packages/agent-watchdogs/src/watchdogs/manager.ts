// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Watchdog Manager
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/watchdog-manager");

/** Watchdog event types corresponding to the 14 watchdog categories */
export type WatchdogType =
  | "captcha"
  | "download"
  | "popup"
  | "crash"
  | "dom_mutation"
  | "permission"
  | "navigation"
  | "network_error"
  | "console_error"
  | "dialog"
  | "auth_expiry"
  | "timeout"
  | "memory_leak"
  | "performance_degradation";

/** An event emitted by a watchdog */
export interface WatchdogEvent {
  type: WatchdogType;
  timestamp: number;
  /** Human-readable description */
  message: string;
  /** Severity level */
  severity: "info" | "warning" | "critical";
  /** Additional data */
  data?: Record<string, unknown>;
  /** Whether this event should pause the agent */
  blocking: boolean;
  /** Suggested action for the agent */
  suggestedAction?: string;
}

/** Watchdog configuration */
export interface WatchdogConfig {
  /** Which watchdogs to enable (default: all) */
  enabled?: WatchdogType[];
  /** Which watchdogs to disable */
  disabled?: WatchdogType[];
  /** Poll interval for polling-based watchdogs (ms) */
  pollInterval?: number;
  /** Page reference for browser-based watchdogs */
  page?: unknown; // Playwright Page type - kept as unknown to avoid dependency
}

/** Interface that individual watchdog implementations follow */
export interface Watchdog {
  type: WatchdogType;
  start(): void;
  stop(): void;
  check(): WatchdogEvent | null;
}

/** Callback for watchdog events */
export type WatchdogCallback = (event: WatchdogEvent) => void | Promise<void>;

/**
 * Manages all 14 watchdog types that monitor for unexpected browser
 * events during test execution. Watchdogs detect captchas, downloads,
 * popups, crashes, and other conditions that need special handling.
 */
export class WatchdogManager {
  private config: WatchdogConfig;
  private watchdogs: Map<WatchdogType, Watchdog> = new Map();
  private callbacks: WatchdogCallback[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private events: WatchdogEvent[] = [];
  private running = false;

  constructor(config?: WatchdogConfig) {
    this.config = config ?? {};
  }

  /**
   * Register a watchdog implementation.
   */
  register(watchdog: Watchdog): void {
    if (this.isEnabled(watchdog.type)) {
      this.watchdogs.set(watchdog.type, watchdog);
    }
  }

  /**
   * Register an event callback.
   */
  onEvent(callback: WatchdogCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Start all registered watchdogs.
   */
  startAll(): void {
    if (this.running) return;
    this.running = true;

    for (const watchdog of this.watchdogs.values()) {
      watchdog.start();
    }

    // Start polling for events
    const interval = this.config.pollInterval ?? 1000;
    this.pollTimer = setInterval(() => this.poll(), interval);
  }

  /**
   * Stop all watchdogs and clean up.
   */
  stopAll(): void {
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const watchdog of this.watchdogs.values()) {
      watchdog.stop();
    }
  }

  /**
   * Manually trigger a check across all watchdogs.
   */
  checkAll(): WatchdogEvent[] {
    const events: WatchdogEvent[] = [];

    for (const watchdog of this.watchdogs.values()) {
      const event = watchdog.check();
      if (event) {
        events.push(event);
        this.events.push(event);
      }
    }

    return events;
  }

  /**
   * Emit a custom watchdog event (for external integrations).
   */
  emit(event: WatchdogEvent): void {
    this.events.push(event);
    this.notifyCallbacks(event);
  }

  /**
   * Get all events collected since start.
   */
  getEvents(): WatchdogEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type.
   */
  getEventsByType(type: WatchdogType): WatchdogEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Get the most recent blocking event (if any).
   */
  getBlockingEvent(): WatchdogEvent | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].blocking) {
        return this.events[i];
      }
    }
    return null;
  }

  /**
   * Clear the event history.
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Get list of registered watchdog types.
   */
  getRegistered(): WatchdogType[] {
    return Array.from(this.watchdogs.keys());
  }

  /**
   * Check if the manager is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private isEnabled(type: WatchdogType): boolean {
    if (this.config.disabled?.includes(type)) return false;
    if (this.config.enabled && !this.config.enabled.includes(type)) return false;
    return true;
  }

  private poll(): void {
    for (const watchdog of this.watchdogs.values()) {
      const event = watchdog.check();
      if (event) {
        this.events.push(event);
        this.notifyCallbacks(event);
      }
    }
  }

  private notifyCallbacks(event: WatchdogEvent): void {
    for (const callback of this.callbacks) {
      try {
        const result = callback(event);
        if (result instanceof Promise) {
          result.catch((err) => logger.warn("Watchdog callback error", { error: err })); // Don't let callback errors propagate
        }
      } catch (error) {
        logger.warn("Watchdog callback failed", {
          err: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
