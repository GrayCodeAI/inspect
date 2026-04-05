/**
 * Crash Watchdog
 *
 * Detects and handles browser crashes, page errors, and out-of-memory situations.
 */

import type { Page, ConsoleMessage } from "playwright";
import { Effect } from "effect";

export interface CrashConfig {
  /** Monitor page errors */
  monitorPageErrors: boolean;
  /** Monitor console errors */
  monitorConsoleErrors: boolean;
  /** Monitor unhandled rejections */
  monitorUnhandledRejections: boolean;
  /** Monitor out-of-memory */
  monitorOOM: boolean;
  /** Max errors before considering page crashed */
  maxErrorsBeforeCrash: number;
  /** Time window for error counting (ms) */
  errorWindowMs: number;
  /** Auto-retry on crash */
  autoRetry: boolean;
  /** Max retry attempts */
  maxRetries: number;
  /** Callback on crash detected */
  onCrashDetected?: (type: CrashType, details: string) => void;
  /** Callback on recovery attempt */
  onRecoveryAttempt?: (attempt: number, strategy: string) => void;
}

export type CrashType =
  | "page-crash"
  | "browser-crash"
  | "out-of-memory"
  | "infinite-loop"
  | "unresponsive"
  | "js-error"
  | "network-failure"
  | "unknown";

export interface CrashInfo {
  type: CrashType;
  timestamp: number;
  details: string;
  url?: string;
  stackTrace?: string;
  errorCount?: number;
  memoryUsage?: number;
}

export class CrashWatchdog {
  private config: CrashConfig;
  private isRunning = false;
  private errorLog: Array<{ message: string; timestamp: number }> = [];
  private crashListeners: Array<(info: CrashInfo) => void> = [];
  private retryCount = 0;
  private pageErrorHandler?: (error: Error) => void;
  private consoleHandler?: (msg: ConsoleMessage) => void;

  constructor(config: Partial<CrashConfig> = {}) {
    this.config = {
      monitorPageErrors: true,
      monitorConsoleErrors: true,
      monitorUnhandledRejections: true,
      monitorOOM: true,
      maxErrorsBeforeCrash: 10,
      errorWindowMs: 5000,
      autoRetry: true,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Start monitoring for crashes
   */
  start(page: Page): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Monitor page errors
    if (this.config.monitorPageErrors) {
      this.pageErrorHandler = (error: Error) => {
        this.logError(error.message);
        this.checkForCrash("js-error", error.message);
      };
      page.on("pageerror", this.pageErrorHandler);
    }

    // Monitor console errors
    if (this.config.monitorConsoleErrors) {
      this.consoleHandler = (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          this.logError(text);
          this.checkForCrash("js-error", text);
        }
      };
      page.on("console", this.consoleHandler);
    }

    // Start OOM monitoring
    if (this.config.monitorOOM) {
      this.startOOMMonitoring(page);
    }
  }

  /**
   * Stop monitoring
   */
  stop(page: Page): void {
    this.isRunning = false;

    if (this.pageErrorHandler) {
      page.off("pageerror", this.pageErrorHandler);
      this.pageErrorHandler = undefined;
    }

    if (this.consoleHandler) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.off("console" as any, this.consoleHandler);
      this.consoleHandler = undefined;
    }
  }

  /**
   * Log an error
   */
  private logError(message: string): void {
    this.errorLog.push({
      message,
      timestamp: Date.now(),
    });

    // Clean old errors
    const cutoff = Date.now() - this.config.errorWindowMs;
    this.errorLog = this.errorLog.filter((e) => e.timestamp > cutoff);
  }

  /**
   * Check if current error rate indicates a crash
   */
  private checkForCrash(type: CrashType, details: string): void {
    if (this.errorLog.length >= this.config.maxErrorsBeforeCrash) {
      const crashInfo: CrashInfo = {
        type,
        timestamp: Date.now(),
        details,
        errorCount: this.errorLog.length,
      };

      this.config.onCrashDetected?.(type, details);
      this.notifyListeners(crashInfo);

      if (this.config.autoRetry) {
        this.attemptRecovery(type);
      }
    }
  }

  /**
   * Start OOM monitoring
   */
  private startOOMMonitoring(page: Page): void {
    // Check memory periodically
    setInterval(async () => {
      try {
        const memory = await page.evaluate(() => {
          const perf = performance as unknown as {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
          };
          return perf.memory?.usedJSHeapSize || 0;
        });

        // If memory > 1GB, consider it a problem
        if (memory > 1024 * 1024 * 1024) {
          this.checkForCrash(
            "out-of-memory",
            `Memory usage: ${Math.round(memory / 1024 / 1024)}MB`,
          );
        }
      } catch {
        // Page might be crashed
      }
    }, 5000);
  }

  /**
   * Attempt to recover from crash
   */
  private async attemptRecovery(crashType: CrashType): Promise<void> {
    if (this.retryCount >= this.config.maxRetries) {
      Effect.logError(`Max retries (${this.config.maxRetries}) exceeded`).pipe(Effect.runFork);
      return;
    }

    this.retryCount++;
    const strategy = this.selectRecoveryStrategy(crashType);
    this.config.onRecoveryAttempt?.(this.retryCount, strategy);

    Effect.logInfo(`Recovery attempt ${this.retryCount}: ${strategy}`).pipe(Effect.runFork);
  }

  /**
   * Select recovery strategy based on crash type
   */
  private selectRecoveryStrategy(crashType: CrashType): string {
    switch (crashType) {
      case "page-crash":
      case "js-error":
        return "reload-page";
      case "out-of-memory":
        return "clear-cache-and-reload";
      case "infinite-loop":
        return "terminate-and-restart";
      case "unresponsive":
        return "wait-and-retry";
      case "browser-crash":
        return "restart-browser";
      default:
        return "reload-page";
    }
  }

  /**
   * Add crash listener
   */
  addListener(listener: (info: CrashInfo) => void): void {
    this.crashListeners.push(listener);
  }

  /**
   * Remove crash listener
   */
  removeListener(listener: (info: CrashInfo) => void): void {
    const index = this.crashListeners.indexOf(listener);
    if (index > -1) {
      this.crashListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(info: CrashInfo): void {
    for (const listener of this.crashListeners) {
      try {
        listener(info);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Check if browser is still responsive
   */
  static async isResponsive(page: Page, timeoutMs = 5000): Promise<boolean> {
    try {
      await page.evaluate(() => true, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get error statistics
   */
  getStats(): {
    recentErrorCount: number;
    retryCount: number;
    isRunning: boolean;
  } {
    return {
      recentErrorCount: this.errorLog.length,
      retryCount: this.retryCount,
      isRunning: this.isRunning,
    };
  }

  /**
   * Reset retry count
   */
  resetRetries(): void {
    this.retryCount = 0;
  }
}
