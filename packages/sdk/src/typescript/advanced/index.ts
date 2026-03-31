/**
 * Advanced SDK Features
 * Less commonly used methods namespaced under inspect.advanced
 */

import type { BrowserConfig } from "@inspect/core";

/**
 * Advanced SDK features - namespaced to keep core API simple
 */
export class InspectAdvanced {
  private browserConfig: BrowserConfig;
  private getPage: () => Promise<unknown>;

  constructor(config: { browserConfig: BrowserConfig; getPage: () => Promise<unknown> }) {
    this.browserConfig = config.browserConfig;
    this.getPage = config.getPage;
  }

  /**
   * Crawl a website and extract content
   */
  async crawl(
    url: string,
    options?: {
      depth?: number;
      maxPages?: number;
      format?: "json" | "csv" | "jsonl";
      extractContent?: boolean;
      exclude?: string[];
      include?: string[];
    },
  ): Promise<{ pagesCrawled: number; errorCount: number; results: unknown[] }> {
    const { WebCrawler } = await import("@inspect/core");

    const crawler = new WebCrawler({
      startUrl: url,
      maxDepth: options?.depth ?? 3,
      maxPages: options?.maxPages ?? 100,
      extractContent: options?.extractContent ?? false,
      excludePatterns: options?.exclude ?? [],
      includePatterns: options?.include ?? [],
    });

    const job = await crawler.crawl();
    const output = crawler.export(options?.format ?? "json");

    return {
      pagesCrawled: job.pagesCrawled,
      errorCount: job.errorCount,
      results: JSON.parse(output),
    };
  }

  /**
   * Track changes on a set of URLs
   */
  async track(
    urls: string[],
    options?: {
      interval?: number;
      onDiff?: (diff: unknown) => void;
    },
  ): Promise<{ urlsMonitored: number; diffs: unknown[] }> {
    const { ChangeTracker } = await import("@inspect/core");
    const diffs: unknown[] = [];

    const tracker = new ChangeTracker({
      urls,
      interval: (options?.interval ?? 60) * 1000,
      onDiff: (diff: unknown) => {
        diffs.push(diff);
        options?.onDiff?.(diff);
      },
    });

    await tracker.snapshotAll();

    return { urlsMonitored: urls.length, diffs };
  }

  /**
   * Start a network fault injection proxy
   */
  async createProxy(options?: {
    port?: number;
    upstream?: string;
    preset?: string;
    latency?: number;
  }): Promise<{
    status: () => Record<string, unknown>;
    addFault: (type: string, attributes: Record<string, unknown>) => void;
    stop: () => Promise<void>;
  }> {
    const { ProxyServer } = await import("@inspect/quality");

    const server = new ProxyServer({
      port: options?.port ?? 8888,
      upstream: options?.upstream ?? "localhost:80",
      name: "sdk-proxy",
    });

    if (options?.preset) {
      server.applyPreset(options.preset);
    }

    if (options?.latency) {
      server.addToxic({
        type: "latency",
        name: "sdk-latency",
        attributes: { latency: options.latency },
      });
    }

    await server.start();

    return {
      status: () => server.getStatus() as unknown as Record<string, unknown>,
      addFault: (type: string, attributes: Record<string, unknown>) => {
        server.addToxic({
          type: type as unknown as import("@inspect/core").ToxicType,
          name: `sdk-${type}`,
          attributes,
        });
      },
      stop: async () => {
        await server.stop();
      },
    };
  }

  /**
   * Run a test across all 3 browsers
   */
  async testAllBrowsers(
    url: string,
    _instruction: string,
  ): Promise<Array<{ engine: string; passed: boolean; durationMs: number; error?: string }>> {
    const { CrossBrowserManager } = await import("@inspect/browser");
    const manager = new CrossBrowserManager();

    try {
      const results = await manager.runAllBrowsers(this.browserConfig, async (engine, context) => {
        const page = await context.newPage();
        await page.goto(url);
        const title = await page.title();
        if (!title) throw new Error(`${engine}: Page has no title`);
      });
      return results.map((r) => ({
        engine: r.engine,
        passed: r.passed,
        durationMs: r.durationMs,
        error: r.error,
      }));
    } finally {
      await manager.closeAll();
    }
  }

  /**
   * Get flakiness score for a test
   */
  async getFlakiness(
    testId: string,
  ): Promise<{ score: number; passRate: number; recommendation: string } | null> {
    const { FlakinessDetector } = await import("@inspect/core");
    const detector = new FlakinessDetector();
    const score = detector.getScore(testId);
    if (!score) return null;
    return {
      score: score.score,
      passRate: score.passRate,
      recommendation: score.recommendation,
    };
  }
}
