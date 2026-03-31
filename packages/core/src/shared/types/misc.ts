// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Miscellaneous Shared Types
// ──────────────────────────────────────────────────────────────────────────────

// import type { LLMProviderName } from "./agent.js";

/** Analytics event categories */
export type AnalyticsEventCategory =
  | "session"
  | "plan"
  | "run"
  | "step"
  | "browser"
  | "agent"
  | "flow"
  | "error";

/** Analytics event */
export interface AnalyticsEvent {
  category: AnalyticsEventCategory;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** OpenTelemetry span */
export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes?: Record<string, unknown>;
  status?: "ok" | "error" | "unset";
}

/** Webhook configuration */
export interface WebhookConfig {
  url: string;
  events: string[];
  secret?: string;
  maxRetries: number;
  retryBackoff: "linear" | "exponential";
  enabled: boolean;
}

/** SSE event */
export interface SSEEvent {
  id?: string;
  event: string;
  data: string;
  retry?: number;
}

/** Benchmark task definition */
export interface EvalTask {
  id: string;
  name: string;
  description: string;
  url: string;
  instruction: string;
  expectedResult: unknown;
  maxSteps: number;
  timeout: number;
  benchmark: string;
}

/** Benchmark result */
export interface BenchmarkResult {
  taskId: string;
  passed: boolean;
  score: number;
  steps: number;
  duration: number;
  tokenUsage: import("./agent.js").TokenMetrics;
  model: string;
  error?: string;
}

/** Generic paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Generic result type */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/** Disposable resource */
export interface Disposable {
  dispose(): Promise<void>;
}

/** Health check response */
export interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  checks: {
    name: string;
    status: "pass" | "fail";
    message?: string;
  }[];
}
