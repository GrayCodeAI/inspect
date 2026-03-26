// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Logging, tracing, metrics, analytics, performance
// ──────────────────────────────────────────────────────────────────────────────

// Analytics & Telemetry
export {
  Analytics,
  PostHogProvider,
  ANALYTICS_EVENTS,
} from "./analytics.js";
export type {
  AnalyticsEventName,
  AnalyticsProvider,
  PostHogConfig,
  AnalyticsConfig,
} from "./analytics.js";

// Distributed Tracing
export { Tracer } from "./tracing.js";
export type {
  Span,
  SpanEvent,
  SpanStatus,
  OTLPExporterConfig,
} from "./tracing.js";

// Token Usage & Cost Metrics
export { MetricsCollector } from "./metrics.js";
export type {
  MetricFunction,
  MetricEntry,
  DurationTimer,
} from "./metrics.js";

// Web Performance Metrics
export {
  PerformanceMetrics,
  WEB_VITAL_THRESHOLDS,
} from "./performance.js";
export type {
  WebVitalName,
  PageLike,
} from "./performance.js";

// Structured Logging
export { Logger, createLogger } from "./logging.js";
export type {
  LogLevel,
  LogEntry,
  LoggerConfig,
} from "./logging.js";
