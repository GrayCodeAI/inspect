// ============================================================================
// @inspect/browser - Network Interceptor
//
// Mock API responses, block requests, and record HAR during testing.
// ============================================================================

import type { Page, Route} from "playwright";

export interface MockRoute {
  /** URL pattern to match (glob or regex) */
  urlPattern: string;
  /** HTTP method to match. Default: all */
  method?: string;
  /** Response to return */
  response: {
    status?: number;
    body?: string | Record<string, unknown>;
    headers?: Record<string, string>;
  };
}

export interface BlockRule {
  /** URL pattern to block */
  urlPattern: string;
  /** Resource types to block */
  resourceTypes?: string[];
}

/**
 * NetworkInterceptor mocks APIs, blocks requests, and records traffic.
 */
export class NetworkInterceptor {
  private page: Page;
  private mocks: MockRoute[] = [];
  private blocks: BlockRule[] = [];
  private recordedRequests: Array<{ url: string; method: string; status: number; resourceType: string; timestamp: number }> = [];
  private recording = false;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Mock an API response.
   */
  async mock(route: MockRoute): Promise<void> {
    this.mocks.push(route);
    await this.page.route(route.urlPattern, async (r: Route) => {
      if (route.method && r.request().method() !== route.method.toUpperCase()) {
        await r.continue();
        return;
      }

      const body = typeof route.response.body === "string"
        ? route.response.body
        : JSON.stringify(route.response.body);

      await r.fulfill({
        status: route.response.status ?? 200,
        body,
        headers: {
          "content-type": "application/json",
          ...route.response.headers,
        },
      });
    });
  }

  /**
   * Block requests matching patterns.
   */
  async block(rule: BlockRule): Promise<void> {
    this.blocks.push(rule);
    await this.page.route(rule.urlPattern, async (r: Route) => {
      if (rule.resourceTypes) {
        const type = r.request().resourceType();
        if (!rule.resourceTypes.includes(type)) {
          await r.continue();
          return;
        }
      }
      await r.abort("blockedbyclient");
    });
  }

  /**
   * Block common analytics/tracking requests.
   */
  async blockTrackers(): Promise<void> {
    const trackerPatterns = [
      "**/google-analytics.com/**",
      "**/googletagmanager.com/**",
      "**/facebook.net/**",
      "**/doubleclick.net/**",
      "**/hotjar.com/**",
      "**/mixpanel.com/**",
      "**/segment.com/**",
      "**/amplitude.com/**",
      "**/clarity.ms/**",
    ];
    for (const pattern of trackerPatterns) {
      await this.block({ urlPattern: pattern });
    }
  }

  /**
   * Start recording all network requests.
   */
  startRecording(): void {
    if (this.recording) return;
    this.recording = true;
    this.recordedRequests = [];

    this.page.on("response", (response) => {
      this.recordedRequests.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        resourceType: response.request().resourceType(),
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Stop recording and return requests.
   */
  stopRecording(): typeof this.recordedRequests {
    this.recording = false;
    return [...this.recordedRequests];
  }

  /**
   * Get failed requests (4xx, 5xx).
   */
  getFailedRequests(): typeof this.recordedRequests {
    return this.recordedRequests.filter((r) => r.status >= 400);
  }

  /**
   * Remove all mocks and blocks.
   */
  async clear(): Promise<void> {
    await this.page.unrouteAll({ behavior: "ignoreErrors" });
    this.mocks = [];
    this.blocks = [];
  }
}
