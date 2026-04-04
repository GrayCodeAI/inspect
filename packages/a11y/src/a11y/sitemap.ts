// ============================================================================
// @inspect/quality - Sitemap-based Accessibility Auditor
// ============================================================================

import type { A11yReport } from "@inspect/shared";
import { mapConcurrent, createTimer } from "@inspect/shared";
import { AccessibilityAuditor, type A11yAuditOptions } from "./auditor.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/sitemap-auditor");

/** Page-like interface for navigation */
interface PageHandle {
  url(): string;
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
  addScriptTag(options: { url?: string; content?: string }): Promise<void>;
  waitForFunction(fn: string | (() => boolean), options?: { timeout?: number }): Promise<void>;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
}

/** Browser context that can spawn new pages */
interface BrowserContextHandle {
  newPage(): Promise<PageHandle>;
}

/** Options for sitemap auditing */
export interface SitemapAuditOptions extends A11yAuditOptions {
  /** Max pages to audit in parallel */
  concurrency?: number;
  /** Timeout per page navigation in ms */
  navigationTimeout?: number;
  /** Whether to follow sitemap links recursively */
  recursive?: boolean;
  /** Maximum pages to audit (cap) */
  maxPages?: number;
  /** Skip URLs matching these patterns */
  excludePatterns?: RegExp[];
  /** Only audit URLs matching these patterns */
  includePatterns?: RegExp[];
}

/** Aggregate sitemap audit result */
export interface SitemapAuditResult {
  /** Per-page results */
  pages: Map<string, A11yReport>;
  /** Aggregate score across all pages */
  averageScore: number;
  /** Total violations across all pages */
  totalViolations: number;
  /** Pages audited count */
  pagesAudited: number;
  /** Pages that failed to audit */
  failedPages: string[];
  /** Total duration in ms */
  duration: number;
  /** Scores per page for tracking */
  scoresByPage: Array<{ url: string; score: number; violations: number }>;
}

/**
 * SitemapAuditor runs parallel accessibility audits across multiple URLs
 * with aggregated scoring and reporting.
 */
export class SitemapAuditor {
  private readonly auditor: AccessibilityAuditor;

  constructor(auditor?: AccessibilityAuditor) {
    this.auditor = auditor ?? new AccessibilityAuditor();
  }

  /**
   * Audit a list of URLs in parallel, creating a new page per URL.
   */
  async auditSitemap(
    urls: string[],
    context: BrowserContextHandle,
    options: SitemapAuditOptions = {},
  ): Promise<SitemapAuditResult> {
    const timer = createTimer();
    const concurrency = options.concurrency ?? 3;
    const maxPages = options.maxPages ?? 100;
    const navigationTimeout = options.navigationTimeout ?? 30_000;

    // Filter URLs
    let filteredUrls = urls.slice(0, maxPages);
    if (options.excludePatterns) {
      filteredUrls = filteredUrls.filter(
        (url) => !options.excludePatterns!.some((p) => p.test(url)),
      );
    }
    if (options.includePatterns) {
      filteredUrls = filteredUrls.filter((url) =>
        options.includePatterns!.some((p) => p.test(url)),
      );
    }

    const pages = new Map<string, A11yReport>();
    const failedPages: string[] = [];

    // Audit each URL with concurrency control
    await mapConcurrent(filteredUrls, concurrency, async (url) => {
      let page: PageHandle | undefined;
      try {
        page = await context.newPage();
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: navigationTimeout,
        });

        const report = await this.auditor.audit(page, options);
        pages.set(url, report);
      } catch (_error) {
        failedPages.push(url);
        pages.set(url, {
          violations: [],
          passes: [],
          incomplete: [],
          inapplicable: [],
          score: 0,
          standard: options.standard ?? "wcag2aa",
          timestamp: Date.now(),
          url,
        });
      }
    });

    // Calculate aggregates
    const scores: number[] = [];
    let totalViolations = 0;
    const scoresByPage: Array<{ url: string; score: number; violations: number }> = [];

    for (const [url, report] of pages) {
      scores.push(report.score);
      totalViolations += report.violations.length;
      scoresByPage.push({
        url,
        score: report.score,
        violations: report.violations.length,
      });
    }

    const averageScore =
      scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Sort by score ascending (worst first)
    scoresByPage.sort((a, b) => a.score - b.score);

    return {
      pages,
      averageScore,
      totalViolations,
      pagesAudited: pages.size,
      failedPages,
      duration: timer.elapsed(),
      scoresByPage,
    };
  }

  /**
   * Parse a sitemap.xml URL and extract page URLs.
   */
  static async parseSitemapXml(sitemapUrl: string): Promise<string[]> {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const urls: string[] = [];

    // Simple XML parsing for <loc> tags
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
    let match: RegExpExecArray | null;
    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[1].trim();
      if (url.startsWith("http")) {
        urls.push(url);
      }
    }

    // Check for sitemap index (nested sitemaps)
    const sitemapRegex = /<sitemap>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi;
    const nestedSitemaps: string[] = [];
    while ((match = sitemapRegex.exec(xml)) !== null) {
      nestedSitemaps.push(match[1].trim());
    }

    // Recursively fetch nested sitemaps
    for (const nestedUrl of nestedSitemaps) {
      try {
        const nestedUrls = await SitemapAuditor.parseSitemapXml(nestedUrl);
        urls.push(...nestedUrls);
      } catch (error) {
        logger.debug("Failed to fetch nested sitemap, skipping", { nestedUrl, error });
      }
    }

    // Deduplicate
    return [...new Set(urls)];
  }
}
