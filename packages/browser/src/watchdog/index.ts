export interface WatchdogOptions {
  enabled: boolean;
  timeoutMs: number;
}

export interface WatchdogEvent {
  type: "timeout" | "error" | "close";
  timestamp: number;
}

export class BrowserWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;

  constructor(options: WatchdogOptions) {
    this.timeoutMs = options.timeoutMs;
  }

  start(): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.onTimeout();
    }, this.timeoutMs);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private onTimeout(): void {
    console.warn("Browser watchdog timeout triggered");
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
