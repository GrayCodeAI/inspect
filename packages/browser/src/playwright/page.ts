// ──────────────────────────────────────────────────────────────────────────────
// PageManager - Full page interaction wrapper around Playwright Page
// ──────────────────────────────────────────────────────────────────────────────

import type {
  Page,
  ElementHandle,
  Response,
  ConsoleMessage as PWConsoleMessage,
  Request,
} from "playwright";
import type {
  ScreenshotOptions,
  PDFOptions,
  CookieParam,
  ConsoleMessage,
  NetworkRequest,
} from "@inspect/shared";

/**
 * Wraps a Playwright Page to provide a complete set of browser interactions:
 * navigation, waiting, clicks, typing, scrolling, screenshots, cookies,
 * console/network capture, and more.
 */
export class PageManager {
  private page: Page;
  private consoleMessages: ConsoleMessage[] = [];
  private networkRequests: NetworkRequest[] = [];
  private capturing = false;

  constructor(page: Page) {
    this.page = page;
    this.setupCapture();
  }

  /** Get the underlying Playwright Page */
  getPage(): Page {
    return this.page;
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  /**
   * Navigate to a URL and wait for the specified load state.
   */
  async navigate(
    url: string,
    waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load",
  ): Promise<Response | null> {
    return this.page.goto(url, { waitUntil });
  }

  /** Reload the current page. */
  async reload(
    waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load",
  ): Promise<Response | null> {
    return this.page.reload({ waitUntil });
  }

  /** Navigate back in history. */
  async goBack(
    waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load",
  ): Promise<Response | null> {
    return this.page.goBack({ waitUntil });
  }

  /** Navigate forward in history. */
  async goForward(
    waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit" = "load",
  ): Promise<Response | null> {
    return this.page.goForward({ waitUntil });
  }

  // ── Waiting ──────────────────────────────────────────────────────────────

  /**
   * Wait for a selector to appear in the DOM.
   */
  async waitForSelector(
    selector: string,
    timeout?: number,
  ): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
    return this.page.waitForSelector(selector, {
      timeout: timeout ?? 30_000,
      state: "visible",
    });
  }

  /**
   * Wait for the page to reach the specified load state.
   */
  async waitForLoadState(
    state: "load" | "domcontentloaded" | "networkidle" = "load",
  ): Promise<void> {
    await this.page.waitForLoadState(state);
  }

  /**
   * Wait for network to be idle (no requests for the specified duration).
   */
  async waitForNetworkIdle(timeout: number = 30_000): Promise<void> {
    await this.page.waitForLoadState("networkidle");
    // Additional explicit idle wait using request count tracking
    await this.page.waitForTimeout(Math.min(timeout, 500));
  }

  /**
   * Wait for the DOM to stabilize by observing mutations.
   * Uses MutationObserver to detect when DOM changes fall below a threshold.
   *
   * @param threshold - Maximum mutations per 500ms interval to consider stable (default: 2)
   * @param timeout - Maximum wait time in ms (default: 10000)
   */
  async waitForDOMStable(threshold: number = 2, timeout: number = 10_000): Promise<void> {
    await this.page.evaluate(
      ({ threshold, timeout }) => {
        return new Promise<void>((resolve, reject) => {
          let mutationCount = 0;
          let stableIntervals = 0;
          const requiredStableIntervals = 3;
          const checkInterval = 500;

          const observer = new MutationObserver((mutations) => {
            mutationCount += mutations.length;
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          const timer = setInterval(() => {
            if (mutationCount <= threshold) {
              stableIntervals++;
              if (stableIntervals >= requiredStableIntervals) {
                cleanup();
                resolve();
              }
            } else {
              stableIntervals = 0;
            }
            mutationCount = 0;
          }, checkInterval);

          const timeoutTimer = setTimeout(() => {
            cleanup();
            reject(new Error(`DOM did not stabilize within ${timeout}ms`));
          }, timeout);

          function cleanup() {
            observer.disconnect();
            clearInterval(timer);
            clearTimeout(timeoutTimer);
          }
        });
      },
      { threshold, timeout },
    );
  }

  // ── Click actions ────────────────────────────────────────────────────────

  /** Click an element matching the selector. */
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  /** Click at specific page coordinates. */
  async clickCoordinates(x: number, y: number): Promise<void> {
    await this.page.mouse.click(x, y);
  }

  /** Double-click an element. */
  async doubleClick(selector: string): Promise<void> {
    await this.page.dblclick(selector);
  }

  /** Right-click (context menu) on an element. */
  async rightClick(selector: string): Promise<void> {
    await this.page.click(selector, { button: "right" });
  }

  // ── Hover ────────────────────────────────────────────────────────────────

  /** Hover over an element. */
  async hover(selector: string): Promise<void> {
    await this.page.hover(selector);
  }

  /** Hover at specific page coordinates. */
  async hoverCoordinates(x: number, y: number): Promise<void> {
    await this.page.mouse.move(x, y);
  }

  // ── Typing and input ─────────────────────────────────────────────────────

  /** Type text into an element (simulates key-by-key input). */
  async type(selector: string, text: string, delay?: number): Promise<void> {
    await this.page.locator(selector).pressSequentially(text, { delay: delay ?? 50 });
  }

  /** Fill an input element (sets value directly). */
  async fill(selector: string, text: string): Promise<void> {
    await this.page.fill(selector, text);
  }

  /** Select an option from a <select> element by value. */
  async selectOption(selector: string, value: string | string[]): Promise<string[]> {
    return this.page.selectOption(selector, value);
  }

  /** Upload a file to a file input element. */
  async uploadFile(selector: string, filePath: string | string[]): Promise<void> {
    const paths = Array.isArray(filePath) ? filePath : [filePath];
    await this.page.setInputFiles(selector, paths);
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  /** Press a single key (e.g. "Enter", "Tab", "Escape"). */
  async keyPress(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /** Press a key combination (e.g. ["Control", "a"]). */
  async keyCombination(keys: string[]): Promise<void> {
    // Hold all modifier keys, press the last key, then release
    const modifiers = keys.slice(0, -1);
    const finalKey = keys[keys.length - 1];

    for (const mod of modifiers) {
      await this.page.keyboard.down(mod);
    }
    await this.page.keyboard.press(finalKey);
    for (const mod of modifiers.reverse()) {
      await this.page.keyboard.up(mod);
    }
  }

  // ── Drag and drop ────────────────────────────────────────────────────────

  /** Drag an element and drop it on another element. */
  async dragAndDrop(
    from: string | { x: number; y: number },
    to: string | { x: number; y: number },
  ): Promise<void> {
    if (typeof from === "string" && typeof to === "string") {
      await this.page.dragAndDrop(from, to);
    } else {
      const fromCoords = typeof from === "string" ? await this.getElementCenter(from) : from;
      const toCoords = typeof to === "string" ? await this.getElementCenter(to) : to;

      await this.page.mouse.move(fromCoords.x, fromCoords.y);
      await this.page.mouse.down();
      await this.page.mouse.move(toCoords.x, toCoords.y, { steps: 10 });
      await this.page.mouse.up();
    }
  }

  // ── Scrolling ────────────────────────────────────────────────────────────

  /** Scroll the page in a direction by a specified amount (in pixels). */
  async scroll(direction: "up" | "down" | "left" | "right", amount: number = 500): Promise<void> {
    const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0;
    const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0;
    await this.page.mouse.wheel(deltaX, deltaY);
  }

  /**
   * Scroll until specific text is visible on the page.
   * Incrementally scrolls down and checks for text visibility.
   */
  async scrollToText(text: string, maxScrolls: number = 20): Promise<boolean> {
    for (let i = 0; i < maxScrolls; i++) {
      const found = await this.page.evaluate((searchText) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (node.textContent?.includes(searchText)) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const rect = range.getBoundingClientRect();
            if (
              rect.top >= 0 &&
              rect.top <= window.innerHeight &&
              rect.left >= 0 &&
              rect.left <= window.innerWidth
            ) {
              return true;
            }
            // Scroll the element into view
            (node.parentElement as HTMLElement)?.scrollIntoView({ behavior: "smooth", block: "center" });
            return true;
          }
        }
        return false;
      }, text);

      if (found) return true;

      await this.page.mouse.wheel(0, 500);
      await this.page.waitForTimeout(200);
    }
    return false;
  }

  // ── Viewport ─────────────────────────────────────────────────────────────

  /** Set the browser viewport size. */
  async setViewportSize(width: number, height: number): Promise<void> {
    await this.page.setViewportSize({ width, height });
  }

  // ── Screenshots ──────────────────────────────────────────────────────────

  /** Take a screenshot with the given options. */
  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    return this.page.screenshot({
      fullPage: options.fullPage ?? false,
      path: options.path,
      type: options.type ?? "png",
      quality: options.type === "jpeg" ? options.quality : undefined,
      clip: options.clip,
      omitBackground: options.omitBackground,
    }) as Promise<Buffer>;
  }

  /** Take a full-page screenshot. */
  async fullPageScreenshot(path?: string): Promise<Buffer> {
    return this.page.screenshot({ fullPage: true, path, type: "png" }) as Promise<Buffer>;
  }

  // ── JavaScript evaluation ────────────────────────────────────────────────

  /** Evaluate a function in the page context. */
  async evaluate<T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
    return this.page.evaluate(fn as () => T, ...args);
  }

  /** Evaluate and return a JSHandle. */
  async evaluateHandle(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]) {
    return this.page.evaluateHandle(fn as () => unknown, ...args);
  }

  // ── Page info ────────────────────────────────────────────────────────────

  /** Get the current page URL. */
  getUrl(): string {
    return this.page.url();
  }

  /** Get the current page title. */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  // ── Console and network capture ──────────────────────────────────────────

  /**
   * Get captured console messages, optionally filtered by type.
   */
  getConsoleMessages(filter?: string): ConsoleMessage[] {
    if (!filter) return [...this.consoleMessages];
    return this.consoleMessages.filter((m) => m.type === filter);
  }

  /**
   * Get captured network requests, optionally filtered by URL pattern or resource type.
   */
  getNetworkRequests(filter?: { urlPattern?: string; resourceType?: string }): NetworkRequest[] {
    let requests = [...this.networkRequests];
    if (filter?.urlPattern) {
      const pattern = new RegExp(filter.urlPattern);
      requests = requests.filter((r) => pattern.test(r.url));
    }
    if (filter?.resourceType) {
      requests = requests.filter((r) => r.resourceType === filter.resourceType);
    }
    return requests;
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  /** Save the page as a PDF. Only works in headless Chromium. */
  async saveAsPDF(options: PDFOptions = {}): Promise<Buffer> {
    return this.page.pdf({
      path: options.path,
      format: options.format ?? "A4",
      landscape: options.landscape,
      printBackground: options.printBackground ?? true,
      margin: options.margin,
      scale: options.scale,
      headerTemplate: options.headerTemplate,
      footerTemplate: options.footerTemplate,
      pageRanges: options.pageRanges,
      width: options.width,
      height: options.height,
    });
  }

  // ── Cookies ──────────────────────────────────────────────────────────────

  /** Get all cookies for the current page. */
  async getCookies(): Promise<CookieParam[]> {
    const cookies = await this.page.context().cookies(this.page.url());
    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as CookieParam["sameSite"],
    }));
  }

  /** Set cookies on the current context. */
  async setCookies(cookies: CookieParam[]): Promise<void> {
    const playwrightCookies = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? "",
      path: c.path ?? "/",
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? false,
      sameSite: (c.sameSite ?? "Lax") as "Strict" | "Lax" | "None",
    }));
    await this.page.context().addCookies(playwrightCookies);
  }

  /** Clear all cookies for the current context. */
  async clearCookies(): Promise<void> {
    await this.page.context().clearCookies();
  }

  // ── HTTP headers ─────────────────────────────────────────────────────────

  /** Set extra HTTP headers for all subsequent requests. */
  async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
    await this.page.setExtraHTTPHeaders(headers);
  }

  // ── Init scripts ─────────────────────────────────────────────────────────

  /** Add an initialization script that runs before every page load. */
  async addInitScript(script: string | { path: string }): Promise<void> {
    if (typeof script === "string") {
      await this.page.addInitScript(script);
    } else {
      await this.page.addInitScript({ path: script.path });
    }
  }

  // ── Page lifecycle ───────────────────────────────────────────────────────

  /** Close the page. */
  async close(): Promise<void> {
    this.capturing = false;
    await this.page.close();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Set up automatic capture of console messages and network requests.
   */
  private setupCapture(): void {
    this.capturing = true;

    this.page.on("console", (msg: PWConsoleMessage) => {
      if (!this.capturing) return;
      this.consoleMessages.push({
        type: msg.type() as ConsoleMessage["type"],
        text: msg.text(),
        timestamp: Date.now(),
        location: msg.location()
          ? {
              url: msg.location().url,
              lineNumber: msg.location().lineNumber,
              columnNumber: msg.location().columnNumber,
            }
          : undefined,
      });
    });

    this.page.on("request", (request: Request) => {
      if (!this.capturing) return;
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        requestHeaders: request.headers(),
        timing: { startTime: Date.now(), endTime: 0, duration: 0 },
      });
    });

    this.page.on("requestfinished", async (request: Request) => {
      if (!this.capturing) return;
      const entry = this.networkRequests.find(
        (r) => r.url === request.url() && r.method === request.method() && !r.status,
      );
      if (entry) {
        const response = await request.response();
        if (response) {
          entry.status = response.status();
          entry.statusText = response.statusText();
          entry.responseHeaders = response.headers();
        }
        if (entry.timing) {
          entry.timing.endTime = Date.now();
          entry.timing.duration = entry.timing.endTime - entry.timing.startTime;
        }
      }
    });

    this.page.on("requestfailed", (request: Request) => {
      if (!this.capturing) return;
      const entry = this.networkRequests.find(
        (r) => r.url === request.url() && r.method === request.method() && !r.status,
      );
      if (entry) {
        entry.failed = true;
        entry.failureText = request.failure()?.errorText;
        if (entry.timing) {
          entry.timing.endTime = Date.now();
          entry.timing.duration = entry.timing.endTime - entry.timing.startTime;
        }
      }
    });
  }

  /**
   * Get the center coordinates of an element.
   */
  private async getElementCenter(selector: string): Promise<{ x: number; y: number }> {
    const box = await this.page.locator(selector).boundingBox();
    if (!box) throw new Error(`Element not found or not visible: ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
}
