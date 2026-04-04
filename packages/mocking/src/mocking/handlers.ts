// ============================================================================
// @inspect/quality - Mock Handlers (MSW-inspired)
// ============================================================================

import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/mock-handlers");

/** Mock request representation */
export interface MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  params: Record<string, string>;
  query: Record<string, string>;
  /** GraphQL operation name (if applicable) */
  operationName?: string;
  /** GraphQL variables (if applicable) */
  variables?: Record<string, unknown>;
}

/** Mock response builder */
export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Handler function signature */
export type HandlerFn = (req: MockRequest) => MockResponse | Promise<MockResponse>;

/** Mock handler definition */
export interface MockHandler {
  /** Unique handler ID */
  id: string;
  /** Handler type */
  type: "rest" | "graphql";
  /** HTTP method (REST) */
  method?: string;
  /** URL pattern (REST) or operation name (GraphQL) */
  pattern: string;
  /** Handler function */
  handler: HandlerFn;
  /** Whether this is a one-time handler */
  once?: boolean;
  /** Number of times this handler has been called */
  callCount: number;
}

/** Response helper to create MockResponse objects */
export function response(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): MockResponse {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ?? null,
  };
}

/**
 * MSW-compatible HttpResponse class with static factory methods.
 */
export const HttpResponse = {
  json(body: unknown, init?: { status?: number; headers?: Record<string, string> }): MockResponse {
    return {
      status: init?.status ?? 200,
      headers: { "Content-Type": "application/json", ...init?.headers },
      body,
    };
  },

  text(body: string, init?: { status?: number; headers?: Record<string, string> }): MockResponse {
    return {
      status: init?.status ?? 200,
      headers: { "Content-Type": "text/plain", ...init?.headers },
      body,
    };
  },

  html(body: string, init?: { status?: number; headers?: Record<string, string> }): MockResponse {
    return {
      status: init?.status ?? 200,
      headers: { "Content-Type": "text/html", ...init?.headers },
      body,
    };
  },

  xml(body: string, init?: { status?: number; headers?: Record<string, string> }): MockResponse {
    return {
      status: init?.status ?? 200,
      headers: { "Content-Type": "application/xml", ...init?.headers },
      body,
    };
  },

  error(init?: { status?: number; headers?: Record<string, string> }): MockResponse {
    return {
      status: init?.status ?? 500,
      headers: { "Content-Type": "application/json", ...init?.headers },
      body: null,
    };
  },
};

/**
 * Delay execution for a given duration.
 * MSW-compatible: `await delay(500)`, `await delay()` (realistic), `await delay("infinite")`.
 */
export function delay(duration?: number | "infinite"): Promise<void> {
  if (duration === "infinite") {
    return new Promise(() => {}); // never resolves
  }
  const ms = duration ?? Math.floor(Math.random() * 400 + 100); // realistic: 100-500ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Signal that a request should pass through to the real server.
 * Use inside a handler: `return passthrough()`.
 */
const PASSTHROUGH_SYMBOL = Symbol("passthrough");

export function passthrough(): MockResponse {
  return {
    status: 0,
    headers: {},
    body: PASSTHROUGH_SYMBOL as unknown,
  };
}

/**
 * Check if a response is a passthrough signal.
 */
export function isPassthrough(res: MockResponse): boolean {
  return res.body === (PASSTHROUGH_SYMBOL as unknown);
}

let handlerIdCounter = 0;

function createHandler(
  type: "rest" | "graphql",
  method: string | undefined,
  pattern: string,
  handler: HandlerFn,
  once?: boolean,
): MockHandler {
  return {
    id: `handler_${++handlerIdCounter}`,
    type,
    method,
    pattern,
    handler,
    once,
    callCount: 0,
  };
}

/**
 * REST mock handler builders.
 */
export const rest = {
  get(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "GET", path, handler);
  },

  post(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "POST", path, handler);
  },

  put(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "PUT", path, handler);
  },

  patch(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "PATCH", path, handler);
  },

  delete(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "DELETE", path, handler);
  },

  head(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "HEAD", path, handler);
  },

  options(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "OPTIONS", path, handler);
  },

  all(path: string, handler: HandlerFn): MockHandler {
    return createHandler("rest", "*", path, handler);
  },
};

/**
 * GraphQL mock handler builders.
 */
export const graphql = {
  query(operationName: string, handler: HandlerFn): MockHandler {
    return createHandler("graphql", "POST", operationName, handler);
  },

  mutation(operationName: string, handler: HandlerFn): MockHandler {
    return createHandler("graphql", "POST", operationName, handler);
  },

  /**
   * Match any GraphQL operation.
   */
  operation(handler: HandlerFn): MockHandler {
    return createHandler("graphql", "POST", "*", handler);
  },
};

/**
 * Match a URL against a pattern with path parameters.
 * Supports patterns like "/api/users/:id" and "/api/posts/:postId/comments/:commentId".
 */
export function matchUrl(
  pattern: string,
  url: string,
): { matched: boolean; params: Record<string, string> } {
  const params: Record<string, string> = {};

  // Handle wildcard
  if (pattern === "*") return { matched: true, params };

  // Handle glob patterns
  if (pattern.includes("*")) {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\//g, "\\/") + "$");
    return { matched: regex.test(url), params };
  }

  // Parse URL to get pathname
  let urlPath: string;
  try {
    const parsed = new URL(url);
    urlPath = parsed.pathname;
  } catch (error) {
    logger.debug("Failed to parse URL for matching, using raw value", { url, error });
    urlPath = url;
  }

  // Split pattern and URL into segments
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = urlPath.split("/").filter(Boolean);

  if (patternParts.length !== urlParts.length) {
    return { matched: false, params };
  }

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    const up = urlParts[i];

    if (pp.startsWith(":")) {
      // Path parameter
      params[pp.slice(1)] = up;
    } else if (pp !== up) {
      return { matched: false, params };
    }
  }

  return { matched: true, params };
}

/**
 * Parse query parameters from a URL.
 */
export function parseQuery(url: string): Record<string, string> {
  try {
    const parsed = new URL(url, "http://localhost");
    const query: Record<string, string> = {};
    for (const [key, value] of parsed.searchParams) {
      query[key] = value;
    }
    return query;
  } catch (error) {
    logger.debug("Failed to parse query parameters from URL", { url, error });
    return {};
  }
}

/**
 * Detect GraphQL operation from request body.
 */
export function parseGraphQLOperation(
  body: unknown,
): { operationName?: string; variables?: Record<string, unknown> } | null {
  if (!body || typeof body !== "object") return null;

  const obj = body as Record<string, unknown>;
  if (typeof obj.query !== "string") return null;

  // Extract operation name from query string if not explicitly provided
  let operationName = obj.operationName as string | undefined;
  if (!operationName) {
    const match = (obj.query as string).match(/(?:query|mutation|subscription)\s+(\w+)/);
    operationName = match?.[1];
  }

  return {
    operationName,
    variables: obj.variables as Record<string, unknown> | undefined,
  };
}
