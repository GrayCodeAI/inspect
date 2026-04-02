// ──────────────────────────────────────────────────────────────────────────────
// MCP Tool Definitions - JSON Schema tool definitions for the browser MCP server
// ──────────────────────────────────────────────────────────────────────────────

import type { MCPToolDefinition } from "@inspect/shared";

/**
 * All browser MCP tool definitions with JSON Schema input schemas
 * and semantic annotations (readOnlyHint, destructiveHint, etc.).
 */
export const BROWSER_TOOLS: MCPToolDefinition[] = [
  // ── Browser lifecycle ──────────────────────────────────────────────────
  {
    name: "browser_open",
    description:
      "Launch a new browser instance with optional configuration. Supports headless/headed mode, viewport, proxy, stealth, and extensions.",
    inputSchema: {
      type: "object",
      properties: {
        headless: {
          type: "boolean",
          description: "Run in headless mode (default: true)",
          default: true,
        },
        viewport: {
          type: "object",
          properties: {
            width: { type: "number", description: "Viewport width in pixels" },
            height: { type: "number", description: "Viewport height in pixels" },
          },
          description: "Browser viewport dimensions",
        },
        stealth: { type: "boolean", description: "Enable stealth/anti-detection mode" },
        locale: { type: "string", description: "Browser locale (e.g., 'en-US')" },
        timezoneId: { type: "string", description: "Timezone ID (e.g., 'America/New_York')" },
        proxy: {
          type: "object",
          properties: {
            server: { type: "string", description: "Proxy server URL" },
            username: { type: "string" },
            password: { type: "string" },
          },
          required: ["server"],
        },
        userDataDir: {
          type: "string",
          description: "Path to user data directory for persistent profile",
        },
        executablePath: { type: "string", description: "Custom browser executable path" },
      },
    },
  },

  // ── Navigation ─────────────────────────────────────────────────────────
  {
    name: "browser_navigate",
    description: "Navigate the browser to a URL. Waits for the page to load.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle", "commit"],
          description: "When to consider navigation complete (default: 'load')",
          default: "load",
        },
      },
      required: ["url"],
    },
  },

  // ── Screenshots ────────────────────────────────────────────────────────
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page. Returns base64-encoded PNG.",
    inputSchema: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description: "Capture the full scrollable page (default: false)",
        },
        selector: { type: "string", description: "CSS selector of element to capture (optional)" },
      },
    },
  },

  // ── ARIA Snapshot ──────────────────────────────────────────────────────
  {
    name: "browser_snapshot",
    description:
      "Get the ARIA accessibility tree snapshot of the current page. Returns a structured tree with ref IDs (e1, e2, ...) for each element. Use refs with click/type tools.",
    inputSchema: {
      type: "object",
      properties: {
        interactiveOnly: {
          type: "boolean",
          description: "Only include interactive elements (buttons, links, inputs, etc.)",
          default: false,
        },
      },
    },
  },

  // ── Annotated Screenshot ───────────────────────────────────────────────
  {
    name: "browser_annotated",
    description:
      "Take a screenshot with numbered labels overlaid on interactive elements. Combines visual + ARIA data. Returns base64 image.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ── Click ──────────────────────────────────────────────────────────────
  {
    name: "browser_click",
    description:
      "Click an element on the page. Accepts a ref ID (e.g., 'e5') from a snapshot, a CSS selector, or x,y coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID from snapshot (e.g., 'e5')" },
        selector: { type: "string", description: "CSS selector" },
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" },
        doubleClick: { type: "boolean", description: "Double-click instead of single click" },
        rightClick: { type: "boolean", description: "Right-click (context menu)" },
      },
    },
  },

  // ── Type ───────────────────────────────────────────────────────────────
  {
    name: "browser_type",
    description:
      "Type text into an input field. First clicks the element to focus it, then types. Accepts ref ID, selector, or coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID from snapshot (e.g., 'e3')" },
        selector: { type: "string", description: "CSS selector" },
        text: { type: "string", description: "Text to type" },
        clearFirst: {
          type: "boolean",
          description: "Clear existing text before typing (default: true)",
          default: true,
        },
        pressEnter: { type: "boolean", description: "Press Enter after typing" },
      },
      required: ["text"],
    },
  },

  // ── Playwright evaluate ────────────────────────────────────────────────
  {
    name: "browser_playwright",
    description:
      "Execute arbitrary JavaScript in the browser page context. Returns the evaluation result. Use for complex interactions or data extraction not covered by other tools.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to evaluate in the page context" },
      },
      required: ["code"],
    },
  },

  // ── Console logs ───────────────────────────────────────────────────────
  {
    name: "browser_console_logs",
    description:
      "Get console messages from the browser page. Includes log, warn, error, info messages.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["log", "warn", "error", "info"],
          description: "Filter by message type (optional)",
        },
        limit: { type: "number", description: "Maximum number of messages to return", default: 50 },
      },
    },
  },

  // ── Network requests ───────────────────────────────────────────────────
  {
    name: "browser_network_requests",
    description:
      "Get network requests made by the page. Includes URL, method, status, headers, timing.",
    inputSchema: {
      type: "object",
      properties: {
        urlPattern: { type: "string", description: "Regex pattern to filter URLs" },
        resourceType: {
          type: "string",
          enum: [
            "document",
            "stylesheet",
            "image",
            "media",
            "font",
            "script",
            "texttrack",
            "xhr",
            "fetch",
            "other",
          ],
          description: "Filter by resource type",
        },
        limit: { type: "number", description: "Maximum number of requests to return", default: 50 },
      },
    },
  },

  // ── Performance metrics ────────────────────────────────────────────────
  {
    name: "browser_performance_metrics",
    description:
      "Get page performance metrics: FCP, LCP, CLS, INP, TTFB, resource counts, DOM size.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ── Cookies ────────────────────────────────────────────────────────────
  {
    name: "browser_cookies",
    description: "Get, set, or clear cookies for the current browser context.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "set", "clear"],
          description: "Cookie action to perform",
        },
        cookies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: { type: "string" },
              domain: { type: "string" },
              path: { type: "string" },
              httpOnly: { type: "boolean" },
              secure: { type: "boolean" },
            },
            required: ["name", "value"],
          },
          description: "Cookies to set (only for 'set' action)",
        },
      },
      required: ["action"],
    },
  },

  // ── Page to Markdown ───────────────────────────────────────────────────
  {
    name: "browser_markdown",
    description:
      "Convert the current page to clean Markdown. Preserves headings, links, lists, tables, and form elements. Interactive elements are annotated with ref IDs.",
    inputSchema: {
      type: "object",
      properties: {
        includeRefs: {
          type: "boolean",
          description: "Annotate interactive elements with ref IDs (default: true)",
          default: true,
        },
        includeImages: {
          type: "boolean",
          description: "Include image markdown tags (default: true)",
          default: true,
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden/invisible elements (default: false)",
          default: false,
        },
        maxLength: {
          type: "number",
          description: "Maximum content length in characters (default: 50000)",
          default: 50000,
        },
      },
    },
  },

  // ── Close ──────────────────────────────────────────────────────────────
  {
    name: "browser_close",
    description: "Close the browser instance and clean up all resources.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Quality and testing MCP tool definitions.
 * These extend the browser tools with accessibility, performance, security, and testing capabilities.
 */
export const QUALITY_TOOLS: MCPToolDefinition[] = [
  {
    name: "a11y_audit",
    description:
      "Run an accessibility audit on the current page using axe-core. Checks WCAG 2.2 compliance.",
    inputSchema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["A", "AA", "AAA"],
          description: "WCAG conformance level to check",
          default: "AA",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description: "CSS selectors to include in audit",
        },
      },
    },
  },
  {
    name: "perf_audit",
    description: "Run a performance audit measuring Core Web Vitals (LCP, CLS, INP, FCP, TTFB).",
    inputSchema: {
      type: "object",
      properties: {
        duration: {
          type: "number",
          description: "Measurement duration in ms (default: 5000)",
          default: 5000,
        },
      },
    },
  },
  {
    name: "security_scan",
    description:
      "Run a security scan checking headers, CSP, mixed content, and common vulnerabilities.",
    inputSchema: {
      type: "object",
      properties: {
        checks: {
          type: "array",
          items: { type: "string" },
          description: "Specific checks to run (headers, csp, mixed-content, cookies)",
        },
      },
    },
  },
  {
    name: "run_test",
    description:
      "Execute a test case with the Inspect agent. Provide a natural language instruction.",
    inputSchema: {
      type: "object",
      properties: {
        instruction: { type: "string", description: "Natural language test instruction" },
        url: { type: "string", description: "URL to test" },
        maxSteps: { type: "number", description: "Maximum test steps", default: 25 },
      },
      required: ["instruction", "url"],
    },
  },
  {
    name: "visual_diff",
    description: "Compare two screenshots and return a visual diff report with pixel differences.",
    inputSchema: {
      type: "object",
      properties: {
        baseline: { type: "string", description: "Path to baseline screenshot" },
        current: { type: "string", description: "Path to current screenshot" },
        threshold: {
          type: "number",
          description: "Pixel difference threshold (0-1)",
          default: 0.1,
        },
      },
      required: ["baseline", "current"],
    },
  },
  {
    name: "extract_data",
    description:
      "Extract structured data from the current page using CSS selectors or LLM analysis.",
    inputSchema: {
      type: "object",
      properties: {
        schema: { type: "object", description: "JSON schema describing the data to extract" },
        selectors: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "CSS selectors for each field",
        },
      },
    },
  },
];

/**
 * Get all tool definitions (browser + quality).
 */
export function getAllToolDefinitions(): MCPToolDefinition[] {
  return [...BROWSER_TOOLS, ...QUALITY_TOOLS];
}

/**
 * Get a tool definition by name (searches both browser and quality tools).
 */
export function getToolDefinition(name: string): MCPToolDefinition | undefined {
  return BROWSER_TOOLS.find((t) => t.name === name) ?? QUALITY_TOOLS.find((t) => t.name === name);
}

/**
 * Get all tool names (browser + quality).
 */
export function getToolNames(): string[] {
  return [...BROWSER_TOOLS, ...QUALITY_TOOLS].map((t) => t.name);
}
