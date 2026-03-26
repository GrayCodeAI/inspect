import type { Command } from "commander";
import chalk from "chalk";
import { createServer as createNetServer } from "node:net";

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
function handleMCPRequest(request: {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}): object {
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

      // In full implementation: dispatch to actual browser automation
      console.error(
        chalk.dim(`[MCP] Tool call: ${toolName}(${JSON.stringify(toolArgs)})`)
      );

      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [
            {
              type: "text",
              text: `Tool ${toolName} executed successfully (stub). Args: ${JSON.stringify(toolArgs)}`,
            },
          ],
        },
      };
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
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    // Process complete JSON-RPC messages (separated by newlines)
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const request = JSON.parse(trimmed);
        const response = handleMCPRequest(request);

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

  process.stdin.on("end", () => {
    console.error(chalk.dim("MCP stdin closed"));
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
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        try {
          const request = JSON.parse(body);
          const response = handleMCPRequest(request);
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
