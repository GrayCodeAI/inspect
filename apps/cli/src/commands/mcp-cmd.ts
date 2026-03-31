import type { Command } from "commander";
import chalk from "chalk";

// Lazy-initialized shared browser session for MCP tool calls
let browserSessionPromise: Promise<BrowserSession> | null = null;

interface BrowserSession {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  browserManager: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshotBuilder: any;
  consoleLogs: Array<{ level: string; text: string; timestamp: number }>;
}

async function getOrCreateBrowserSession(): Promise<BrowserSession> {
  if (!browserSessionPromise) {
    browserSessionPromise = (async () => {
      const { BrowserManager, AriaSnapshotBuilder } = await import("@inspect/browser");
      const browserManager = new BrowserManager();
      await browserManager.launchBrowser({
        headless: true,
        viewport: { width: 1280, height: 720 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const page = await browserManager.newPage();
      const snapshotBuilder = new AriaSnapshotBuilder();

      // Capture console logs
      const consoleLogs: Array<{ level: string; text: string; timestamp: number }> = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.on("console", (msg: any) => {
        consoleLogs.push({
          level: msg.type(),
          text: msg.text(),
          timestamp: Date.now(),
        });
      });

      return { browserManager, page, snapshotBuilder, consoleLogs };
    })();
  }
  return browserSessionPromise;
}

async function closeBrowserSession(): Promise<void> {
  if (browserSessionPromise) {
    try {
      const session = await browserSessionPromise;
      await session.browserManager.closeBrowser();
    } catch {
      // Ignore cleanup errors
    }
    browserSessionPromise = null;
  }
}

/**
 * Execute an MCP tool against a real browser instance.
 * Returns the text result content.
 */
async function executeBrowserTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<string> {
  const session = await getOrCreateBrowserSession();
  const { page, snapshotBuilder, consoleLogs } = session;

  switch (toolName) {
    case "browser_navigate": {
      const url = toolArgs.url as string;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const title = await page.title();
      return `Navigated to: ${page.url()}\nTitle: ${title}`;
    }

    case "browser_snapshot": {
      await snapshotBuilder.buildTree(page);
      const formatted = snapshotBuilder.getFormattedTree();
      const stats = snapshotBuilder.getStats();
      return `${formatted}\n\n---\nElements: ${stats.refCount} | Interactive: ${stats.interactiveCount} | ~${stats.tokenEstimate} tokens`;
    }

    case "browser_click": {
      if (toolArgs.ref) {
        const locator = snapshotBuilder.getRefLocator(page, toolArgs.ref as string);
        const count = (toolArgs.clickCount as number) ?? 1;
        const button = (toolArgs.button as string) ?? "left";
        await locator.click({ button, clickCount: count });
        return `Clicked element [${toolArgs.ref}]`;
      } else if (toolArgs.selector) {
        await page.click(toolArgs.selector as string);
        return `Clicked selector: ${toolArgs.selector}`;
      } else if (toolArgs.coordinates) {
        const coords = toolArgs.coordinates as { x: number; y: number };
        await page.mouse.click(coords.x, coords.y);
        return `Clicked at (${coords.x}, ${coords.y})`;
      }
      return "No click target specified. Provide ref, selector, or coordinates.";
    }

    case "browser_type": {
      const text = toolArgs.text as string;
      const clear = (toolArgs.clear as boolean) ?? true;
      if (toolArgs.ref) {
        const locator = snapshotBuilder.getRefLocator(page, toolArgs.ref as string);
        if (clear) {
          await locator.fill(text);
        } else {
          await locator.pressSequentially(text);
        }
        if (toolArgs.pressEnter) await page.keyboard.press("Enter");
        return `Typed "${text}" into [${toolArgs.ref}]`;
      } else if (toolArgs.selector) {
        if (clear) {
          await page.fill(toolArgs.selector as string, text);
        } else {
          await page.type(toolArgs.selector as string, text);
        }
        if (toolArgs.pressEnter) await page.keyboard.press("Enter");
        return `Typed "${text}" into ${toolArgs.selector}`;
      }
      await page.keyboard.type(text);
      if (toolArgs.pressEnter) await page.keyboard.press("Enter");
      return `Typed "${text}" into focused element`;
    }

    case "browser_screenshot": {
      const mode = (toolArgs.mode as string) ?? "viewport";
      let buffer: Buffer;
      if (mode === "element" && toolArgs.selector) {
        const el = page.locator(toolArgs.selector as string);
        buffer = await el.screenshot();
      } else if (mode === "full") {
        buffer = await page.screenshot({ fullPage: true });
      } else {
        buffer = await page.screenshot();
      }
      const base64 = buffer.toString("base64");
      return `Screenshot captured (${mode} mode, ${buffer.length} bytes). Base64 data: ${base64.slice(0, 100)}...`;
    }

    case "browser_console": {
      const level = (toolArgs.level as string) ?? "all";
      const filtered = level === "all"
        ? consoleLogs
        : consoleLogs.filter((l) => l.level === level);
      if (toolArgs.clear) consoleLogs.length = 0;
      if (filtered.length === 0) return "(No console messages)";
      return filtered.map((m) => `[${m.level.toUpperCase()}] ${m.text}`).join("\n");
    }

    case "browser_evaluate": {
      const expression = toolArgs.expression as string;
      const result = await page.evaluate(expression);
      return JSON.stringify(result, null, 2);
    }

    case "browser_scroll": {
      const direction = (toolArgs.direction as string) ?? "down";
      const amount = (toolArgs.amount as number) ?? 300;
      if (toolArgs.selector) {
        const sel = (toolArgs.selector as string).replace(/'/g, "\\'");
        const scrollProp = direction === "left" || direction === "right" ? "scrollLeft" : "scrollTop";
        const scrollVal = direction === "up" || direction === "left" ? -amount : amount;
        await page.evaluate(`document.querySelector('${sel}').${scrollProp} += ${scrollVal}`);
      } else {
        const scrollMap: Record<string, [number, number]> = {
          down: [0, amount], up: [0, -amount], right: [amount, 0], left: [-amount, 0],
        };
        const [x, y] = scrollMap[direction] ?? [0, amount];
        await page.mouse.wheel(x, y);
      }
      return `Scrolled ${direction} by ${amount}px`;
    }

    case "browser_hover": {
      if (toolArgs.ref) {
        const locator = snapshotBuilder.getRefLocator(page, toolArgs.ref as string);
        await locator.hover();
        return `Hovered over element [${toolArgs.ref}]`;
      } else if (toolArgs.selector) {
        await page.hover(toolArgs.selector as string);
        return `Hovered over selector: ${toolArgs.selector}`;
      }
      return "No hover target specified.";
    }

    case "browser_keyboard": {
      const key = toolArgs.key as string;
      const modifiers = (toolArgs.modifiers as string[]) ?? [];
      if (modifiers.length > 0) {
        const combo = [...modifiers, key].join("+");
        await page.keyboard.press(combo);
        return `Pressed key combination: ${combo}`;
      }
      await page.keyboard.press(key);
      return `Pressed key: ${key}`;
    }

    case "browser_select": {
      const selector = (toolArgs.ref ?? toolArgs.selector) as string;
      if (toolArgs.label) {
        await page.selectOption(selector, { label: toolArgs.label as string });
        return `Selected option with label "${toolArgs.label}" in ${selector}`;
      }
      if (toolArgs.value) {
        await page.selectOption(selector, toolArgs.value as string);
        return `Selected option with value "${toolArgs.value}" in ${selector}`;
      }
      return "No value or label provided for select.";
    }

    case "browser_file_upload": {
      const selector = (toolArgs.ref ?? toolArgs.selector ?? 'input[type="file"]') as string;
      const filePath = toolArgs.filePath as string;
      await page.setInputFiles(selector, filePath);
      return `Uploaded file "${filePath}" to ${selector}`;
    }

    case "browser_wait": {
      const timeout = (toolArgs.timeout as number) ?? 30000;
      if (toolArgs.selector) {
        await page.waitForSelector(toolArgs.selector as string, { timeout });
        return `Selector "${toolArgs.selector}" appeared`;
      } else if (toolArgs.text) {
        const searchText = (toolArgs.text as string).replace(/'/g, "\\'");
        await page.waitForFunction(
          `document.body.innerText.includes('${searchText}')`,
          { timeout },
        );
        return `Text "${toolArgs.text}" appeared`;
      } else if (toolArgs.navigation) {
        await page.waitForLoadState("networkidle", { timeout });
        return "Navigation completed";
      }
      return "No wait condition specified.";
    }

    case "browser_cookies": {
      const action = toolArgs.action as string;
      if (action === "get") {
        const cookies = await page.context().cookies();
        return JSON.stringify(cookies, null, 2);
      } else if (action === "set" && toolArgs.cookies) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.context().addCookies(toolArgs.cookies as any[]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return `Set ${(toolArgs.cookies as any[]).length} cookies`;
      } else if (action === "clear") {
        await page.context().clearCookies();
        return "Cleared all cookies";
      }
      return `Unknown cookie action: ${action}`;
    }

    case "browser_storage": {
      const storageType = toolArgs.type as string;
      const storageAction = toolArgs.action as string;
      const storageApi = storageType === "session" ? "sessionStorage" : "localStorage";

      if (storageAction === "getAll") {
        const data = await page.evaluate(`JSON.stringify(${storageApi})`);
        return data as string;
      } else if (storageAction === "get" && toolArgs.key) {
        const escapedKey = (toolArgs.key as string).replace(/'/g, "\\'");
        const val = await page.evaluate(`${storageApi}.getItem('${escapedKey}')`);
        return (val as string) ?? "(null)";
      } else if (storageAction === "set" && toolArgs.key) {
        const escapedKey = (toolArgs.key as string).replace(/'/g, "\\'");
        const escapedVal = (toolArgs.value as string ?? "").replace(/'/g, "\\'");
        await page.evaluate(`${storageApi}.setItem('${escapedKey}', '${escapedVal}')`);
        return `Set ${storageApi}.${toolArgs.key}`;
      } else if (storageAction === "clear") {
        await page.evaluate(`${storageApi}.clear()`);
        return `Cleared ${storageApi}`;
      }
      return `Unknown storage action: ${storageAction}`;
    }

    case "browser_network": {
      return "Network request logging requires active session monitoring. Use browser_console for captured logs.";
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

export interface MCPOptions {
  transport?: "stdio" | "sse" | "streamable-http";
  port?: string;
}

/**
 * MCP (Model Context Protocol) tool definitions for browser automation.
 * These tools are exposed to AI agents (Claude, GPT, etc.) through the MCP protocol.
 */
const MCP_TOOLS = [
  {
    name: "browser_navigate",
    description: "Navigate the browser to a URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["viewport", "full", "element"],
          description: "Screenshot mode",
        },
        selector: {
          type: "string",
          description: "CSS selector for element mode",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_click",
    description: "Click an element on the page",
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element reference ID (e.g., e1, e2)",
        },
        selector: {
          type: "string",
          description: "CSS selector (fallback)",
        },
        coordinates: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "Click coordinates (fallback for vision mode)",
        },
        button: {
          type: "string",
          enum: ["left", "right", "middle"],
          description: "Mouse button",
        },
        clickCount: {
          type: "number",
          description: "Number of clicks (2 for double-click)",
        },
      },
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_type",
    description: "Type text into an element",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
        selector: { type: "string", description: "CSS selector (fallback)" },
        text: { type: "string", description: "Text to type" },
        clear: {
          type: "boolean",
          description: "Clear existing text first",
        },
        pressEnter: {
          type: "boolean",
          description: "Press Enter after typing",
        },
      },
      required: ["text"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_snapshot",
    description:
      "Get an accessibility tree snapshot of the current page with element references",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["aria", "dom", "hybrid"],
          description: "Snapshot mode",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_console",
    description: "Get console logs from the browser",
    inputSchema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["all", "error", "warn", "log"],
          description: "Filter by log level",
        },
        clear: {
          type: "boolean",
          description: "Clear logs after reading",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_network",
    description: "Get network request logs",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Filter by URL pattern",
        },
        status: {
          type: "string",
          enum: ["all", "error", "redirect"],
          description: "Filter by status",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_evaluate",
    description: "Execute JavaScript in the browser context",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "JavaScript expression to evaluate",
        },
      },
      required: ["expression"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_select",
    description: "Select an option from a dropdown",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
        selector: { type: "string", description: "CSS selector" },
        value: { type: "string", description: "Value to select" },
        label: { type: "string", description: "Label text to select" },
      },
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page or an element",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
        },
        amount: { type: "number", description: "Pixels to scroll" },
        selector: {
          type: "string",
          description: "Element to scroll (defaults to page)",
        },
        toText: {
          type: "string",
          description: "Scroll until this text is visible",
        },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_hover",
    description: "Hover over an element",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
        selector: { type: "string", description: "CSS selector" },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_keyboard",
    description: "Press keyboard keys or key combinations",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Key name: Enter, Tab, Escape, ArrowDown, etc.",
        },
        modifiers: {
          type: "array",
          items: { type: "string", enum: ["Control", "Shift", "Alt", "Meta"] },
          description: "Modifier keys to hold",
        },
      },
      required: ["key"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_file_upload",
    description: "Upload a file to a file input",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
        selector: { type: "string", description: "CSS selector" },
        filePath: { type: "string", description: "Path to file to upload" },
      },
      required: ["filePath"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_wait",
    description: "Wait for a condition",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "Wait for selector to appear" },
        text: { type: "string", description: "Wait for text to appear" },
        navigation: { type: "boolean", description: "Wait for navigation to complete" },
        timeout: { type: "number", description: "Timeout in milliseconds" },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "browser_cookies",
    description: "Get or set browser cookies",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set", "clear"] },
        cookies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
              domain: { type: "string" },
            },
          },
        },
      },
      required: ["action"],
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "browser_storage",
    description: "Read or write localStorage/sessionStorage",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["local", "session"] },
        action: { type: "string", enum: ["get", "set", "clear", "getAll"] },
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["type", "action"],
    },
    annotations: { destructiveHint: true },
  },
];

/**
 * Handle an incoming MCP JSON-RPC request.
 */
async function handleMCPRequest(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}): Promise<object> {
  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "inspect-mcp",
            version: "0.1.0",
          },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: MCP_TOOLS,
        },
      };

    case "tools/call": {
      const toolName = request.params?.name as string;
      const toolArgs = request.params?.arguments as Record<string, unknown>;
      const tool = MCP_TOOLS.find((t) => t.name === toolName);

      if (!tool) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32602,
            message: `Unknown tool: ${toolName}`,
          },
        };
      }

      // Dispatch to real browser automation
      console.error(
        chalk.dim(`[MCP] Tool call: ${toolName}(${JSON.stringify(toolArgs)})`)
      );

      try {
        const resultText = await executeBrowserTool(toolName, toolArgs ?? {});
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              {
                type: "text",
                text: resultText,
              },
            ],
          },
        };
      } catch (toolErr) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              {
                type: "text",
                text: `Error executing ${toolName}: ${toolErr instanceof Error ? toolErr.message : toolErr}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    case "notifications/initialized":
      // Client notification, no response needed
      return { jsonrpc: "2.0", id: request.id, result: {} };

    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      };
  }
}

async function startStdioMCP(): Promise<void> {
  console.error(chalk.blue("Inspect MCP Server (stdio transport)"));
  console.error(chalk.dim(`Tools: ${MCP_TOOLS.length} available`));

  let buffer = "";

  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk;

    // Process complete JSON-RPC messages (separated by newlines)
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const request = JSON.parse(trimmed);
        const response = await handleMCPRequest(request);

        // Only send response if it has an id (not a notification)
        if (request.id !== undefined) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch (err) {
        const errorResponse = {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${err}`,
          },
        };
        process.stdout.write(JSON.stringify(errorResponse) + "\n");
      }
    }
  });

  process.stdin.on("end", async () => {
    console.error(chalk.dim("MCP stdin closed"));
    await closeBrowserSession();
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}

async function startSSEMCP(port: number): Promise<void> {
  const { createServer } = await import("node:http");

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";

    if (url === "/sse" && req.method === "GET") {
      // SSE endpoint for server-to-client messages
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send endpoint info
      res.write(
        `data: ${JSON.stringify({ endpoint: `/message` })}\n\n`
      );

      // Keep alive with heartbeat
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 15000);

      req.on("close", () => clearInterval(heartbeat));
    } else if (url === "/message" && req.method === "POST") {
      // HTTP endpoint for client-to-server messages
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", async () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const request = JSON.parse(body);
          const response = await handleMCPRequest(request);
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify(response));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: `Parse error: ${err}` },
            })
          );
        }
      });
    } else if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.error(chalk.blue("\nInspect MCP Server (SSE transport)"));
    console.error(`  ${chalk.green("→")} http://127.0.0.1:${port}`);
    console.error(chalk.dim(`  SSE endpoint: /sse`));
    console.error(chalk.dim(`  Message endpoint: /message`));
    console.error(chalk.dim(`  Tools: ${MCP_TOOLS.length} available\n`));
  });

  await new Promise(() => {});
}

async function startMCP(options: MCPOptions): Promise<void> {
  const transport = options.transport ?? "stdio";
  const port = parseInt(options.port ?? "4101", 10);

  switch (transport) {
    case "stdio":
      await startStdioMCP();
      break;
    case "sse":
      await startSSEMCP(port);
      break;
    case "streamable-http":
      // Streamable HTTP is similar to SSE but with bidirectional streaming
      console.log(
        chalk.yellow("Streamable HTTP transport not yet implemented. Falling back to SSE.")
      );
      await startSSEMCP(port);
      break;
    default:
      console.error(
        chalk.red(`Unknown transport: ${transport}. Use stdio, sse, or streamable-http.`)
      );
      process.exit(1);
  }
}

export function registerMCPCommand(program: Command): void {
  program
    .command("mcp")
    .description("Start the MCP (Model Context Protocol) server for AI agents")
    .option(
      "--transport <transport>",
      "Transport: stdio, sse, streamable-http",
      "stdio"
    )
    .option(
      "-p, --port <port>",
      "Port for SSE/HTTP transport",
      "4101"
    )
    .action(async (opts: MCPOptions) => {
      try {
        await startMCP(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
