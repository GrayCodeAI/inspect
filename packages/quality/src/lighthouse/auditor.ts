// ============================================================================
// @inspect/quality - Lighthouse Auditor
// ============================================================================

import type {
  LighthouseReport,
  LighthouseScore,
  PerformanceMetric,
  LighthouseOpportunity,
  MetricRating,
} from "@inspect/shared";
import { createTimer } from "@inspect/shared";
import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/lighthouse-auditor");

/** Lighthouse audit options */
export interface LighthouseOptions {
  /** Device to emulate: mobile or desktop */
  device?: "mobile" | "desktop";
  /** Categories to audit */
  categories?: Array<"performance" | "accessibility" | "best-practices" | "seo" | "pwa">;
  /** Network throttling profile */
  throttling?: {
    rttMs?: number;
    downloadKbps?: number;
    uploadKbps?: number;
    cpuSlowdown?: number;
  };
  /** Performance budgets to check against */
  budgets?: LighthouseBudget[];
  /** Chrome debugging port (default: 9222) */
  port?: number;
  /** Path to Chrome executable */
  chromePath?: string;
  /** Maximum wait time for audit in ms */
  timeout?: number;
  /** Additional Lighthouse flags */
  extraFlags?: Record<string, unknown>;
  /** Whether to keep Chrome open after audit */
  keepAlive?: boolean;
  /** Output format */
  output?: "json" | "html" | "csv";
  /** Locale for the report */
  locale?: string;
}

/** Lighthouse performance budget */
export interface LighthouseBudget {
  /** Resource type or metric name */
  resourceType?: string;
  /** Metric name (e.g. "FCP", "LCP") */
  metric?: string;
  /** Budget value in bytes (resources) or ms (metrics) */
  budget: number;
}

/** Chrome process handle */
interface ChromeHandle {
  process: ChildProcess;
  port: number;
  kill: () => void;
}

/**
 * LighthouseAuditor runs Google Lighthouse via its Node API
 * to produce performance, accessibility, best-practices, SEO, and PWA scores.
 */
export class LighthouseAuditor {
  private readonly defaultOptions: Partial<LighthouseOptions>;

  constructor(options?: Partial<LighthouseOptions>) {
    this.defaultOptions = options ?? {};
  }

  /**
   * Run a Lighthouse audit on a URL.
   *
   * Launches a headless Chrome instance with remote debugging enabled,
   * runs Lighthouse via dynamic import, and returns a structured report.
   */
  async run(url: string, options: LighthouseOptions = {}): Promise<LighthouseReport> {
    const _timer = createTimer();
    const mergedOptions = { ...this.defaultOptions, ...options };
    const device = mergedOptions.device ?? "mobile";
    const port = mergedOptions.port ?? 9222;
    const timeout = mergedOptions.timeout ?? 120_000;
    const categories = mergedOptions.categories ?? [
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ];

    let chrome: ChromeHandle | undefined;

    try {
      // Launch Chrome with remote debugging
      chrome = await this.launchChrome(port, mergedOptions.chromePath);

      // Dynamic import of lighthouse (optional peer dependency)
      const lighthouse = await this.importLighthouse();

      // Build Lighthouse flags
      const flags = {
        port,
        output: mergedOptions.output ?? "json",
        logLevel: "error" as const,
        onlyCategories: categories,
        formFactor: device,
        screenEmulation:
          device === "desktop"
            ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
            : { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
        throttling:
          mergedOptions.throttling ??
          (device === "desktop"
            ? { rttMs: 40, downloadKbps: 10240, uploadKbps: 10240, cpuSlowdown: 1 }
            : { rttMs: 150, downloadKbps: 1600, uploadKbps: 750, cpuSlowdown: 4 }),
        locale: mergedOptions.locale,
        ...mergedOptions.extraFlags,
      };

      // Build Lighthouse config
      const config = {
        extends: "lighthouse:default",
        settings: {
          budgets: mergedOptions.budgets
            ? [
                {
                  path: "/*",
                  resourceSizes: [],
                  resourceCounts: [],
                  timings: mergedOptions.budgets.map((b) => ({
                    metric: b.metric ?? b.resourceType,
                    budget: b.budget,
                  })),
                },
              ]
            : undefined,
        },
      };

      // Run Lighthouse
      const result = await Promise.race([
        lighthouse(url, flags, config),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Lighthouse audit timed out after ${timeout}ms`)),
            timeout,
          ),
        ),
      ]);

      // Parse results
      return this.parseResults(result.lhr, url, device);
    } finally {
      if (chrome && !mergedOptions.keepAlive) {
        chrome.kill();
      }
    }
  }

  /**
   * Run Lighthouse on an already-connected Chrome instance via port.
   */
  async runOnPort(
    url: string,
    port: number,
    options: LighthouseOptions = {},
  ): Promise<LighthouseReport> {
    const mergedOptions = { ...this.defaultOptions, ...options, port, keepAlive: true };
    return this.run(url, mergedOptions);
  }

  /**
   * Launch a headless Chrome instance with remote debugging.
   */
  private async launchChrome(port: number, chromePath?: string): Promise<ChromeHandle> {
    const chromeExecutable = chromePath ?? this.findChromeExecutable();

    const chromeProcess = spawn(
      chromeExecutable,
      [
        `--remote-debugging-port=${port}`,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--mute-audio",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "about:blank",
      ],
      {
        stdio: "ignore",
        detached: false,
      },
    );

    // Wait for Chrome to start
    await this.waitForDebugger(port, 15_000);

    return {
      process: chromeProcess,
      port,
      kill: () => {
        try {
          chromeProcess.kill("SIGTERM");
        } catch (error) {
          logger.debug("Failed to kill Chrome process, may already be dead", { error });
        }
      },
    };
  }

  /**
   * Wait for Chrome's debugging port to be ready.
   */
  private async waitForDebugger(port: number, timeout: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) return;
      } catch (error) {
        logger.debug("Chrome debugger not ready yet, retrying", { port, error });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Chrome debugger not ready on port ${port} after ${timeout}ms`);
  }

  /**
   * Find the Chrome executable on the system.
   */
  private findChromeExecutable(): string {
    const platform = process.platform;

    if (platform === "darwin") {
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    }
    if (platform === "win32") {
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }

    // Linux - try common paths
    const linuxPaths = [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ];

    // Return the first one; actual check happens at launch
    return linuxPaths[0];
  }

  /**
   * Dynamically import Lighthouse.
   */
  private async importLighthouse(): Promise<LighthouseFn> {
    try {
      // @ts-expect-error - lighthouse may not be installed; dynamic import
      const mod = await import("lighthouse");
      return mod.default ?? mod;
    } catch (error) {
      logger.debug("Failed to import lighthouse module", { error });
      throw new Error("Lighthouse is not installed. Install it with: npm install lighthouse", {
        cause: error,
      });
    }
  }

  /**
   * Parse raw Lighthouse results into our LighthouseReport format.
   */
  private parseResults(
    lhr: LighthouseRawResult,
    url: string,
    device: "mobile" | "desktop",
  ): LighthouseReport {
    // Extract category scores
    const scores: LighthouseScore = {
      performance: this.getCategoryScore(lhr, "performance"),
      accessibility: this.getCategoryScore(lhr, "accessibility"),
      bestPractices: this.getCategoryScore(lhr, "best-practices"),
      seo: this.getCategoryScore(lhr, "seo"),
      pwa: lhr.categories?.["pwa"] ? this.getCategoryScore(lhr, "pwa") : undefined,
    };

    // Extract core web vitals and performance metrics
    const metrics = {
      FCP: this.extractMetric(lhr, "first-contentful-paint"),
      LCP: this.extractMetric(lhr, "largest-contentful-paint"),
      CLS: this.extractMetric(lhr, "cumulative-layout-shift"),
      TBT: this.extractMetric(lhr, "total-blocking-time"),
      SI: this.extractMetric(lhr, "speed-index"),
      TTI: this.extractMetric(lhr, "interactive"),
      INP: lhr.audits?.["experimental-interaction-to-next-paint"]
        ? this.extractMetric(lhr, "experimental-interaction-to-next-paint")
        : undefined,
      TTFB: lhr.audits?.["server-response-time"]
        ? this.extractMetric(lhr, "server-response-time")
        : undefined,
    };

    // Extract opportunities
    const opportunities: LighthouseOpportunity[] = [];
    for (const audit of Object.values(lhr.audits ?? {})) {
      if (audit.details?.type === "opportunity" && (audit.details.overallSavingsMs ?? 0) > 0) {
        opportunities.push({
          id: audit.id,
          title: audit.title,
          description: audit.description ?? "",
          estimatedSavingsMs: audit.details.overallSavingsMs,
        });
      }
    }

    // Sort by potential savings descending
    opportunities.sort((a, b) => (b.estimatedSavingsMs ?? 0) - (a.estimatedSavingsMs ?? 0));

    // Extract diagnostics
    const diagnostics = Object.values(lhr.audits ?? {})
      .filter(
        (audit) =>
          audit.details?.type === "table" &&
          audit.scoreDisplayMode !== "notApplicable" &&
          audit.score !== null &&
          audit.score < 1,
      )
      .map((audit) => ({
        id: audit.id,
        title: audit.title,
        description: audit.description ?? "",
        score: audit.score ?? 0,
        details: audit.details?.items ?? [],
      }));

    // Extract stack packs
    const stackPacks = (lhr.stackPacks ?? []).map((sp: StackPackRaw) => ({
      id: sp.id,
      title: sp.title,
      descriptions: sp.descriptions ?? {},
    })) as Array<{ id: string; title: string; descriptions: Record<string, string> }>;

    return {
      scores,
      metrics,
      opportunities,
      diagnostics,
      device,
      timestamp: Date.now(),
      url,
      stackPacks: stackPacks.length > 0 ? stackPacks : undefined,
    } as LighthouseReport;
  }

  /**
   * Get a category score from raw Lighthouse results (0-100).
   */
  private getCategoryScore(lhr: LighthouseRawResult, category: string): number {
    const cat = lhr.categories?.[category];
    if (!cat) return 0;
    return Math.round((cat.score ?? 0) * 100);
  }

  /**
   * Extract a single metric from raw Lighthouse results.
   */
  private extractMetric(lhr: LighthouseRawResult, auditId: string): PerformanceMetric {
    const audit = lhr.audits?.[auditId];
    if (!audit) {
      return { value: 0, rating: "poor", displayValue: "N/A" };
    }

    const value = audit.numericValue ?? 0;
    const displayValue = audit.displayValue ?? `${Math.round(value)} ms`;

    // Determine rating from score
    let rating: MetricRating = "poor";
    if (audit.score !== null && audit.score !== undefined) {
      if (audit.score >= 0.9) rating = "good";
      else if (audit.score >= 0.5) rating = "needs-improvement";
    }

    return { value, rating, displayValue };
  }
}

// ---------------------------------------------------------------------------
// Internal Lighthouse type interfaces
// ---------------------------------------------------------------------------

type LighthouseFn = (
  url: string,
  flags: unknown,
  config: unknown,
) => Promise<{ lhr: LighthouseRawResult }>;

interface LighthouseRawResult {
  categories?: Record<string, { score: number | null }>;
  audits?: Record<string, LighthouseRawAudit>;
  stackPacks?: StackPackRaw[];
}

interface LighthouseRawAudit {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  displayValue?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    items?: unknown[];
  };
}

interface StackPackRaw {
  id: string;
  title: string;
  descriptions?: Record<string, string>;
}
