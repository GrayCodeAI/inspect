// ──────────────────────────────────────────────────────────────────────────────
// @inspect/browser - Cross-Browser Manager
// ──────────────────────────────────────────────────────────────────────────────

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type BrowserType,
} from "playwright";
import type { BrowserConfig } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/cross-browser");

/** Supported browser engine */
export type BrowserEngine = "chromium" | "firefox" | "webkit";

/** Cross-browser test result */
export interface CrossBrowserResult {
  engine: BrowserEngine;
  url: string;
  passed: boolean;
  error?: string;
  durationMs: number;
  screenshot?: string;
}

/**
 * Cross-Browser Manager.
 * Launches Chromium, Firefox, or WebKit based on config.
 * Supports running the same test across multiple browsers.
 *
 * Usage:
 * ```ts
 * const manager = new CrossBrowserManager();
 * // Launch specific browser
 * const ctx = await manager.launch("firefox", config);
 * // Run across all browsers
 * const results = await manager.runAllBrowsers(config, testFn);
 * ```
 */
export class CrossBrowserManager {
  private browsers: Map<BrowserEngine, Browser> = new Map();
  private contexts: Map<BrowserEngine, BrowserContext> = new Map();

  /**
   * Launch a specific browser engine.
   */
  async launch(engine: BrowserEngine, config: BrowserConfig): Promise<BrowserContext> {
    const browserType = this.getBrowserType(engine);

    const launchOptions = {
      headless: config.headless,
      slowMo: config.slowMo,
      proxy: config.proxy
        ? {
            server: (config.proxy as { server: string }).server,
            username: (config.proxy as { username?: string }).username,
            password: (config.proxy as { password?: string }).password,
          }
        : undefined,
    };

    let context: BrowserContext;

    if (config.userDataDir) {
      context = await (browserType as typeof chromium).launchPersistentContext(config.userDataDir, {
        ...launchOptions,
        viewport: config.viewport,
        locale: config.locale,
        timezoneId: config.timezone,
        isMobile: config.isMobile,
        hasTouch: config.hasTouch,
        deviceScaleFactor: config.deviceScaleFactor,
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
      });
    } else {
      const browser = await browserType.launch(launchOptions);
      this.browsers.set(engine, browser);
      context = await browser.newContext({
        viewport: config.viewport,
        locale: config.locale,
        timezoneId: config.timezone,
        isMobile: config.isMobile,
        hasTouch: config.hasTouch,
        deviceScaleFactor: config.deviceScaleFactor,
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
        userAgent: this.getUserAgent(engine),
      });
    }

    this.contexts.set(engine, context);
    return context;
  }

  /**
   * Get a launched browser context.
   */
  getContext(engine: BrowserEngine): BrowserContext | undefined {
    return this.contexts.get(engine);
  }

  /**
   * Run a test across all 3 browsers.
   */
  async runAllBrowsers(
    config: BrowserConfig,
    testFn: (engine: BrowserEngine, context: BrowserContext) => Promise<void>,
  ): Promise<CrossBrowserResult[]> {
    const engines: BrowserEngine[] = ["chromium", "firefox", "webkit"];
    const results: CrossBrowserResult[] = [];

    for (const engine of engines) {
      const start = Date.now();
      try {
        const context = await this.launch(engine, config);
        await testFn(engine, context);
        results.push({
          engine,
          url: "",
          passed: true,
          durationMs: Date.now() - start,
        });
      } catch (error) {
        results.push({
          engine,
          url: "",
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - start,
        });
      }
    }

    return results;
  }

  /**
   * Close all browsers.
   */
  async closeAll(): Promise<void> {
    for (const [id, context] of this.contexts) {
      await context.close().catch((err) => {
        logger.warn("Failed to close context", { engine: id, err: err?.message });
      });
    }
    for (const [id, browser] of this.browsers) {
      await browser.close().catch((err) => {
        logger.warn("Failed to close browser", { engine: id, err: err?.message });
      });
    }
    this.contexts.clear();
    this.browsers.clear();
  }

  /**
   * Get list of supported engines.
   */
  static getSupportedEngines(): BrowserEngine[] {
    return ["chromium", "firefox", "webkit"];
  }

  /**
   * Get engine name from browser type string.
   */
  static parseEngine(input: string): BrowserEngine {
    const lower = input.toLowerCase();
    if (lower === "firefox" || lower === "ff") return "firefox";
    if (lower === "webkit" || lower === "safari") return "webkit";
    return "chromium";
  }

  private getBrowserType(engine: BrowserEngine): BrowserType {
    switch (engine) {
      case "chromium":
        return chromium;
      case "firefox":
        return firefox;
      case "webkit":
        return webkit;
    }
  }

  private getUserAgent(_engine: BrowserEngine): string | undefined {
    // Let Playwright set the default UA for each engine
    return undefined;
  }
}
