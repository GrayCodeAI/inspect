import { Array as Arr, Effect, Layer, ServiceMap } from "effect";
import { CoverageProcessingError } from "./errors.js";
import type {
  FunctionCoverage,
  RawCoverageData,
  ScriptCoverage,
  CoverageRange,
} from "./coverage-collector.js";

export interface CoverageSummary {
  readonly lines: CoverageMetrics;
  readonly functions: CoverageMetrics;
  readonly branches: CoverageMetrics;
  readonly files: ReadonlyArray<FileCoverage>;
}

export interface CoverageMetrics {
  readonly total: number;
  readonly covered: number;
  readonly skipped: number;
  readonly pct: number;
}

export interface FileCoverage {
  readonly path: string;
  readonly lines: CoverageMetrics;
  readonly functions: CoverageMetrics;
  readonly branches: CoverageMetrics;
  readonly details: ReadonlyArray<LineCoverage>;
}

export interface LineCoverage {
  readonly line: number;
  readonly hits: number;
  readonly branch: boolean;
  readonly taken: number;
}

export interface CoverageFilter {
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
}

const DEFAULT_FILTER: CoverageFilter = {
  include: ["**/*.ts", "**/*.js"],
  exclude: ["**/node_modules/**", "**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
};

export class CoverageProcessor extends ServiceMap.Service<CoverageProcessor>()(
  "@code-coverage/CoverageProcessor",
  {
    make: Effect.gen(function* () {
      const mergeCoverage = (
        runs: ReadonlyArray<RawCoverageData>,
      ): Effect.Effect<RawCoverageData, CoverageProcessingError> =>
        Effect.try({
          try: () => {
            const scriptMap = new Map<string, ScriptCoverage>();

            for (const run of runs) {
              for (const script of run) {
                const existing = scriptMap.get(script.scriptId);
                if (!existing) {
                  scriptMap.set(script.scriptId, { ...script });
                  continue;
                }

                const functionMap = new Map<string, FunctionCoverage>();
                for (const fn of existing.functions) {
                  functionMap.set(fn.functionName, { ...fn, ranges: [...fn.ranges] });
                }

                for (const fn of script.functions) {
                  const existingFn = functionMap.get(fn.functionName);
                  if (!existingFn) {
                    functionMap.set(fn.functionName, { ...fn });
                  } else {
                    const rangeMap = new Map<string, CoverageRange>();
                    for (const range of existingFn.ranges) {
                      const key = `${range.startOffset}-${range.endOffset}`;
                      const existingRange = rangeMap.get(key);
                      if (existingRange) {
                        rangeMap.set(key, {
                          ...existingRange,
                          count: existingRange.count + range.count,
                        });
                      } else {
                        rangeMap.set(key, { ...range });
                      }
                    }
                    for (const range of fn.ranges) {
                      const key = `${range.startOffset}-${range.endOffset}`;
                      const existingRange = rangeMap.get(key);
                      if (existingRange) {
                        rangeMap.set(key, {
                          ...existingRange,
                          count: existingRange.count + range.count,
                        });
                      } else {
                        rangeMap.set(key, { ...range });
                      }
                    }
                    functionMap.set(fn.functionName, {
                      ...existingFn,
                      ranges: Arr.fromIterable(rangeMap.values()),
                    });
                  }
                }

                scriptMap.set(script.scriptId, {
                  ...existing,
                  functions: Arr.fromIterable(functionMap.values()),
                });
              }
            }

            return Arr.fromIterable(scriptMap.values());
          },
          catch: (cause) =>
            new CoverageProcessingError({
              reason: "Failed to merge coverage data from multiple runs",
              cause: String(cause),
            }),
        }).pipe(Effect.withSpan("CoverageProcessor.mergeCoverage"));

      const calculateMetrics = (
        coverage: RawCoverageData,
      ): Effect.Effect<CoverageSummary, CoverageProcessingError> =>
        Effect.try({
          try: () => {
            const files: Array<FileCoverage> = [];

            for (const script of coverage) {
              if (!script.url) continue;

              const lineMap = new Map<number, number>();
              const functionMap = new Map<string, boolean>();
              const branchMap = new Map<string, { taken: boolean; total: number }>();

              for (const fn of script.functions) {
                const hasHits = fn.ranges.some((r) => r.count > 0);
                functionMap.set(fn.functionName, hasHits);

                for (const range of fn.ranges) {
                  const startLine = countNewlines(script, range.startOffset);
                  const endLine = countNewlines(script, range.endOffset);

                  for (let line = startLine; line <= endLine; line++) {
                    const current = lineMap.get(line) ?? 0;
                    lineMap.set(line, Math.max(current, range.count));
                  }

                  if (fn.isBlockCoverage) {
                    const branchKey = `${fn.functionName}-${range.startOffset}`;
                    const existing = branchMap.get(branchKey);
                    if (existing) {
                      branchMap.set(branchKey, {
                        taken: existing.taken || range.count > 0,
                        total: existing.total + 1,
                      });
                    } else {
                      branchMap.set(branchKey, {
                        taken: range.count > 0,
                        total: 1,
                      });
                    }
                  }
                }
              }

              const details: Array<LineCoverage> = [];
              let coveredLines = 0;
              let totalLines = 0;
              let coveredBranches = 0;
              let totalBranches = 0;

              for (const [line, hits] of lineMap.entries()) {
                totalLines++;
                if (hits > 0) coveredLines++;
                details.push({ line, hits, branch: false, taken: hits });
              }

              for (const [, branch] of branchMap.entries()) {
                totalBranches++;
                if (branch.taken) coveredBranches++;
              }

              const coveredFunctions = Arr.fromIterable(functionMap.values()).filter(Boolean).length;
              const totalFunctions = functionMap.size;

              files.push({
                path: script.url,
                lines: createMetrics(totalLines, coveredLines),
                functions: createMetrics(totalFunctions, coveredFunctions),
                branches: createMetrics(totalBranches, coveredBranches),
                details,
              });
            }

            return {
              lines: aggregateMetrics(files.map((f) => f.lines)),
              functions: aggregateMetrics(files.map((f) => f.functions)),
              branches: aggregateMetrics(files.map((f) => f.branches)),
              files,
            };
          },
          catch: (cause) =>
            new CoverageProcessingError({
              reason: "Failed to calculate coverage metrics",
              cause: String(cause),
            }),
        }).pipe(Effect.withSpan("CoverageProcessor.calculateMetrics"));

      const filterCoverage = (
        coverage: RawCoverageData,
        filter: CoverageFilter = DEFAULT_FILTER,
      ): Effect.Effect<RawCoverageData, CoverageProcessingError> =>
        Effect.sync(() => {
          return coverage.filter((script) => {
            if (!script.url) return false;

            const shouldInclude = filter.include.length === 0
              ? true
              : filter.include.some((pattern) => matchesPattern(script.url, pattern));

            const shouldExclude = filter.exclude.some((pattern) =>
              matchesPattern(script.url, pattern)
            );

            return shouldInclude && !shouldExclude;
          });
        }).pipe(Effect.withSpan("CoverageProcessor.filterCoverage"));

      return {
        mergeCoverage,
        calculateMetrics,
        filterCoverage,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make);
}

function countNewlines(script: ScriptCoverage, offset: number): number {
  const content = script.functions
    .flatMap((fn) => fn.ranges)
    .reduce((acc, range) => acc + (range.endOffset - range.startOffset), 0);

  if (offset > content) {
    return 1;
  }

  let newlines = 0;
  for (const fn of script.functions) {
    for (const range of fn.ranges) {
      if (range.startOffset <= offset) {
        const text = JSON.stringify(range).slice(0, offset - range.startOffset);
        newlines += (text.match(/\n/g) ?? []).length;
      }
    }
  }
  return newlines + 1;
}

function createMetrics(total: number, covered: number): CoverageMetrics {
  return {
    total,
    covered,
    skipped: 0,
    pct: total === 0 ? 100 : (covered / total) * 100,
  };
}

function aggregateMetrics(
  metricsArray: ReadonlyArray<CoverageMetrics>,
): CoverageMetrics {
  const total = metricsArray.reduce((sum, m) => sum + m.total, 0);
  const covered = metricsArray.reduce((sum, m) => sum + m.covered, 0);
  const skipped = metricsArray.reduce((sum, m) => sum + m.skipped, 0);

  return {
    total,
    covered,
    skipped,
    pct: total === 0 ? 100 : (covered / total) * 100,
  };
}

function matchesPattern(path: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, ".")
      .replace(/\./g, "\\.")}$`,
  );
  return regex.test(path);
}
