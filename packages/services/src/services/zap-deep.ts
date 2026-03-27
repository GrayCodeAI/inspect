// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/zap-deep.ts - ZAP Deep Integration Service
// ──────────────────────────────────────────────────────────────────────────────

/** ZAP scan type */
export type ZapScanType = "spider" | "active" | "passive" | "ajax" | "graphql";

/** ZAP alert */
export interface ZapAlert {
  pluginId: string;
  alert: string;
  risk: "Informational" | "Low" | "Medium" | "High";
  confidence: "False Positive" | "Low" | "Medium" | "High";
  url: string;
  param: string;
  attack?: string;
  evidence?: string;
  cweid: string;
  wascid: string;
  solution: string;
  reference: string;
  description: string;
  timestamp: number;
}

/** ZAP scan policy */
export interface ZapScanPolicy {
  name: string;
  scanners: ZapScannerConfig[];
  attackStrength: "LOW" | "MEDIUM" | "HIGH" | "INSANE";
  alertThreshold: "OFF" | "LOW" | "MEDIUM" | "HIGH";
}

/** Scanner configuration */
export interface ZapScannerConfig {
  id: string;
  name: string;
  enabled: boolean;
  strength: "LOW" | "MEDIUM" | "HIGH" | "INSANE";
  threshold: "OFF" | "LOW" | "MEDIUM" | "HIGH";
}

/** ZAP scan result */
export interface ZapScanResult {
  scanId: string;
  scanType: ZapScanType;
  target: string;
  status: "running" | "completed" | "failed";
  alerts: ZapAlert[];
  progress: number;
  startTime: number;
  endTime?: number;
}

/** Marketplace addon */
export interface ZapAddon {
  id: string;
  name: string;
  description: string;
  status: "installed" | "not_installed" | "update_available";
  version?: string;
}

/**
 * ZAP Deep Integration Service.
 * Extends basic ZAP wrapping with marketplace, policies, manual tools, and addon management.
 *
 * Usage:
 * ```ts
 * const zap = new ZAPDeepService();
 * const policy = zap.createCustomPolicy('strict', 'HIGH', 'LOW');
 * const result = await zap.runScan('https://example.com', { type: 'active', policy });
 * ```
 */
export class ZAPDeepService {
  private baseUrl: string;
  private apiKey?: string;
  private policies: Map<string, ZapScanPolicy> = new Map();
  private scans: Map<string, ZapScanResult> = new Map();

  constructor(config: { baseUrl?: string; apiKey?: string } = {}) {
    this.baseUrl = config.baseUrl ?? "http://localhost:8080";
    this.apiKey = config.apiKey;

    // Register default policies
    this.policies.set("default", this.buildDefaultPolicy());
    this.policies.set("quick", this.buildQuickPolicy());
    this.policies.set("full", this.buildFullPolicy());
  }

  /**
   * Create a custom scan policy.
   */
  createCustomPolicy(
    name: string,
    attackStrength: ZapScanPolicy["attackStrength"],
    alertThreshold: ZapScanPolicy["alertThreshold"],
  ): ZapScanPolicy {
    const policy: ZapScanPolicy = {
      name,
      attackStrength,
      alertThreshold,
      scanners: this.getDefaultScanners().map((s) => ({
        ...s,
        strength: attackStrength,
        threshold: alertThreshold,
      })),
    };
    this.policies.set(name, policy);
    return policy;
  }

  /**
   * Get all registered policies.
   */
  getPolicies(): ZapScanPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get OWASP Top 10 categorized alerts.
   */
  static categorizeOWASP(alerts: ZapAlert[]): Record<string, ZapAlert[]> {
    const categories: Record<string, ZapAlert[]> = {
      "A01: Broken Access Control": [],
      "A02: Cryptographic Failures": [],
      "A03: Injection": [],
      "A04: Insecure Design": [],
      "A05: Security Misconfiguration": [],
      "A06: Vulnerable Components": [],
      "A07: Auth Failures": [],
      "A08: Software Integrity": [],
      "A09: Logging Failures": [],
      "A10: SSRF": [],
    };

    for (const alert of alerts) {
      const cwe = parseInt(alert.cweid, 10);
      if (cwe === 284 || cwe === 285) categories["A01: Broken Access Control"].push(alert);
      else if (cwe === 310 || cwe === 326 || cwe === 327)
        categories["A02: Cryptographic Failures"].push(alert);
      else if (cwe === 79 || cwe === 89 || cwe === 94) categories["A03: Injection"].push(alert);
      else if (cwe === 209 || cwe === 200) categories["A04: Insecure Design"].push(alert);
      else if (cwe === 16 || cwe === 611) categories["A05: Security Misconfiguration"].push(alert);
      else if (cwe === 1104) categories["A06: Vulnerable Components"].push(alert);
      else if (cwe === 287 || cwe === 384) categories["A07: Auth Failures"].push(alert);
      else if (cwe === 345 || cwe === 353) categories["A08: Software Integrity"].push(alert);
      else if (cwe === 778 || cwe === 223) categories["A09: Logging Failures"].push(alert);
      else if (cwe === 918) categories["A10: SSRF"].push(alert);
      else categories["A05: Security Misconfiguration"].push(alert);
    }

    return categories;
  }

  /**
   * Build a security summary report.
   */
  static buildSummary(alerts: ZapAlert[]): ZapSecuritySummary {
    const byRisk: Record<string, number> = { High: 0, Medium: 0, Low: 0, Informational: 0 };
    const byConfidence: Record<string, number> = {
      High: 0,
      Medium: 0,
      Low: 0,
      "False Positive": 0,
    };
    const uniqueCWEs = new Set<string>();

    for (const alert of alerts) {
      byRisk[alert.risk]++;
      byConfidence[alert.confidence]++;
      if (alert.cweid) uniqueCWEs.add(alert.cweid);
    }

    const owasp = ZAPDeepService.categorizeOWASP(alerts);
    const topRisks = alerts.filter((a) => a.risk === "High" || a.risk === "Medium").slice(0, 10);

    return {
      totalAlerts: alerts.length,
      byRisk,
      byConfidence,
      uniqueCWEs: uniqueCWEs.size,
      owaspCoverage: Object.fromEntries(Object.entries(owasp).map(([k, v]) => [k, v.length])),
      topRisks,
      score: Math.max(0, 100 - byRisk["High"] * 15 - byRisk["Medium"] * 5 - byRisk["Low"] * 1),
    };
  }

  /**
   * Get available marketplace addons.
   */
  async getMarketplace(): Promise<ZapAddon[]> {
    // Simulated addon list (in production, would call ZAP API)
    return [
      {
        id: "ascanrules",
        name: "Active Scan Rules",
        description: "Additional active scan rules",
        status: "installed",
      },
      {
        id: "pscanrules",
        name: "Passive Scan Rules",
        description: "Additional passive scan rules",
        status: "installed",
      },
      {
        id: "graphql",
        name: "GraphQL Support",
        description: "GraphQL endpoint scanning",
        status: "not_installed",
      },
      {
        id: "openapi",
        name: "OpenAPI Support",
        description: "Import OpenAPI/Swagger specs",
        status: "not_installed",
      },
      {
        id: "postman",
        name: "Postman Import",
        description: "Import Postman collections",
        status: "not_installed",
      },
      {
        id: "automation",
        name: "Automation Framework",
        description: "CI/CD automation",
        status: "not_installed",
      },
      {
        id: "retire",
        name: "Retire.js",
        description: "Detect outdated JS libraries",
        status: "installed",
      },
      {
        id: "sqliplugin",
        name: "SQL Injection Plugin",
        description: "Advanced SQL injection tests",
        status: "not_installed",
      },
    ];
  }

  private getDefaultScanners(): ZapScannerConfig[] {
    return [
      {
        id: "40012",
        name: "Cross Site Scripting",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "40018",
        name: "SQL Injection",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "40019",
        name: "Server Side Include",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "90021",
        name: "Path Traversal",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "90023",
        name: "XML External Entity",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "40003",
        name: "CRLF Injection",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "40009",
        name: "Server Side Code Injection",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "90019",
        name: "Server Side Code Injection (PHP)",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "40008",
        name: "Parameter Tampering",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
      {
        id: "10045",
        name: "Source Code Disclosure",
        enabled: true,
        strength: "MEDIUM",
        threshold: "MEDIUM",
      },
    ];
  }

  private buildDefaultPolicy(): ZapScanPolicy {
    return {
      name: "Default Policy",
      attackStrength: "MEDIUM",
      alertThreshold: "MEDIUM",
      scanners: this.getDefaultScanners(),
    };
  }

  private buildQuickPolicy(): ZapScanPolicy {
    return {
      name: "Quick Scan",
      attackStrength: "LOW",
      alertThreshold: "HIGH",
      scanners: this.getDefaultScanners().map((s) => ({
        ...s,
        enabled: ["40012", "40018", "90021"].includes(s.id),
      })),
    };
  }

  private buildFullPolicy(): ZapScanPolicy {
    return {
      name: "Full Scan",
      attackStrength: "HIGH",
      alertThreshold: "LOW",
      scanners: this.getDefaultScanners(),
    };
  }
}

/** ZAP security summary */
export interface ZapSecuritySummary {
  totalAlerts: number;
  byRisk: Record<string, number>;
  byConfidence: Record<string, number>;
  uniqueCWEs: number;
  owaspCoverage: Record<string, number>;
  topRisks: ZapAlert[];
  score: number;
}
