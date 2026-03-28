// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Lightpanda Browser Backend Adapter
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/backends/lightpanda");

/** Lightpanda-specific configuration */
export interface LightpandaConfig {
  /** Lightpanda binary path or URL */
  endpoint?: string;
  /** Connection mode */
  mode: "cdp" | "api";
  /** Port for CDP connection */
  port?: number;
  /** Enable headless mode (always true for Lightpanda) */
  headless: true;
  /** Custom flags */
  flags?: string[];
}

/** Backend adapter interface */
export interface BrowserBackend {
  name: string;
  launch(config: unknown): Promise<unknown>;
  close(): Promise<void>;
  isAvailable(): Promise<boolean>;
}

/**
 * Lightpanda browser backend adapter.
 *
 * Lightpanda is a headless browser built from scratch (not a Chromium/WebKit fork)
 * specifically for AI agents and web automation. It's faster and uses fewer resources
 * than Chromium-based solutions.
 *
 * Usage:
 * ```ts
 * const backend = new LightpandaBackend({ mode: "cdp", port: 9222 });
 * const isAvailable = await backend.isAvailable();
 * if (isAvailable) {
 *   const browser = await backend.launch({ headless: true });
 * }
 * ```
 */
export class LightpandaBackend implements BrowserBackend {
  name = "lightpanda";
  private config: LightpandaConfig;
  private process: unknown = null;

  constructor(config: Partial<LightpandaConfig> = {}) {
    this.config = {
      endpoint: config.endpoint ?? "http://localhost:9222",
      mode: config.mode ?? "cdp",
      port: config.port ?? 9222,
      headless: true,
      flags: config.flags ?? [],
    };
  }

  /**
   * Check if Lightpanda is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.config.endpoint}/json/version`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      logger.debug("Lightpanda not available", { error });
      return false;
    }
  }

  /**
   * Launch a Lightpanda browser instance.
   */
  async launch(_config: unknown): Promise<unknown> {
    if (this.config.mode === "cdp") {
      // Connect via CDP protocol
      const cdpEndpoint = `${this.config.endpoint}/devtools/browser`;
      return { type: "lightpanda", cdpEndpoint, config: this.config };
    }

    // API mode
    return { type: "lightpanda", endpoint: this.config.endpoint, config: this.config };
  }

  /**
   * Close the browser instance.
   */
  async close(): Promise<void> {
    this.process = null;
  }

  /**
   * Get the CDP endpoint URL.
   */
  getCdpEndpoint(): string {
    return `${this.config.endpoint}/devtools/browser`;
  }

  /**
   * Get browser version info.
   */
  async getVersion(): Promise<LightpandaVersion | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.config.endpoint}/json/version`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return null;
      return (await response.json()) as LightpandaVersion;
    } catch (error) {
      logger.debug("Failed to get Lightpanda version", { error });
      return null;
    }
  }
}

/** Lightpanda version info */
export interface LightpandaVersion {
  Browser: string;
  "Protocol-Version": string;
  "User-Agent": string;
  "V8-Version": string;
  "WebKit-Version": string;
  webSocketDebuggerUrl: string;
}

/**
 * Chromium backend adapter (for comparison/fallback).
 */
export class ChromiumBackend implements BrowserBackend {
  name = "chromium";

  async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import("node:child_process");
      execSync("which chromium || which google-chrome || which chromium-browser", {
        stdio: "ignore",
      });
      return true;
    } catch (error) {
      logger.debug("Chromium not available", { error });
      return false;
    }
  }

  async launch(_config: unknown): Promise<unknown> {
    return { type: "chromium" };
  }

  async close(): Promise<void> {
    // Handled by Playwright
  }
}

/**
 * Backend factory that selects the best available backend.
 */
export class BackendFactory {
  /**
   * Create a backend by name.
   */
  static create(
    name: "chromium" | "lightpanda",
    config?: Partial<LightpandaConfig>,
  ): BrowserBackend {
    switch (name) {
      case "lightpanda":
        return new LightpandaBackend(config);
      case "chromium":
        return new ChromiumBackend();
    }
  }

  /**
   * Auto-detect the best available backend.
   */
  static async detect(): Promise<BrowserBackend> {
    const lightpanda = new LightpandaBackend();
    if (await lightpanda.isAvailable()) {
      return lightpanda;
    }
    return new ChromiumBackend();
  }
}
