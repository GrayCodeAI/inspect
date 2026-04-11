import { Effect, Layer, ServiceMap } from "effect";
import { CoverageThresholdError } from "./errors.js";
import type { CoverageSummary } from "./coverage-processor.js";

export interface CoverageThresholds {
  readonly lines: number;
  readonly functions: number;
  readonly branches: number;
  readonly statements?: number;
}

export interface ThresholdCheckResult {
  readonly passed: boolean;
  readonly violations: ReadonlyArray<CoverageThresholdError>;
}

const DEFAULT_THRESHOLDS: CoverageThresholds = {
  lines: 0,
  functions: 0,
  branches: 0,
};

export class CoverageThreshold extends ServiceMap.Service<CoverageThreshold>()(
  "@code-coverage/CoverageThreshold",
  {
    make: Effect.gen(function* () {
      const checkThresholds = (
        summary: CoverageSummary,
        thresholds: CoverageThresholds = DEFAULT_THRESHOLDS,
      ): Effect.Effect<ThresholdCheckResult, never> =>
        Effect.sync(() => {
          const violations: Array<CoverageThresholdError> = [];

          if (summary.lines.pct < thresholds.lines) {
            violations.push(
              new CoverageThresholdError({
                metric: "lines",
                actual: summary.lines.pct,
                threshold: thresholds.lines,
              }),
            );
          }

          if (summary.functions.pct < thresholds.functions) {
            violations.push(
              new CoverageThresholdError({
                metric: "functions",
                actual: summary.functions.pct,
                threshold: thresholds.functions,
              }),
            );
          }

          if (summary.branches.pct < thresholds.branches) {
            violations.push(
              new CoverageThresholdError({
                metric: "branches",
                actual: summary.branches.pct,
                threshold: thresholds.branches,
              }),
            );
          }

          if (thresholds.statements !== undefined) {
            const statementPct = calculateStatementCoverage(summary);
            if (statementPct < thresholds.statements) {
              violations.push(
                new CoverageThresholdError({
                  metric: "statements",
                  actual: statementPct,
                  threshold: thresholds.statements,
                }),
              );
            }
          }

          return {
            passed: violations.length === 0,
            violations,
          };
        }).pipe(Effect.withSpan("CoverageThreshold.checkThresholds"));

      const enforceThresholds = (
        summary: CoverageSummary,
        thresholds: CoverageThresholds = DEFAULT_THRESHOLDS,
      ): Effect.Effect<void, CoverageThresholdError> =>
        Effect.gen(function* () {
          const result = yield* checkThresholds(summary, thresholds);

          if (!result.passed) {
            yield* Effect.logWarning("Coverage thresholds not met", {
              violationCount: result.violations.length,
            });
            return yield* result.violations[0]!;
          }

          yield* Effect.logInfo("Coverage thresholds met", {
            lines: summary.lines.pct.toFixed(2),
            functions: summary.functions.pct.toFixed(2),
            branches: summary.branches.pct.toFixed(2),
          });
        }).pipe(Effect.withSpan("CoverageThreshold.enforceThresholds"));

      const calculateStatementCoverage = (summary: CoverageSummary): number => {
        const totalStatements = summary.files.reduce(
          (sum, file) => sum + file.functions.total,
          0,
        );
        const coveredStatements = summary.files.reduce(
          (sum, file) => sum + file.functions.covered,
          0,
        );

        return totalStatements === 0
          ? 100
          : (coveredStatements / totalStatements) * 100;
      };

      return {
        checkThresholds,
        enforceThresholds,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}
