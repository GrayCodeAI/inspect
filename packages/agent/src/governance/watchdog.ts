/**
 * WatchdogManager — monitors browser for popups, captchas, crashes.
 * Stub implementation for CLI compilation.
 */

export interface WatchdogConfig {
  pollInterval?: number;
}

export interface WatchdogEvent {
  type: "captcha" | "crash" | "popup" | "navigation";
  message?: string;
}

export class WatchdogManager {
  private pollInterval: number;
  private eventHandler: ((event: WatchdogEvent) => void) | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config?: WatchdogConfig) {
    this.pollInterval = config?.pollInterval ?? 2000;
  }

  onEvent(handler: (event: WatchdogEvent) => void): void {
    this.eventHandler = handler;
  }

  startAll(): void {
    this.intervalId = setInterval(() => {
      // Stub — no-op in test mode
    }, this.pollInterval);
  }

  stopAll(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
