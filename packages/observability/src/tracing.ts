// ──────────────────────────────────────────────────────────────────────────────
// @inspect/observability - Distributed Tracing (OpenTelemetry-compatible)
// ──────────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import type { OTelSpan } from "@inspect/shared";

/** Span status codes */
export type SpanStatus = "ok" | "error" | "unset";

/** Span event (annotation within a span) */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

/** Extended span with events and child tracking */
export interface Span extends OTelSpan {
  /** Events that occurred during the span */
  events: SpanEvent[];
  /** Duration in milliseconds (set when ended) */
  duration?: number;
}

/** OTLP exporter configuration */
export interface OTLPExporterConfig {
  /** OTLP HTTP endpoint (e.g. "http://localhost:4318/v1/traces") */
  endpoint: string;
  /** Additional headers for authentication */
  headers?: Record<string, string>;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** Batch size before auto-export (default: 50) */
  batchSize?: number;
  /** Export interval in ms (default: 5000) */
  exportIntervalMs?: number;
}

/**
 * Generate a 16-byte hex trace ID (32 chars).
 */
function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Generate an 8-byte hex span ID (16 chars).
 */
function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Tracer provides OpenTelemetry-compatible distributed tracing.
 * Spans are organized into traces with parent-child relationships.
 * Optionally exports to an OTLP HTTP endpoint.
 */
export class Tracer {
  private spans: Map<string, Span> = new Map();
  private activeSpanStack: Span[] = [];
  private completedSpans: Span[] = [];
  private exporterConfig: OTLPExporterConfig | undefined;
  private exportBuffer: Span[] = [];
  private exportTimer: ReturnType<typeof setInterval> | undefined;
  private serviceName: string;

  constructor(options?: {
    serviceName?: string;
    exporter?: OTLPExporterConfig;
  }) {
    this.serviceName = options?.serviceName ?? "inspect";

    // Configure OTLP exporter if endpoint is provided
    if (options?.exporter) {
      this.exporterConfig = options.exporter;
      this.startExportTimer();
    }

    // Also check environment for OTLP endpoint
    const envEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (envEndpoint && !this.exporterConfig) {
      this.exporterConfig = {
        endpoint: `${envEndpoint}/v1/traces`,
        headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
      };
      this.startExportTimer();
    }
  }

  /**
   * Start a new span. If there is an active parent span, the new span
   * is automatically linked as a child.
   *
   * @param name - Span name (e.g. "browser.navigate", "agent.act")
   * @param metadata - Initial span attributes
   * @returns The created span
   */
  startSpan(
    name: string,
    metadata?: Record<string, unknown>,
  ): Span {
    const parentSpan = this.activeSpanStack.length > 0
      ? this.activeSpanStack[this.activeSpanStack.length - 1]
      : undefined;

    const span: Span = {
      traceId: parentSpan?.traceId ?? generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId: parentSpan?.spanId,
      name,
      startTime: Date.now(),
      attributes: {
        "service.name": this.serviceName,
        ...metadata,
      },
      status: "unset",
      events: [],
    };

    this.spans.set(span.spanId, span);
    this.activeSpanStack.push(span);

    return span;
  }

  /**
   * End a span and record its duration.
   * The span is removed from the active stack and added to completed spans.
   *
   * @param span - The span to end
   * @param status - Final status (default: "ok")
   * @param attributes - Additional attributes to merge
   */
  endSpan(
    span: Span,
    status?: SpanStatus,
    attributes?: Record<string, unknown>,
  ): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status ?? "ok";

    if (attributes) {
      span.attributes = { ...span.attributes, ...attributes };
    }

    // Remove from active stack
    const idx = this.activeSpanStack.indexOf(span);
    if (idx !== -1) {
      this.activeSpanStack.splice(idx, 1);
    }

    this.completedSpans.push(span);

    // Add to export buffer
    if (this.exporterConfig) {
      this.exportBuffer.push(span);

      // Auto-export if buffer is full
      const batchSize = this.exporterConfig.batchSize ?? 50;
      if (this.exportBuffer.length >= batchSize) {
        this.exportSpans().catch(() => {});
      }
    }
  }

  /**
   * Add an event to an active span.
   *
   * @param span - The span to annotate
   * @param name - Event name
   * @param attributes - Event attributes
   */
  addEvent(
    span: Span,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Set an attribute on a span.
   */
  setAttribute(
    span: Span,
    key: string,
    value: unknown,
  ): void {
    if (!span.attributes) span.attributes = {};
    span.attributes[key] = value;
  }

  /**
   * Execute a function within a new span. The span is automatically
   * started before the function and ended after it completes (or errors).
   *
   * @param name - Span name
   * @param fn - The async function to execute within the span
   * @param metadata - Initial span attributes
   * @returns The result of the function
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T> {
    const span = this.startSpan(name, metadata);

    try {
      const result = await fn(span);
      this.endSpan(span, "ok");
      return result;
    } catch (error) {
      this.endSpan(span, "error", {
        "error.type": error instanceof Error ? error.name : "Error",
        "error.message": error instanceof Error ? error.message : String(error),
        "error.stack": error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get the currently active span (top of the stack).
   */
  getActiveSpan(): Span | undefined {
    return this.activeSpanStack.length > 0
      ? this.activeSpanStack[this.activeSpanStack.length - 1]
      : undefined;
  }

  /**
   * Get all completed spans.
   */
  getCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  /**
   * Get all spans for a specific trace.
   */
  getTrace(traceId: string): Span[] {
    return this.completedSpans.filter((s) => s.traceId === traceId);
  }

  /**
   * Reset all spans and clear the active stack.
   */
  reset(): void {
    this.spans.clear();
    this.activeSpanStack = [];
    this.completedSpans = [];
    this.exportBuffer = [];
  }

  /**
   * Shut down the tracer: export remaining spans and stop timers.
   */
  async shutdown(): Promise<void> {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = undefined;
    }

    // Final export
    if (this.exportBuffer.length > 0) {
      await this.exportSpans();
    }
  }

  // ── OTLP Export ──────────────────────────────────────────────────────────

  /**
   * Export buffered spans to the OTLP HTTP endpoint.
   */
  private async exportSpans(): Promise<void> {
    if (!this.exporterConfig || this.exportBuffer.length === 0) return;

    const spans = [...this.exportBuffer];
    this.exportBuffer = [];

    const payload = this.buildOtlpPayload(spans);
    const timeoutMs = this.exporterConfig.timeoutMs ?? 10_000;

    try {
      const response = await fetch(this.exporterConfig.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.exporterConfig.headers,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        // Put spans back in buffer for retry (up to a limit)
        if (this.exportBuffer.length < 500) {
          this.exportBuffer.unshift(...spans);
        }
      }
    } catch {
      // On network failure, put spans back if buffer isn't too large
      if (this.exportBuffer.length < 500) {
        this.exportBuffer.unshift(...spans);
      }
    }
  }

  /**
   * Build an OTLP-compatible JSON payload from spans.
   */
  private buildOtlpPayload(spans: Span[]): object {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: this.serviceName } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "inspect-tracer", version: "0.1.0" },
              spans: spans.map((span) => ({
                traceId: span.traceId,
                spanId: span.spanId,
                parentSpanId: span.parentSpanId ?? "",
                name: span.name,
                kind: 1, // INTERNAL
                startTimeUnixNano: String(span.startTime * 1_000_000),
                endTimeUnixNano: span.endTime
                  ? String(span.endTime * 1_000_000)
                  : undefined,
                attributes: span.attributes
                  ? Object.entries(span.attributes).map(([key, value]) => ({
                      key,
                      value: serializeAttributeValue(value),
                    }))
                  : [],
                status: {
                  code: span.status === "ok" ? 1 : span.status === "error" ? 2 : 0,
                },
                events: span.events.map((event) => ({
                  name: event.name,
                  timeUnixNano: String(event.timestamp * 1_000_000),
                  attributes: event.attributes
                    ? Object.entries(event.attributes).map(([key, value]) => ({
                        key,
                        value: serializeAttributeValue(value),
                      }))
                    : [],
                })),
              })),
            },
          ],
        },
      ],
    };
  }

  private startExportTimer(): void {
    if (this.exportTimer) return;
    const intervalMs = this.exporterConfig?.exportIntervalMs ?? 5_000;
    this.exportTimer = setInterval(() => {
      this.exportSpans().catch(() => {});
    }, intervalMs);

    if (this.exportTimer.unref) {
      this.exportTimer.unref();
    }
  }
}

/**
 * Serialize an attribute value to OTLP format.
 */
function serializeAttributeValue(
  value: unknown,
): Record<string, unknown> {
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => serializeAttributeValue(v)),
      },
    };
  }
  return { stringValue: String(value) };
}

/**
 * Parse OTEL_EXPORTER_OTLP_HEADERS env var format: "key1=val1,key2=val2"
 */
function parseOtlpHeaders(
  headerStr?: string,
): Record<string, string> | undefined {
  if (!headerStr) return undefined;
  const headers: Record<string, string> = {};
  for (const pair of headerStr.split(",")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) {
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      headers[key] = value;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}
