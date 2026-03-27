// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - MCP (Model Context Protocol) Types
// ──────────────────────────────────────────────────────────────────────────────

/** MCP tool definition */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

/** MCP tool parameter definition */
export interface MCPToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

/** MCP tool definition (structured) */
export interface MCPTool {
  name: string;
  description: string;
  parameters: MCPToolParameter[];
  readOnlyHint: boolean;
  destructiveHint: boolean;
  category?: 'navigation' | 'observation' | 'interaction' | 'state' | 'extraction' | 'testing';
}

/** MCP tool call request */
export interface MCPToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  callId?: string;
}

/** MCP tool call result */
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** MCP server configuration */
export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  tools?: MCPTool[];
}
