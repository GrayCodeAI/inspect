// ──────────────────────────────────────────────────────────────────────────────
// Deduplication Stage
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Schema } from "effect";

export class DedupConfig extends Schema.Class<DedupConfig>("DedupConfig")({
  capacity: Schema.Number,
  falsePositiveRate: Schema.Number,
  keyExtractor: Schema.optional(Schema.String),
}) {}

export const deduplicate = (_config?: Partial<DedupConfig>) => {
  return (items: string[]) =>
    Effect.gen(function* () {
      const seen = new Set<string>();
      const unique: string[] = [];
      let duplicateCount = 0;

      for (const item of items) {
        if (!seen.has(item)) {
          seen.add(item);
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
    }).pipe(Effect.withSpan("stages.deduplicate"));
};

export const deduplicateBy = <T>(keyExtractor: (item: T) => string) => {
  return (items: T[]) =>
    Effect.gen(function* () {
      const seen = new Set<string>();
      const unique: T[] = [];

      for (const item of items) {
        const key = keyExtractor(item);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(item);
        }
      }

      return unique;
    }).pipe(Effect.withSpan("stages.deduplicateBy"));
};
