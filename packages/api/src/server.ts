// ============================================================================
// @inspect/api - HTTP API Server
// ============================================================================

import * as http from "node:http";
import * as crypto from "node:crypto";

/** Route handler function */
export type RouteHandler = (
  req: APIRequest,
  res: APIResponse,
) => void | Promise<void>;

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
  /** JWT secret for authentication */
  jwtSecret?: string;
  /** CORS allowed origins (default: "*") */
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
    this.config = {
      jwtSecret: config?.jwtSecret ?? process.env.INSPECT_JWT_SECRET ?? "",
      corsOrigin: config?.corsOrigin ?? "*",
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
          console.error("Unhandled request error:", err);
          if (!res.writableEnded) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: "Internal server error" }),
            );
          }
        });
      });

      this.server.on("error", reject);
      this.server.listen(port, host, () => {
        if (this.config.logging) {
          console.log(`API server listening on ${host}:${port}`);
        }
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Get the underlying HTTP server instance.
   */
  getServer(): http.Server | null {
    return this.server;
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
          error:
            error instanceof Error
              ? error.message
              : "Invalid token",
        });
      }
    };
  }

  /**
   * Create a JWT token.
   */
  createJWT(
    payload: Record<string, unknown>,
    expiresIn: number = 86_400,
  ): string {
    const header = { alg: "HS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);

    const claims = {
      ...payload,
      iat: now,
      exp: now + expiresIn,
    };

    const headerB64 = this.base64UrlEncode(
      JSON.stringify(header),
    );
    const payloadB64 = this.base64UrlEncode(
      JSON.stringify(claims),
    );

    const signature = crypto
      .createHmac("sha256", this.config.jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Handle an incoming HTTP request.
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
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
        const message =
          error instanceof Error ? error.message : "Internal server error";
        apiRes.status(500).json({ error: message });
      }
    }

    // Log request
    if (this.config.logging) {
      const duration = Date.now() - startTime;
      console.log(
        `${apiReq.method} ${apiReq.path} ${apiRes.statusCode} ${duration}ms`,
      );
    }
  }

  /**
   * Route a parsed request to the matching handler.
   */
  private async routeRequest(
    req: APIRequest,
    res: APIResponse,
  ): Promise<void> {
    for (const route of this.routes) {
      if (route.method !== req.method && route.method !== "ALL") {
        continue;
      }

      const match = route.pattern.exec(req.path);
      if (match) {
        // Extract route parameters
        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = decodeURIComponent(
            match[i + 1],
          );
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
  private async parseRequest(
    req: http.IncomingMessage,
  ): Promise<APIRequest> {
    const parsedUrl = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    const query: Record<string, string> = {};
    for (const [key, value] of parsedUrl.searchParams) {
      query[key] = value;
    }

    // Parse body for POST/PUT/PATCH
    let body: unknown = null;
    let rawBody = "";

    if (
      req.method === "POST" ||
      req.method === "PUT" ||
      req.method === "PATCH"
    ) {
      rawBody = await this.readBody(req);
      const contentType = req.headers["content-type"] ?? "";

      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      } else if (
        contentType.includes("application/x-www-form-urlencoded")
      ) {
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
          "Content-Type":
            apiRes.headers["Content-Type"] ?? "text/plain",
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
  private setCORSHeaders(
    res: http.ServerResponse,
    req: http.IncomingMessage,
  ): void {
    const origin = req.headers.origin ?? "*";
    const allowed = this.config.corsOrigin;

    if (Array.isArray(allowed)) {
      if (allowed.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", allowed);
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Request-ID",
    );
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
    const pattern = path.replace(
      /:([a-zA-Z_][a-zA-Z0-9_]*)/g,
      (_match, name: string) => {
        paramNames.push(name);
        return "([^/]+)";
      },
    );
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

    if (!crypto.timingSafeEqual(
      Buffer.from(signatureB64),
      Buffer.from(expectedSig),
    )) {
      throw new Error("Invalid JWT signature");
    }

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    );

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
