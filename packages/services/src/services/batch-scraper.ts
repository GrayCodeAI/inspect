// ──────────────────────────────────────────────────────────────────────────────
// packages/services/src/services/batch-scraper.ts - Firecrawl Batch & Media Service
// ──────────────────────────────────────────────────────────────────────────────

/** Batch scrape job */
export interface BatchScrapeJob {
  id: string;
  urls: string[];
  status: "pending" | "running" | "completed" | "failed";
  results: BatchScrapeResult[];
  config: BatchScrapeConfig;
  progress: number;
  startTime?: number;
  endTime?: number;
}

/** Single scrape result */
export interface BatchScrapeResult {
  url: string;
  statusCode: number;
  contentType: string;
  markdown?: string;
  html?: string;
  screenshot?: string;
  metadata: Record<string, unknown>;
  links: string[];
  media: MediaAsset[];
  error?: string;
  fetchTimeMs: number;
}

/** Media asset extracted from page */
export interface MediaAsset {
  type: "image" | "pdf" | "docx" | "video" | "audio";
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  size?: number;
}

/** Batch scrape configuration */
export interface BatchScrapeConfig {
  formats: Array<"markdown" | "html" | "screenshot" | "text">;
  extractMedia: boolean;
  followRedirects: boolean;
  timeout: number;
  concurrency: number;
  delay: number;
  headers: Record<string, string>;
  userAgent: string;
  onlyMainContent: boolean;
  actions?: ScrapeAction[];
}

/** Scrape action (click, scroll, etc.) */
export interface ScrapeAction {
  type: "click" | "scroll" | "wait" | "screenshot" | "write" | "press";
  selector?: string;
  value?: string;
  milliseconds?: number;
}

/** Webhook payload for scrape events */
export interface ScrapeWebhookPayload {
  event: "page_scraped" | "batch_completed" | "batch_failed";
  jobId: string;
  url?: string;
  result?: BatchScrapeResult;
  progress: number;
  timestamp: number;
}

/**
 * Batch & Media Scraping Service (Firecrawl-inspired).
 * Supports async batch scraping, media extraction, and webhook notifications.
 *
 * Usage:
 * ```ts
 * const scraper = new BatchScraper();
 * const job = await scraper.createJob(['https://a.com', 'https://b.com'], {
 *   formats: ['markdown', 'screenshot'],
 *   extractMedia: true,
 * });
 * ```
 */
export class BatchScraper {
  private jobs: Map<string, BatchScrapeJob> = new Map();
  private webhooks: Map<string, string[]> = new Map();

  /**
   * Create a batch scrape job.
   */
  createJob(urls: string[], config: Partial<BatchScrapeConfig> = {}): BatchScrapeJob {
    const job: BatchScrapeJob = {
      id: generateId(),
      urls,
      status: "pending",
      results: [],
      config: {
        formats: config.formats ?? ["markdown"],
        extractMedia: config.extractMedia ?? false,
        followRedirects: config.followRedirects ?? true,
        timeout: config.timeout ?? 30_000,
        concurrency: config.concurrency ?? 5,
        delay: config.delay ?? 0,
        headers: config.headers ?? {},
        userAgent: config.userAgent ?? "InspectBot/1.0",
        onlyMainContent: config.onlyMainContent ?? true,
      },
      progress: 0,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Execute a batch scrape job.
   */
  async execute(jobId: string): Promise<BatchScrapeJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    job.status = "running";
    job.startTime = Date.now();

    const results: BatchScrapeResult[] = [];
    const batches = this.chunkArray(job.urls, job.config.concurrency);

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map((url) => this.scrapeUrl(url, job.config)),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
          this.notifyWebhook(jobId, {
            event: "page_scraped",
            jobId,
            url: result.value.url,
            result: result.value,
            progress: Math.round((results.length / job.urls.length) * 100),
            timestamp: Date.now(),
          });
        }
      }

      job.progress = Math.round((results.length / job.urls.length) * 100);
      job.results = results;

      if (job.config.delay > 0) {
        await sleep(job.config.delay);
      }
    }

    job.status = "completed";
    job.endTime = Date.now();

    this.notifyWebhook(jobId, {
      event: "batch_completed",
      jobId,
      progress: 100,
      timestamp: Date.now(),
    });

    return job;
  }

  /**
   * Register a webhook for job notifications.
   */
  registerWebhook(jobId: string, url: string): void {
    const hooks = this.webhooks.get(jobId) ?? [];
    hooks.push(url);
    this.webhooks.set(jobId, hooks);
  }

  /**
   * Get a job by ID.
   */
  getJob(jobId: string): BatchScrapeJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Export results in various formats.
   */
  exportResults(jobId: string, format: "json" | "csv" | "jsonl"): string {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (format === "json") return JSON.stringify(job.results, null, 2);
    if (format === "jsonl") return job.results.map((r) => JSON.stringify(r)).join("\n");

    const header = "url,status,contentType,fetchTimeMs,mediaCount";
    const rows = job.results.map(
      (r) => `"${r.url}",${r.statusCode},"${r.contentType}",${r.fetchTimeMs},${r.media.length}`,
    );
    return [header, ...rows].join("\n");
  }

  private async scrapeUrl(url: string, config: BatchScrapeConfig): Promise<BatchScrapeResult> {
    const start = performance.now();
    const result: BatchScrapeResult = {
      url,
      statusCode: 0,
      contentType: "",
      metadata: {},
      links: [],
      media: [],
      fetchTimeMs: 0,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(url, {
        headers: { "User-Agent": config.userAgent, ...config.headers },
        signal: controller.signal,
        redirect: config.followRedirects ? "follow" : "manual",
      });

      clearTimeout(timeoutId);

      result.statusCode = response.status;
      result.contentType = response.headers.get("content-type") ?? "";

      if (result.contentType.includes("text/html")) {
        const html = await response.text();

        if (config.formats.includes("html")) result.html = html;
        if (config.formats.includes("markdown")) {
          result.markdown = this.htmlToMarkdown(html);
        }
        if (config.formats.includes("text")) {
          result.metadata["text"] = html
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        result.links = this.extractLinks(html, url);

        if (config.extractMedia) {
          result.media = this.extractMedia(html, url);
        }

        result.metadata["title"] = this.extractTitle(html);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.fetchTimeMs = Math.round(performance.now() - start);
    return result;
  }

  private htmlToMarkdown(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    const links: string[] = [];
    for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      try {
        const url = new URL(match[1], baseUrl).href;
        if (!links.includes(url)) links.push(url);
      } catch {
        /* skip */
      }
    }
    return links;
  }

  private extractMedia(html: string, baseUrl: string): MediaAsset[] {
    const media: MediaAsset[] = [];
    for (const match of html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      try {
        const url = new URL(match[1], baseUrl).href;
        const altMatch = match[0].match(/alt\s*=\s*["']([^"']*)["']/i);
        media.push({ type: "image", url, alt: altMatch?.[1] });
      } catch {
        /* skip */
      }
    }
    return media;
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return match ? match[1].trim() : "";
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private notifyWebhook(jobId: string, payload: ScrapeWebhookPayload): void {
    const hooks = this.webhooks.get(jobId) ?? [];
    for (const url of hooks) {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }
}

function generateId(): string {
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
