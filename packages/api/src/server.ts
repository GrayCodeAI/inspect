// ============================================================================
// @inspect/api - HTTP API Server
// ============================================================================

import * as http from "node:http";
import * as crypto from "node:crypto";
import { createLogger } from "@inspect/observability";

const log = createLogger("api");

/** Route handler function */
export type RouteHandler = (req: APIRequest, res: APIResponse) => void | Promise<void>;

/** Middleware function */
export type Middleware = (
  req: APIRequest,
  res: APIResponse,
  next: () => Promise<void>,
) => void | Promise<void>;

/** Parsed API request */
export interface APIRequest {
  method: string;
  url: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
  /** JWT payload if authenticated */
  user?: Record<string, unknown>;
  /** Raw Node.js request */
  raw: http.IncomingMessage;
}

/** API response helper */
export interface APIResponse {
  statusCode: number;
  headers: Record<string, string>;
  /** Set status code */
  status(code: number): APIResponse;
  /** Set a response header */
  header(name: string, value: string): APIResponse;
  /** Send JSON response */
  json(data: unknown): void;
  /** Send text response */
  send(data: string): void;
  /** Send response with specific status */
  sendStatus(code: number): void;
  /** End response */
  end(): void;
  /** Whether response has been sent */
  sent: boolean;
  /** Raw Node.js response */
  raw: http.ServerResponse;
}

/** Route definition */
interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

/** Server configuration */
export interface APIServerConfig {
  /** JWT secret for authentication (required for production) */
  jwtSecret?: string;
  /** CORS allowed origins (default: none — must be explicitly configured) */
  corsOrigin?: string | string[];
  /** Enable request logging (default: true) */
  logging?: boolean;
  /** Request body size limit in bytes (default: 1MB) */
  bodyLimit?: number;
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
}

/**
 * APIServer provides an HTTP server built on Node.js http module.
 * Includes route matching, JSON body parsing, CORS support,
 * JWT authentication middleware, and request logging.
 */
export class APIServer {
  private server: http.Server | null = null;
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];
  private config: Required<APIServerConfig>;

  constructor(config?: APIServerConfig) {
    const jwtSecret = config?.jwtSecret ?? process.env.INSPECT_JWT_SECRET ?? "";
    const isProduction = process.env.NODE_ENV === "production";

    if (!jwtSecret) {
      if (isProduction) {
        throw new Error(
          "FATAL: jwtSecret is required in production. " +
            "Set INSPECT_JWT_SECRET or pass jwtSecret to APIServer. " +
            "Generate one with: openssl rand -base64 32",
        );
      }
      log.warn(
        "No JWT secret configured. " +
          "Set INSPECT_JWT_SECRET or pass jwtSecret to enable authentication. " +
          "All routes will be unauthenticated.",
      );
    }

    const corsOrigin = config?.corsOrigin ?? process.env.INSPECT_CORS_ORIGIN ?? "";
    if (!corsOrigin || corsOrigin === "*") {
      log.warn(
        "CORS origin is set to wildcard or empty. " +
          "Set corsOrigin to specific origins for production use.",
      );
    }

    this.config = {
      jwtSecret,
      corsOrigin: corsOrigin || "http://localhost:5173",
      logging: config?.logging ?? true,
      bodyLimit: config?.bodyLimit ?? 1_048_576, // 1MB
      requestTimeout: config?.requestTimeout ?? 30_000,
    };
  }

  /**
   * Add a route handler.
   */
  addRoute(method: string, path: string, handler: RouteHandler): void {
    const { pattern, paramNames } = this.compilePath(path);
    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      paramNames,
      handler,
    });
  }

  /**
   * Add convenience route methods.
   */
  get(path: string, handler: RouteHandler): void {
    this.addRoute("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.addRoute("POST", path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.addRoute("PUT", path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.addRoute("DELETE", path, handler);
  }

  patch(path: string, handler: RouteHandler): void {
    this.addRoute("PATCH", path, handler);
  }

  /**
   * Add middleware.
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Start the HTTP server.
   */
  async start(port: number, host: string = "0.0.0.0"): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          log.error(
            "Unhandled request error",
            err instanceof Error ? err : { message: String(err) },
          );
          if (!res.writableEnded) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        });
      });

      this.server.on("error", reject);
      this.server.listen(port, host, () => {
        if (this.config.logging) {
          log.info(`API server listening on ${host}:${port}`);
        }
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server with graceful connection draining.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Stop accepting new connections
      this.server.close(() => {
        log.info("HTTP server stopped");
        this.server = null;
        resolve();
      });

      // Force close existing connections after timeout
      this.server.closeIdleConnections();

      const forceTimeout = setTimeout(() => {
        if (this.server) {
          log.warn("Force closing remaining connections");
          this.server.closeAllConnections?.();
        }
      }, 5_000);

      // Don't block process exit on the force timeout
      forceTimeout.unref();
    });
  }

  /**
   * Get the underlying HTTP server instance.
   */
  getServer(): http.Server | null {
    return this.server;
  }

  /**
   * Register SIGTERM/SIGINT handlers for graceful shutdown.
   * Call this after start() to enable clean process termination.
   */
  enableGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  }

  /**
   * Security headers middleware.
   * Sets recommended HTTP security headers on all responses.
   */
  securityHeaders(): Middleware {
    return async (_req, res, next) => {
      res.header("X-Content-Type-Options", "nosniff");
      res.header("X-Frame-Options", "DENY");
      res.header("X-XSS-Protection", "0");
      res.header("Referrer-Policy", "strict-origin-when-cross-origin");
      res.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      res.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.header("Cache-Control", "no-store");
      res.header("X-Powered-By", "");
      await next();
    };
  }

  /**
   * CSRF protection middleware using double-submit cookie pattern.
   * Generates a CSRF token on GET requests and validates it on state-changing methods.
   * Skip for JWT-authenticated requests (Authorization header) as they are not CSRF-vulnerable.
   */
  csrfProtection(): Middleware {
    const tokens = new Map<string, { token: string; expires: number }>();

    // Cleanup expired tokens periodically
    setInterval(() => {
      const now = Date.now();
      for (const [sid, entry] of tokens) {
        if (entry.expires < now) tokens.delete(sid);
      }
    }, 60_000).unref();

    return async (req, res, next) => {
      // JWT-authenticated requests are not CSRF-vulnerable
      const authHeader = req.headers.authorization;
      if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        await next();
        return;
      }

      const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
      const stateChanging = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);

      if (!stateChanging) {
        // On safe methods, issue a CSRF token
        const token = crypto.randomBytes(32).toString("hex");
        const cookieId =
          cookieHeader.match(/inspect_csrf=([^;]+)/)?.[1] ?? crypto.randomBytes(16).toString("hex");
        tokens.set(cookieId, { token, expires: Date.now() + 3600_000 });
        res.header("Set-Cookie", `inspect_csrf=${cookieId}; Path=/; HttpOnly; SameSite=Strict`);
        res.header("X-CSRF-Token", token);
        await next();
        return;
      }

      // On state-changing methods, validate the CSRF token
      const cookieId = cookieHeader.match(/inspect_csrf=([^;]+)/)?.[1];
      const submittedToken = req.headers["x-csrf-token"];

      if (!cookieId || !submittedToken || typeof submittedToken !== "string") {
        res.status(403).json({ error: "CSRF token missing" });
        return;
      }

      const entry = tokens.get(cookieId);
      if (!entry || entry.expires < Date.now() || entry.token !== submittedToken) {
        res.status(403).json({ error: "Invalid CSRF token" });
        return;
      }

      await next();
    };
  }

  /**
   * JWT authentication middleware.
   */
  jwtAuth(): Middleware {
    return async (req, res, next) => {
      if (!this.config.jwtSecret) {
        await next();
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || typeof authHeader !== "string") {
        res.status(401).json({ error: "Authorization header required" });
        return;
      }

      const [scheme, token] = authHeader.split(" ");
      if (scheme !== "Bearer" || !token) {
        res.status(401).json({ error: "Bearer token required" });
        return;
      }

      try {
        req.user = this.verifyJWT(token);
        await next();
      } catch (error) {
        res.status(401).json({
          error: error instanceof Error ? error.message : "Invalid token",
        });
      }
    };
  }

  /**
   * Create a JWT token.
   */
  createJWT(payload: Record<string, unknown>, expiresIn: number = 86_400): string {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);

    const claims = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(claims));

    const signature = crypto
      .createHmac("sha256", this.config.jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Handle an incoming HTTP request.
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();

    // Set request timeout
    req.setTimeout(this.config.requestTimeout);

    // Handle CORS
    this.setCORSHeaders(res, req);

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Parse the request
    const apiReq = await this.parseRequest(req);
    const apiRes = this.createResponse(res);

    // Run middleware chain
    const middlewareChain = [...this.middlewares];
    let middlewareIndex = 0;

    const runNextMiddleware = async (): Promise<void> => {
      if (middlewareIndex < middlewareChain.length) {
        const middleware = middlewareChain[middlewareIndex++];
        await middleware(apiReq, apiRes, runNextMiddleware);
      } else {
        // Route matching
        await this.routeRequest(apiReq, apiRes);
      }
    };

    try {
      await runNextMiddleware();
    } catch (error) {
      if (!apiRes.sent) {
        const message = error instanceof Error ? error.message : "Internal server error";
        apiRes.status(500).json({ error: message });
      }
    }

    // Log request
    if (this.config.logging) {
      const duration = Date.now() - startTime;
      log.info(`${apiReq.method} ${apiReq.path} ${apiRes.statusCode}`, {
        method: apiReq.method,
        path: apiReq.path,
        status: apiRes.statusCode,
        duration,
      });
    }
  }

  /**
   * Route a parsed request to the matching handler.
   */
  private async routeRequest(req: APIRequest, res: APIResponse): Promise<void> {
    for (const route of this.routes) {
      if (route.method !== req.method && route.method !== "ALL") {
        continue;
      }

      const match = route.pattern.exec(req.path);
      if (match) {
        // Extract route parameters
        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
        }
        req.params = params;

        await route.handler(req, res);
        return;
      }
    }

    // No route matched
    res.status(404).json({
      error: "Not found",
      path: req.path,
      method: req.method,
    });
  }

  /**
   * Parse an incoming HTTP request.
   */
  private async parseRequest(req: http.IncomingMessage): Promise<APIRequest> {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    const query: Record<string, string> = {};
    for (const [key, value] of parsedUrl.searchParams) {
      query[key] = value;
    }

    // Parse body for POST/PUT/PATCH
    let body: unknown = null;
    let rawBody = "";

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      rawBody = await this.readBody(req);
      const contentType = req.headers["content-type"] ?? "";

      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        body = Object.fromEntries(new URLSearchParams(rawBody));
      } else {
        body = rawBody;
      }
    }

    return {
      method: (req.method ?? "GET").toUpperCase(),
      url: req.url ?? "/",
      path: parsedUrl.pathname,
      params: {},
      query,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body,
      rawBody,
      raw: req,
    };
  }

  /**
   * Create a response helper object.
   */
  private createResponse(res: http.ServerResponse): APIResponse {
    const apiRes: APIResponse = {
      statusCode: 200,
      headers: {},
      sent: false,
      raw: res,

      status(code: number) {
        apiRes.statusCode = code;
        return apiRes;
      },

      header(name: string, value: string) {
        apiRes.headers[name] = value;
        return apiRes;
      },

      json(data: unknown) {
        if (apiRes.sent) return;
        apiRes.sent = true;
        const body = JSON.stringify(data);
        res.writeHead(apiRes.statusCode, {
          ...apiRes.headers,
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
        });
        res.end(body);
      },

      send(data: string) {
        if (apiRes.sent) return;
        apiRes.sent = true;
        res.writeHead(apiRes.statusCode, {
          ...apiRes.headers,
          "Content-Type": apiRes.headers["Content-Type"] ?? "text/plain",
          "Content-Length": String(Buffer.byteLength(data)),
        });
        res.end(data);
      },

      sendStatus(code: number) {
        apiRes.statusCode = code;
        apiRes.json({ status: code });
      },

      end() {
        if (apiRes.sent) return;
        apiRes.sent = true;
        res.writeHead(apiRes.statusCode, apiRes.headers);
        res.end();
      },
    };

    return apiRes;
  }

  /**
   * Read the request body.
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > this.config.bodyLimit) {
          reject(new Error("Request body too large"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });

      req.on("error", reject);
    });
  }

  /**
   * Set CORS headers on a response.
   */
  private setCORSHeaders(res: http.ServerResponse, req: http.IncomingMessage): void {
    const origin = req.headers.origin ?? "*";
    const allowed = this.config.corsOrigin;

    if (Array.isArray(allowed)) {
      if (allowed.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", allowed);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  /**
   * Compile a route path pattern into a RegExp.
   * Supports :param syntax.
   */
  private compilePath(path: string): {
    pattern: RegExp;
    paramNames: string[];
  } {
    const paramNames: string[] = [];
    const pattern = path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    });
    return {
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
    };
  }

  /**
   * Verify a JWT token.
   */
  private verifyJWT(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const expectedSig = crypto
      .createHmac("sha256", this.config.jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSig))) {
      throw new Error("Invalid JWT signature");
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

    // Check expiration
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      throw new Error("JWT token expired");
    }

    return payload;
  }

  /**
   * Base64url encode a string.
   */
  private base64UrlEncode(str: string): string {
    return Buffer.from(str).toString("base64url");
  }
}
