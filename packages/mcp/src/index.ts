// ──────────────────────────────────────────────────────────────────────────────
// @inspect/mcp - Model Context Protocol server
// ──────────────────────────────────────────────────────────────────────────────

export {
  type MCPServerConfig,
  type MCPCapabilities,
  type MCPAuthConfig,
  type RateLimitConfig,
  type MCPTool,
  type MCPResource,
  type JSONSchema,
  type MCPRequest,
  type MCPResponse,
  type MCPError,
  type MCPNotification,
  type MCPSession,
  type MCPClientInfo,
  MCP_ERROR_CODES,
  MCPServer,
  createInspectMCPServer,
} from "./server/mcp-server.js";
