// ──────────────────────────────────────────────────────────────────────────────
// Deduplication Stage (via Bloom Filter)
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema } from "effect";
import { BloomFilter, BloomFilterConfig } from "@inspect/bloom-filter/bloom-filter";
import { PipelineError } from "../errors.js";

export class DedupConfig extends Schema.Class<DedupConfig>("DedupConfig")({
  capacity: Schema.Number,
  falsePositiveRate: Schema.Number,
  keyExtractor: Schema.optional(Schema.String),
}) {}

export const deduplicate = (config?: Partial<DedupConfig>) => {
  return (items: string[]) =>
    Effect.gen(function* () {
      const bloomFilter = new BloomFilter(
        new BloomFilterConfig({
          capacity: config?.capacity ?? 50000,
          falsePositiveRate: config?.falsePositiveRate ?? 0.01,
        }),
      );

      const unique: string[] = [];
      let duplicateCount = 0;

      for (const item of items) {
        const isDuplicate = yield* bloomFilter.contains(item);
        if (!isDuplicate) {
          yield* bloomFilter.add(item);
          unique.push(item);
        } else {
          duplicateCount++;
        }
      }

      yield* Effect.logInfo("Deduplication completed", {
        stage: "deduplicate",
        inputCount: items.length,
        uniqueCount: unique.length,
        duplicateCount,
      });

      return unique;
    }).pipe(
      Effect.matchEffect({
        onSuccess: (result) => Effect.succeed(result),
        onFailure: (cause) =>
          Effect.fail(
            new PipelineError({
              message: `Deduplication failed: ${String(cause)}`,
              stage: "deduplicate",
              cause,
            }),
          ),
      }),
      Effect.withSpan("stages.deduplicate"),
    );
};

export const deduplicateBy = <T>(keyExtractor: (item: T) => string) => {
  return (items: T[]) =>
    Effect.gen(function* () {
      const bloomFilter = new BloomFilter(
        new BloomFilterConfig({
          capacity: 50000,
          falsePositiveRate: 0.01,
        }),
      );

      const unique: T[] = [];

      for (const item of items) {
        const key = keyExtractor(item);
        const isDuplicate = yield* bloomFilter.contains(key);
        if (!isDuplicate) {
          yield* bloomFilter.add(key);
          unique.push(item);
        }
      }

      return unique;
    }).pipe(
      Effect.matchEffect({
        onSuccess: (result) => Effect.succeed(result),
        onFailure: (cause) =>
          Effect.fail(
            new PipelineError({
              message: `Key-based deduplication failed: ${String(cause)}`,
              stage: "deduplicate",
              cause,
            }),
          ),
      }),
      Effect.withSpan("stages.deduplicateBy"),
    );
};
