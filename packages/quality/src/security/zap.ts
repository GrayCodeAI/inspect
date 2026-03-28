// ============================================================================
// @inspect/quality - ZAP Security Scanner
// ============================================================================

import type { SecurityAlert, SecurityReport, SecurityRisk } from "@inspect/shared";
import { createTimer, sleep } from "@inspect/shared";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/zap");

/** ZAP scan options */
export interface ZAPOptions {
  /** ZAP API base URL */
  apiUrl?: string;
  /** ZAP API key */
  apiKey?: string;
  /** Whether to run active scanning */
  activeScan?: boolean;
  /** Whether to run spider first */
  spider?: boolean;
  /** Spider max depth */
  spiderMaxDepth?: number;
  /** Active scan strength */
  scanStrength?: "LOW" | "MEDIUM" | "HIGH" | "INSANE";
  /** Active scan threshold */
  scanThreshold?: "LOW" | "MEDIUM" | "HIGH";
  /** Timeout for the entire scan in ms */
  timeout?: number;
  /** Progress callback */
  onProgress?: (phase: string, progress: number) => void;
  /** Authentication context ID */
  contextId?: string;
  /** User ID for authenticated scanning */
  userId?: string;
  /** Login URL for form-based auth */
  loginUrl?: string;
  /** Login request data */
  loginData?: Record<string, string>;
}

/** ZAP API alert structure */
interface ZAPApiAlert {
  alert: string;
  risk: string;
  confidence: string;
  description: string;
  solution: string;
  url: string;
  evidence: string;
  cweid: string;
  wascid: string;
  param?: string;
  attack?: string;
  reference?: string;
  other?: string;
}

const DEFAULT_ZAP_API = "http://localhost:8080";

/**
 * ZAPScanner connects to a running ZAP instance
 * and performs spider + passive + active security scanning.
 */
export class ZAPScanner {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(options?: { apiUrl?: string; apiKey?: string }) {
    this.apiUrl = options?.apiUrl ?? DEFAULT_ZAP_API;
    this.apiKey = options?.apiKey ?? "";
  }

  /**
   * Run a full security scan against a URL.
   * Optionally performs spidering and active scanning.
   */
  async scan(url: string, options: ZAPOptions = {}): Promise<SecurityReport> {
    const timer = createTimer();
    const timeout = options.timeout ?? 600_000; // 10 min default
    const doSpider = options.spider ?? true;
    const doActiveScan = options.activeScan ?? true;

    // Ensure ZAP is accessible
    await this.healthCheck();

    // Set up authentication if needed
    if (options.loginUrl && options.loginData) {
      await this.setupAuthentication(url, options);
    }

    // Configure scan policy
    if (options.scanStrength || options.scanThreshold) {
      await this.configureScanPolicy(options);
    }

    // Step 1: Spider the target
    if (doSpider) {
      options.onProgress?.("spider", 0);
      await this.spider(url, options);
      options.onProgress?.("spider", 100);
    }

    // Step 2: Wait for passive scanning to complete
    options.onProgress?.("passive-scan", 0);
    await this.waitForPassiveScan(timeout);
    options.onProgress?.("passive-scan", 100);

    // Step 3: Active scan
    if (doActiveScan) {
      options.onProgress?.("active-scan", 0);
      await this.activeScan(url, options, timeout);
      options.onProgress?.("active-scan", 100);
    }

    // Step 4: Collect alerts
    const alerts = await this.getAlerts(url);

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
   * Check if ZAP is accessible.
   */
  private async healthCheck(): Promise<void> {
    try {
      const response = await this.zapGet("/JSON/core/view/version/");
      if (!response.version) {
        throw new Error("Invalid ZAP version response");
      }
    } catch (error) {
      throw new Error(
        `Cannot connect to ZAP at ${this.apiUrl}. ` +
        "Ensure ZAP is running with API enabled. " +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Run the spider on a URL.
   */
  private async spider(url: string, options: ZAPOptions): Promise<void> {
    const params: Record<string, string> = {
      url,
      maxChildren: "0",
      recurse: "true",
      subtreeOnly: "false",
    };

    if (options.spiderMaxDepth) {
      params.maxDepth = String(options.spiderMaxDepth);
    }

    if (options.contextId) {
      params.contextName = options.contextId;
    }

    const result = await this.zapGet("/JSON/spider/action/scan/", params);
    const scanId = result.scan as string;

    if (!scanId) {
      throw new Error("Failed to start ZAP spider");
    }

    // Poll for spider completion
    let progress = 0;
    while (progress < 100) {
      await sleep(2000);
      const status = await this.zapGet("/JSON/spider/view/status/", { scanId });
      progress = parseInt((status.status as string) ?? "0", 10);
      options.onProgress?.("spider", progress);
    }
  }

  /**
   * Wait for passive scanning to complete.
   */
  private async waitForPassiveScan(timeout: number): Promise<void> {
    const start = Date.now();
    let recordsRemaining = 1;

    while (recordsRemaining > 0 && Date.now() - start < timeout) {
      await sleep(2000);
      const result = await this.zapGet("/JSON/pscan/view/recordsToScan/");
      recordsRemaining = parseInt((result.recordsToScan as string) ?? "0", 10);
    }
  }

  /**
   * Run active scanning on a URL.
   */
  private async activeScan(url: string, options: ZAPOptions, timeout: number): Promise<void> {
    const params: Record<string, string> = {
      url,
      recurse: "true",
      inScopeOnly: "false",
    };

    if (options.contextId) {
      params.contextId = options.contextId;
    }

    if (options.userId) {
      params.userId = options.userId;
    }

    const result = await this.zapGet("/JSON/ascan/action/scan/", params);
    const scanId = result.scan as string;

    if (!scanId) {
      throw new Error("Failed to start ZAP active scan");
    }

    // Poll for active scan completion
    const start = Date.now();
    let progress = 0;

    while (progress < 100 && Date.now() - start < timeout) {
      await sleep(5000);
      const status = await this.zapGet("/JSON/ascan/view/status/", { scanId });
      progress = parseInt((status.status as string) ?? "0", 10);
      options.onProgress?.("active-scan", progress);
    }
  }

  /**
   * Configure scan policy for active scanning.
   */
  private async configureScanPolicy(options: ZAPOptions): Promise<void> {
    const policyName = "inspect-policy";

    try {
      await this.zapGet("/JSON/ascan/action/addScanPolicy/", { scanPolicyName: policyName });
    } catch (error) {
      logger.debug("Failed to add ZAP scan policy, may already exist", { policyName, error });
    }

    if (options.scanStrength) {
      await this.zapGet("/JSON/ascan/action/setOptionAttackStrength/", {
        String: options.scanStrength,
      }).catch(() => {});
    }

    if (options.scanThreshold) {
      await this.zapGet("/JSON/ascan/action/setOptionAlertThreshold/", {
        String: options.scanThreshold,
      }).catch(() => {});
    }
  }

  /**
   * Set up form-based authentication.
   */
  private async setupAuthentication(url: string, options: ZAPOptions): Promise<void> {
    if (!options.loginUrl || !options.loginData) return;

    const contextId = options.contextId ?? "1";

    // Include target in context
    const urlPattern = new URL(url).origin + ".*";
    await this.zapGet("/JSON/context/action/includeInContext/", {
      contextName: contextId,
      regex: urlPattern,
    }).catch(() => {});

    // Set form-based auth
    const loginParams = Object.entries(options.loginData)
      .map(([k, v]) => `${encodeURIComponent(k)}={%${encodeURIComponent(k)}%}`)
      .join("&");

    await this.zapGet("/JSON/authentication/action/setAuthenticationMethod/", {
      contextId,
      authMethodName: "formBasedAuthentication",
      authMethodConfigParams: `loginUrl=${encodeURIComponent(options.loginUrl)}&loginRequestData=${encodeURIComponent(loginParams)}`,
    }).catch(() => {});
  }

  /**
   * Get all alerts for a URL.
   */
  private async getAlerts(url: string): Promise<SecurityAlert[]> {
    const result = await this.zapGet("/JSON/alert/view/alerts/", {
      baseurl: url,
      start: "0",
      count: "1000",
    });

    const zapAlerts: ZAPApiAlert[] = (result.alerts as ZAPApiAlert[]) ?? [];
    return zapAlerts.map((alert) => this.transformAlert(alert));
  }

  /**
   * Transform a ZAP alert into our SecurityAlert format.
   */
  private transformAlert(alert: ZAPApiAlert): SecurityAlert {
    const riskMap: Record<string, SecurityRisk> = {
      "3": "critical",
      "2": "high",
      "1": "medium",
      "0": "low",
      High: "high",
      Medium: "medium",
      Low: "low",
      Informational: "informational",
    };

    const confidenceMap: Record<string, SecurityAlert["confidence"]> = {
      "3": "confirmed",
      "2": "high",
      "1": "medium",
      "0": "low",
      High: "high",
      Medium: "medium",
      Low: "low",
      Confirmed: "confirmed",
      "False Positive": "false_positive",
    };

    const references = alert.reference
      ? alert.reference.split("\n").filter((r) => r.trim().startsWith("http"))
      : [];

    return {
      risk: riskMap[alert.risk] ?? "informational",
      name: alert.alert,
      description: alert.description,
      solution: alert.solution,
      url: alert.url,
      evidence: alert.evidence,
      cweid: parseInt(alert.cweid, 10) || 0,
      wascid: parseInt(alert.wascid, 10) || undefined,
      param: alert.param || undefined,
      attack: alert.attack || undefined,
      confidence: confidenceMap[alert.confidence] ?? "medium",
      references,
      source: "zap",
    };
  }

  /**
   * Make a GET request to the ZAP API.
   */
  private async zapGet(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const url = new URL(path, this.apiUrl);

    if (this.apiKey) {
      url.searchParams.set("apikey", this.apiKey);
    }

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`ZAP API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }
}
