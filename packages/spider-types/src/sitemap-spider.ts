// ──────────────────────────────────────────────────────────────────────────────
// Sitemap Spider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SpiderError } from "./errors.js";

export class SitemapUrl extends Schema.Class<SitemapUrl>("SitemapUrl")({
  loc: Schema.String,
  lastmod: Schema.optional(Schema.String),
  changefreq: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Number),
}) {}

export interface SitemapSpiderService {
  readonly parseSitemap: (
    sitemapUrl: string,
  ) => Effect.Effect<SitemapUrl[], SpiderError>;
  readonly findSitemaps: (
    baseUrl: string,
  ) => Effect.Effect<string[]>;
}

export class SitemapSpider extends ServiceMap.Service<
  SitemapSpider,
  SitemapSpiderService
>()("@inspect/SitemapSpider") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const parseSitemapXml = (xml: string, baseUrl: string): SitemapUrl[] => {
        const urls: SitemapUrl[] = [];
        const urlRegex = /<url>([\s\S]*?)<\/url>/gi;

        let match: RegExpExecArray | null;
        while ((match = urlRegex.exec(xml)) !== null) {
          const urlBlock = match[1];
          const locMatch = urlBlock.match(/<loc>([^<]+)<\/loc>/i);
          const lastmodMatch = urlBlock.match(/<lastmod>([^<]+)<\/lastmod>/i);
          const changefreqMatch = urlBlock.match(/<changefreq>([^<]+)<\/changefreq>/i);
          const priorityMatch = urlBlock.match(/<priority>([^<]+)<\/priority>/i);

          if (locMatch) {
            urls.push(
              new SitemapUrl({
                loc: locMatch[1],
                lastmod: lastmodMatch?.[1],
                changefreq: changefreqMatch?.[1],
                priority: priorityMatch ? parseFloat(priorityMatch[1]) : undefined,
              }),
            );
          }
        }

        if (urls.length === 0) {
          const sitemapIndexRegex = /<loc>([^<]+)<\/loc>/gi;
          while ((match = sitemapIndexRegex.exec(xml)) !== null) {
            const childSitemapUrl = match[1];
            urls.push(new SitemapUrl({ loc: childSitemapUrl }));
          }
        }

        return urls;
      };

      const parseSitemap = (sitemapUrl: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sitemapUrl });

          yield* Effect.logInfo("Fetching sitemap", { url: sitemapUrl });

          const xml = yield* Effect.tryPromise({
            try: () => fetch(sitemapUrl).then((res) => res.text()),
            catch: (cause) =>
              new SpiderError({
                message: `Failed to fetch sitemap: ${sitemapUrl}`,
                url: sitemapUrl,
                cause,
              }),
          });

          const urls = parseSitemapXml(xml, sitemapUrl);

          yield* Effect.logInfo("Sitemap parsed", {
            url: sitemapUrl,
            urlCount: urls.length,
          });

          return urls;
        }).pipe(
          Effect.catchTag("SpiderError", Effect.fail),
          Effect.withSpan("SitemapSpider.parseSitemap"),
        );

      const findSitemaps = (baseUrl: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ baseUrl });

          const candidates = [
            `${baseUrl}/sitemap.xml`,
            `${baseUrl}/sitemap_index.xml`,
            `${baseUrl}/sitemaps.xml`,
          ];

          const found: string[] = [];

          for (const candidate of candidates) {
            try {
              const response = yield* Effect.tryPromise({
                try: () => fetch(candidate, { method: "HEAD" }),
                catch: () => ({ ok: false }),
              });

              if ((response as Response).ok) {
                found.push(candidate);
              }
            } catch {
              // Not found, try next
            }
          }

          yield* Effect.logInfo("Sitemap search completed", {
            baseUrl,
            foundCount: found.length,
          });

          return found;
        }).pipe(Effect.withSpan("SitemapSpider.findSitemaps"));

      return { parseSitemap, findSitemaps } as const;
    }),
  );
}
