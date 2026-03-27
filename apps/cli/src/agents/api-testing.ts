// ============================================================================
// API & Network Testing Agent — Captures, validates, and tests API traffic
// ============================================================================

import type { ProgressCallback } from "./types.js";
import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

export interface CapturedResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body?: string;
  duration: number;
  contentType: string;
}

export interface APITestResult {
  endpoint: string;
  method: string;
  status: number;
  duration: number;
  schemaValid: boolean;
  errors: string[];
}

export interface NetworkLog {
  requests: CapturedRequest[];
  responses: CapturedResponse[];
  failures: Array<{ url: string; error: string }>;
}

export interface WebSocketLog {
  url: string;
  messages: Array<{
    direction: "sent" | "received";
    data: string;
    timestamp: number;
  }>;
}

// ---------------------------------------------------------------------------
// 1. Network logger — captures all HTTP traffic via Playwright events
// ---------------------------------------------------------------------------

export function createNetworkLogger(page: any): {
  start: () => void;
  stop: () => NetworkLog;
  getLog: () => NetworkLog;
} {
  const requests: CapturedRequest[] = [];
  const responses: CapturedResponse[] = [];
  const failures: Array<{ url: string; error: string }> = [];
  const requestTimings = new Map<string, number>();

  let onRequest: ((req: any) => void) | null = null;
  let onResponse: ((res: any) => void) | null = null;
  let onRequestFailed: ((req: any) => void) | null = null;

  function start(): void {
    onRequest = (req: any) => {
      const url = req.url() as string;
      const timestamp = Date.now();
      requestTimings.set(url, timestamp);

      let headers: Record<string, string> = {};
      try {
        headers = req.headers() as Record<string, string>;
      } catch {
        // Headers may not be available in all contexts
      }

      let body: string | undefined;
      try {
        body = req.postData() as string | undefined;
      } catch {
        // No post data
      }

      requests.push({
        url,
        method: req.method() as string,
        headers,
        body: body ?? undefined,
        timestamp,
      });
    };

    onResponse = (res: any) => {
      const url = res.url() as string;
      const startTime = requestTimings.get(url);
      const duration = startTime ? Date.now() - startTime : 0;
      requestTimings.delete(url);

      let headers: Record<string, string> = {};
      try {
        headers = res.headers() as Record<string, string>;
      } catch {
        // Headers may not be available
      }

      const contentType =
        headers["content-type"] ?? headers["Content-Type"] ?? "";

      responses.push({
        url,
        status: res.status() as number,
        headers,
        duration,
        contentType,
      });
    };

    onRequestFailed = (req: any) => {
      const url = req.url() as string;
      requestTimings.delete(url);

      let errorText = "Unknown error";
      try {
        errorText = req.failure()?.errorText ?? "Unknown error";
      } catch {
        // Failure info not available
      }

      failures.push({ url, error: errorText });
    };

    page.on("request", onRequest);
    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);
  }

  function getLog(): NetworkLog {
    return {
      requests: [...requests],
      responses: [...responses],
      failures: [...failures],
    };
  }

  function stop(): NetworkLog {
    if (onRequest) page.removeListener("request", onRequest);
    if (onResponse) page.removeListener("response", onResponse);
    if (onRequestFailed) page.removeListener("requestfailed", onRequestFailed);
    onRequest = null;
    onResponse = null;
    onRequestFailed = null;
    return getLog();
  }

  return { start, stop, getLog };
}

// ---------------------------------------------------------------------------
// 2. WebSocket logger — uses CDP to intercept WebSocket frames
// ---------------------------------------------------------------------------

export function createWebSocketLogger(page: any): {
  start: () => void;
  stop: () => WebSocketLog[];
  getLogs: () => WebSocketLog[];
} {
  const logsByUrl = new Map<string, WebSocketLog>();
  let cdpSession: any = null;
  let started = false;

  function getOrCreateLog(url: string): WebSocketLog {
    let log = logsByUrl.get(url);
    if (!log) {
      log = { url, messages: [] };
      logsByUrl.set(url, log);
    }
    return log;
  }

  function start(): void {
    if (started) return;
    started = true;

    // CDP session setup is async; fire and forget, frames arrive once ready
    (async () => {
      try {
        cdpSession = await page.context().newCDPSession(page);
        await cdpSession.send("Network.enable");

        cdpSession.on(
          "Network.webSocketCreated",
          (params: { requestId: string; url: string }) => {
            getOrCreateLog(params.url);
          },
        );

        cdpSession.on(
          "Network.webSocketFrameSent",
          (params: {
            requestId: string;
            timestamp: number;
            response: { payloadData: string };
          }) => {
            // Look up WebSocket URL by requestId — fall back to finding the first log
            const url = findWebSocketUrl(params.requestId) ?? "";
            const log = getOrCreateLog(url);
            log.messages.push({
              direction: "sent",
              data: params.response.payloadData,
              timestamp: Math.round(params.timestamp * 1000),
            });
          },
        );

        cdpSession.on(
          "Network.webSocketFrameReceived",
          (params: {
            requestId: string;
            timestamp: number;
            response: { payloadData: string };
          }) => {
            const url = findWebSocketUrl(params.requestId) ?? "";
            const log = getOrCreateLog(url);
            log.messages.push({
              direction: "received",
              data: params.response.payloadData,
              timestamp: Math.round(params.timestamp * 1000),
            });
          },
        );
      } catch {
        // CDP not available (non-Chromium browser) — WebSocket logging disabled
      }
    })();
  }

  // Track requestId -> URL mapping via webSocketCreated events
  const requestIdToUrl = new Map<string, string>();

  function findWebSocketUrl(requestId: string): string | undefined {
    return requestIdToUrl.get(requestId);
  }

  // Patch start to also track requestId mapping
  const originalStart = start;
  const patchedStart = (): void => {
    originalStart();

    // Override the CDP listener setup to include requestId tracking
    if (cdpSession) {
      cdpSession.on(
        "Network.webSocketCreated",
        (params: { requestId: string; url: string }) => {
          requestIdToUrl.set(params.requestId, params.url);
          getOrCreateLog(params.url);
        },
      );
    }
  };

  function getLogs(): WebSocketLog[] {
    return Array.from(logsByUrl.values());
  }

  function stop(): WebSocketLog[] {
    started = false;
    if (cdpSession) {
      cdpSession.detach().catch(() => {});
      cdpSession = null;
    }
    return getLogs();
  }

  return { start: patchedStart, stop, getLogs };
}

// ---------------------------------------------------------------------------
// 3. Schema validation — basic JSON schema checker (no external deps)
// ---------------------------------------------------------------------------

export async function validateResponseSchema(
  response: CapturedResponse,
  schema: Record<string, unknown>,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!response.body) {
    errors.push("Response body is empty");
    return { valid: false, errors };
  }

  let data: unknown;
  try {
    data = JSON.parse(response.body);
  } catch {
    errors.push("Response body is not valid JSON");
    return { valid: false, errors };
  }

  validateValue(data, schema, "", errors);

  return { valid: errors.length === 0, errors };
}

function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  const schemaType = schema["type"] as string | undefined;

  if (schemaType) {
    const actualType = getJsonType(value);
    if (schemaType !== actualType) {
      errors.push(
        `${path || "root"}: expected type "${schemaType}" but got "${actualType}"`,
      );
      return;
    }
  }

  // Object validation
  if (schemaType === "object" || (!schemaType && schema["properties"])) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${path || "root"}: expected object`);
      return;
    }

    const properties = schema["properties"] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const required = schema["required"] as string[] | undefined;

    if (required) {
      for (const key of required) {
        if (!(key in (value as Record<string, unknown>))) {
          errors.push(`${path ? path + "." : ""}${key}: required field missing`);
        }
      }
    }

    if (properties) {
      const obj = value as Record<string, unknown>;
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in obj) {
          validateValue(
            obj[key],
            propSchema,
            path ? `${path}.${key}` : key,
            errors,
          );
        }
      }
    }
  }

  // Array validation
  if (schemaType === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path || "root"}: expected array`);
      return;
    }

    const items = schema["items"] as Record<string, unknown> | undefined;
    if (items) {
      for (let i = 0; i < value.length; i++) {
        validateValue(value[i], items, `${path || "root"}[${i}]`, errors);
      }
    }

    const minItems = schema["minItems"] as number | undefined;
    if (minItems !== undefined && value.length < minItems) {
      errors.push(
        `${path || "root"}: array has ${value.length} items, minimum is ${minItems}`,
      );
    }

    const maxItems = schema["maxItems"] as number | undefined;
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push(
        `${path || "root"}: array has ${value.length} items, maximum is ${maxItems}`,
      );
    }
  }

  // String validation
  if (schemaType === "string" && typeof value === "string") {
    const minLength = schema["minLength"] as number | undefined;
    if (minLength !== undefined && value.length < minLength) {
      errors.push(
        `${path || "root"}: string length ${value.length} is less than minimum ${minLength}`,
      );
    }

    const maxLength = schema["maxLength"] as number | undefined;
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push(
        `${path || "root"}: string length ${value.length} exceeds maximum ${maxLength}`,
      );
    }

    const pattern = schema["pattern"] as string | undefined;
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          errors.push(
            `${path || "root"}: string does not match pattern "${pattern}"`,
          );
        }
      } catch {
        // Invalid pattern in schema — skip
      }
    }
  }

  // Number validation
  if (
    (schemaType === "number" || schemaType === "integer") &&
    typeof value === "number"
  ) {
    const minimum = schema["minimum"] as number | undefined;
    if (minimum !== undefined && value < minimum) {
      errors.push(
        `${path || "root"}: value ${value} is less than minimum ${minimum}`,
      );
    }

    const maximum = schema["maximum"] as number | undefined;
    if (maximum !== undefined && value > maximum) {
      errors.push(
        `${path || "root"}: value ${value} exceeds maximum ${maximum}`,
      );
    }

    if (schemaType === "integer" && !Number.isInteger(value)) {
      errors.push(`${path || "root"}: expected integer but got float`);
    }
  }

  // Enum validation
  const enumValues = schema["enum"] as unknown[] | undefined;
  if (enumValues && !enumValues.includes(value)) {
    errors.push(
      `${path || "root"}: value ${JSON.stringify(value)} is not in enum [${enumValues.map((v) => JSON.stringify(v)).join(", ")}]`,
    );
  }
}

function getJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value; // "string", "boolean", "object", "undefined"
}

// ---------------------------------------------------------------------------
// 4. Discover API endpoints from captured network traffic
// ---------------------------------------------------------------------------

/** File extensions that indicate static assets rather than API calls */
const STATIC_ASSET_PATTERN =
  /\.(js|css|png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot|map|mp4|webm|ogg|mp3|wav|pdf|zip|wasm)(\?|#|$)/i;

export async function discoverAPIEndpoints(
  log: NetworkLog,
): Promise<Array<{ url: string; method: string; contentType: string }>> {
  const seen = new Set<string>();
  const endpoints: Array<{ url: string; method: string; contentType: string }> =
    [];

  for (const response of log.responses) {
    // Skip static assets
    if (STATIC_ASSET_PATTERN.test(response.url)) continue;

    // Only include XHR/fetch-like content types (JSON, XML, text, form data)
    const ct = response.contentType.toLowerCase();
    const isApiLike =
      ct.includes("json") ||
      ct.includes("xml") ||
      ct.includes("text/plain") ||
      ct.includes("form-urlencoded") ||
      ct.includes("graphql") ||
      ct === "";

    if (!isApiLike) continue;

    // Find the corresponding request to get the method
    const matchingRequest = log.requests.find(
      (req) => req.url === response.url,
    );
    const method = matchingRequest?.method ?? "GET";

    // Normalize URL for deduplication: strip query params and trailing slashes
    let normalized: string;
    try {
      const parsed = new URL(response.url);
      normalized = `${method}:${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
    } catch {
      normalized = `${method}:${response.url}`;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);

    endpoints.push({
      url: response.url,
      method,
      contentType: response.contentType,
    });
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// 5. Mock API response — intercept and return a custom response
// ---------------------------------------------------------------------------

export async function mockAPIResponse(
  page: any,
  urlPattern: string,
  response: {
    status: number;
    body: string;
    headers?: Record<string, string>;
  },
): Promise<void> {
  await page.route(urlPattern, (route: any) => {
    route.fulfill({
      status: response.status,
      contentType:
        response.headers?.["content-type"] ??
        response.headers?.["Content-Type"] ??
        "application/json",
      headers: response.headers ?? {},
      body: response.body,
    });
  });
}

// ---------------------------------------------------------------------------
// 6. Simulate network errors — abort, timeout, or 500
// ---------------------------------------------------------------------------

export async function simulateNetworkError(
  page: any,
  urlPattern: string,
  errorType: "timeout" | "abort" | "500",
): Promise<void> {
  await page.route(urlPattern, async (route: any) => {
    switch (errorType) {
      case "abort":
        await route.abort("failed");
        break;

      case "timeout":
        // Delay long enough to trigger client-side timeouts, then abort
        await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
        try {
          await route.abort("timedout");
        } catch {
          // Route may already be closed if the page navigated
        }
        break;

      case "500":
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Internal Server Error",
            message: "Simulated server error by Inspect API testing agent",
          }),
        });
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// 7. CORS testing — check Access-Control-* headers
// ---------------------------------------------------------------------------

export async function testCORS(
  page: any,
  url: string,
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Perform a preflight-like fetch from the page context and inspect headers
  const corsHeaders = await safeEvaluate<{
    allowOrigin: string | null;
    allowMethods: string | null;
    allowHeaders: string | null;
    allowCredentials: string | null;
    exposeHeaders: string | null;
    maxAge: string | null;
    error: string | null;
  }>(
    page,
    `
    (async () => {
      try {
        const res = await fetch(${JSON.stringify(url)}, {
          method: "OPTIONS",
          headers: {
            "Origin": window.location.origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Content-Type",
          },
          mode: "cors",
        });
        return {
          allowOrigin: res.headers.get("access-control-allow-origin"),
          allowMethods: res.headers.get("access-control-allow-methods"),
          allowHeaders: res.headers.get("access-control-allow-headers"),
          allowCredentials: res.headers.get("access-control-allow-credentials"),
          exposeHeaders: res.headers.get("access-control-expose-headers"),
          maxAge: res.headers.get("access-control-max-age"),
          error: null,
        };
      } catch (err) {
        return {
          allowOrigin: null,
          allowMethods: null,
          allowHeaders: null,
          allowCredentials: null,
          exposeHeaders: null,
          maxAge: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })()
  `,
    {
      allowOrigin: null,
      allowMethods: null,
      allowHeaders: null,
      allowCredentials: null,
      exposeHeaders: null,
      maxAge: null,
      error: "safeEvaluate fallback",
    },
  );

  if (corsHeaders.error) {
    issues.push(`CORS request failed: ${corsHeaders.error}`);
    return { valid: false, issues };
  }

  // Check Access-Control-Allow-Origin
  if (!corsHeaders.allowOrigin) {
    issues.push(
      "Missing Access-Control-Allow-Origin header — cross-origin requests will be blocked",
    );
  } else if (corsHeaders.allowOrigin === "*") {
    issues.push(
      "Access-Control-Allow-Origin is wildcard (*) — overly permissive, any origin can access this resource",
    );

    // Wildcard with credentials is a critical misconfiguration
    if (corsHeaders.allowCredentials === "true") {
      issues.push(
        "CRITICAL: Access-Control-Allow-Credentials is true with wildcard origin — browsers reject this, but it indicates a misconfigured server",
      );
    }
  }

  // Check Allow-Methods
  if (!corsHeaders.allowMethods) {
    issues.push(
      "Missing Access-Control-Allow-Methods header — preflight requests may fail",
    );
  }

  // Check Allow-Headers
  if (!corsHeaders.allowHeaders) {
    issues.push(
      "Missing Access-Control-Allow-Headers header — custom headers in requests may be rejected",
    );
  }

  // Flag credentials with wildcard origin
  if (
    corsHeaders.allowCredentials === "true" &&
    corsHeaders.allowOrigin === "*"
  ) {
    issues.push(
      "Access-Control-Allow-Credentials with wildcard origin is invalid per the spec",
    );
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// 8. API audit — full end-to-end analysis of API traffic on a page
// ---------------------------------------------------------------------------

const SLOW_THRESHOLD_MS = 3000;
const LARGE_PAYLOAD_BYTES = 1024 * 1024; // 1 MB

export async function runAPIAudit(
  page: any,
  url: string,
  onProgress: ProgressCallback,
): Promise<{
  endpoints: number;
  avgResponseTime: number;
  failures: number;
  issues: string[];
}> {
  onProgress("info", "Running API & network audit...");

  // Set up network logger
  const logger = createNetworkLogger(page);
  logger.start();

  // Navigate to the URL
  onProgress("step", "  Navigating to page...");
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    } catch {
      onProgress("warn", "  Page navigation timed out, continuing with partial results");
    }
  }

  // Wait for additional async API calls to complete
  try {
    await page.waitForTimeout(2000);
  } catch {
    // Timeout helper not available
  }

  const log = logger.stop();
  const issues: string[] = [];

  // Discover API endpoints (filter out static assets)
  onProgress("step", "  Discovering API endpoints...");
  const endpoints = await discoverAPIEndpoints(log);

  // Analyze response times
  onProgress("step", "  Analyzing response times...");
  let totalDuration = 0;
  let responseCount = 0;

  for (const res of log.responses) {
    // Skip static assets for timing analysis
    if (STATIC_ASSET_PATTERN.test(res.url)) continue;

    totalDuration += res.duration;
    responseCount++;

    // Flag slow responses
    if (res.duration > SLOW_THRESHOLD_MS) {
      issues.push(
        `Slow response: ${res.url.slice(0, 100)} took ${res.duration}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`,
      );
    }
  }

  const avgResponseTime =
    responseCount > 0 ? Math.round(totalDuration / responseCount) : 0;

  // Flag 4xx/5xx responses
  onProgress("step", "  Checking for HTTP errors...");
  for (const res of log.responses) {
    if (STATIC_ASSET_PATTERN.test(res.url)) continue;

    if (res.status >= 400 && res.status < 500) {
      issues.push(
        `Client error ${res.status}: ${res.url.slice(0, 120)}`,
      );
    } else if (res.status >= 500) {
      issues.push(
        `Server error ${res.status}: ${res.url.slice(0, 120)}`,
      );
    }
  }

  // Flag missing Content-Type headers
  onProgress("step", "  Checking Content-Type headers...");
  for (const res of log.responses) {
    if (STATIC_ASSET_PATTERN.test(res.url)) continue;
    if (res.status === 204 || res.status === 304) continue; // No body expected

    if (!res.contentType) {
      issues.push(
        `Missing Content-Type header: ${res.url.slice(0, 120)}`,
      );
    }
  }

  // Flag large payloads
  onProgress("step", "  Checking payload sizes...");
  for (const req of log.requests) {
    if (req.body && req.body.length > LARGE_PAYLOAD_BYTES) {
      issues.push(
        `Large request payload (${formatBytes(req.body.length)}): ${req.method} ${req.url.slice(0, 100)}`,
      );
    }
  }

  // Count failed requests
  const failureCount = log.failures.length;
  for (const failure of log.failures) {
    issues.push(
      `Request failed: ${failure.url.slice(0, 100)} — ${failure.error}`,
    );
  }

  // Report results
  onProgress("step", `  Found ${endpoints.length} API endpoint(s)`);
  onProgress("step", `  Average response time: ${avgResponseTime}ms`);

  if (failureCount > 0) {
    onProgress("warn", `  ${failureCount} request(s) failed`);
  }

  if (issues.length === 0) {
    onProgress("pass", "  No API issues found");
  } else {
    onProgress("warn", `  ${issues.length} issue(s) found:`);
    for (const issue of issues.slice(0, 10)) {
      onProgress("warn", `    - ${issue}`);
    }
    if (issues.length > 10) {
      onProgress("warn", `    ... and ${issues.length - 10} more`);
    }
  }

  onProgress("done", "API & network audit complete.");

  return {
    endpoints: endpoints.length,
    avgResponseTime,
    failures: failureCount,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
