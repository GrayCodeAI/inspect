// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Logging, tracing, metrics, analytics, performance
// ──────────────────────────────────────────────────────────────────────────────

// Analytics & Telemetry
export { Analytics, PostHogProvider, ANALYTICS_EVENTS } from "./analytics.js";
export type {
  AnalyticsEventName,
  AnalyticsProvider,
  PostHogConfig,
  AnalyticsConfig,
} from "./analytics.js";

// Distributed Tracing
export { Tracer } from "./tracing.js";
export type { Span, SpanEvent, SpanStatus, OTLPExporterConfig } from "./tracing.js";

// Token Usage & Cost Metrics
export { MetricsCollector } from "./metrics.js";
export type { MetricFunction, MetricEntry, DurationTimer } from "./metrics.js";

// Web Performance Metrics
export { PerformanceMetrics, WEB_VITAL_THRESHOLDS } from "./performance.js";
export type { WebVitalName, PageLike } from "./performance.js";

// Notifications (Slack, Discord)
export { Notifier } from "./notifications.js";
export type { NotificationConfig, TestNotification } from "./notifications.js";

// Desktop Notifications (macOS, Linux, Windows)
export { DesktopNotifier } from "./desktop-notifier.js";
export type { DesktopNotificationOptions } from "./desktop-notifier.js";

// Structured Logging
export { Logger, createLogger } from "./logging.js";
export type { LogLevel, LogEntry, LoggerConfig } from "./logging.js";

// Cost Intelligence
export {
  CostPredictor,
  CostOptimizer,
  CostAttributionTracker,
  BudgetManager,
  type CostEstimate,
  type Optimization,
  type StepCostEntry,
  type CostAttribution,
} from "./cost.js";
