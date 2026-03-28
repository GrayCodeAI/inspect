// ============================================================================
// @inspect/api - Prometheus-compatible Metrics Endpoint
// ============================================================================

import type { Middleware, APIRequest, APIResponse } from "../server.js";

/** Metric entry */
interface MetricEntry {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  value: number;
  labels: Record<string, string>;
}

/**
 * MetricsCollector collects Prometheus-compatible metrics for the API server.
 */
export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private requestDurations: number[] = [];
  private startTime = Date.now();

  /** Increment a counter metric */
  increment(name: string, labels?: Record<string, string>): void {
    const key = this.metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  /** Set a gauge metric */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.metricKey(name, labels);
    this.gauges.set(key, value);
  }

  /** Record a request duration in ms */
  recordDuration(ms: number): void {
    this.requestDurations.push(ms);
    // Keep only last 1000 entries
    if (this.requestDurations.length > 1000) {
      this.requestDurations = this.requestDurations.slice(-1000);
    }
  }

  /** Export metrics in Prometheus text format */
  export(): string {
    const lines: string[] = [];
    const now = Date.now();

    // Uptime
    lines.push("# HELP inspect_uptime_seconds Server uptime in seconds");
    lines.push("# TYPE inspect_uptime_seconds gauge");
    lines.push(`inspect_uptime_seconds ${(now - this.startTime) / 1000}`);

    // Request counters
    lines.push("# HELP inspect_http_requests_total Total HTTP requests");
    lines.push("# TYPE inspect_http_requests_total counter");
    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseKey(key);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`inspect_http_requests_total{${labelStr}} ${value}`);
    }

    // Gauges
    lines.push("# HELP inspect_gauge Generic gauge metrics");
    lines.push("# TYPE inspect_gauge gauge");
    for (const [key, value] of this.gauges) {
      const { name, labels } = this.parseKey(key);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`inspect_gauge{name="${name}",${labelStr}} ${value}`);
    }

    // Request duration percentiles
    if (this.requestDurations.length > 0) {
      const sorted = [...this.requestDurations].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
      const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;

      lines.push("# HELP inspect_http_request_duration_ms HTTP request duration in milliseconds");
      lines.push("# TYPE inspect_http_request_duration_ms summary");
      lines.push(`inspect_http_request_duration_ms{quantile="0.5"} ${p50}`);
      lines.push(`inspect_http_request_duration_ms{quantile="0.9"} ${p90}`);
      lines.push(`inspect_http_request_duration_ms{quantile="0.99"} ${p99}`);
    }

    // Process metrics
    const mem = process.memoryUsage();
    lines.push("# HELP inspect_nodejs_heap_used_bytes Node.js heap used in bytes");
    lines.push("# TYPE inspect_nodejs_heap_used_bytes gauge");
    lines.push(`inspect_nodejs_heap_used_bytes ${mem.heapUsed}`);

    lines.push("# HELP inspect_nodejs_heap_total_bytes Node.js heap total in bytes");
    lines.push("# TYPE inspect_nodejs_heap_total_bytes gauge");
    lines.push(`inspect_nodejs_heap_total_bytes ${mem.heapTotal}`);

    lines.push("# HELP inspect_nodejs_rss_bytes Node.js RSS in bytes");
    lines.push("# TYPE inspect_nodejs_rss_bytes gauge");
    lines.push(`inspect_nodejs_rss_bytes ${mem.rss}`);

    return lines.join("\n") + "\n";
  }

  /** Create a middleware that tracks request metrics */
  middleware(): Middleware {
    return async (req: APIRequest, res: APIResponse, next: () => Promise<void>) => {
      const start = Date.now();
      this.increment("requests_total", { method: req.method });

      await next();

      const duration = Date.now() - start;
      this.recordDuration(duration);
      this.increment("responses_total", {
        method: req.method,
        status: String(res.statusCode),
      });
    };
  }

  private metricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return `${name}{${sorted.map(([k, v]) => `${k}=${v}`).join(",")}}`;
  }

  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const match = key.match(/^(.+?)\{(.+)\}$/);
    if (!match) return { name: key, labels: {} };
    const labels: Record<string, string> = {};
    for (const part of match[2].split(",")) {
      const [k, v] = part.split("=");
      if (k && v) labels[k] = v;
    }
    return { name: match[1], labels };
  }
}

/**
 * Register a /api/metrics endpoint that returns Prometheus text format.
 */
export function registerMetricsEndpoint(
  server: { get(path: string, handler: (req: APIRequest, res: APIResponse) => void): void },
  collector: MetricsCollector,
): void {
  server.get("/api/metrics", (_req: APIRequest, res: APIResponse) => {
    res.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(collector.export());
  });
}
