// ──────────────────────────────────────────────────────────────────────────────
// URL Deduplicator Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import { BloomFilter, BloomFilterConfig } from "./bloom-filter.js";

export class UrlDedupConfig extends Schema.Class<UrlDedupConfig>("UrlDedupConfig")({
  capacity: Schema.Number,
  falsePositiveRate: Schema.Number,
}) {}

export class UrlDedupResult extends Schema.Class<UrlDedupResult>("UrlDedupResult")({
  url: Schema.String,
  isDuplicate: Schema.Boolean,
}) {}

export interface UrlDeduplicatorService {
  readonly add: (url: string) => Effect.Effect<boolean>;
  readonly addMany: (urls: string[]) => Effect.Effect<string[]>;
  readonly contains: (url: string) => Effect.Effect<boolean>;
  readonly stats: Effect.Effect<{
    totalAdded: number;
    estimatedFalsePositiveRate: number;
  }>;
}

export class UrlDeduplicator extends ServiceMap.Service<UrlDeduplicator, UrlDeduplicatorService>()(
  "@inspect/UrlDeduplicator",
) {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new UrlDedupConfig({ capacity: 100000, falsePositiveRate: 0.01 });
      const bloomFilter = new BloomFilter(
        new BloomFilterConfig({
          capacity: config.capacity,
          falsePositiveRate: config.falsePositiveRate,
        }),
      );

      let totalAdded = 0;

      const add = (url: string) =>
        Effect.gen(function* () {
          const isDuplicate = yield* bloomFilter.contains(url);
          if (!isDuplicate) {
            yield* bloomFilter.add(url);
            totalAdded++;
            return true;
          }
          return false;
        }).pipe(Effect.withSpan("UrlDeduplicator.add"));

      const addMany = (urls: string[]) =>
        Effect.gen(function* () {
          const newUrls: string[] = [];
          for (const url of urls) {
            const isNew = yield* add(url);
            if (isNew) {
              newUrls.push(url);
            }
          }
          return newUrls;
        }).pipe(Effect.withSpan("UrlDeduplicator.addMany"));

      const contains = (url: string) =>
        bloomFilter.contains(url).pipe(Effect.withSpan("UrlDeduplicator.contains"));

      const stats = Effect.sync(() => ({
        totalAdded,
        estimatedFalsePositiveRate: bloomFilter.estimatedFalsePositiveRate,
      })).pipe(Effect.withSpan("UrlDeduplicator.stats"));

      return { add, addMany, contains, stats } as const;
    }),
  );
}
