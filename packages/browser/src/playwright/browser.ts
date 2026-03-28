// ──────────────────────────────────────────────────────────────────────────────
// BrowserManager - Launch, configure, and manage Playwright browser instances
// ──────────────────────────────────────────────────────────────────────────────

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type LaunchOptions,
} from "playwright";
import type { BrowserConfig, CookieParam, ViewportConfig } from "@inspect/shared";

/**
 * Manages Playwright browser lifecycle: launch, context creation, page management,
 * stealth mode, cookie injection, init scripts, and storage state.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private config: BrowserConfig | null = null;

  /**
   * Launch a Chromium browser with full configuration support.
   *
   * Supports: headed/headless, custom executable, user data dir, CDP connection,
   * stealth mode, proxy, viewport, locale, timezone, extensions, geolocation,
   * permissions, cookies, init scripts, and storage state import.
   */
  async launchBrowser(config: BrowserConfig): Promise<BrowserContext> {
    this.config = config;

    // ── Connect to existing browser via CDP ──────────────────────────────
    if (config.cdpEndpoint) {
      this.browser = await chromium.connectOverCDP(config.cdpEndpoint);
      const contexts = this.browser.contexts();
      this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext();
      await this.applyContextConfig(this.context, config);
      return this.context;
    }

    // ── Build launch options ─────────────────────────────────────────────
    const launchOptions: LaunchOptions = {
      headless: config.headless,
      slowMo: config.slowMo,
      args: this.buildLaunchArgs(config),
    };

    if (config.executablePath) {
      launchOptions.executablePath = config.executablePath;
    }

    if (config.downloadsPath) {
      launchOptions.downloadsPath = config.downloadsPath;
    }

    if (config.proxy) {
      launchOptions.proxy = {
        server: config.proxy.server,
        username: config.proxy.username,
        password: config.proxy.password,
        bypass: config.proxy.bypass,
      };
    }

    // ── Launch with persistent context (user data dir) or fresh ─────────
    if (config.userDataDir) {
      this.context = await chromium.launchPersistentContext(config.userDataDir, {
        ...launchOptions,
        viewport: config.viewport,
        locale: config.locale,
        timezoneId: config.timezone,
        geolocation: config.geolocation,
        permissions: config.permissions,
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
        deviceScaleFactor: config.deviceScaleFactor,
        isMobile: config.isMobile,
        hasTouch: config.hasTouch,
        extraHTTPHeaders: config.extraHTTPHeaders,
      });
      // Persistent context owns its own browser — set to null to avoid double-close
      this.browser = null;
    } else {
      this.browser = await chromium.launch(launchOptions);
      this.context = await this.browser.newContext({
        viewport: config.viewport,
        locale: config.locale,
        timezoneId: config.timezone,
        geolocation: config.geolocation,
        permissions: config.permissions,
        ignoreHTTPSErrors: config.ignoreHTTPSErrors,
        deviceScaleFactor: config.deviceScaleFactor,
        isMobile: config.isMobile,
        hasTouch: config.hasTouch,
        extraHTTPHeaders: config.extraHTTPHeaders,
        storageState: config.storageStatePath ?? undefined,
      });
    }

    await this.applyContextConfig(this.context, config);
    return this.context;
  }

  /**
   * Close the browser and all associated contexts/pages.
   */
  async closeBrowser(): Promise<void> {
    if (this.context) {
      await this.context.close().catch((err) => {
        console.warn("[browser] Failed to close context:", err?.message);
      });
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch((err) => {
        console.warn("[browser] Failed to close browser:", err?.message);
      });
      this.browser = null;
    }
  }

  /**
   * Get the current browser context. Throws if not launched.
   */
  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error("Browser not launched. Call launchBrowser() first.");
    }
    return this.context;
  }

  /**
   * Create and return a new page in the current context.
   */
  async newPage(): Promise<Page> {
    const ctx = this.getContext();
    return ctx.newPage();
  }

  /**
   * Export current storage state (cookies, localStorage, etc.) to a file or return it.
   */
  async exportStorageState(path?: string): Promise<string> {
    const ctx = this.getContext();
    const state = await ctx.storageState({ path });
    return JSON.stringify(state, null, 2);
  }

  /**
   * Import storage state from a file path or JSON string into the context.
   * Note: This requires creating a new context with the state — use config.storageStatePath at launch for best results.
   */
  async importStorageState(stateOrPath: string): Promise<void> {
    if (!this.browser) {
      throw new Error(
        "Cannot import storage state on persistent context. Use storageStatePath in config.",
      );
    }
    // Close existing context
    if (this.context) {
      await this.context.close();
    }
    // Determine if it's a file path or JSON string
    let storageState: string | { cookies: CookieParam[]; origins: unknown[] };
    try {
      storageState = JSON.parse(stateOrPath);
    } catch {
      // It's a file path
      storageState = stateOrPath;
    }
    this.context = await this.browser.newContext({
      viewport: this.config?.viewport ?? { width: 1280, height: 720 },
      locale: this.config?.locale,
      timezoneId: this.config?.timezone,
      storageState: storageState as string,
    });
    if (this.config) {
      await this.applyContextConfig(this.context, this.config);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build Chromium launch arguments from config.
   */
  private buildLaunchArgs(config: BrowserConfig): string[] {
    const args: string[] = [...(config.args ?? [])];

    // ── Stealth mode: disable automation indicators ──────────────────────
    if (config.stealth) {
      args.push(
        "--disable-blink-features=AutomationControlled",
        "--disable-features=AutomationControlled",
        "--disable-infobars",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-popup-blocking",
      );
    }

    // ── Load extensions ──────────────────────────────────────────────────
    if (config.extensions && config.extensions.length > 0) {
      args.push(`--disable-extensions-except=${config.extensions.join(",")}`);
      args.push(`--load-extension=${config.extensions.join(",")}`);
    }

    return args;
  }

  /**
   * Apply context-level config: stealth scripts, cookies, init scripts, permissions.
   */
  private async applyContextConfig(context: BrowserContext, config: BrowserConfig): Promise<void> {
    // ── Stealth: inject navigator overrides ──────────────────────────────
    if (config.stealth) {
      await context.addInitScript(() => {
        // Override webdriver property
        Object.defineProperty(navigator, "webdriver", { get: () => false });

        // Override plugins to appear non-empty
        Object.defineProperty(navigator, "plugins", {
          get: () => [
            { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
            { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
            { name: "Native Client", filename: "internal-nacl-plugin" },
          ],
        });

        // Override languages
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });

        // Remove chrome.runtime to avoid detection
        const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
        window.navigator.permissions.query = (parameters: PermissionDescriptor) => {
          if (parameters.name === "notifications") {
            return Promise.resolve({ state: "prompt" } as PermissionStatus);
          }
          return originalQuery(parameters);
        };

        // Override chrome object
        if (!(window as unknown as Record<string, unknown>)["chrome"]) {
          const chrome = {
            runtime: {
              connect: () => {},
              sendMessage: () => {},
            },
          };
          Object.defineProperty(window, "chrome", { get: () => chrome });
        }
      });
    }

    // ── Inject init scripts ──────────────────────────────────────────────
    if (config.initScripts) {
      for (const script of config.initScripts) {
        await context.addInitScript(script);
      }
    }

    // ── Inject cookies ───────────────────────────────────────────────────
    if (config.cookies && config.cookies.length > 0) {
      const playwrightCookies = config.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain ?? "",
        path: c.path ?? "/",
        expires: c.expires ?? -1,
        httpOnly: c.httpOnly ?? false,
        secure: c.secure ?? false,
        sameSite: c.sameSite ?? ("Lax" as const),
      }));
      await context.addCookies(playwrightCookies);
    }

    // ── Default timeout ──────────────────────────────────────────────────
    if (config.defaultTimeout) {
      context.setDefaultTimeout(config.defaultTimeout);
    }
  }
}
