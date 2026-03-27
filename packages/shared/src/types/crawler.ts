// ──────────────────────────────────────────────────────────────────────────────
// @inspect/shared - Crawler Types
// ──────────────────────────────────────────────────────────────────────────────

/** Crawl job status */
export type CrawlStatus = "pending" | "running" | "paused" | "completed" | "failed";

/** Crawl configuration */
export interface CrawlConfig {
  /** Starting URL */
  startUrl: string;
  /** Maximum depth to crawl (default: 3) */
  maxDepth?: number;
  /** Maximum number of pages to crawl (default: 100) */
  maxPages?: number;
  /** Stay within the same domain (default: true) */
  sameDomain?: boolean;
  /** URL patterns to include (glob patterns) */
  includePatterns?: string[];
  /** URL patterns to exclude (glob patterns) */
  excludePatterns?: string[];
  /** Number of concurrent requests (default: 5) */
  concurrency?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Respect robots.txt (default: true) */
  respectRobots?: boolean;
  /** Follow redirects (default: true) */
  followRedirects?: boolean;
  /** Custom headers */
  headers?: Record<string, string>;
  /** User agent string */
  userAgent?: string;
  /** Delay between requests in ms (default: 0) */
  delay?: number;
  /** Extract content from pages (default: false) */
  extractContent?: boolean;
  /** Use Playwright for JS rendering (default: false) */
  useBrowser?: boolean;
}

/** A single crawled page result */
export interface CrawlResult {
  /** Page URL */
  url: string;
  /** HTTP status code */
  statusCode: number;
  /** Response content type */
  contentType: string;
  /** Page title (if HTML) */
  title?: string;
  /** Extracted text content */
  textContent?: string;
  /** Extracted links */
  links: string[];
  /** Crawl depth from start URL */
  depth: number;
  /** Time taken to fetch in ms */
  fetchTimeMs: number;
  /** Content size in bytes */
  contentSize: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
}

/** Crawl job state */
export interface CrawlJob {
  /** Unique job ID */
  id: string;
  /** Job status */
  status: CrawlStatus;
  /** Configuration used */
  config: CrawlConfig;
  /** URLs queued for crawling */
  queue: string[];
  /** URLs already crawled */
  visited: string[];
  /** Results collected */
  results: CrawlResult[];
  /** Total pages crawled */
  pagesCrawled: number;
  /** Total errors encountered */
  errorCount: number;
  /** Start time */
  startTime?: number;
  /** End time */
  endTime?: number;
  /** Progress percentage (0-100) */
  progress: number;
}

/** Crawl progress event */
export interface CrawlProgressEvent {
  type: "page_crawled" | "error" | "started" | "paused" | "completed" | "resumed";
  jobId: string;
  url?: string;
  pagesCrawled: number;
  totalPages: number;
  progress: number;
  error?: string;
}

/** Crawl checkpoint for resume */
export interface CrawlCheckpoint {
  jobId: string;
  config: CrawlConfig;
  queue: string[];
  visited: string[];
  pagesCrawled: number;
  timestamp: number;
}

/** Change snapshot for content tracking */
export interface ChangeSnapshot {
  id: string;
  url: string;
  content: string;
  textContent: string;
  hash: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Change diff result */
export interface ChangeDiff {
  url: string;
  previousSnapshotId: string;
  currentSnapshotId: string;
  added: string[];
  removed: string[];
  modified: string[];
  similarity: number;
  timestamp: number;
}

/** Change tracking configuration */
export interface ChangeTrackingConfig {
  urls: string[];
  interval?: number;
  onDiff?: (diff: ChangeDiff) => void | Promise<void>;
  webhookUrl?: string;
  storageDir?: string;
}

/** Webhook configuration for change tracking (re-uses misc.WebhookConfig) */
