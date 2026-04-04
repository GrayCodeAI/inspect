// ============================================================================
// @inspect/quality - Network Request Interceptor
// ============================================================================

import type { MockHandler, MockRequest, MockResponse } from "./handlers.js";
import { matchUrl, parseQuery, parseGraphQLOperation, isPassthrough } from "./handlers.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/interceptor");

/** Page-like interface with route() method (Playwright compatible) */
interface PageHandle {
  route(
    urlOrPredicate: string | RegExp | ((url: URL) => boolean),
    handler: RouteHandler,
  ): Promise<void>;
  unroute(
    urlOrPredicate: string | RegExp | ((url: URL) => boolean),
    handler?: RouteHandler,
  ): Promise<void>;
}

/** Playwright Route interface */
interface Route {
  request(): RouteRequest;
  fulfill(options: {
    status?: number;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<void>;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}

/** Playwright Route Request interface */
interface RouteRequest {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
  postData(): string | null;
}

type RouteHandler = (route: Route) => Promise<void>;

/** Interceptor configuration */
export interface InterceptorOptions {
  /** Whether to passthrough unmatched requests */
  passthrough?: boolean;
  /** Delay to add to all mock responses (ms) */
  delay?: number;
  /** Log intercepted requests */
  log?: boolean;
  /** Callback for each intercepted request */
  onIntercept?: (req: MockRequest, res: MockResponse | null) => void;
}

/** Intercepted request log entry */
export interface InterceptedRequest {
  timestamp: number;
  request: MockRequest;
  response: MockResponse | null;
  handlerId: string | null;
  duration: number;
}

/**
 * NetworkInterceptor uses Playwright's route() API to intercept
 * requests and return mock responses based on configured handlers.
 */
export class NetworkInterceptor {
  private handlers: MockHandler[] = [];
  private interceptLog: InterceptedRequest[] = [];
  private options: InterceptorOptions;
  private routeHandlerFn: RouteHandler | null = null;
  private page: PageHandle | null = null;
  private active = false;

  constructor(options: InterceptorOptions = {}) {
    this.options = {
      passthrough: true,
      delay: 0,
      log: false,
      ...options,
    };
  }

  /**
   * Start intercepting requests on a page with the given handlers.
   */
  async intercept(page: PageHandle, handlers: MockHandler[]): Promise<void> {
    this.page = page;
    this.handlers = [...handlers];
    this.interceptLog = [];
    this.active = true;

    this.routeHandlerFn = async (route: Route) => {
      await this.handleRoute(route);
    };

    // Intercept all requests
    await page.route("**/*", this.routeHandlerFn);
  }

  /**
   * Add a handler dynamically after interceptor is started.
   */
  addHandler(handler: MockHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Remove a handler by ID.
   */
  removeHandler(handlerId: string): void {
    this.handlers = this.handlers.filter((h) => h.id !== handlerId);
  }

  /**
   * Stop intercepting requests.
   */
  async stop(): Promise<void> {
    if (this.page && this.routeHandlerFn) {
      try {
        await this.page.unroute("**/*", this.routeHandlerFn);
      } catch (error) {
        logger.debug("Failed to unroute interceptor, page may already be closed", { error });
      }
    }
    this.active = false;
  }

  /**
   * Reset all handlers and logs.
   */
  reset(): void {
    this.handlers = [];
    this.interceptLog = [];
  }

  /**
   * Get the intercept log.
   */
  getLog(): InterceptedRequest[] {
    return [...this.interceptLog];
  }

  /**
   * Get call count for a specific handler.
   */
  getCallCount(handlerId: string): number {
    const handler = this.handlers.find((h) => h.id === handlerId);
    return handler?.callCount ?? 0;
  }

  /**
   * Handle an intercepted route.
   */
  private async handleRoute(route: Route): Promise<void> {
    const startTime = Date.now();
    const request = route.request();

    const mockReq: MockRequest = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: this.parseBody(request.postData()),
      params: {},
      query: parseQuery(request.url()),
    };

    // Check for GraphQL
    const graphqlOp = parseGraphQLOperation(mockReq.body);
    if (graphqlOp) {
      mockReq.operationName = graphqlOp.operationName;
      mockReq.variables = graphqlOp.variables;
    }

    // Find matching handler
    const matchedHandler = this.findHandler(mockReq);

    if (matchedHandler) {
      // Update params from URL match
      const urlMatch = matchUrl(matchedHandler.pattern, mockReq.url);
      mockReq.params = urlMatch.params;

      try {
        matchedHandler.callCount++;
        const mockRes = await matchedHandler.handler(mockReq);

        // Handle passthrough responses
        if (isPassthrough(mockRes)) {
          await route.continue();
          this.logRequest(mockReq, null, matchedHandler.id, startTime);
          return;
        }

        // Apply global delay
        if (this.options.delay && this.options.delay > 0) {
          await new Promise((r) => setTimeout(r, this.options.delay));
        }

        // Fulfill the request
        await route.fulfill({
          status: mockRes.status,
          headers: mockRes.headers,
          body: typeof mockRes.body === "string" ? mockRes.body : JSON.stringify(mockRes.body),
        });

        // Log
        this.logRequest(mockReq, mockRes, matchedHandler.id, startTime);

        // Remove one-time handlers
        if (matchedHandler.once) {
          this.handlers = this.handlers.filter((h) => h.id !== matchedHandler.id);
        }

        return;
      } catch (_error) {
        // Handler threw an error, continue with original request
        this.logRequest(mockReq, null, matchedHandler.id, startTime);
      }
    }

    // No matching handler found
    if (this.options.passthrough) {
      await route.continue();
    } else {
      await route.abort("connectionrefused");
    }

    this.logRequest(mockReq, null, null, startTime);
  }

  /**
   * Find the first matching handler for a request.
   */
  private findHandler(req: MockRequest): MockHandler | null {
    for (const handler of this.handlers) {
      if (handler.type === "graphql") {
        // GraphQL matching: match by operation name
        if (
          req.operationName &&
          (handler.pattern === "*" || handler.pattern === req.operationName)
        ) {
          return handler;
        }
        continue;
      }

      // REST matching: method + URL pattern
      if (handler.method && handler.method !== "*" && handler.method !== req.method) {
        continue;
      }

      const urlMatch = matchUrl(handler.pattern, req.url);
      if (urlMatch.matched) {
        return handler;
      }
    }

    return null;
  }

  /**
   * Parse a request body string into an object.
   */
  private parseBody(postData: string | null): unknown {
    if (!postData) return undefined;
    try {
      return JSON.parse(postData);
    } catch (error) {
      logger.debug("Failed to parse request body as JSON, using raw string", { error });
      return postData;
    }
  }

  /**
   * Log an intercepted request.
   */
  private logRequest(
    req: MockRequest,
    res: MockResponse | null,
    handlerId: string | null,
    startTime: number,
  ): void {
    if (!this.options.log) return;

    this.interceptLog.push({
      timestamp: startTime,
      request: req,
      response: res,
      handlerId,
      duration: Date.now() - startTime,
    });

    this.options.onIntercept?.(req, res);
  }
}
