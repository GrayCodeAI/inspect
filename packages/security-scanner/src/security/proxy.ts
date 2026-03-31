// ============================================================================
// @inspect/quality - Security Header Proxy
// ============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import type { SecurityAlert, SecurityRisk } from "@inspect/shared";

/** Security finding from header analysis */
export interface SecurityHeaderFinding {
  /** Header name or issue area */
  header: string;
  /** Issue description */
  issue: string;
  /** Risk level */
  risk: SecurityRisk;
  /** Recommendation */
  recommendation: string;
  /** URL where the issue was found */
  url: string;
  /** Current header value (if present) */
  currentValue?: string;
}

/** Traffic log entry */
export interface TrafficLogEntry {
  /** Request timestamp */
  timestamp: number;
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers */
  requestHeaders: Record<string, string>;
  /** Response status code */
  statusCode?: number;
  /** Response headers */
  responseHeaders?: Record<string, string>;
  /** Security findings for this request */
  findings: SecurityHeaderFinding[];
}

/** Proxy configuration */
export interface SecurityProxyConfig {
  /** Proxy listen port */
  port?: number;
  /** Proxy listen host */
  host?: string;
  /** Whether to log all traffic */
  logTraffic?: boolean;
  /** Callback for each request */
  onRequest?: (entry: TrafficLogEntry) => void;
  /** Callback for security findings */
  onFinding?: (finding: SecurityHeaderFinding) => void;
}

/** Required security headers and their expected configurations */
const SECURITY_HEADER_CHECKS: Array<{
  header: string;
  check: (value: string | undefined) => SecurityHeaderFinding | null;
  risk: SecurityRisk;
}> = [
  {
    header: "strict-transport-security",
    risk: "high",
    check: (value) => {
      if (!value) {
        return {
          header: "Strict-Transport-Security",
          issue: "HSTS header is missing",
          risk: "high",
          recommendation: 'Add "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload"',
          url: "",
        };
      }
      const maxAge = parseInt(value.match(/max-age=(\d+)/)?.[1] ?? "0", 10);
      if (maxAge < 31536000) {
        return {
          header: "Strict-Transport-Security",
          issue: `HSTS max-age is too short: ${maxAge} seconds`,
          risk: "medium",
          recommendation: "Set max-age to at least 31536000 (1 year)",
          url: "",
          currentValue: value,
        };
      }
      return null;
    },
  },
  {
    header: "content-security-policy",
    risk: "high",
    check: (value) => {
      if (!value) {
        return {
          header: "Content-Security-Policy",
          issue: "CSP header is missing",
          risk: "high",
          recommendation: "Add a Content-Security-Policy header to prevent XSS and data injection attacks",
          url: "",
        };
      }
      if (value.includes("unsafe-inline") && value.includes("unsafe-eval")) {
        return {
          header: "Content-Security-Policy",
          issue: "CSP allows unsafe-inline and unsafe-eval, which weakens protection",
          risk: "medium",
          recommendation: "Remove unsafe-inline and unsafe-eval directives; use nonces or hashes instead",
          url: "",
          currentValue: value,
        };
      }
      return null;
    },
  },
  {
    header: "x-frame-options",
    risk: "medium",
    check: (value) => {
      if (!value) {
        return {
          header: "X-Frame-Options",
          issue: "X-Frame-Options header is missing (clickjacking risk)",
          risk: "medium",
          recommendation: 'Add "X-Frame-Options: DENY" or "SAMEORIGIN"',
          url: "",
        };
      }
      return null;
    },
  },
  {
    header: "x-content-type-options",
    risk: "low",
    check: (value) => {
      if (!value) {
        return {
          header: "X-Content-Type-Options",
          issue: "X-Content-Type-Options header is missing (MIME sniffing risk)",
          risk: "low",
          recommendation: 'Add "X-Content-Type-Options: nosniff"',
          url: "",
        };
      }
      return null;
    },
  },
  {
    header: "referrer-policy",
    risk: "low",
    check: (value) => {
      if (!value) {
        return {
          header: "Referrer-Policy",
          issue: "Referrer-Policy header is missing",
          risk: "low",
          recommendation: 'Add "Referrer-Policy: strict-origin-when-cross-origin"',
          url: "",
        };
      }
      return null;
    },
  },
  {
    header: "permissions-policy",
    risk: "low",
    check: (value) => {
      if (!value) {
        return {
          header: "Permissions-Policy",
          issue: "Permissions-Policy header is missing",
          risk: "low",
          recommendation: "Add a Permissions-Policy header to restrict browser features",
          url: "",
        };
      }
      return null;
    },
  },
  {
    header: "x-xss-protection",
    risk: "informational",
    check: (value) => {
      if (value && value !== "0") {
        return {
          header: "X-XSS-Protection",
          issue: "X-XSS-Protection is set but deprecated; rely on CSP instead",
          risk: "informational",
          recommendation: 'Set "X-XSS-Protection: 0" or remove it; use CSP for XSS protection',
          url: "",
          currentValue: value,
        };
      }
      return null;
    },
  },
  {
    header: "server",
    risk: "low",
    check: (value) => {
      if (value && value.match(/\d+\.\d+/)) {
        return {
          header: "Server",
          issue: `Server header reveals version information: ${value}`,
          risk: "low",
          recommendation: "Remove or obfuscate the Server header to avoid revealing technology details",
          url: "",
          currentValue: value,
        };
      }
      return null;
    },
  },
  {
    header: "x-powered-by",
    risk: "low",
    check: (value) => {
      if (value) {
        return {
          header: "X-Powered-By",
          issue: `X-Powered-By header reveals technology: ${value}`,
          risk: "low",
          recommendation: "Remove the X-Powered-By header to avoid revealing technology details",
          url: "",
          currentValue: value,
        };
      }
      return null;
    },
  },
];

/**
 * SecurityProxy creates an HTTP proxy that logs traffic
 * and detects security issues in HTTP headers.
 */
export class SecurityProxy {
  private server: ReturnType<typeof createServer> | null = null;
  private trafficLog: TrafficLogEntry[] = [];
  private findings: SecurityHeaderFinding[] = [];
  private config: SecurityProxyConfig;

  constructor(config: SecurityProxyConfig = {}) {
    this.config = config;
  }

  /**
   * Start the security proxy.
   */
  async start(): Promise<{ host: string; port: number }> {
    const port = this.config.port ?? 0;
    const host = this.config.host ?? "127.0.0.1";

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        await this.handleRequest(req, res);
      });

      // Handle CONNECT method for HTTPS tunneling
      this.server.on("connect", (req, socket, head) => {
        this.handleConnect(req, socket, head);
      });

      this.server.on("error", reject);

      this.server.listen(port, host, () => {
        const addr = this.server!.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : port;
        resolve({ host, port: actualPort });
      });
    });
  }

  /**
   * Stop the security proxy.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Get all traffic log entries.
   */
  getTrafficLog(): TrafficLogEntry[] {
    return [...this.trafficLog];
  }

  /**
   * Get all security findings.
   */
  getFindings(): SecurityHeaderFinding[] {
    return [...this.findings];
  }

  /**
   * Generate a SecurityReport from the proxy's findings.
   */
  generateReport(): { findings: SecurityHeaderFinding[]; alerts: SecurityAlert[] } {
    const alerts: SecurityAlert[] = this.findings.map((finding) => ({
      risk: finding.risk,
      name: `Missing/Insecure Header: ${finding.header}`,
      description: finding.issue,
      solution: finding.recommendation,
      url: finding.url,
      evidence: finding.currentValue ?? "",
      cweid: 0,
      source: "custom" as const,
    }));

    return { findings: [...this.findings], alerts };
  }

  /**
   * Analyze response headers for a given URL.
   * Can be used standalone without the proxy.
   */
  static analyzeHeaders(
    url: string,
    headers: Record<string, string>,
  ): SecurityHeaderFinding[] {
    const findings: SecurityHeaderFinding[] = [];
    const lowerHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      lowerHeaders[key.toLowerCase()] = value;
    }

    for (const check of SECURITY_HEADER_CHECKS) {
      const value = lowerHeaders[check.header];
      const finding = check.check(value);
      if (finding) {
        finding.url = url;
        findings.push(finding);
      }
    }

    return findings;
  }

  /**
   * Handle an HTTP request (non-CONNECT).
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? "";
    const method = req.method ?? "GET";

    const entry: TrafficLogEntry = {
      timestamp: Date.now(),
      method,
      url,
      requestHeaders: this.flattenHeaders(req.headers),
      findings: [],
    };

    try {
      // Forward the request
      const targetUrl = new URL(url);
      const response = await fetch(targetUrl.toString(), {
        method,
        headers: this.flattenHeaders(req.headers),
      });

      entry.statusCode = response.status;
      entry.responseHeaders = Object.fromEntries(response.headers.entries());

      // Analyze security headers
      const findings = SecurityProxy.analyzeHeaders(url, entry.responseHeaders);
      entry.findings = findings;

      for (const finding of findings) {
        this.findings.push(finding);
        this.config.onFinding?.(finding);
      }

      // Forward response
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const body = await response.arrayBuffer();
      res.end(Buffer.from(body));
    } catch (_error) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Bad Gateway");
    }

    if (this.config.logTraffic) {
      this.trafficLog.push(entry);
      this.config.onRequest?.(entry);
    }
  }

  /**
   * Handle CONNECT requests (HTTPS tunneling).
   */
  private handleConnect(req: IncomingMessage, clientSocket: NodeJS.Socket, head: Buffer): void {
    const [hostname, port] = (req.url ?? "").split(":");
    const serverSocket = connect(parseInt(port ?? "443", 10), hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on("error", () => {
      clientSocket.end();
    });

    clientSocket.on("error", () => {
      serverSocket.end();
    });
  }

  /**
   * Flatten Node.js IncomingHttpHeaders to a simple Record.
   */
  private flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        flat[key] = Array.isArray(value) ? value.join(", ") : value;
      }
    }
    return flat;
  }
}
