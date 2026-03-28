// ============================================================================
// @inspect/workflow - HTTP Request Block
// ============================================================================

import * as http from "node:http";
import * as https from "node:https";
import type { WorkflowBlock } from "@inspect/shared";
import { WorkflowContext } from "../engine/context.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("workflow/blocks/http");

/** HTTP response result */
export interface HTTPResponse {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody: string;
  ok: boolean;
  duration: number;
}

/**
 * HTTPRequestBlock makes HTTP requests with configurable method, URL,
 * headers, and body. Parses responses based on content-type.
 */
export class HTTPRequestBlock {
  private defaultTimeout: number;
  private defaultHeaders: Record<string, string>;

  constructor(options?: {
    defaultTimeout?: number;
    defaultHeaders?: Record<string, string>;
  }) {
    this.defaultTimeout = options?.defaultTimeout ?? 30_000;
    this.defaultHeaders = options?.defaultHeaders ?? {};
  }

  /**
   * Execute an HTTP request block.
   *
   * Parameters:
   * - method: HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
   * - url: Request URL (supports {{var}} template)
   * - headers: Request headers object
   * - body: Request body (string or object, auto-serialized to JSON)
   * - timeout: Request timeout in ms
   * - followRedirects: Whether to follow 3xx redirects (default: true)
   * - parseResponse: Whether to parse JSON responses (default: true)
   * - auth: { type: "basic"|"bearer", username?, password?, token? }
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<HTTPResponse> {
    const params = block.parameters;
    const method = String(params.method ?? "GET").toUpperCase();
    const url = context.render(String(params.url ?? ""));
    const timeout = (params.timeout as number) ?? this.defaultTimeout;
    const parseResponse = (params.parseResponse as boolean) ?? true;
    const followRedirects = (params.followRedirects as boolean) ?? true;

    if (!url) {
      throw new Error("HTTP request block requires a URL");
    }

    // Validate URL to prevent SSRF attacks against internal services
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      logger.debug("Invalid URL provided to HTTP block", { url, error });
      throw new Error(`Invalid URL: ${url}`);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const blockedHosts = [
      "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
      "169.254.169.254", "metadata.google.internal", "169.254.169.253",
    ];
    const blockedPrefixes = [
      "10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.",
      "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
      "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
      "169.254.",
    ];

    if (
      blockedHosts.includes(hostname) ||
      blockedPrefixes.some((p) => hostname.startsWith(p))
    ) {
      throw new Error(
        `HTTP request to internal/private host "${hostname}" is blocked. ` +
        "Workflow HTTP blocks cannot access localhost, private networks, or cloud metadata endpoints.",
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`Protocol "${parsedUrl.protocol}" is not allowed. Use http: or https:.`);
    }

    // Build headers
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
    };

    if (params.headers && typeof params.headers === "object") {
      for (const [key, val] of Object.entries(
        params.headers as Record<string, string>,
      )) {
        headers[key] = context.render(String(val));
      }
    }

    // Authentication
    const auth = params.auth as
      | { type: string; username?: string; password?: string; token?: string }
      | undefined;
    if (auth) {
      if (auth.type === "basic" && auth.username && auth.password) {
        const credentials = Buffer.from(
          `${context.render(auth.username)}:${context.render(auth.password)}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${credentials}`;
      } else if (auth.type === "bearer" && auth.token) {
        headers["Authorization"] = `Bearer ${context.render(auth.token)}`;
      }
    }

    // Prepare body
    let bodyStr: string | undefined;
    if (params.body !== undefined && method !== "GET" && method !== "HEAD") {
      if (typeof params.body === "string") {
        bodyStr = context.render(params.body);
      } else {
        bodyStr = JSON.stringify(params.body);
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "application/json";
        }
      }
      if (bodyStr) {
        headers["Content-Length"] = String(Buffer.byteLength(bodyStr));
      }
    }

    return this.makeRequest(
      method,
      url,
      headers,
      bodyStr,
      timeout,
      parseResponse,
      followRedirects,
      0,
    );
  }

  /**
   * Make the actual HTTP request.
   */
  private makeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeout: number,
    parseResponse: boolean,
    followRedirects: boolean,
    redirectCount: number,
  ): Promise<HTTPResponse> {
    return new Promise((resolve, reject) => {
      if (redirectCount > 10) {
        reject(new Error("Too many redirects (>10)"));
        return;
      }

      const startTime = Date.now();
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const requestOptions: http.RequestOptions = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers,
        timeout,
      };

      const req = httpModule.request(requestOptions, (res) => {
        const statusCode = res.statusCode ?? 0;

        // Handle redirects
        if (
          followRedirects &&
          statusCode >= 300 &&
          statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = new URL(
            res.headers.location,
            url,
          ).toString();
          this.makeRequest(
            method === "POST" && statusCode === 303 ? "GET" : method,
            redirectUrl,
            headers,
            statusCode === 303 ? undefined : body,
            timeout,
            parseResponse,
            followRedirects,
            redirectCount + 1,
          )
            .then(resolve)
            .catch(reject);

          // Consume the response
          res.resume();
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("utf-8");
          const duration = Date.now() - startTime;

          let parsedBody: unknown = rawBody;
          if (parseResponse) {
            const contentType = res.headers["content-type"] ?? "";
            if (contentType.includes("application/json")) {
              try {
                parsedBody = JSON.parse(rawBody);
              } catch (error) {
                logger.debug("Failed to parse JSON response body", { error });
              }
            }
          }

          resolve({
            statusCode,
            statusMessage: res.statusMessage ?? "",
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: parsedBody,
            rawBody,
            ok: statusCode >= 200 && statusCode < 300,
            duration,
          });
        });

        res.on("error", (err) => {
          reject(new Error(`Response error: ${err.message}`));
        });
      });

      req.on("error", (err) => {
        reject(new Error(`HTTP request to ${url} failed: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`HTTP request to ${url} timed out after ${timeout}ms`));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}
