// ============================================================================
// @inspect/credentials - Custom HTTP Credential Provider
// ============================================================================

import * as http from "node:http";
import * as https from "node:https";

/** Configuration for the custom HTTP credential provider */
export interface CustomHTTPProviderConfig {
  /** Base URL of the credential API */
  baseUrl: string;
  /** Authentication method */
  authType: "bearer" | "basic" | "api-key" | "custom-header" | "none";
  /** Bearer token or API key */
  authToken?: string;
  /** Basic auth username */
  authUsername?: string;
  /** Basic auth password */
  authPassword?: string;
  /** Custom auth header name (for api-key or custom-header) */
  authHeaderName?: string;
  /** Default request headers */
  headers?: Record<string, string>;
  /** Request timeout in ms */
  timeout?: number;
  /** Path templates for different operations */
  paths?: {
    get?: string; // e.g., "/credentials/:id"
    list?: string; // e.g., "/credentials"
    create?: string;
    update?: string;
    delete?: string;
  };
}

/** Credential response from HTTP API */
export interface HTTPCredentialResponse {
  id: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * CustomHTTPProvider is a generic HTTP API adapter for retrieving
 * credentials from any REST-based credential management system.
 * Fully configurable endpoint, auth, and path templates.
 */
export class CustomHTTPProvider {
  private config: CustomHTTPProviderConfig;

  constructor(config: CustomHTTPProviderConfig) {
    this.config = {
      timeout: 30_000,
      paths: {
        get: "/credentials/:id",
        list: "/credentials",
        create: "/credentials",
        update: "/credentials/:id",
        delete: "/credentials/:id",
      },
      ...config,
    };
  }

  /**
   * Retrieve a credential by ID.
   */
  async get(id: string): Promise<HTTPCredentialResponse> {
    const path = this.resolvePath(this.config.paths!.get!, { id });
    const response = await this.request("GET", path);
    return this.parseResponse(response);
  }

  /**
   * List all credentials.
   */
  async list(
    filter?: Record<string, string>,
  ): Promise<HTTPCredentialResponse[]> {
    let path = this.config.paths!.list!;
    if (filter) {
      const params = new URLSearchParams(filter).toString();
      path = `${path}?${params}`;
    }
    const response = await this.request("GET", path);
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.map((item: Record<string, unknown>) => this.normalizeItem(item));
    }
    if (parsed.data && Array.isArray(parsed.data)) {
      return parsed.data.map((item: Record<string, unknown>) =>
        this.normalizeItem(item),
      );
    }
    if (parsed.items && Array.isArray(parsed.items)) {
      return parsed.items.map((item: Record<string, unknown>) =>
        this.normalizeItem(item),
      );
    }
    return [];
  }

  /**
   * Create a credential.
   */
  async create(
    data: Record<string, unknown>,
  ): Promise<HTTPCredentialResponse> {
    const path = this.config.paths!.create!;
    const response = await this.request(
      "POST",
      path,
      JSON.stringify(data),
    );
    return this.parseResponse(response);
  }

  /**
   * Update a credential.
   */
  async update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<HTTPCredentialResponse> {
    const path = this.resolvePath(this.config.paths!.update!, { id });
    const response = await this.request(
      "PUT",
      path,
      JSON.stringify(data),
    );
    return this.parseResponse(response);
  }

  /**
   * Delete a credential.
   */
  async delete(id: string): Promise<boolean> {
    const path = this.resolvePath(this.config.paths!.delete!, { id });
    await this.request("DELETE", path);
    return true;
  }

  /**
   * Test connectivity to the credential API.
   */
  async testConnection(): Promise<{
    connected: boolean;
    message: string;
  }> {
    try {
      await this.request("GET", this.config.paths!.list!);
      return { connected: true, message: "Connection successful" };
    } catch (error) {
      return {
        connected: false,
        message:
          error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Make an HTTP request to the credential API.
   */
  private request(
    method: string,
    path: string,
    body?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.baseUrl);
      const isHttps = url.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...this.config.headers,
      };

      // Apply authentication
      switch (this.config.authType) {
        case "bearer":
          if (this.config.authToken) {
            headers["Authorization"] = `Bearer ${this.config.authToken}`;
          }
          break;
        case "basic":
          if (this.config.authUsername && this.config.authPassword) {
            const creds = Buffer.from(
              `${this.config.authUsername}:${this.config.authPassword}`,
            ).toString("base64");
            headers["Authorization"] = `Basic ${creds}`;
          }
          break;
        case "api-key":
          if (this.config.authToken) {
            const headerName =
              this.config.authHeaderName ?? "X-API-Key";
            headers[headerName] = this.config.authToken;
          }
          break;
        case "custom-header":
          if (this.config.authHeaderName && this.config.authToken) {
            headers[this.config.authHeaderName] = this.config.authToken;
          }
          break;
      }

      if (body) {
        headers["Content-Length"] = String(Buffer.byteLength(body));
      }

      const req = httpModule.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
          timeout: this.config.timeout,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const responseBody = Buffer.concat(chunks).toString("utf-8");
            const statusCode = res.statusCode ?? 0;

            if (statusCode >= 400) {
              reject(
                new Error(
                  `Custom HTTP provider error (${statusCode}): ${responseBody}`,
                ),
              );
              return;
            }

            resolve(responseBody);
          });
        },
      );

      req.on("error", (err) =>
        reject(new Error(`Custom HTTP provider request failed: ${err.message}`)),
      );

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Custom HTTP provider request timed out"));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * Resolve path template variables.
   */
  private resolvePath(
    template: string,
    vars: Record<string, string>,
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(`:${key}`, encodeURIComponent(value));
    }
    return result;
  }

  /**
   * Parse a response string into a credential response.
   */
  private parseResponse(raw: string): HTTPCredentialResponse {
    const parsed = JSON.parse(raw);
    return this.normalizeItem(parsed);
  }

  /**
   * Normalize an API response item to our standard format.
   */
  private normalizeItem(
    item: Record<string, unknown>,
  ): HTTPCredentialResponse {
    return {
      id: String(item.id ?? item._id ?? item.key ?? ""),
      data: (item.data as Record<string, unknown>) ??
        (item.value as Record<string, unknown>) ??
        item,
      metadata: (item.metadata as Record<string, unknown>) ?? undefined,
    };
  }
}
