// ──────────────────────────────────────────────────────────────────────────────
// MCPServer - Model Context Protocol server for browser automation tools
// ──────────────────────────────────────────────────────────────────────────────

import { createInterface } from "node:readline";
import type { CookieParam, BrowserConfig } from "@inspect/shared";
import { createLogger } from "@inspect/observability";
import { BrowserManager } from "../playwright/browser.js";

const logger = createLogger("browser/mcp");
import { PageManager } from "../playwright/page.js";
import { AriaSnapshotBuilder } from "../aria/snapshot.js";
import { ScreenshotCapture } from "../vision/screenshot.js";
import { PageToMarkdown } from "../dom/page-to-markdown.js";
import { BROWSER_TOOLS } from "./tools.js";

// ── JSON-RPC Types ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface MCPToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

/**
 * Full MCP server implementation for browser automation.
 *
 * Exposes tools: open, navigate, screenshot, snapshot, annotated, click, type,
 * playwright, console_logs, network_requests, performance_metrics, cookies, close.
 *
 * Uses stdio transport (JSON-RPC over stdin/stdout).
 */
export class MCPServer {
  private browserManager: BrowserManager;
  private pageManager: PageManager | null = null;
  private snapshotBuilder: AriaSnapshotBuilder;
  private screenshotCapture: ScreenshotCapture;
  private running = false;

  constructor() {
    this.browserManager = new BrowserManager();
    this.snapshotBuilder = new AriaSnapshotBuilder();
    this.screenshotCapture = new ScreenshotCapture();
  }

  /**
   * Start the MCP server on stdio transport.
   * Reads JSON-RPC messages from stdin, processes them, writes responses to stdout.
   */
  async start(): Promise<void> {
    this.running = true;

    const rl = createInterface({
      input: process.stdin,
      output: undefined,
      terminal: false,
    });

    let buffer = "";

    rl.on("line", async (line: string) => {
      buffer += line;

      // Try to parse as complete JSON-RPC message
      try {
        const request = JSON.parse(buffer) as JsonRpcRequest;
        buffer = "";

        if (request.jsonrpc !== "2.0") {
          this.sendError(request.id, -32600, "Invalid JSON-RPC version");
          return;
        }

        await this.handleRequest(request);
      } catch (e) {
        if (e instanceof SyntaxError) {
          // Incomplete JSON — wait for more data
          // But if the buffer is too large, it's probably invalid
          if (buffer.length > 1_000_000) {
            buffer = "";
            this.sendError(0, -32700, "Parse error: message too large");
          }
        } else {
          buffer = "";
          this.sendError(0, -32603, `Internal error: ${(e as Error).message}`);
        }
      }
    });

    rl.on("close", () => {
      this.running = false;
      this.cleanup();
    });

    // Handle process signals for graceful shutdown
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
  }

  /**
   * Stop the server and clean up resources.
   */
  async shutdown(): Promise<void> {
    this.running = false;
    await this.cleanup();
    process.exit(0);
  }

  // ── Request routing ──────────────────────────────────────────────────────

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    switch (request.method) {
      case "initialize":
        this.sendResult(request.id, {
          protocolVersion: "2025-01-01",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "inspect-browser",
            version: "0.1.0",
          },
        });
        break;

      case "tools/list":
        this.sendResult(request.id, {
          tools: BROWSER_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
        break;

      case "tools/call": {
        const params = request.params as { name: string; arguments?: Record<string, unknown> };
        if (!params?.name) {
          this.sendError(request.id, -32602, "Missing tool name");
          return;
        }
        const result = await this.executeTool(params.name, params.arguments ?? {});
        this.sendResult(request.id, result);
        break;
      }

      case "notifications/initialized":
        // Client acknowledgment — no response needed
        break;

      default:
        this.sendError(request.id, -32601, `Method not found: ${request.method}`);
    }
  }

  // ── Tool execution ───────────────────────────────────────────────────────

  private async executeTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (name) {
        case "browser_open":
          return await this.toolOpen(args);
        case "browser_navigate":
          return await this.toolNavigate(args);
        case "browser_screenshot":
          return await this.toolScreenshot(args);
        case "browser_snapshot":
          return await this.toolSnapshot(args);
        case "browser_annotated":
          return await this.toolAnnotated();
        case "browser_click":
          return await this.toolClick(args);
        case "browser_type":
          return await this.toolType(args);
        case "browser_playwright":
          return await this.toolPlaywright(args);
        case "browser_console_logs":
          return await this.toolConsoleLogs(args);
        case "browser_network_requests":
          return await this.toolNetworkRequests(args);
        case "browser_performance_metrics":
          return await this.toolPerformanceMetrics();
        case "browser_cookies":
          return await this.toolCookies(args);
        case "browser_markdown":
          return await this.toolMarkdown(args);
        case "browser_close":
          return await this.toolClose();
        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error executing ${name}: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }

  // ── Tool implementations ─────────────────────────────────────────────────

  private async toolOpen(args: Record<string, unknown>): Promise<MCPToolResult> {
    const vp = args["viewport"] as { width?: number; height?: number } | undefined;

    const config: BrowserConfig = {
      name: "chromium",
      headless: (args["headless"] as boolean) ?? true,
      stealth: (args["stealth"] as boolean) ?? false,
      viewport: { width: vp?.width ?? 1280, height: vp?.height ?? 720 },
      locale: args["locale"] as string | undefined,
      timezone: args["timezoneId"] as string | undefined,
      userDataDir: args["userDataDir"] as string | undefined,
      executablePath: args["executablePath"] as string | undefined,
      proxy: args["proxy"] as { server: string; username?: string; password?: string } | undefined,
    };

    const _context = await this.browserManager.launchBrowser(config);
    const page = await this.browserManager.newPage();
    this.pageManager = new PageManager(page);

    return {
      content: [{ type: "text", text: "Browser launched successfully." }],
    };
  }

  private async toolNavigate(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const url = args["url"] as string;
    const waitUntil =
      (args["waitUntil"] as "load" | "domcontentloaded" | "networkidle" | "commit") ?? "load";

    await this.pageManager!.navigate(url, waitUntil);
    const title = await this.pageManager!.getTitle();
    const pageUrl = this.pageManager!.getUrl();

    return {
      content: [{ type: "text", text: `Navigated to: ${pageUrl}\nTitle: ${title}` }],
    };
  }

  private async toolScreenshot(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();

    let buffer: Buffer;
    if (args["selector"]) {
      buffer = await this.screenshotCapture.captureElement(page, args["selector"] as string);
    } else if (args["fullPage"]) {
      buffer = await this.screenshotCapture.captureFullPage(page);
    } else {
      buffer = await this.screenshotCapture.capture(page);
    }

    return {
      content: [
        {
          type: "image",
          data: this.screenshotCapture.toBase64(buffer),
          mimeType: "image/png",
        },
      ],
    };
  }

  private async toolSnapshot(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();

    const tree = await this.snapshotBuilder.buildTree(page);
    const interactiveOnly = args["interactiveOnly"] as boolean;
    const _elements = interactiveOnly ? this.snapshotBuilder.getInteractiveElements() : tree;
    const formatted = this.snapshotBuilder.getFormattedTree();
    const stats = this.snapshotBuilder.getStats();

    let text = formatted;
    text += `\n\n---\nElements: ${stats.refCount} | Interactive: ${stats.interactiveCount} | ~${stats.tokenEstimate} tokens`;

    return {
      content: [{ type: "text", text }],
    };
  }

  private async toolAnnotated(): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();

    // Build snapshot to get element positions
    const _tree = await this.snapshotBuilder.buildTree(page);
    const interactive = this.snapshotBuilder.getInteractiveElements();

    // Take annotated screenshot
    const buffer = await this.screenshotCapture.annotate(page, interactive);

    // Also include the text snapshot
    const stats = this.snapshotBuilder.getStats();

    return {
      content: [
        {
          type: "image",
          data: this.screenshotCapture.toBase64(buffer),
          mimeType: "image/png",
        },
        {
          type: "text",
          text: `Annotated ${stats.interactiveCount} interactive elements. Use refs (e1, e2, ...) to interact.`,
        },
      ],
    };
  }

  private async toolClick(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();

    if (args["ref"]) {
      const locator = this.snapshotBuilder.getRefLocator(page, args["ref"] as string);
      if (args["doubleClick"]) {
        await locator.dblclick();
      } else if (args["rightClick"]) {
        await locator.click({ button: "right" });
      } else {
        await locator.click();
      }
      return { content: [{ type: "text", text: `Clicked element [${args["ref"]}]` }] };
    }

    if (args["selector"]) {
      if (args["doubleClick"]) {
        await this.pageManager!.doubleClick(args["selector"] as string);
      } else if (args["rightClick"]) {
        await this.pageManager!.rightClick(args["selector"] as string);
      } else {
        await this.pageManager!.click(args["selector"] as string);
      }
      return { content: [{ type: "text", text: `Clicked selector: ${args["selector"]}` }] };
    }

    if (args["x"] !== undefined && args["y"] !== undefined) {
      await this.pageManager!.clickCoordinates(args["x"] as number, args["y"] as number);
      return { content: [{ type: "text", text: `Clicked at (${args["x"]}, ${args["y"]})` }] };
    }

    return {
      content: [
        { type: "text", text: "No target specified. Provide ref, selector, or x/y coordinates." },
      ],
      isError: true,
    };
  }

  private async toolType(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();
    const text = args["text"] as string;
    const clearFirst = (args["clearFirst"] as boolean) ?? true;
    const pressEnter = args["pressEnter"] as boolean;

    // Determine target
    if (args["ref"]) {
      const locator = this.snapshotBuilder.getRefLocator(page, args["ref"] as string);
      if (clearFirst) {
        await locator.fill(text);
      } else {
        await locator.pressSequentially(text);
      }
      if (pressEnter) await page.keyboard.press("Enter");
      return { content: [{ type: "text", text: `Typed "${text}" into [${args["ref"]}]` }] };
    }

    if (args["selector"]) {
      const selector = args["selector"] as string;
      if (clearFirst) {
        await this.pageManager!.fill(selector, text);
      } else {
        await this.pageManager!.type(selector, text);
      }
      if (pressEnter) await page.keyboard.press("Enter");
      return { content: [{ type: "text", text: `Typed "${text}" into ${selector}` }] };
    }

    // No target — type directly (useful for focused elements)
    await page.keyboard.type(text);
    if (pressEnter) await page.keyboard.press("Enter");
    return { content: [{ type: "text", text: `Typed "${text}" into focused element` }] };
  }

  private async toolPlaywright(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const code = args["code"] as string;
    const result = await this.pageManager!.evaluate(code);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private async toolConsoleLogs(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const filter = args["filter"] as string | undefined;
    const limit = (args["limit"] as number) ?? 50;

    const messages = this.pageManager!.getConsoleMessages(filter).slice(-limit);
    const formatted = messages.map((m) => `[${m.type.toUpperCase()}] ${m.text}`).join("\n");

    return {
      content: [{ type: "text", text: formatted || "(No console messages)" }],
    };
  }

  private async toolNetworkRequests(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const limit = (args["limit"] as number) ?? 50;
    const filter = {
      urlPattern: args["urlPattern"] as string | undefined,
      resourceType: args["resourceType"] as string | undefined,
    };

    const requests = this.pageManager!.getNetworkRequests(filter).slice(-limit);
    const formatted = requests
      .map((r) => `${r.method} ${r.status ?? "..."} ${r.url} (${r.resourceType})`)
      .join("\n");

    return {
      content: [{ type: "text", text: formatted || "(No network requests captured)" }],
    };
  }

  private async toolPerformanceMetrics(): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();

    const metrics = await page.evaluate(() => {
      const perf = performance;
      const nav = perf.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const paint = perf.getEntriesByType("paint");
      const resources = perf.getEntriesByType("resource");

      // Core Web Vitals
      const fcp = paint.find((p) => p.name === "first-contentful-paint");

      // Get LCP via PerformanceObserver (if available from previously collected data)
      // Note: LCP requires an active observer — we'll use a basic fallback
      const lcp = perf.getEntriesByType("largest-contentful-paint");

      return {
        // Navigation timing
        ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.fetchStart) : null,
        loadComplete: nav ? Math.round(nav.loadEventEnd - nav.fetchStart) : null,

        // Paint
        firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
        largestContentfulPaint: lcp.length > 0 ? Math.round(lcp[lcp.length - 1].startTime) : null,

        // Resources
        totalResources: resources.length,
        totalResourceSize: resources.reduce(
          (sum, r) => sum + ((r as PerformanceResourceTiming).transferSize || 0),
          0,
        ),

        // DOM stats
        domNodes: document.querySelectorAll("*").length,
        domDepth: (() => {
          let maxDepth = 0;
          const walk = (node: Element, depth: number) => {
            maxDepth = Math.max(maxDepth, depth);
            for (const child of Array.from(node.children)) {
              walk(child, depth + 1);
            }
          };
          walk(document.documentElement, 0);
          return maxDepth;
        })(),
      };
    });

    const lines = [
      "=== Performance Metrics ===",
      `TTFB: ${metrics.ttfb ?? "N/A"}ms`,
      `FCP: ${metrics.firstContentfulPaint ?? "N/A"}ms`,
      `LCP: ${metrics.largestContentfulPaint ?? "N/A"}ms`,
      `DOM Content Loaded: ${metrics.domContentLoaded ?? "N/A"}ms`,
      `Load Complete: ${metrics.loadComplete ?? "N/A"}ms`,
      "",
      `DOM Nodes: ${metrics.domNodes}`,
      `DOM Depth: ${metrics.domDepth}`,
      `Resources: ${metrics.totalResources}`,
      `Total Transfer Size: ${Math.round((metrics.totalResourceSize ?? 0) / 1024)}KB`,
    ];

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async toolCookies(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const action = args["action"] as string;

    switch (action) {
      case "get": {
        const cookies = await this.pageManager!.getCookies();
        return {
          content: [{ type: "text", text: JSON.stringify(cookies, null, 2) }],
        };
      }
      case "set": {
        const cookies = (args["cookies"] as CookieParam[]) ?? [];
        await this.pageManager!.setCookies(cookies);
        return {
          content: [{ type: "text", text: `Set ${cookies.length} cookies.` }],
        };
      }
      case "clear":
        await this.pageManager!.clearCookies();
        return {
          content: [{ type: "text", text: "Cleared all cookies." }],
        };
      default:
        return {
          content: [{ type: "text", text: `Unknown cookie action: ${action}` }],
          isError: true,
        };
    }
  }

  private async toolMarkdown(args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensurePage();
    const page = this.pageManager!.getPage();

    const converter = new PageToMarkdown({
      includeRefs: (args["includeRefs"] as boolean) ?? true,
      includeImages: (args["includeImages"] as boolean) ?? true,
      includeHidden: (args["includeHidden"] as boolean) ?? false,
      maxLength: (args["maxLength"] as number) ?? 50000,
    });

    const result = await converter.convert(page);

    return {
      content: [{ type: "text", text: result.markdown }],
    };
  }

  private async toolClose(): Promise<MCPToolResult> {
    if (this.pageManager) {
      await this.pageManager.close().catch((err) => {
        logger.warn("Failed to close page", { err: err?.message });
      });
      this.pageManager = null;
    }
    await this.browserManager.closeBrowser();
    return {
      content: [{ type: "text", text: "Browser closed." }],
    };
  }

  // ── Public API for HTTP access ─────────────────────────────────────────────

  /** Execute a tool by name (for HTTP/MCP endpoint access) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async executeMethod(name: string, args: Record<string, unknown>): Promise<any> {
    return this.executeTool(name, args);
  }

  /** Get available tool definitions (for tool discovery) */
  getToolDefinitions() {
    return BROWSER_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private ensurePage(): void {
    if (!this.pageManager) {
      throw new Error("No browser page open. Use browser_open first.");
    }
  }

  private sendResult(id: number | string, result: unknown): void {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id, result };
    process.stdout.write(JSON.stringify(response) + "\n");
  }

  private sendError(id: number | string, code: number, message: string, data?: unknown): void {
    const response: JsonRpcResponse = { jsonrpc: "2.0", id, error: { code, message, data } };
    process.stdout.write(JSON.stringify(response) + "\n");
  }

  private async cleanup(): Promise<void> {
    if (this.pageManager) {
      await this.pageManager.close().catch((err) => {
        logger.warn("Failed to close page during cleanup", { err: err?.message });
      });
      this.pageManager = null;
    }
    await this.browserManager.closeBrowser().catch((err) => {
      logger.warn("Failed to close browser during cleanup", { err: err?.message });
    });
  }
}
