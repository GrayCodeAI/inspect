// ──────────────────────────────────────────────────────────────────────────────
// @inspect/mcp - MCP Server Entry Point
//
// Standalone entry point for running the MCP server via `npx @inspect/mcp`
// or `inspect-mcp` CLI command.
// ──────────────────────────────────────────────────────────────────────────────

import { MCPServer } from "@inspect/browser";

async function main(): Promise<void> {
  const server = new MCPServer();

  process.on("SIGINT", () => {
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    process.exit(0);
  });

  await server.start();
}

main().catch((err) => {
  process.stderr.write(`MCP server failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
