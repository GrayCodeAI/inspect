// ──────────────────────────────────────────────────────────────────────────────
// Crawl Spider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { RobotsTxtError, SpiderError } from "./errors.js";

export class CrawlConfig extends Schema.Class<CrawlConfig>("CrawlConfig")({
  baseUrl: Schema.String,
  maxDepth: Schema.Number,
  maxPages: Schema.Number,
  respectRobotsTxt: Schema.Boolean,
  delay: Schema.Number,
  allowedDomains: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class CrawlResult extends Schema.Class<CrawlResult>("CrawlResult")({
  url: Schema.String,
  title: Schema.String,
  links: Schema.Array(Schema.String),
  depth: Schema.Number,
  content: Schema.String,
}) {}

export interface CrawlSpiderService {
  readonly crawl: (
    startUrl: string,
    config?: Partial<CrawlConfig>,
  ) => Effect.Effect<CrawlResult[], SpiderError | RobotsTxtError | null>;
  readonly checkRobotsTxt: (url: string) => Effect.Effect<boolean, RobotsTxtError | null>;
}

export class CrawlSpider extends ServiceMap.Service<CrawlSpider, CrawlSpiderService>()(
  "@inspect/CrawlSpider",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const robotsCache = new Map<string, string[]>();

      const checkRobotsTxt = (url: string) =>
        Effect.gen(function* () {
          const urlObj = new URL(url);
          const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

          if (robotsCache.has(urlObj.host)) {
            const disallowed = robotsCache.get(urlObj.host) ?? [];
            const isDisallowed = disallowed.some((pattern) => urlObj.pathname.startsWith(pattern));
            if (isDisallowed) {
              return yield* new RobotsTxtError({ url, disallowed: true });
            }
            return true;
          }

          try {
            const response = yield* Effect.tryPromise({
              try: () => fetch(robotsUrl).then((res) => res.text()),
              catch: () => null,
            });

            if (response) {
              const disallowed: string[] = [];
              for (const line of response.split("\n")) {
                const trimmed = line.trim().toLowerCase();
                if (trimmed.startsWith("disallow:")) {
                  const path = trimmed.replace("disallow:", "").trim();
                  if (path) disallowed.push(path);
                }
              }
              robotsCache.set(urlObj.host, disallowed);
            }

            return true;
          } catch {
            return true;
          }
        }).pipe(Effect.withSpan("CrawlSpider.checkRobotsTxt"));

      const extractLinks = (html: string, baseUrl: string): string[] => {
        const links: string[] = [];
        const hrefRegex = /href=["']([^"']+)["']/gi;
        let match: RegExpExecArray | null;

        while ((match = hrefRegex.exec(html)) !== null) {
          try {
            const link = new URL(match[1], baseUrl).href;
            links.push(link);
          } catch {
            // Invalid URL, skip
          }
        }

        return links;
      };

      const extractTitle = (html: string): string => {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return titleMatch?.[1]?.trim() ?? "Untitled";
      };

      const extractText = (html: string): string => {
        return html
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      };

      const crawl = (startUrl: string, config?: Partial<CrawlConfig>) =>
        Effect.gen(function* () {
          const resolvedConfig = new CrawlConfig({
            baseUrl: config?.baseUrl ?? "",
            maxDepth: config?.maxDepth ?? 3,
            maxPages: config?.maxPages ?? 100,
            respectRobotsTxt: config?.respectRobotsTxt ?? true,
            delay: config?.delay ?? 1000,
            allowedDomains: config?.allowedDomains,
          });
          const visited = new Set<string>();
          const results: CrawlResult[] = [];

          yield* Effect.logInfo("Starting crawl", {
            startUrl,
            maxDepth: resolvedConfig.maxDepth,
            maxPages: resolvedConfig.maxPages,
          });

          const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];

          while (queue.length > 0 && results.length < resolvedConfig.maxPages) {
            const current = queue.shift();
            if (!current) break;

            if (visited.has(current.url) || current.depth > resolvedConfig.maxDepth) {
              continue;
            }

            visited.add(current.url);

            if (resolvedConfig.respectRobotsTxt) {
              const isAllowed = yield* checkRobotsTxt(current.url);
              if (!isAllowed) continue;
            }

            try {
              const html = yield* Effect.tryPromise({
                try: () => fetch(current.url).then((res) => res.text()),
                catch: (cause) =>
                  new SpiderError({
                    message: `Failed to fetch: ${current.url}`,
                    url: current.url,
                    cause,
                  }),
              });

              const links = extractLinks(html, current.url);
              const title = extractTitle(html);
              const content = extractText(html);

              results.push(
                new CrawlResult({
                  url: current.url,
                  title,
                  links,
                  depth: current.depth,
                  content,
                }),
              );

              yield* Effect.logDebug("Page crawled", {
                url: current.url,
                title,
                linkCount: links.length,
              });

              for (const link of links) {
                if (!visited.has(link)) {
                  try {
                    const linkUrl = new URL(link);
                    const baseUrlObj = new URL(resolvedConfig.baseUrl);

                    if (linkUrl.hostname === baseUrlObj.hostname) {
                      queue.push({ url: link, depth: current.depth + 1 });
                    }
                  } catch {
                    // Invalid URL, skip
                  }
                }
              }

              yield* Effect.sleep(`${resolvedConfig.delay} millis`);
            } catch (error) {
              yield* Effect.logWarning("Failed to crawl page", {
                url: current.url,
                error: String(error),
              });
            }
          }

          yield* Effect.logInfo("Crawl completed", {
            pagesCrawled: results.length,
            uniqueUrls: visited.size,
          });

          return results;
        }).pipe(Effect.catchTag("SpiderError", Effect.fail), Effect.withSpan("CrawlSpider.crawl"));

      return { crawl, checkRobotsTxt } as const;
    }),
  );
}
