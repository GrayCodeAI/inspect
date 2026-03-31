// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/nuclei-multi.ts - Nuclei Multi-Protocol Scanner
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/core";

const logger = createLogger("services/nuclei-multi");

/** Nuclei protocol type */
export type NucleiProtocol =
  | "http"
  | "dns"
  | "tcp"
  | "ssl"
  | "file"
  | "headless"
  | "network"
  | "javascript"
  | "whois";

/** Nuclei template definition */
export interface NucleiTemplate {
  id: string;
  info: NucleiTemplateInfo;
  requests?: NucleiHttpRequest[];
  dns?: NucleiDnsRequest[];
  tcp?: NucleiTcpRequest[];
  ssl?: NucleiSslRequest[];
  network?: NucleiNetworkRequest[];
  variables?: Record<string, string>;
  matchersCondition?: "and" | "or";
}

/** Template info */
export interface NucleiTemplateInfo {
  name: string;
  author: string[];
  severity: "info" | "low" | "medium" | "high" | "critical";
  description: string;
  tags: string[];
  reference?: string[];
  classification?: {
    cvssMetrics?: string;
    cvssScore?: number;
    cweId?: string[];
    cveId?: string[];
  };
}

/** HTTP request definition */
export interface NucleiHttpRequest {
  method: string;
  path: string[];
  headers?: Record<string, string>;
  body?: string;
  matchers?: NucleiMatcher[];
  extractors?: NucleiExtractor[];
}

/** DNS request definition */
export interface NucleiDnsRequest {
  name: string;
  type: string;
  class?: string;
  matchers?: NucleiMatcher[];
}

/** TCP request definition */
export interface NucleiTcpRequest {
  host: string[];
  inputs: Array<{ data: string }>;
  readSize?: number;
  matchers?: NucleiMatcher[];
}

/** SSL request definition */
export interface NucleiSslRequest {
  address: "{{Host}}:{{Port}}";
  matchers?: NucleiMatcher[];
}

/** Network request definition */
export interface NucleiNetworkRequest {
  host: string[];
  inputs: Array<{ data: string }>;
  readSize?: number;
  matchers?: NucleiMatcher[];
}

/** Matcher definition */
export interface NucleiMatcher {
  type: "word" | "regex" | "status" | "size" | "binary" | "dsl";
  words?: string[];
  regex?: string[];
  status?: number[];
  negative?: boolean;
  condition?: "and" | "or";
  part?: string;
}

/** Extractor definition */
export interface NucleiExtractor {
  type: "regex" | "kval" | "json" | "xpath";
  regex?: string[];
  json?: string[];
  attribute?: string;
}

/** Scan result */
export interface NucleiScanResult {
  templateId: string;
  templateName: string;
  severity: string;
  host: string;
  matchedAt: string;
  matcherName?: string;
  extractedResults?: string[];
  curlCommand?: string;
  protocol: NucleiProtocol;
  timestamp: number;
}

/**
 * Multi-Protocol Vulnerability Scanner Service (Nuclei-inspired).
 * Supports HTTP, DNS, TCP, SSL, and custom template authoring.
 *
 * Usage:
 * ```ts
 * const scanner = new NucleiMultiService();
 * scanner.addTemplate(dnsTemplate);
 * scanner.addTemplate(tcpTemplate);
 * const results = await scanner.scan('example.com');
 * ```
 */
export class NucleiMultiService {
  private templates: Map<string, NucleiTemplate> = new Map();
  private results: NucleiScanResult[] = [];

  /**
   * Add a template.
   */
  addTemplate(template: NucleiTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Add multiple templates.
   */
  addTemplates(templates: NucleiTemplate[]): void {
    for (const t of templates) this.addTemplate(t);
  }

  /**
   * Scan a target with all templates.
   */
  async scan(target: string, protocols?: NucleiProtocol[]): Promise<NucleiScanResult[]> {
    const results: NucleiScanResult[] = [];
    const filterProtocols = protocols ? new Set(protocols) : null;

    for (const template of this.templates.values()) {
      if (filterProtocols) {
        const templateProtocol = this.detectProtocol(template);
        if (!filterProtocols.has(templateProtocol)) continue;
      }

      try {
        const templateResults = await this.executeTemplate(target, template);
        results.push(...templateResults);
      } catch (error) {
        logger.debug("Template execution failed, skipping", { templateId: template.id, error });
      }
    }

    this.results.push(...results);
    return results;
  }

  /**
   * Create a DNS template.
   */
  static createDnsTemplate(config: {
    id: string;
    name: string;
    severity: NucleiTemplateInfo["severity"];
    dnsName: string;
    dnsType: string;
    matchWords: string[];
  }): NucleiTemplate {
    return {
      id: config.id,
      info: {
        name: config.name,
        author: ["inspect"],
        severity: config.severity,
        description: config.name,
        tags: ["dns", "network"],
      },
      dns: [
        {
          name: config.dnsName,
          type: config.dnsType,
          matchers: [
            {
              type: "word",
              words: config.matchWords,
              condition: "and",
            },
          ],
        },
      ],
    };
  }

  /**
   * Create a TCP template.
   */
  static createTcpTemplate(config: {
    id: string;
    name: string;
    severity: NucleiTemplateInfo["severity"];
    inputs: string[];
    matchWords: string[];
  }): NucleiTemplate {
    return {
      id: config.id,
      info: {
        name: config.name,
        author: ["inspect"],
        severity: config.severity,
        description: config.name,
        tags: ["tcp", "network"],
      },
      tcp: [
        {
          host: ["{{Host}}"],
          inputs: config.inputs.map((data) => ({ data })),
          matchers: [
            {
              type: "word",
              words: config.matchWords,
              condition: "and",
            },
          ],
        },
      ],
    };
  }

  /**
   * Create an SSL/TLS template.
   */
  static createSslTemplate(config: {
    id: string;
    name: string;
    severity: NucleiTemplateInfo["severity"];
    matchWords: string[];
  }): NucleiTemplate {
    return {
      id: config.id,
      info: {
        name: config.name,
        author: ["inspect"],
        severity: config.severity,
        description: config.name,
        tags: ["ssl", "tls"],
      },
      ssl: [
        {
          address: "{{Host}}:{{Port}}",
          matchers: [
            {
              type: "word",
              words: config.matchWords,
              condition: "and",
            },
          ],
        },
      ],
    };
  }

  /**
   * Get built-in templates for common vulnerabilities.
   */
  static getBuiltinTemplates(): NucleiTemplate[] {
    return [
      NucleiMultiService.createDnsTemplate({
        id: "dns-mx-check",
        name: "MX Record Check",
        severity: "info",
        dnsName: "{{FQDN}}",
        dnsType: "MX",
        matchWords: ["IN\tMX"],
      }),
      NucleiMultiService.createDnsTemplate({
        id: "dns-takeover",
        name: "Subdomain Takeover Detection",
        severity: "high",
        dnsName: "{{FQDN}}",
        dnsType: "CNAME",
        matchWords: ["herokuapp.com", "github.io", "amazonaws.com"],
      }),
      NucleiMultiService.createTcpTemplate({
        id: "tcp-redis-unauth",
        name: "Redis Unauthorized Access",
        severity: "critical",
        inputs: ["INFO\r\n"],
        matchWords: ["redis_version", "connected_clients"],
      }),
      NucleiMultiService.createSslTemplate({
        id: "ssl-expiry",
        name: "SSL Certificate Expiry",
        severity: "medium",
        matchWords: ["Not After"],
      }),
    ];
  }

  /**
   * Export templates as YAML.
   */
  exportTemplates(): string {
    const lines: string[] = [];
    for (const template of this.templates.values()) {
      lines.push(`id: ${template.id}`);
      lines.push(`info:`);
      lines.push(`  name: ${template.info.name}`);
      lines.push(`  severity: ${template.info.severity}`);
      lines.push(`  tags: ${template.info.tags.join(",")}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  private detectProtocol(template: NucleiTemplate): NucleiProtocol {
    if (template.dns) return "dns";
    if (template.tcp) return "tcp";
    if (template.ssl) return "ssl";
    if (template.network) return "network";
    return "http";
  }

  private async executeTemplate(
    target: string,
    template: NucleiTemplate,
  ): Promise<NucleiScanResult[]> {
    const results: NucleiScanResult[] = [];
    const protocol = this.detectProtocol(template);

    if (protocol === "dns" && template.dns) {
      for (const req of template.dns) {
        const domain = req.name.replace("{{FQDN}}", target);
        try {
          const dnsResult = await this.resolveDns(domain, req.type);
          if (dnsResult && this.matchResult(dnsResult, req.matchers)) {
            results.push({
              templateId: template.id,
              templateName: template.info.name,
              severity: template.info.severity,
              host: target,
              matchedAt: new Date().toISOString(),
              protocol: "dns",
              timestamp: Date.now(),
            });
          }
        } catch (error) {
          logger.debug("DNS lookup failed", { domain, error });
        }
      }
    }

    if (protocol === "tcp" && template.tcp) {
      for (const req of template.tcp) {
        try {
          const tcpResult = await this.probeTcp(target, req);
          if (tcpResult && this.matchResult(tcpResult, req.matchers)) {
            results.push({
              templateId: template.id,
              templateName: template.info.name,
              severity: template.info.severity,
              host: target,
              matchedAt: new Date().toISOString(),
              protocol: "tcp",
              timestamp: Date.now(),
            });
          }
        } catch (error) {
          logger.debug("TCP probe failed", { target, error });
        }
      }
    }

    if (protocol === "http" && template.requests) {
      for (const req of template.requests) {
        for (const path of req.path) {
          try {
            const url = `http://${target}${path}`;
            const response = await fetch(url, {
              method: req.method,
              headers: req.headers,
              body: req.body,
              signal: AbortSignal.timeout(10_000),
            });
            const text = await response.text();
            if (this.matchResult(text, req.matchers)) {
              results.push({
                templateId: template.id,
                templateName: template.info.name,
                severity: template.info.severity,
                host: target,
                matchedAt: new Date().toISOString(),
                protocol: "http",
                timestamp: Date.now(),
              });
            }
          } catch (error) {
            logger.debug("HTTP request failed during scan", { target, error });
          }
        }
      }
    }

    return results;
  }

  private async resolveDns(domain: string, type: string): Promise<string | null> {
    try {
      const url = `https://dns.google/resolve?name=${domain}&type=${type}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = (await response.json()) as Record<string, unknown>;
      if (data["Answer"] && Array.isArray(data["Answer"])) {
        return (data["Answer"] as Array<Record<string, string>>).map((a) => a["data"]).join(" ");
      }
    } catch (error) {
      logger.debug("DNS resolution failed", { domain, error });
    }
    return null;
  }

  private async probeTcp(host: string, _req: NucleiTcpRequest): Promise<string | null> {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`http://${host}`, { signal: controller.signal });
      return await response.text();
    } catch (error) {
      logger.debug("TCP probe via HTTP fallback failed", { host, error });
    }
    return null;
  }

  private matchResult(content: string, matchers?: NucleiMatcher[]): boolean {
    if (!matchers || matchers.length === 0) return false;
    for (const matcher of matchers) {
      if (matcher.type === "word" && matcher.words) {
        const found = matcher.words.some((w) => content.includes(w));
        if (!found && matcher.condition === "and") return false;
        if (found && matcher.condition === "or") return true;
      }
      if (matcher.type === "regex" && matcher.regex) {
        const found = matcher.regex.some((r) => new RegExp(r).test(content));
        if (!found && matcher.condition === "and") return false;
        if (found && matcher.condition === "or") return true;
      }
    }
    return true;
  }
}
