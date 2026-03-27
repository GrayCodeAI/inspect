// ============================================================================
// @inspect/api - API Server Package
// ============================================================================

// Server
export { APIServer } from "./server.js";
export type {
  RouteHandler,
  Middleware,
  APIRequest,
  APIResponse,
  APIServerConfig,
} from "./server.js";

// Routes
export { registerTaskRoutes, InMemoryTaskStore } from "./routes/tasks.js";
export type { TaskStore } from "./routes/tasks.js";
export { registerWorkflowRoutes } from "./routes/workflows.js";
export type { WorkflowStore } from "./routes/workflows.js";
export { registerCredentialRoutes } from "./routes/credentials.js";
export type { CredentialVaultAPI } from "./routes/credentials.js";
export {
  registerSessionRoutes,
  InMemorySessionManager,
} from "./routes/sessions.js";
export type { BrowserSession, SessionManager } from "./routes/sessions.js";
export { registerSystemRoutes } from "./routes/system.js";
export { registerAuditRoutes } from "./routes/audits.js";
export type { HealthStatus, HealthCheck } from "./routes/system.js";

// Webhooks
export { WebhookManager } from "./webhooks/manager.js";
export type {
  WebhookRegistration,
  WebhookDelivery,
} from "./webhooks/manager.js";
export { RetryPolicy } from "./webhooks/retry.js";
export type {
  RetryConfig,
  RetryResult,
  DeadLetterEntry,
} from "./webhooks/retry.js";

// Middleware
export { RateLimiter } from "./middleware/rate-limit.js";
export type { RateLimitConfig } from "./middleware/rate-limit.js";
export { AuditLogger } from "./middleware/audit-log.js";
export type { AuditLogConfig, AuditLogEntry } from "./middleware/audit-log.js";

// Storage
export { JsonStore, PersistentTaskStore, PersistentWorkflowStore, PersistentSessionManager } from "./storage/index.js";
export { createPersistentStores, getDefaultDataDir } from "./storage/index.js";

// Streaming
export { SSEManager } from "./streaming/sse.js";
export type { SSEClient } from "./streaming/sse.js";
export { WebSocketManager } from "./streaming/websocket.js";
export type {
  WSClient,
  WSMessage,
  WSMessageHandler,
} from "./streaming/websocket.js";
