// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/graphql-mock.ts - Deep GraphQL Mocking Service (MSW-inspired)
// ──────────────────────────────────────────────────────────────────────────────

/** GraphQL operation type */
export type GraphQLOperationType = "query" | "mutation" | "subscription";

/** GraphQL request parsed from intercepted traffic */
export interface GraphQLRequest {
  operationName?: string;
  operationType: GraphQLOperationType;
  query: string;
  variables: Record<string, unknown>;
  headers: Record<string, string>;
  url: string;
}

/** GraphQL response builder */
export interface GraphQLResponseBuilder {
  data?: unknown;
  errors?: Array<{
    message: string;
    locations?: unknown[];
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
  extensions?: Record<string, unknown>;
}

/** GraphQL mock handler */
export interface GraphQLMockHandler {
  operationName: string | RegExp;
  operationType?: GraphQLOperationType;
  handler: (req: GraphQLRequest) => GraphQLResponseBuilder | Promise<GraphQLResponseBuilder>;
  once?: boolean;
  delay?: number;
  callCount: number;
}

/** Schema introspection result */
export interface IntrospectionResult {
  types: Array<{ name: string; kind: string; fields?: string[] }>;
  queries: string[];
  mutations: string[];
  subscriptions: string[];
}

/**
 * Deep GraphQL Mocking Service (MSW-inspired).
 * Provides operation-level mocking, schema introspection, and subscription support.
 *
 * Usage:
 * ```ts
 * const mock = new GraphQLMockService();
 * mock.query('GetUser', (req) => ({ data: { user: { id: '1', name: 'Alice' } } }));
 * mock.mutation('CreatePost', (req) => ({ data: { post: { id: '1' } } }));
 * ```
 */
export class GraphQLMockService {
  private handlers: GraphQLMockHandler[] = [];
  private schemaCache: Map<string, IntrospectionResult> = new Map();

  /**
   * Mock a GraphQL query.
   */
  query(
    operationName: string | RegExp,
    handler: (req: GraphQLRequest) => GraphQLResponseBuilder | Promise<GraphQLResponseBuilder>,
    options?: { once?: boolean; delay?: number },
  ): this {
    this.handlers.push({
      operationName,
      operationType: "query",
      handler,
      once: options?.once,
      delay: options?.delay,
      callCount: 0,
    });
    return this;
  }

  /**
   * Mock a GraphQL mutation.
   */
  mutation(
    operationName: string | RegExp,
    handler: (req: GraphQLRequest) => GraphQLResponseBuilder | Promise<GraphQLResponseBuilder>,
    options?: { once?: boolean; delay?: number },
  ): this {
    this.handlers.push({
      operationName,
      operationType: "mutation",
      handler,
      once: options?.once,
      delay: options?.delay,
      callCount: 0,
    });
    return this;
  }

  /**
   * Mock a GraphQL subscription.
   */
  subscription(
    operationName: string | RegExp,
    handler: (req: GraphQLRequest) => GraphQLResponseBuilder | Promise<GraphQLResponseBuilder>,
  ): this {
    this.handlers.push({
      operationName,
      operationType: "subscription",
      handler,
      callCount: 0,
    });
    return this;
  }

  /**
   * Handle an intercepted GraphQL request.
   */
  async handle(
    body: string,
    url: string,
    headers: Record<string, string> = {},
  ): Promise<GraphQLResponseBuilder | null> {
    let parsed: GraphQLRequest;
    try {
      const json = JSON.parse(body) as Record<string, unknown>;
      parsed = {
        operationName: json["operationName"] as string,
        operationType: this.detectOperationType(json["query"] as string),
        query: (json["query"] as string) ?? "",
        variables: (json["variables"] as Record<string, unknown>) ?? {},
        headers,
        url,
      };
    } catch {
      return null;
    }

    for (const handler of this.handlers) {
      if (this.matchesOperation(parsed, handler)) {
        handler.callCount++;
        if (handler.delay) await sleep(handler.delay);
        const result = await handler.handler(parsed);
        if (handler.once) {
          this.handlers = this.handlers.filter((h) => h !== handler);
        }
        return result;
      }
    }

    return null;
  }

  /**
   * Parse a GraphQL operation from raw query string.
   */
  static parseOperation(query: string): { type: GraphQLOperationType; name?: string } {
    const trimmed = query.trim();
    if (trimmed.startsWith("query")) {
      const nameMatch = trimmed.match(/query\s+(\w+)/);
      return { type: "query", name: nameMatch?.[1] };
    }
    if (trimmed.startsWith("mutation")) {
      const nameMatch = trimmed.match(/mutation\s+(\w+)/);
      return { type: "mutation", name: nameMatch?.[1] };
    }
    if (trimmed.startsWith("subscription")) {
      const nameMatch = trimmed.match(/subscription\s+(\w+)/);
      return { type: "subscription", name: nameMatch?.[1] };
    }
    return { type: "query" };
  }

  /**
   * Build a schema introspection mock.
   */
  static buildIntrospectionMock(schema: Record<string, unknown>): IntrospectionResult {
    const types: Array<{ name: string; kind: string; fields?: string[] }> = [];
    const queries: string[] = [];
    const mutations: string[] = [];

    if (schema["types"] && Array.isArray(schema["types"])) {
      for (const type of schema["types"] as Array<Record<string, unknown>>) {
        types.push({
          name: type["name"] as string,
          kind: type["kind"] as string,
          fields: (type["fields"] as Array<Record<string, unknown>>)?.map(
            (f) => f["name"] as string,
          ),
        });
      }
    }

    return { types, queries, mutations, subscriptions: [] };
  }

  /**
   * Get handler statistics.
   */
  getStats(): Array<{ operationName: string; callCount: number }> {
    return this.handlers.map((h) => ({
      operationName: typeof h.operationName === "string" ? h.operationName : h.operationName.source,
      callCount: h.callCount,
    }));
  }

  /**
   * Reset all handlers.
   */
  reset(): void {
    this.handlers = [];
  }

  /**
   * Get registered handler count.
   */
  get size(): number {
    return this.handlers.length;
  }

  private detectOperationType(query: string): GraphQLOperationType {
    if (!query) return "query";
    const trimmed = query.trim().toLowerCase();
    if (trimmed.startsWith("mutation")) return "mutation";
    if (trimmed.startsWith("subscription")) return "subscription";
    return "query";
  }

  private matchesOperation(req: GraphQLRequest, handler: GraphQLMockHandler): boolean {
    if (handler.operationType && req.operationType !== handler.operationType) return false;
    if (typeof handler.operationName === "string") {
      return req.operationName === handler.operationName;
    }
    return handler.operationName.test(req.operationName ?? "");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
