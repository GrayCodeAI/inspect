/**
 * Network Stability Detector - Tasks 296-310
 *
 * Monitor and detect network request completion, idle states,
 * and XHR/fetch completion for page stability detection
 */

import type { Page, APIResponse } from "playwright";

/**
 * Network request tracking
 */
export interface NetworkRequest {
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  timestamp: number;
  duration?: number;
  size?: number;
}

/**
 * Network stability metrics
 */
export interface NetworkMetrics {
  activeRequests: number;
  totalRequests: number;
  failedRequests: number;
  averageRequestTime: number;
  isIdle: boolean;
  lastActivityTime: number;
  errors: string[];
}

/**
 * Task 296-300: Network detector configuration
 */
export interface NetworkDetectorConfig {
  idleTimeout: number; // ms without requests to consider idle
  maxWaitTime: number; // max time to wait for stability
  trackResourceTypes: string[];
  ignorePatterns: RegExp[];
  captureResponse: boolean; // capture response bodies
}

export const DEFAULT_NETWORK_CONFIG: NetworkDetectorConfig = {
  idleTimeout: 500,
  maxWaitTime: 30000,
  trackResourceTypes: [
    "document",
    "stylesheet",
    "image",
    "media",
    "font",
    "script",
    "xhr",
    "fetch",
  ],
  ignorePatterns: [
    /localhost:9222/,
    /chrome-extension:\/\//,
    /about:/,
    /data:/,
  ],
  captureResponse: false,
};

/**
 * Task 296-305: Network stability detector
 */
export class NetworkDetector {
  private page: Page;
  private config: NetworkDetectorConfig;
  private requests: Map<string, NetworkRequest> = new Map();
  private completedRequests: NetworkRequest[] = [];
  private startTime: number = 0;
  private lastActivityTime: number = 0;
  private failedRequests: Set<string> = new Set();

  constructor(page: Page, config: Partial<NetworkDetectorConfig> = {}) {
    this.page = page;
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
  }

  /**
   * Task 297: Start tracking network activity
   */
  async start(): Promise<void> {
    // Task 297a: Track request sent
    this.page.on("request", (request) => {
      const resourceType = request.resourceType();
      const url = request.url();

      // Skip if matches ignore patterns
      if (this.shouldIgnore(url)) return;

      const req: NetworkRequest = {
        url,
        method: request.method(),
        resourceType,
        timestamp: Date.now(),
      };

      this.requests.set(url, req);
      this.lastActivityTime = Date.now();
    });

    // Task 298: Track request completion
    this.page.on("response", (response) => {
      const url = response.url();
      const request = this.requests.get(url);

      if (!request) return;

      request.status = response.status();
      request.duration = Date.now() - request.timestamp;

      // Track failures
      if (response.status() >= 400) {
        this.failedRequests.add(url);
      }

      this.completedRequests.push(request);
      this.lastActivityTime = Date.now();
    });

    // Task 299: Track request failure
    this.page.on("requestfailed", (request) => {
      const url = request.url();
      this.failedRequests.add(url);
      this.lastActivityTime = Date.now();
    });

    // Task 300: Track abort
    this.page.on("requestfinished", () => {
      this.lastActivityTime = Date.now();
    });
  }

  /**
   * Task 301-305: Check network stability
   */
  async waitForNetworkIdle(timeout: number = this.config.idleTimeout): Promise<boolean> {
    const startTime = Date.now();
    const maxWait = Math.min(timeout, this.config.maxWaitTime);

    while (Date.now() - startTime < maxWait) {
      const idleTime = Date.now() - this.lastActivityTime;

      if (idleTime >= timeout && this.requests.size === 0) {
        return true;
      }

      // Wait a bit and retry
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }

  /**
   * Task 306-310: Get network metrics
   */
  getMetrics(): NetworkMetrics {
    const now = Date.now();
    const idleTime = now - this.lastActivityTime;

    let totalTime = 0;
    for (const req of this.completedRequests) {
      if (req.duration) totalTime += req.duration;
    }

    return {
      activeRequests: this.requests.size,
      totalRequests: this.completedRequests.length,
      failedRequests: this.failedRequests.size,
      averageRequestTime:
        this.completedRequests.length > 0
          ? totalTime / this.completedRequests.length
          : 0,
      isIdle: idleTime >= this.config.idleTimeout,
      lastActivityTime: this.lastActivityTime,
      errors: Array.from(this.failedRequests),
    };
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): NetworkRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * Get completed requests
   */
  getCompletedRequests(): NetworkRequest[] {
    return [...this.completedRequests];
  }

  /**
   * Clear tracking data
   */
  reset(): void {
    this.requests.clear();
    this.completedRequests = [];
    this.failedRequests.clear();
    this.lastActivityTime = Date.now();
  }

  /**
   * Stop tracking
   */
  async stop(): Promise<void> {
    // Cleanup listeners
    this.page.removeAllListeners("request");
    this.page.removeAllListeners("response");
    this.page.removeAllListeners("requestfailed");
    this.page.removeAllListeners("requestfinished");
  }

  /**
   * Check if URL should be ignored
   */
  private shouldIgnore(url: string): boolean {
    return this.config.ignorePatterns.some((pattern) => pattern.test(url));
  }
}
