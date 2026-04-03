import { Effect, Layer, Schema, ServiceMap } from "effect";
import type { Page, Browser } from "playwright";
import { writeFile } from "node:fs/promises";

export interface CrawlConfig {
  readonly startUrl: string;
  readonly maxPages: number;
  readonly maxDepth: number;
  readonly includePatterns: string[];
  readonly excludePatterns: string[];
  readonly waitForSelector?: string;
  readonly extractContentSelector?: string;
  readonly maxFileSize: number;
}

export interface CrawledPage {
  readonly url: string;
  readonly title: string;
  readonly content: string;
  readonly links: string[];
  readonly depth: number;
  readonly timestamp: number;
}

export interface CrawlResult {
  readonly pages: CrawledPage[];
  readonly totalPages: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly errors: Array<{ readonly url: string; readonly error: string }>;
}

export class CrawlError extends Schema.ErrorClass<CrawlError>("CrawlError")({
  _tag: Schema.tag("CrawlError"),
  url: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Crawl failed for URL: ${this.url}`;
}

export class ExportError extends Schema.ErrorClass<ExportError>("ExportError")({
  _tag: Schema.tag("ExportError"),
  path: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Export failed to path: ${this.path}`;
}

export class SiteCrawler extends ServiceMap.Service<SiteCrawler>()("@inspect/SiteCrawler", {
  make: Effect.gen(function* () {
    const crawl = Effect.fn("SiteCrawler.crawl")(function* (
      config: CrawlConfig,
      browser?: Browser,
    ) {
      const startTime = Date.now();
      const pages: CrawledPage[] = [];
      const errors: Array<{ url: string; error: string }> = [];
      const visitedUrls = new Set<string>();
      const queue: Array<{ url: string; depth: number }> = [{ url: config.startUrl, depth: 0 }];

      let page: Page | undefined;

      if (browser) {
        page = yield* Effect.tryPromise({
          try: () => browser.newPage(),
          catch: (cause) => new CrawlError({ url: config.startUrl, cause }),
        });
      }

      yield* Effect.logInfo("Starting crawl", {
        startUrl: config.startUrl,
        maxPages: config.maxPages,
      });

      while (queue.length > 0 && pages.length < config.maxPages) {
        const current = queue.shift();
        if (!current) continue;

        const { url, depth } = current;

        if (visitedUrls.has(url)) continue;
        if (depth > config.maxDepth) continue;
        if (!shouldCrawlInternal(url, config)) continue;

        visitedUrls.add(url);

        yield* crawlSinglePageInternal(url, config, page).pipe(
          Effect.matchEffect({
            onSuccess: (result) => {
              const crawledPage = { ...result, depth };
              pages.push(crawledPage);

              const newLinks = crawledPage.links.filter(
                (link: string) => !visitedUrls.has(link) && shouldCrawlInternal(link, config),
              );

              for (const link of newLinks) {
                queue.push({ url: link, depth: depth + 1 });
              }

              return Effect.logDebug("Crawled page", { url, depth, linksFound: newLinks.length });
            },
            onFailure: (error) => {
              errors.push({ url, error: String(error.cause) });
              return Effect.void;
            },
          }),
        );
      }

      if (page) {
        yield* Effect.tryPromise({
          try: () => page.close(),
          catch: () => Effect.void,
        });
      }

      const endTime = Date.now();

      yield* Effect.logInfo("Crawl completed", {
        pagesCrawled: pages.length,
        errors: errors.length,
        duration: endTime - startTime,
      });

      return {
        pages,
        totalPages: pages.length,
        startTime,
        endTime,
        errors,
      } as const satisfies CrawlResult;
    });

    const crawlSinglePage = Effect.fn("SiteCrawler.crawlSinglePage")(function* (
      url: string,
      partialConfig: Partial<CrawlConfig>,
      browser?: Browser,
    ) {
      const defaultConfig: CrawlConfig = {
        startUrl: url,
        maxPages: 1,
        maxDepth: 0,
        includePatterns: [],
        excludePatterns: [],
        maxFileSize: 10 * 1024 * 1024,
      };

      const config = { ...defaultConfig, ...partialConfig };

      let page: Page | undefined;

      if (browser) {
        page = yield* Effect.tryPromise({
          try: () => browser.newPage(),
          catch: (cause) => new CrawlError({ url, cause }),
        });
      }

      const result = yield* crawlSinglePageInternal(url, config, page);

      if (page) {
        yield* Effect.tryPromise({
          try: () => page.close(),
          catch: () => Effect.void,
        });
      }

      return result;
    });

    const extractLinks = (page: CrawledPage): string[] => {
      return page.links;
    };

    const shouldCrawl = (url: string, config: CrawlConfig): boolean => {
      return shouldCrawlInternal(url, config);
    };

    const generateTestUrls = (crawlResult: CrawlResult, maxUrls?: number): string[] => {
      const urls = crawlResult.pages.map((page) => page.url);

      const priorityUrls = crawlResult.pages
        .filter((page) => {
          const lower = page.url.toLowerCase();
          return (
            lower.includes("/login") ||
            lower.includes("/signin") ||
            lower.includes("/checkout") ||
            lower.includes("/cart") ||
            lower.includes("/search") ||
            lower.includes("/form")
          );
        })
        .map((page) => page.url);

      const uniqueUrls = [...new Set([...priorityUrls, ...urls])];

      if (maxUrls) {
        return uniqueUrls.slice(0, maxUrls);
      }

      return uniqueUrls;
    };

    const exportToJson = Effect.fn("SiteCrawler.exportToJson")(function* (
      crawlResult: CrawlResult,
      path: string,
    ) {
      yield* Effect.tryPromise({
        try: () => writeFile(path, JSON.stringify(crawlResult, null, 2), "utf-8"),
        catch: (cause) => new ExportError({ path, cause }),
      });

      yield* Effect.logInfo("Crawl results exported", { path, pages: crawlResult.totalPages });
    });

    return {
      crawl,
      crawlSinglePage,
      extractLinks,
      shouldCrawl,
      generateTestUrls,
      exportToJson,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

const shouldCrawlInternal = (url: string, config: CrawlConfig): boolean => {
  try {
    const parsedUrl = new URL(url);
    const startUrl = new URL(config.startUrl);

    if (parsedUrl.hostname !== startUrl.hostname) {
      return false;
    }

    for (const pattern of config.excludePatterns) {
      const regex = new RegExp(pattern);
      if (regex.test(url)) return false;
    }

    if (config.includePatterns.length > 0) {
      let matchesInclude = false;
      for (const pattern of config.includePatterns) {
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
          matchesInclude = true;
          break;
        }
      }
      if (!matchesInclude) return false;
    }

    const skipExtensions = [
      ".pdf",
      ".zip",
      ".exe",
      ".dmg",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".mp4",
      ".mp3",
    ];
    const pathname = parsedUrl.pathname.toLowerCase();
    for (const ext of skipExtensions) {
      if (pathname.endsWith(ext)) return false;
    }

    return true;
  } catch {
    return false;
  }
};

const crawlSinglePageInternal = (
  url: string,
  config: CrawlConfig,
  page?: Page,
): Effect.Effect<CrawledPage, CrawlError> => {
  return Effect.gen(function* () {
    if (!page) {
      return yield* new CrawlError({ url, cause: "No browser page available" });
    }

    yield* Effect.tryPromise({
      try: () => page.goto(url, { waitUntil: "networkidle" }),
      catch: (cause) => new CrawlError({ url, cause }),
    });

    if (config.waitForSelector) {
      yield* Effect.tryPromise({
        try: () => page.waitForSelector(config.waitForSelector!, { timeout: 5000 }),
        catch: (cause) => new CrawlError({ url, cause }),
      }).pipe(Effect.ignore);
    }

    const title = yield* Effect.tryPromise({
      try: () => page.title(),
      catch: (cause) => new CrawlError({ url, cause }),
    }).pipe(Effect.catchTag("CrawlError", () => Effect.succeed("")));

    const contentSelector = config.extractContentSelector ?? "body";

    const content = yield* Effect.tryPromise({
      try: () =>
        page.evaluate((selector: string) => {
          const element = document.querySelector(selector);
          return element ? (element.textContent ?? "") : "";
        }, contentSelector),
      catch: (cause) => new CrawlError({ url, cause }),
    }).pipe(Effect.catchTag("CrawlError", () => Effect.succeed("")));

    const links = yield* Effect.tryPromise({
      try: () =>
        page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll("a[href]"));
          return anchors
            .map((a) => (a as HTMLAnchorElement).href)
            .filter((href: string) => href.startsWith("http"));
        }),
      catch: (cause) => new CrawlError({ url, cause }),
    }).pipe(Effect.catchTag("CrawlError", () => Effect.succeed([] as string[])));

    const truncatedContent =
      content.length > config.maxFileSize
        ? content.substring(0, config.maxFileSize) + "..."
        : content;

    return {
      url,
      title,
      content: truncatedContent,
      links,
      depth: 0,
      timestamp: Date.now(),
    } as const satisfies CrawledPage;
  });
};
