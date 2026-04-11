// ──────────────────────────────────────────────────────────────────────────────
// Diff Reporter Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";

export class DiffReportEntry extends Schema.Class<DiffReportEntry>("DiffReportEntry")({
  image1Path: Schema.String,
  image2Path: Schema.String,
  similarity: Schema.Number,
  isSimilar: Schema.Boolean,
  threshold: Schema.Number,
  duration: Schema.Number,
}) {}

export class DiffReport extends Schema.Class<DiffReport>("DiffReport")({
  reportId: Schema.String,
  entries: Schema.Array(DiffReportEntry),
  totalComparisons: Schema.Number,
  similarCount: Schema.Number,
  differentCount: Schema.Number,
  averageSimilarity: Schema.Number,
  generatedAt: Schema.Number,
}) {}

export class DiffReporter extends ServiceMap.Service<
  DiffReporter,
  {
    readonly recordComparison: (entry: DiffReportEntry) => Effect.Effect<void>;
    readonly generateReport: Effect.Effect<DiffReport>;
    readonly getEntries: Effect.Effect<DiffReportEntry[]>;
  }
>()("@inspect/DiffReporter") {
  static layer = Layer.effect(this)(
    Effect.gen(function* () {
      const entries: DiffReportEntry[] = [];

      const recordComparison = (entry: DiffReportEntry) =>
      Effect.sync(() => {
        entries.push(entry);
      }).pipe(
        Effect.tap(() =>
          Effect.logInfo("Diff comparison recorded", {
            similarity: entry.similarity,
            isSimilar: entry.isSimilar,
          }),
        ),
        Effect.withSpan("DiffReporter.recordComparison"),
      );

    const generateReport = Effect.gen(function* () {
      const similarCount = entries.filter((e) => e.isSimilar).length;
      const differentCount = entries.filter((e) => !e.isSimilar).length;
      const averageSimilarity =
        entries.length > 0
          ? entries.reduce((sum, e) => sum + e.similarity, 0) / entries.length
          : 0;

      const report = new DiffReport({
        reportId: `diff-report-${Date.now()}`,
        entries: [...entries],
        totalComparisons: entries.length,
        similarCount,
        differentCount,
        averageSimilarity,
        generatedAt: Date.now(),
      });

      yield* Effect.logInfo("Diff report generated", {
        totalComparisons: report.totalComparisons,
        similarCount: report.similarCount,
        differentCount: report.differentCount,
        averageSimilarity: report.averageSimilarity,
      });

      return report;
    }).pipe(Effect.withSpan("DiffReporter.generateReport"));

    const getEntries = Effect.sync(() => [...entries]).pipe(
      Effect.withSpan("DiffReporter.getEntries"),
    );

      return { recordComparison, generateReport, getEntries } as const;
    }),
  );
}
