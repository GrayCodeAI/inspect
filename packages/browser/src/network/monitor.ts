/**
 * Network interception for browser testing.
 * Provides HAR recording, request mocking, and request blocking.
 */

import { createLogger } from "@inspect/observability";

const logger = createLogger("browser/network");

/** A recorded network request */
export interface RecordedRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  postData?: string;
  timestamp: number;
  resourceType: string;
}

/** A recorded network response */
export interface RecordedResponse {
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodySize: number;
  mimeType: string;
  duration: number;
}

/** A complete HAR entry (request + response) */
export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: { mimeType: string; text: string };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    content: { size: number; mimeType: string };
    headersSize: number;
    bodySize: number;
  };
  timings: {
    send: number;
    wait: number;
    receive: number;
  };
}

/** HAR file format */
export interface HARFile {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HAREntry[];
  };
}

/** Mock response definition */
export interface MockRule {
  /** URL pattern to match (string or regex) */
  urlPattern: string | RegExp;
  /** HTTP method to match (optional) */
  method?: string;
  /** Mock response status */
  status?: number;
  /** Mock response headers */
  headers?: Record<string, string>;
  /** Mock response body (string or JSON object) */
  body?: string | Record<string, unknown>;
  /** Delay in ms before responding */
  delay?: number;
}

/** Block rule definition */
export interface BlockRule {
  /** URL pattern to block */
  urlPattern: string | RegExp;
  /** Resource types to block (e.g., "image", "font", "script") */
  resourceTypes?: string[];
}

let requestIdCounter = 0;

/**
 * NetworkMonitor records and intercepts network requests/responses.
 *
 * Usage:
 * ```ts
 * const monitor = new NetworkMonitor(page);
 * monitor.start();
 * // ... run test ...
 * const har = monitor.stop();
 * ```
 */
export class NetworkMonitor {
  private requests: RecordedRequest[] = [];
  private responses: Map<string, RecordedResponse> = new Map();
  private mockRules: MockRule[] = [];
  private blockRules: BlockRule[] = [];
  private requestStartTimes: Map<string, number> = new Map();
  private isActive = false;

  /**
   * Start monitoring network activity on a page.
   */
  start(page: { on: (event: string, handler: (...args: unknown[]) => void) => void }): void {
    this.isActive = true;

    // Monitor requests
    page.on("request", (req: any) => {
      if (!this.isActive) return;

      const request: RecordedRequest = {
        id: `req-${++requestIdCounter}`,
        method: req.method?.() ?? "GET",
        url: req.url?.() ?? "",
        headers: req.headers?.() ?? {},
        postData: req.postData?.(),
        timestamp: Date.now(),
        resourceType: req.resourceType?.() ?? "other",
      };

      this.requests.push(request);
      this.requestStartTimes.set(request.url, Date.now());
    });

    // Monitor responses
    page.on("response", (res: any) => {
      if (!this.isActive) return;

      const url = res.url?.() ?? "";
      const startTime = this.requestStartTimes.get(url) ?? Date.now();

      const response: RecordedResponse = {
        requestId: url,
        status: res.status?.() ?? 0,
        statusText: res.statusText?.() ?? "",
        headers: res.headers?.() ?? {},
        bodySize: 0,
        mimeType: res.headers?.()["content-type"] ?? "",
        duration: Date.now() - startTime,
      };

      this.responses.set(url, response);
    });

    logger.debug("Network monitoring started");
  }

  /**
   * Stop monitoring and return HAR file.
   */
  stop(): HARFile {
    this.isActive = false;
    logger.debug("Network monitoring stopped", { requests: this.requests.length });
    return this.toHAR();
  }

  /**
   * Get recorded requests.
   */
  getRequests(): RecordedRequest[] {
    return [...this.requests];
  }

  /**
   * Get recorded responses.
   */
  getResponses(): RecordedResponse[] {
    return [...this.responses.values()];
  }

  /**
   * Get requests filtered by resource type.
   */
  getRequestsByType(type: string): RecordedRequest[] {
    return this.requests.filter((r) => r.resourceType === type);
  }

  /**
   * Get failed requests (status >= 400).
   */
  getFailedRequests(): Array<{ request: RecordedRequest; response: RecordedResponse }> {
    const failed: Array<{ request: RecordedRequest; response: RecordedResponse }> = [];
    for (const req of this.requests) {
      const res = this.responses.get(req.url);
      if (res && res.status >= 400) {
        failed.push({ request: req, response: res });
      }
    }
    return failed;
  }

  /**
   * Get network summary statistics.
   */
  getStats(): {
    totalRequests: number;
    byType: Record<string, number>;
    failedCount: number;
    totalDuration: number;
    totalBytes: number;
  } {
    const byType: Record<string, number> = {};
    let totalDuration = 0;
    let totalBytes = 0;
    let failedCount = 0;

    for (const req of this.requests) {
      byType[req.resourceType] = (byType[req.resourceType] ?? 0) + 1;
    }

    for (const res of this.responses.values()) {
      totalDuration += res.duration;
      totalBytes += res.bodySize;
      if (res.status >= 400) failedCount++;
    }

    return {
      totalRequests: this.requests.length,
      byType,
      failedCount,
      totalDuration,
      totalBytes,
    };
  }

  /**
   * Convert to HAR file format.
   */
  toHAR(): HARFile {
    const entries: HAREntry[] = this.requests.map((req) => {
      const res = this.responses.get(req.url);
      const url = new URL(req.url, "http://localhost");

      return {
        startedDateTime: new Date(req.timestamp).toISOString(),
        time: res?.duration ?? 0,
        request: {
          method: req.method,
          url: req.url,
          httpVersion: "HTTP/1.1",
          headers: Object.entries(req.headers).map(([name, value]) => ({ name, value })),
          queryString: [...url.searchParams.entries()].map(([name, value]) => ({ name, value })),
          postData: req.postData ? { mimeType: "application/json", text: req.postData } : undefined,
          headersSize: -1,
          bodySize: req.postData?.length ?? 0,
        },
        response: {
          status: res?.status ?? 0,
          statusText: res?.statusText ?? "",
          headers: res ? Object.entries(res.headers).map(([name, value]) => ({ name, value })) : [],
          content: { size: res?.bodySize ?? 0, mimeType: res?.mimeType ?? "" },
          headersSize: -1,
          bodySize: res?.bodySize ?? 0,
        },
        timings: {
          send: 0,
          wait: res?.duration ?? 0,
          receive: 0,
        },
      };
    });

    return {
      log: {
        version: "1.2",
        creator: { name: "inspect", version: "0.1.0" },
        entries,
      },
    };
  }

  /**
   * Add a mock rule.
   */
  addMock(rule: MockRule): void {
    this.mockRules.push(rule);
  }

  /**
   * Add a block rule.
   */
  addBlock(rule: BlockRule): void {
    this.blockRules.push(rule);
  }

  /**
   * Clear all recorded data.
   */
  clear(): void {
    this.requests = [];
    this.responses.clear();
    this.requestStartTimes.clear();
  }

  /**
   * Get request count.
   */
  get size(): number {
    return this.requests.length;
  }
}
