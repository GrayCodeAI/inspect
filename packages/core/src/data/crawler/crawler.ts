// ──────────────────────────────────────────────────────────────────────────────
// @inspect/data - Web Crawler
// ──────────────────────────────────────────────────────────────────────────────

import type {
  CrawlConfig,
  CrawlJob,
  CrawlResult,
  CrawlProgressEvent,
  CrawlCheckpoint,
} from "@inspect/core";
import { createLogger } from "@inspect/core";

const logger = createLogger("data/crawler");

/** Progress callback type */
export type CrawlProgressCallback = (event: CrawlProgressEvent) => void;

/**
 * WebCrawler discovers and extracts content from websites.
 * Supports sitemap parsing, robots.txt, link following, and JS-rendered pages.
 */
export class WebCrawler {
  private config: Required<CrawlConfig>;
  private job: CrawlJob;
  private aborted: boolean = false;
  private onProgress?: CrawlProgressCallback;

  constructor(config: CrawlConfig, onProgress?: CrawlProgressCallback) {
    this.config = {
      startUrl: config.startUrl,
      maxDepth: config.maxDepth ?? 3,
      maxPages: config.maxPages ?? 100,
      sameDomain: config.sameDomain ?? true,
      includePatterns: config.includePatterns ?? [],
      excludePatterns: config.excludePatterns ?? [],
      concurrency: config.concurrency ?? 5,
      timeout: config.timeout ?? 30_000,
      respectRobots: config.respectRobots ?? true,
      followRedirects: config.followRedirects ?? true,
      headers: config.headers ?? {},
      userAgent: config.userAgent ?? "InspectBot/1.0",
      delay: config.delay ?? 0,
      extractContent: config.extractContent ?? false,
      useBrowser: config.useBrowser ?? false,
    };

    this.onProgress = onProgress;
    this.job = {
      id: generateId(),
      status: "pending",
      config: this.config,
      queue: [this.config.startUrl],
      visited: [],
      results: [],
      pagesCrawled: 0,
      errorCount: 0,
      progress: 0,
    };
  }

  /**
   * Start the crawl.
   */
  async crawl(): Promise<CrawlJob> {
    this.job.status = "running";
    this.job.startTime = Date.now();
    this.emitProgress("started");

    const robotsRules = this.config.respectRobots
      ? await this.fetchRobotsTxt(this.config.startUrl)
      : null;

    // Try sitemap first
    const sitemapUrls = await this.fetchSitemap(this.config.startUrl);
    if (sitemapUrls.length > 0) {
      for (const url of sitemapUrls) {
        if (!this.job.queue.includes(url)) {
          this.job.queue.push(url);
        }
      }
    }

    while (this.job.queue.length > 0 && !this.aborted) {
      if (this.job.pagesCrawled >= this.config.maxPages) break;

      const batch = this.job.queue.splice(0, this.config.concurrency);
      const promises = batch.map((url) => this.crawlPage(url, 0, robotsRules));
      await Promise.allSettled(promises);

      if (this.config.delay > 0) {
        await sleep(this.config.delay);
      }
    }

    this.job.status = this.aborted ? "paused" : "completed";
    this.job.endTime = Date.now();
    this.job.progress = 100;
    this.emitProgress(this.aborted ? "paused" : "completed");

    return this.job;
  }

  /**
   * Pause the crawl (can be resumed).
   */
  pause(): void {
    this.aborted = true;
  }

  /**
   * Resume a paused crawl from checkpoint.
   */
  async resume(checkpoint: CrawlCheckpoint): Promise<CrawlJob> {
    this.job = {
      id: checkpoint.jobId,
      status: "running",
      config: checkpoint.config as Required<CrawlConfig>,
      queue: checkpoint.queue,
      visited: checkpoint.visited,
      results: [],
      pagesCrawled: checkpoint.pagesCrawled,
      errorCount: 0,
      progress: 0,
      startTime: Date.now(),
    };
    this.aborted = false;
    return this.crawl();
  }

  /**
   * Export crawl results in various formats.
   */
  export(format: "json" | "csv" | "jsonl"): string {
    if (format === "json") {
      return JSON.stringify(this.job.results, null, 2);
    }
    if (format === "jsonl") {
      return this.job.results.map((r) => JSON.stringify(r)).join("\n");
    }
    // CSV
    const header = "url,statusCode,title,depth,fetchTimeMs,contentSize";
    const rows = this.job.results.map(
      (r) =>
        `"${r.url}",${r.statusCode},"${(r.title ?? "").replace(/"/g, '""')}",${r.depth},${r.fetchTimeMs},${r.contentSize}`,
    );
    return [header, ...rows].join("\n");
  }

  /**
   * Get a checkpoint for resume.
   */
  getCheckpoint(): CrawlCheckpoint {
    return {
      jobId: this.job.id,
      config: this.config,
      queue: [...this.job.queue],
      visited: [...this.job.visited],
      pagesCrawled: this.job.pagesCrawled,
      timestamp: Date.now(),
    };
  }

  getJob(): CrawlJob {
    return { ...this.job };
  }

  // ── Private methods ───────────────────────────────────────────────────

  private async crawlPage(
    url: string,
    depth: number,
    robotsRules: RobotsRules | null,
  ): Promise<void> {
    if (this.aborted) return;
    if (this.job.visited.includes(url)) return;
    if (this.job.pagesCrawled >= this.config.maxPages) return;

    // Check robots.txt
    if (robotsRules && !robotsRules.isAllowed(url)) return;

    // Check include/exclude patterns
    if (!this.matchesFilters(url)) return;

    // Check domain scope
    if (this.config.sameDomain) {
      try {
        const startDomain = new URL(this.config.startUrl).hostname;
        const pageDomain = new URL(url).hostname;
        if (startDomain !== pageDomain) return;
      } catch (error) {
        logger.debug("Failed to parse domain for URL comparison", { url, error });
        return;
      }
    }

    this.job.visited.push(url);

    const startTime = performance.now();
    const result: CrawlResult = {
      url,
      statusCode: 0,
      contentType: "",
      links: [],
      depth,
      fetchTimeMs: 0,
      contentSize: 0,
      timestamp: Date.now(),
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.userAgent,
          ...this.config.headers,
        },
        signal: controller.signal,
        redirect: this.config.followRedirects ? "follow" : "manual",
      });

      clearTimeout(timeoutId);

      result.statusCode = response.status;
      result.contentType = response.headers.get("content-type") ?? "";

      const content = await response.text();
      result.contentSize = Buffer.byteLength(content, "utf-8");

      if (result.contentType.includes("text/html")) {
        result.title = this.extractTitle(content);
        result.links = this.extractLinks(content, url);

        if (this.config.extractContent) {
          result.textContent = this.extractTextContent(content);
        }

        // Add discovered links to queue
        if (depth < this.config.maxDepth) {
          for (const link of result.links) {
            if (!this.job.visited.includes(link) && !this.job.queue.includes(link)) {
              this.job.queue.push(link);
            }
          }
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.job.errorCount++;
    }

    result.fetchTimeMs = Math.round(performance.now() - startTime);
    this.job.results.push(result);
    this.job.pagesCrawled++;
    this.job.progress = Math.min(
      100,
      Math.round((this.job.pagesCrawled / this.config.maxPages) * 100),
    );

    this.emitProgress("page_crawled", url);
  }

  private async fetchSitemap(baseUrl: string): Promise<string[]> {
    try {
      const sitemapUrl = new URL("/sitemap.xml", baseUrl).href;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(sitemapUrl, {
        headers: { "User-Agent": this.config.userAgent },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const content = await response.text();
      return this.parseSitemap(content);
    } catch (error) {
      logger.debug("Failed to fetch sitemap", { baseUrl, error });
      return [];
    }
  }

  private parseSitemap(xml: string): string[] {
    const urls: string[] = [];
    const locMatches = xml.matchAll(/<loc[^>]*>(.*?)<\/loc>/gi);
    for (const match of locMatches) {
      const url = match[1].trim();
      if (url.startsWith("http")) {
        urls.push(url);
      }
    }
    return urls;
  }

  private async fetchRobotsTxt(baseUrl: string): Promise<RobotsRules> {
    try {
      const robotsUrl = new URL("/robots.txt", baseUrl).href;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": this.config.userAgent },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return { isAllowed: () => true };

      const content = await response.text();
      return this.parseRobotsTxt(content);
    } catch (error) {
      logger.debug("Failed to fetch robots.txt, allowing all", { baseUrl, error });
      return { isAllowed: () => true };
    }
  }

  private parseRobotsTxt(content: string): RobotsRules {
    const disallowed: string[] = [];
    const lines = content.split("\n");
    let isUserAgentMatch = false;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith("user-agent:")) {
        const agent = trimmed.slice("user-agent:".length).trim();
        isUserAgentMatch = agent === "*" || this.config.userAgent.toLowerCase().includes(agent);
      } else if (isUserAgentMatch && trimmed.startsWith("disallow:")) {
        const path = trimmed.slice("disallow:".length).trim();
        if (path) disallowed.push(path);
      }
    }

    return {
      isAllowed: (url: string) => {
        try {
          const path = new URL(url).pathname;
          return !disallowed.some((d) => path.startsWith(d));
        } catch (error) {
          logger.debug("Failed to parse URL for robots.txt check", { url, error });
          return true;
        }
      },
    };
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    const hrefMatches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);

    for (const match of hrefMatches) {
      try {
        const href = match[1];
        if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:"))
          continue;

        const resolved = new URL(href, baseUrl).href;
        // Remove fragment
        const clean = resolved.split("#")[0];
        if (clean && !links.includes(clean)) {
          links.push(clean);
        }
      } catch (error) {
        logger.debug("Failed to resolve link URL, skipping", { error });
      }
    }

    return links;
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return match ? match[1].trim().slice(0, 500) : "";
  }

  private extractTextContent(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10_000);
  }

  private matchesFilters(url: string): boolean {
    if (this.config.includePatterns.length > 0) {
      const matches = this.config.includePatterns.some((p) => matchGlob(url, p));
      if (!matches) return false;
    }

    if (this.config.excludePatterns.length > 0) {
      const matches = this.config.excludePatterns.some((p) => matchGlob(url, p));
      if (matches) return false;
    }

    return true;
  }

  private emitProgress(type: CrawlProgressEvent["type"], url?: string): void {
    if (!this.onProgress) return;

    this.onProgress({
      type,
      jobId: this.job.id,
      url,
      pagesCrawled: this.job.pagesCrawled,
      totalPages: this.config.maxPages,
      progress: this.job.progress,
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

interface RobotsRules {
  isAllowed: (url: string) => boolean;
}

function generateId(): string {
  return `crawl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchGlob(str: string, pattern: string): boolean {
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  return regex.test(str);
}
