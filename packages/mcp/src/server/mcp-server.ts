/**
 * Model Context Protocol (MCP) Server
 *
 * Implements the MCP specification for standardized tool/protocol communication.
 * Supports tool discovery, invocation, and resource management.
 */

import { EventEmitter } from "events";

export interface MCPServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Capabilities */
  capabilities: MCPCapabilities;
  /** Authentication */
  auth?: MCPAuthConfig;
  /** Rate limiting */
  rateLimit?: RateLimitConfig;
  /** Tool registry */
  tools: MCPTool[];
  /** Resource handlers */
  resources?: MCPResource[];
}

export interface MCPCapabilities {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  logging: boolean;
}

export interface MCPAuthConfig {
  type: "none" | "apiKey" | "oauth";
  apiKey?: string;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxTokensPerRequest: number;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  handler: (params: unknown) => Promise<unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType: string;
  handler: () => Promise<unknown>;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  description?: string;
}

export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface MCPSession {
  id: string;
  clientInfo: MCPClientInfo;
  establishedAt: number;
  lastActivity: number;
  requestCount: number;
}

export interface MCPClientInfo {
  name: string;
  version: string;
  capabilities: MCPCapabilities;
}

// MCP Error Codes
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
  RESOURCE_NOT_FOUND: -32003,
  RATE_LIMIT_EXCEEDED: -32004,
  AUTHENTICATION_ERROR: -32005,
} as const;

/**
 * MCP Server Implementation
 *
 * Provides standardized tool and resource management following the
 * Model Context Protocol specification.
 */
export class MCPServer extends EventEmitter {
  private config: MCPServerConfig;
  private sessions = new Map<string, MCPSession>();
  private toolMap = new Map<string, MCPTool>();
  private resourceMap = new Map<string, MCPResource>();
  private requestCounts = new Map<string, number[]>();

  constructor(config: MCPServerConfig) {
    super();
    this.config = config;

    // Index tools
    for (const tool of config.tools) {
      this.toolMap.set(tool.name, tool);
    }

    // Index resources
    if (config.resources) {
      for (const resource of config.resources) {
        this.resourceMap.set(resource.uri, resource);
      }
    }
  }

  /**
   * Handle incoming MCP request
   */
  async handleRequest(sessionId: string, request: MCPRequest): Promise<MCPResponse> {
    // Validate request
    if (request.jsonrpc !== "2.0") {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.INVALID_REQUEST,
        "Invalid JSON-RPC version",
      );
    }

    // Update session activity
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      session.requestCount++;
    }

    // Check rate limit
    if (this.isRateLimited(sessionId)) {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.RATE_LIMIT_EXCEEDED,
        "Rate limit exceeded",
      );
    }

    try {
      switch (request.method) {
        case "initialize":
          return this.handleInitialize(request);

        case "initialized":
          return this.createResponse(request.id, null);

        case "tools/list":
          return this.handleToolsList(request);

        case "tools/call":
          return this.handleToolCall(request);

        case "resources/list":
          return this.handleResourcesList(request);

        case "resources/read":
          return this.handleResourceRead(request);

        case "ping":
          return this.createResponse(request.id, null);

        default:
          return this.createError(
            request.id,
            MCP_ERROR_CODES.METHOD_NOT_FOUND,
            `Method not found: ${request.method}`,
          );
      }
    } catch (error) {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.INTERNAL_ERROR,
        error instanceof Error ? error.message : "Internal error",
      );
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(request: MCPRequest): MCPResponse {
    const params = request.params as { clientInfo?: MCPClientInfo };

    // Create session
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const session: MCPSession = {
      id: sessionId,
      clientInfo: params?.clientInfo || {
        name: "unknown",
        version: "0.0.0",
        capabilities: this.config.capabilities,
      },
      establishedAt: Date.now(),
      lastActivity: Date.now(),
      requestCount: 0,
    };

    this.sessions.set(sessionId, session);
    this.requestCounts.set(sessionId, []);

    this.emit("session:created", session);

    return this.createResponse(request.id, {
      protocolVersion: "2024-11-05",
      capabilities: this.config.capabilities,
      serverInfo: {
        name: this.config.name,
        version: this.config.version,
      },
      sessionId,
    });
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(request: MCPRequest): MCPResponse {
    const tools = Array.from(this.toolMap.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return this.createResponse(request.id, { tools });
  }

  /**
   * Handle tools/call request
   */
  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const params = request.params as { name: string; arguments?: unknown };

    if (!params?.name) {
      return this.createError(request.id, MCP_ERROR_CODES.INVALID_PARAMS, "Tool name is required");
    }

    const tool = this.toolMap.get(params.name);
    if (!tool) {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.TOOL_NOT_FOUND,
        `Tool not found: ${params.name}`,
      );
    }

    try {
      // Validate params against schema
      const validationError = this.validateParams(params.arguments, tool.inputSchema);
      if (validationError) {
        return this.createError(request.id, MCP_ERROR_CODES.INVALID_PARAMS, validationError);
      }

      // Execute tool
      this.emit("tool:before", { tool: params.name, params: params.arguments });
      const result = await tool.handler(params.arguments || {});
      this.emit("tool:after", { tool: params.name, result });

      return this.createResponse(request.id, {
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result),
          },
        ],
      });
    } catch (error) {
      this.emit("tool:error", {
        tool: params.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return this.createError(
        request.id,
        MCP_ERROR_CODES.TOOL_EXECUTION_ERROR,
        error instanceof Error ? error.message : "Tool execution failed",
      );
    }
  }

  /**
   * Handle resources/list request
   */
  private handleResourcesList(request: MCPRequest): MCPResponse {
    const resources = Array.from(this.resourceMap.values()).map((r) => ({
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType,
    }));

    return this.createResponse(request.id, { resources });
  }

  /**
   * Handle resources/read request
   */
  private async handleResourceRead(request: MCPRequest): Promise<MCPResponse> {
    const params = request.params as { uri: string };

    if (!params?.uri) {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.INVALID_PARAMS,
        "Resource URI is required",
      );
    }

    const resource = this.resourceMap.get(params.uri);
    if (!resource) {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
        `Resource not found: ${params.uri}`,
      );
    }

    try {
      const content = await resource.handler();

      return this.createResponse(request.id, {
        contents: [
          {
            uri: params.uri,
            mimeType: resource.mimeType,
            text: typeof content === "string" ? content : JSON.stringify(content),
          },
        ],
      });
    } catch (error) {
      return this.createError(
        request.id,
        MCP_ERROR_CODES.INTERNAL_ERROR,
        error instanceof Error ? error.message : "Failed to read resource",
      );
    }
  }

  /**
   * Validate params against schema
   */
  private validateParams(params: unknown, schema: JSONSchema): string | null {
    if (!schema.required || schema.required.length === 0) {
      return null;
    }

    if (typeof params !== "object" || params === null) {
      return "Params must be an object";
    }

    const obj = params as Record<string, unknown>;
    for (const key of schema.required) {
      if (!(key in obj)) {
        return `Missing required parameter: ${key}`;
      }
    }

    return null;
  }

  /**
   * Check if session is rate limited
   */
  private isRateLimited(sessionId: string): boolean {
    if (!this.config.rateLimit) return false;

    const timestamps = this.requestCounts.get(sessionId);
    if (!timestamps) return false;

    const oneMinuteAgo = Date.now() - 60000;
    const recent = timestamps.filter((t) => t > oneMinuteAgo);

    // Update timestamps
    recent.push(Date.now());
    this.requestCounts.set(sessionId, recent);

    return recent.length > this.config.rateLimit.maxRequestsPerMinute;
  }

  /**
   * Create success response
   */
  private createResponse(id: string | number, result: unknown): MCPResponse {
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  }

  /**
   * Create error response
   */
  private createError(
    id: string | number,
    code: number,
    message: string,
    data?: unknown,
  ): MCPResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    };
  }

  /**
   * Register a new tool
   */
  registerTool(tool: MCPTool): void {
    this.toolMap.set(tool.name, tool);
    this.emit("tool:registered", tool);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void {
    this.toolMap.delete(name);
    this.emit("tool:unregistered", { name });
  }

  /**
   * Register a resource
   */
  registerResource(resource: MCPResource): void {
    this.resourceMap.set(resource.uri, resource);
    this.emit("resource:registered", resource);
  }

  /**
   * Get session
   */
  getSession(sessionId: string): MCPSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): MCPSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Close session
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.requestCounts.delete(sessionId);
      this.emit("session:closed", session);
    }
  }

  /**
   * Get server info
   */
  getInfo(): { name: string; version: string; capabilities: MCPCapabilities } {
    return {
      name: this.config.name,
      version: this.config.version,
      capabilities: this.config.capabilities,
    };
  }

  /**
   * Close server
   */
  close(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
    this.emit("closed");
  }
}

/**
 * Create MCP server with standard Inspect tools
 */
export function createInspectMCPServer(): MCPServer {
  return new MCPServer({
    name: "inspect-browser-automation",
    version: "1.0.0",
    capabilities: {
      tools: true,
      resources: true,
      prompts: false,
      logging: true,
    },
    tools: [
      {
        name: "browser_navigate",
        description: "Navigate browser to a URL",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to navigate to" },
            waitForStable: {
              type: "boolean",
              description: "Wait for page stability",
            },
          },
          required: ["url"],
        },
        handler: async (params: unknown) => {
          const { url } = params as { url: string };
          return { success: true, url, message: `Navigated to ${url}` };
        },
      },
      {
        name: "browser_click",
        description: "Click an element on the page",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector or element ID" },
            text: { type: "string", description: "Text content to match" },
            role: { type: "string", description: "ARIA role to match" },
          },
          required: [],
        },
        handler: async (params: unknown) => {
          return { success: true, action: "click", params };
        },
      },
      {
        name: "browser_type",
        description: "Type text into an input field",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Input field selector" },
            text: { type: "string", description: "Text to type" },
            clearFirst: {
              type: "boolean",
              description: "Clear field before typing",
            },
          },
          required: ["selector", "text"],
        },
        handler: async (params: unknown) => {
          const { selector, text } = params as { selector: string; text: string };
          return { success: true, selector, text: `${text.slice(0, 10)}...` };
        },
      },
      {
        name: "browser_screenshot",
        description: "Capture screenshot of the current page",
        inputSchema: {
          type: "object",
          properties: {
            fullPage: { type: "boolean", description: "Capture full page" },
            selector: {
              type: "string",
              description: "Capture specific element",
            },
          },
        },
        handler: async (params: unknown) => {
          return {
            success: true,
            screenshot: "[base64-encoded-screenshot-data]",
            params,
          };
        },
      },
      {
        name: "browser_extract",
        description: "Extract data from the page",
        inputSchema: {
          type: "object",
          properties: {
            schema: {
              type: "object",
              description: "Schema defining what to extract",
            },
            selector: {
              type: "string",
              description: "Root element to extract from",
            },
          },
          required: ["schema"],
        },
        handler: async (params: unknown) => {
          return { success: true, data: {}, params };
        },
      },
      {
        name: "browser_observe",
        description: "Get structured page observation",
        inputSchema: {
          type: "object",
          properties: {
            includeAccessibility: {
              type: "boolean",
              description: "Include accessibility tree",
            },
          },
        },
        handler: async (_params: unknown) => {
          return {
            success: true,
            observation: {
              url: "https://example.com",
              title: "Example Page",
              elements: [],
            },
          };
        },
      },
    ],
    resources: [
      {
        uri: "inspect://docs/capabilities",
        name: "Inspect Capabilities",
        mimeType: "application/json",
        handler: async () => {
          return {
            browser: ["chrome", "firefox", "webkit"],
            features: ["navigation", "interaction", "extraction", "screenshots", "accessibility"],
          };
        },
      },
    ],
  });
}
