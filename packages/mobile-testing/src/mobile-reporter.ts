// ──────────────────────────────────────────────────────────────────────────────
// Mobile Reporter Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";

export class MobileTestResult extends Schema.Class<MobileTestResult>("MobileTestResult")({
  testId: Schema.String,
  deviceName: Schema.String,
  platform: Schema.Literals(["iOS", "Android"] as const),
  status: Schema.Literals(["pass", "fail", "error"]) as Schema.Schema<
    "pass" | "fail" | "error",
    "pass" | "fail" | "error",
    never
  >,
  duration: Schema.Number,
  screenshotPath: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  actions: Schema.Array(Schema.String),
  timestamp: Schema.Number,
}) {}

export class MobileTestReport extends Schema.Class<MobileTestReport>("MobileTestReport")({
  reportId: Schema.String,
  results: Schema.Array(MobileTestResult),
  totalTests: Schema.Number,
  passed: Schema.Number,
  failed: Schema.Number,
  duration: Schema.Number,
  generatedAt: Schema.Number,
}) {}

export interface MobileReporterService {
  readonly recordResult: (result: MobileTestResult) => Effect.Effect<void>;
  readonly generateReport: (testId: string) => Effect.Effect<MobileTestReport>;
  readonly getResults: (testId: string) => Effect.Effect<MobileTestResult[]>;
}

export class MobileReporter extends ServiceMap.Service<
  MobileReporter,
  MobileReporterService
>()("@inspect/MobileReporter") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const resultsStore = new Map<string, MobileTestResult[]>();

      const recordResult = (result: MobileTestResult) =>
        Effect.sync(() => {
          const existing = resultsStore.get(result.testId) ?? [];
          resultsStore.set(result.testId, [...existing, result]);
        }).pipe(
          Effect.tap(() =>
            Effect.logInfo("Mobile test result recorded", {
              testId: result.testId,
              device: result.deviceName,
              status: result.status,
            }),
          ),
          Effect.withSpan("MobileReporter.recordResult"),
        );

      const generateReport = (testId: string) =>
        Effect.gen(function* () {
          const results = resultsStore.get(testId) ?? [];
          const passed = results.filter((r) => r.status === "pass").length;
          const failed = results.filter((r) => r.status === "fail" || r.status === "error").length;
          const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

          const report = new MobileTestReport({
            reportId: `report-${testId}-${Date.now()}`,
            results,
            totalTests: results.length,
            passed,
            failed,
            duration: totalDuration,
            generatedAt: Date.now(),
          });

          yield* Effect.logInfo("Mobile test report generated", {
            reportId: report.reportId,
            totalTests: report.totalTests,
            passed: report.passed,
            failed: report.failed,
          });

          return report;
        }).pipe(Effect.withSpan("MobileReporter.generateReport"));

      const getResults = (testId: string) =>
        Effect.sync(() => resultsStore.get(testId) ?? []).pipe(
          Effect.withSpan("MobileReporter.getResults"),
        );

      return { recordResult, generateReport, getResults } as const;
    }),
  );
}
