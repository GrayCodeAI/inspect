// ============================================================================
// @inspect/quality - Nuclei Security Scanner
// ============================================================================

import type { SecurityReport, SecurityAlert, SecurityRisk } from "@inspect/shared";
import { createTimer } from "@inspect/shared";
import { spawn } from "node:child_process";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/nuclei");

/** Nuclei scan options */
export interface NucleiOptions {
  /** Template categories to use */
  templates?: string[];
  /** Template tags to include */
  tags?: string[];
  /** Minimum severity to report */
  severity?: SecurityRisk[];
  /** Rate limit (requests per second) */
  rateLimit?: number;
  /** Timeout in ms */
  timeout?: number;
  /** Number of concurrent requests */
  concurrency?: number;
  /** Custom template directory */
  templateDir?: string;
  /** Path to nuclei binary */
  binaryPath?: string;
  /** Additional flags */
  extraFlags?: string[];
  /** Headers to include in requests */
  headers?: Record<string, string>;
  /** Proxy URL */
  proxy?: string;
  /** Whether to follow redirects */
  followRedirects?: boolean;
}

/** Nuclei JSONL output entry */
interface NucleiJsonEntry {
  "template-id"?: string;
  "template-url"?: string;
  info?: {
    name?: string;
    description?: string;
    severity?: string;
    tags?: string[];
    reference?: string[];
    classification?: {
      "cwe-id"?: string[];
      "cvss-metrics"?: string;
      "cvss-score"?: number;
    };
  };
  host?: string;
  "matched-at"?: string;
  "extracted-results"?: string[];
  matcher_name?: string;
  type?: string;
  ip?: string;
  timestamp?: string;
  "curl-command"?: string;
}

/**
 * NucleiScanner executes the nuclei binary for vulnerability scanning
 * and parses the JSONL output into structured SecurityReport.
 */
export class NucleiScanner {
  private readonly binaryPath: string;

  constructor(binaryPath?: string) {
    this.binaryPath = binaryPath ?? "nuclei";
  }

  /**
   * Run a nuclei scan against a URL.
   * Requires the nuclei binary to be installed and accessible.
   */
  async scan(url: string, options: NucleiOptions = {}): Promise<SecurityReport> {
    const timer = createTimer();
    const timeout = options.timeout ?? 300_000; // 5 min default

    // Check if nuclei is available
    await this.checkBinary();

    // Build command arguments
    const args = this.buildArgs(url, options);

    // Execute nuclei
    const output = await this.execute(args, timeout);

    // Parse JSONL output
    const entries = this.parseJsonl(output);

    // Convert to SecurityAlert format
    const alerts = entries.map((entry) => this.entryToAlert(entry, url));

    // Build summary
    const summary = {
      critical: alerts.filter((a) => a.risk === "critical").length,
      high: alerts.filter((a) => a.risk === "high").length,
      medium: alerts.filter((a) => a.risk === "medium").length,
      low: alerts.filter((a) => a.risk === "low").length,
      informational: alerts.filter((a) => a.risk === "informational").length,
    };

    return {
      alerts,
      scannedUrls: [url],
      duration: timer.elapsed(),
      timestamp: Date.now(),
      summary,
    };
  }

  /**
   * Check if the nuclei binary is available.
   */
  private async checkBinary(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(this.binaryPath, ["-version"], {
        stdio: "pipe",
        timeout: 10_000,
      });

      const _stderr = "";
      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (_code) => {
        // nuclei -version outputs to stderr and returns 0
        resolve();
      });

      proc.on("error", () => {
        reject(
          new Error(
            `nuclei binary not found at "${this.binaryPath}". ` +
              "Install it from: https://github.com/projectdiscovery/nuclei",
          ),
        );
      });
    });
  }

  /**
   * Build nuclei command-line arguments.
   */
  private buildArgs(url: string, options: NucleiOptions): string[] {
    const args: string[] = ["-u", url, "-jsonl", "-silent", "-no-color", "-stats-interval", "0"];

    if (options.templates?.length) {
      for (const t of options.templates) {
        args.push("-t", t);
      }
    }

    if (options.tags?.length) {
      args.push("-tags", options.tags.join(","));
    }

    if (options.severity?.length) {
      args.push("-severity", options.severity.join(","));
    }

    if (options.rateLimit) {
      args.push("-rate-limit", String(options.rateLimit));
    }

    if (options.concurrency) {
      args.push("-concurrency", String(options.concurrency));
    }

    if (options.templateDir) {
      args.push("-t", options.templateDir);
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        args.push("-header", `${key}: ${value}`);
      }
    }

    if (options.proxy) {
      args.push("-proxy", options.proxy);
    }

    if (options.followRedirects) {
      args.push("-follow-redirects");
    }

    if (options.extraFlags) {
      args.push(...options.extraFlags);
    }

    return args;
  }

  /**
   * Execute nuclei and capture output.
   */
  private execute(args: string[], timeout: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(this.binaryPath, args, {
        stdio: "pipe",
        timeout,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        // Nuclei returns 0 on success, but may also return 1 if findings exist
        if (code !== null && code <= 1) {
          resolve(stdout);
        } else {
          reject(new Error(`nuclei exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to execute nuclei: ${err.message}`));
      });

      // Handle timeout
      setTimeout(() => {
        try {
          proc.kill("SIGTERM");
        } catch (error) {
          logger.debug("Failed to kill nuclei process on timeout", { error });
        }
        reject(new Error(`nuclei scan timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Parse JSONL (newline-delimited JSON) output from nuclei.
   */
  private parseJsonl(output: string): NucleiJsonEntry[] {
    const entries: NucleiJsonEntry[] = [];
    const lines = output.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as NucleiJsonEntry;
        entries.push(entry);
      } catch (error) {
        logger.debug("Failed to parse nuclei JSONL line, skipping", { error });
      }
    }

    return entries;
  }

  /**
   * Convert a nuclei JSONL entry to a SecurityAlert.
   */
  private entryToAlert(entry: NucleiJsonEntry, fallbackUrl: string): SecurityAlert {
    const severity = (entry.info?.severity ?? "info").toLowerCase();
    const riskMap: Record<string, SecurityRisk> = {
      critical: "critical",
      high: "high",
      medium: "medium",
      low: "low",
      info: "informational",
      unknown: "informational",
    };

    const cweId = entry.info?.classification?.["cwe-id"]?.[0];
    const cweid = cweId ? parseInt(cweId.replace("CWE-", ""), 10) : 0;

    return {
      risk: riskMap[severity] ?? "informational",
      name: entry.info?.name ?? entry["template-id"] ?? "Unknown",
      description: entry.info?.description ?? "",
      solution: "Review the finding and apply appropriate remediation.",
      url: entry["matched-at"] ?? entry.host ?? fallbackUrl,
      evidence: entry["extracted-results"]?.join(", ") ?? "",
      cweid,
      confidence: "high",
      references: entry.info?.reference ?? [],
      source: "nuclei",
      owaspCategory: this.mapToOwasp(entry.info?.tags ?? []),
    };
  }

  /**
   * Map nuclei tags to OWASP Top 10 categories.
   */
  private mapToOwasp(tags: string[]): string | undefined {
    const owaspMap: Record<string, string> = {
      sqli: "A03:2021 - Injection",
      xss: "A03:2021 - Injection",
      injection: "A03:2021 - Injection",
      ssrf: "A10:2021 - Server-Side Request Forgery",
      lfi: "A01:2021 - Broken Access Control",
      rfi: "A01:2021 - Broken Access Control",
      rce: "A03:2021 - Injection",
      auth: "A07:2021 - Identification and Authentication Failures",
      misconfig: "A05:2021 - Security Misconfiguration",
      exposure: "A01:2021 - Broken Access Control",
      "default-login": "A07:2021 - Identification and Authentication Failures",
      cve: "A06:2021 - Vulnerable and Outdated Components",
      outdated: "A06:2021 - Vulnerable and Outdated Components",
    };

    for (const tag of tags) {
      if (owaspMap[tag]) return owaspMap[tag];
    }
    return undefined;
  }
}
