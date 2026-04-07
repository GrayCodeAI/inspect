// ──────────────────────────────────────────────────────────────────────────────
// @inspect/api - API server and routes
// ──────────────────────────────────────────────────────────────────────────────

// Server
export {
  APIServer,
  type RouteHandler,
  type Middleware,
  type APIRequest,
  type APIResponse,
} from "./server.js";

// Middleware
export { createRBACMiddleware } from "./middleware/rbac.js";
export { createRBACMiddleware as rbacMiddleware } from "./middleware/rbac.js";
export { AuditLogger } from "./middleware/audit-log.js";
export { MetricsCollector, registerMetricsEndpoint } from "./middleware/metrics.js";
export { RateLimiter } from "./middleware/rate-limit.js";
export { RouteRateLimiter } from "./middleware/route-rate-limit.js";

// Routes
export { registerTaskRoutes, InMemoryTaskStore } from "./routes/tasks.js";
export { registerWorkflowRoutes } from "./routes/workflows.js";
export { registerCredentialRoutes } from "./routes/credentials.js";
export { registerSessionRoutes, InMemorySessionManager } from "./routes/sessions.js";
export { registerAuditRoutes } from "./routes/audits.js";
export { registerSystemRoutes, type HealthCheck } from "./routes/system.js";
export { registerDashboardRoutes } from "./routes/dashboard.js";

// Streaming
export { SSEManager } from "./streaming/sse.js";
export { WebSocketManager, type WSMessageHandler } from "./streaming/websocket.js";

// Storage
export {
  PersistentTaskStore,
  PersistentWorkflowStore,
  PersistentSessionManager,
  createPersistentStores,
  type PersistentStores,
} from "./storage/persistent-stores.js";
export { JsonStore } from "./storage/json-store.js";

// Webhooks
export { WebhookManager } from "./webhooks/manager.js";
export { RetryPolicy } from "./webhooks/retry.js";
