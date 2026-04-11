// ──────────────────────────────────────────────────────────────────────────────
// BDD Reporter Service (Spec/Dot)
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";

export type ReporterFormat = "spec" | "dot";

export class BddReporterConfig extends Schema.Class<BddReporterConfig>("BddReporterConfig")({
  format: Schema.Literals(["spec", "dot"] as const),
}) {}

export interface BddReporterService {
  readonly reportSuiteStart: (name: string) => Effect.Effect<void>;
  readonly reportTestPass: (name: string) => Effect.Effect<void>;
  readonly reportTestFail: (name: string, error: string) => Effect.Effect<void>;
  readonly reportTestSkip: (name: string) => Effect.Effect<void>;
  readonly reportSummary: (
    passed: number,
    failed: number,
    skipped: number,
    duration: number,
  ) => Effect.Effect<void>;
}

export class BddReporter extends ServiceMap.Service<
  BddReporter,
  BddReporterService
>()("@inspect/BddReporter") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const config = new BddReporterConfig({ format: "spec" });

      const indent = (level: number) => "  ".repeat(level);

      const reportSuiteStart = (name: string) =>
        Effect.sync(() => {
          if (config.format === "spec") {
            console.log(`\n${indent(0)}${name}`);
          }
        }).pipe(Effect.withSpan("BddReporter.reportSuiteStart"));

      const reportTestPass = (name: string) =>
        Effect.sync(() => {
          if (config.format === "spec") {
            console.log(`${indent(1)}✓ ${name}`);
          } else {
            process.stdout.write(".");
          }
        }).pipe(Effect.withSpan("BddReporter.reportTestPass"));

      const reportTestFail = (name: string, error: string) =>
        Effect.sync(() => {
          if (config.format === "spec") {
            console.log(`${indent(1)}✗ ${name}`);
            console.log(`${indent(2)}${error}`);
          } else {
            process.stdout.write("F");
          }
        }).pipe(Effect.withSpan("BddReporter.reportTestFail"));

      const reportTestSkip = (name: string) =>
        Effect.sync(() => {
          if (config.format === "spec") {
            console.log(`${indent(1)}- ${name} (skipped)`);
          } else {
            process.stdout.write("-");
          }
        }).pipe(Effect.withSpan("BddReporter.reportTestSkip"));

      const reportSummary = (passed: number, failed: number, skipped: number, duration: number) =>
        Effect.sync(() => {
          const total = passed + failed + skipped;
          console.log(`\n\n${"=".repeat(40)}`);
          console.log(`Tests: ${total}`);
          console.log(`  Passed:  ${passed}`);
          console.log(`  Failed:  ${failed}`);
          console.log(`  Skipped: ${skipped}`);
          console.log(`Duration: ${duration}ms`);
          console.log(`${"=".repeat(40)}`);
        }).pipe(Effect.withSpan("BddReporter.reportSummary"));

      return { reportSuiteStart, reportTestPass, reportTestFail, reportTestSkip, reportSummary } as const;
    }),
  );
}
