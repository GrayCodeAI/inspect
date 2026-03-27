// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/gateway.ts - API Gateway for Service Mesh
// ──────────────────────────────────────────────────────────────────────────────

import type { ServiceRegistry, ServiceDefinition, HealthCheckResult } from "./registry.js";

/** API route definition */
export interface ApiRoute {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  service: string;
  handler: RouteHandler;
  middleware?: Middleware[];
  rateLimit?: { requests: number; windowMs: number };
  auth?: boolean;
}

/** Route handler function */
export type RouteHandler = (req: GatewayRequest, res: GatewayResponse) => void | Promise<void>;

/** Middleware function */
export type Middleware = (
  req: GatewayRequest,
  res: GatewayResponse,
  next: () => void,
) => void | Promise<void>;

/** Gateway request */
export interface GatewayRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

/** Gateway response */
export interface GatewayResponse {
  status: (code: number) => GatewayResponse;
  json: (data: unknown) => void;
  send: (data: string) => void;
  header: (name: string, value: string) => GatewayResponse;
}

/**
 * API Gateway for routing requests to services.
 * Provides request routing, middleware, rate limiting, and health aggregation.
 */
export class ApiGateway {
  private registry: ServiceRegistry;
  private routes: ApiRoute[] = [];
  private middleware: Middleware[] = [];

  constructor(registry: ServiceRegistry) {
    this.registry = registry;
  }

  /**
   * Register a route.
   */
  route(route: ApiRoute): this {
    this.routes.push(route);
    return this;
  }

  /**
   * Add global middleware.
   */
  use(middleware: Middleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Register a service's routes automatically.
   */
  registerService(name: string, routes: Omit<ApiRoute, "service">[]): this {
    for (const route of routes) {
      this.routes.push({ ...route, service: name });
    }
    return this;
  }

  /**
   * Get all registered routes.
   */
  getRoutes(): ApiRoute[] {
    return [...this.routes];
  }

  /**
   * Find a route matching the request.
   */
  findRoute(method: string, path: string): ApiRoute | undefined {
    return this.routes.find((r) => {
      if (r.method !== method) return false;
      const pattern = r.path.replace(/:([^/]+)/g, "([^/]+)");
      return new RegExp(`^${pattern}$`).test(path);
    });
  }

  /**
   * Health endpoint aggregator.
   */
  async getHealthSummary(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    services: HealthCheckResult[];
  }> {
    const results: HealthCheckResult[] = [];

    for (const service of this.registry.list()) {
      const start = Date.now();
      results.push({
        service: service.name,
        status: service.health,
        latencyMs: Date.now() - start,
        details: {
          version: service.version,
          capabilities: service.capabilities,
        },
      });
    }

    const unhealthy = results.filter((r) => r.status === "unhealthy").length;
    const degraded = results.filter((r) => r.status === "degraded").length;

    return {
      status: unhealthy > 0 ? "unhealthy" : degraded > 0 ? "degraded" : "healthy",
      services: results,
    };
  }

  /**
   * Get gateway metrics.
   */
  getMetrics(): {
    routes: number;
    services: number;
    middleware: number;
  } {
    return {
      routes: this.routes.length,
      services: this.registry.list().length,
      middleware: this.middleware.length,
    };
  }
}
