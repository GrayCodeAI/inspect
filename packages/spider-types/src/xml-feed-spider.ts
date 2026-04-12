// ──────────────────────────────────────────────────────────────────────────────
// XML Feed Spider Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { SpiderError } from "./errors.js";

export class FeedEntry extends Schema.Class<FeedEntry>("FeedEntry")({
  title: Schema.String,
  link: Schema.String,
  description: Schema.optional(Schema.String),
  pubDate: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
}) {}

export class XmlFeed extends Schema.Class<XmlFeed>("XmlFeed")({
  title: Schema.String,
  link: Schema.String,
  entries: Schema.Array(FeedEntry),
  feedType: Schema.Literals(["rss", "atom", "xml"] as const),
}) {}

export interface XmlFeedSpiderService {
  readonly parseFeed: (feedUrl: string) => Effect.Effect<XmlFeed, SpiderError>;
}

export class XmlFeedSpider extends ServiceMap.Service<XmlFeedSpider, XmlFeedSpiderService>()(
  "@inspect/XmlFeedSpider",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const parseRss = (xml: string, feedUrl: string): XmlFeed => {
        const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/i);
        const linkMatch = xml.match(/<link[^>]*>([^<]+)<\/link>/i);

        const entries: FeedEntry[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let itemMatch: RegExpExecArray | null;

        while ((itemMatch = itemRegex.exec(xml)) !== null) {
          const itemBlock = itemMatch[1];
          const entryTitle = itemBlock.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
          const entryLink = itemBlock.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] ?? "";
          const entryDesc = itemBlock.match(/<description[^>]*>([^<]+)<\/description>/i)?.[1];
          const entryDate = itemBlock.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i)?.[1];
          const entryAuthor = itemBlock.match(/<author[^>]*>([^<]+)<\/author>/i)?.[1];

          entries.push(
            new FeedEntry({
              title: entryTitle,
              link: entryLink,
              description: entryDesc,
              pubDate: entryDate,
              author: entryAuthor,
            }),
          );
        }

        return new XmlFeed({
          title: titleMatch?.[1] ?? "Unknown Feed",
          link: linkMatch?.[1] ?? feedUrl,
          entries,
          feedType: "rss",
        });
      };

      const parseAtom = (xml: string, feedUrl: string): XmlFeed => {
        const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/i);
        const linkMatch = xml.match(/<link[^>]*href="([^"]+)"[^>]*\/>/i);

        const entries: FeedEntry[] = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
        let entryMatch: RegExpExecArray | null;

        while ((entryMatch = entryRegex.exec(xml)) !== null) {
          const entryBlock = entryMatch[1];
          const entryTitle = entryBlock.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "";
          const entryLink = entryBlock.match(/<link[^>]*href="([^"]+)"[^>]*\/>/i)?.[1] ?? "";
          const entrySummary = entryBlock.match(/<summary[^>]*>([^<]+)<\/summary>/i)?.[1];
          const entryUpdated = entryBlock.match(/<updated[^>]*>([^<]+)<\/updated>/i)?.[1];
          const entryAuthor = entryBlock.match(/<name[^>]*>([^<]+)<\/name>/i)?.[1];

          entries.push(
            new FeedEntry({
              title: entryTitle,
              link: entryLink,
              description: entrySummary,
              pubDate: entryUpdated,
              author: entryAuthor,
            }),
          );
        }

        return new XmlFeed({
          title: titleMatch?.[1] ?? "Unknown Feed",
          link: linkMatch?.[1] ?? feedUrl,
          entries,
          feedType: "atom",
        });
      };

      const parseFeed = (feedUrl: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ feedUrl });

          yield* Effect.logInfo("Fetching XML feed", { url: feedUrl });

          const xml = yield* Effect.tryPromise({
            try: () => fetch(feedUrl).then((res) => res.text()),
            catch: (cause) =>
              new SpiderError({
                message: `Failed to fetch feed: ${feedUrl}`,
                url: feedUrl,
                cause,
              }),
          });

          const isRss = xml.includes("<rss") || xml.includes("<item");
          const isAtom =
            xml.includes('xmlns="http://www.w3.org/2005/Atom') || xml.includes("<entry>");

          const feed = isAtom
            ? parseAtom(xml, feedUrl)
            : isRss
              ? parseRss(xml, feedUrl)
              : parseRss(xml, feedUrl);

          yield* Effect.logInfo("Feed parsed successfully", {
            url: feedUrl,
            type: feed.feedType,
            entryCount: feed.entries.length,
          });

          return feed;
        }).pipe(
          Effect.catchTag("SpiderError", Effect.fail),
          Effect.withSpan("XmlFeedSpider.parseFeed"),
        );

      return { parseFeed } as const;
    }),
  );
}
