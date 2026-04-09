// ──────────────────────────────────────────────────────────────────────────────
// @inspect/dashboard - Real-time Web Dashboard for Inspect
// ──────────────────────────────────────────────────────────────────────────────

// Types
export type {
  DashboardMessage,
  TestStartedMessage,
  TestCompletedMessage,
  StepStartedMessage,
  StepCompletedMessage,
  AgentThinkingMessage,
  AgentActionMessage,
  ErrorMessage,
  StatsUpdateMessage,
  AgentAction,
  ActionResult,
  DashboardStats,
  TestExecution,
  StepExecution,
  TestFilter,
  PaginatedTests,
  DashboardConfig,
} from "./types/index.js";
export { DEFAULT_DASHBOARD_CONFIG } from "./types/index.js";

// Server
export { DashboardWebSocketServer } from "./server/websocket-server.js";

// Client
export { createDashboardClient, type DashboardClientInterface } from "./client/dashboard-client.js";
