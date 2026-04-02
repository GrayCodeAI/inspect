// ──────────────────────────────────────────────────────────────────────────────
// @inspect/mcp - Standalone MCP (Model Context Protocol) Server
//
// Re-exports the MCP server implementation from @inspect/browser
// as a standalone package for direct MCP client integration.
// ──────────────────────────────────────────────────────────────────────────────

// Server
export { MCPServer } from "@inspect/browser";

// Tool definitions
export { BROWSER_TOOLS } from "@inspect/browser";

// MCP types from shared
export type {
  MCPToolDefinition,
  ToolCall,
  ToolResult,
} from "@inspect/shared";
