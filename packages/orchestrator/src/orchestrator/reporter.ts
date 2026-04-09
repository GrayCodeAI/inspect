import { Effect, Layer, Schema, ServiceMap } from "effect";
import { ExecutedTestPlan, TestReport, RunCompleted } from "@inspect/shared";
import { Updates } from "./updates.js";

export class ReporterError extends Schema.ErrorClass<ReporterError>("ReporterError")({
  _tag: Schema.tag("ReporterError"),
  cause: Schema.Unknown,
}) {
  message = `Reporting failed: ${String(this.cause)}`;
}

export interface ReporterService {
  readonly report: (executed: ExecutedTestPlan) => Effect.Effect<TestReport, ReporterError>;
}

export class Reporter extends ServiceMap.Service<Reporter, ReporterService>()("@inspect/Reporter") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const updates = yield* Updates;

      const report = (executed: ExecutedTestPlan) =>
        Effect.gen(function* () {
          const testReport = executed.testReport;
          const runCompleted = new RunCompleted({
            status: testReport.status,
            summary: testReport.summary,
            screenshotPaths: testReport.screenshotPaths,
          });
          yield* updates.publish(runCompleted);
          return testReport;
        });

      return { report } as const;
    }),
  );
}
