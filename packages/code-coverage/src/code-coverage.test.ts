import { describe, it, expect } from "vitest";
import { it as effectIt } from "@effect/vitest";
import { Effect } from "effect";
import {
  CoverageProcessor,
  type RawCoverageData,
  type CoverageSummary,
} from "./coverage-processor.js";
import { CoverageThreshold } from "./coverage-threshold.js";
import {
  CoverageCollectionError,
  CoverageProcessingError,
  CoverageThresholdError,
} from "./errors.js";

function makeMetrics(overrides: Partial<CoverageSummary> = {}): CoverageSummary {
  return {
    lines: { total: 10, covered: 8, skipped: 0, pct: 80 },
    functions: { total: 5, covered: 4, skipped: 0, pct: 80 },
    branches: { total: 20, covered: 12, skipped: 0, pct: 60 },
    files: [],
    ...overrides,
  };
}

describe("CoverageProcessor", () => {
  describe("mergeCoverage", () => {
    effectIt("should merge multiple coverage entries", () =>
      Effect.gen(function* () {
        const processor = yield* CoverageProcessor;

        const coverageData = [
          {
            url: "file:///test.js",
            scriptId: "1",
            functions: [
              {
                functionName: "foo",
                isBlockCoverage: true,
                ranges: [{ startOffset: 0, endOffset: 100, count: 1 }],
              },
            ],
          },
        ] as const satisfies RawCoverageData;

        const result = yield* processor.mergeCoverage([coverageData]);
        expect(result).toBeDefined();
      }).pipe(Effect.provide(CoverageProcessor.layer)),
    );
  });

  describe("calculateMetrics", () => {
    effectIt("should calculate coverage metrics", () =>
      Effect.gen(function* () {
        const processor = yield* CoverageProcessor;

        const coverageData = [
          {
            url: "file:///test.js",
            scriptId: "1",
            functions: [
              {
                functionName: "foo",
                isBlockCoverage: true,
                ranges: [
                  { startOffset: 0, endOffset: 10, count: 1 },
                  { startOffset: 10, endOffset: 20, count: 0 },
                ],
              },
            ],
          },
        ] as const satisfies RawCoverageData;

        const metrics = yield* processor.calculateMetrics(coverageData);
        expect(metrics).toBeDefined();
      }).pipe(Effect.provide(CoverageProcessor.layer)),
    );
  });
});

describe("CoverageThreshold", () => {
  describe("checkThresholds", () => {
    effectIt("should pass when coverage meets thresholds", () =>
      Effect.gen(function* () {
        const threshold = yield* CoverageThreshold;

        const thresholds = { lines: 50, functions: 50, branches: 50 };
        const metrics = makeMetrics();

        const result = yield* threshold.checkThresholds(metrics, thresholds);
        expect(result.passed).toBe(true);
      }).pipe(Effect.provide(CoverageThreshold.layer)),
    );

    effectIt("should fail when coverage below thresholds", () =>
      Effect.gen(function* () {
        const threshold = yield* CoverageThreshold;

        const thresholds = { lines: 90, functions: 90, branches: 90 };
        const metrics = makeMetrics({
          lines: { total: 10, covered: 5, skipped: 0, pct: 50 },
          functions: { total: 5, covered: 2, skipped: 0, pct: 40 },
          branches: { total: 20, covered: 8, skipped: 0, pct: 40 },
        });

        const result = yield* threshold.checkThresholds(metrics, thresholds);
        expect(result.passed).toBe(false);
        expect(result.violations.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(CoverageThreshold.layer)),
    );
  });

  describe("enforceThresholds", () => {
    effectIt("should succeed when thresholds are met", () =>
      Effect.gen(function* () {
        const threshold = yield* CoverageThreshold;

        const thresholds = { lines: 50, functions: 50, branches: 50 };
        const metrics = makeMetrics();

        yield* threshold.enforceThresholds(metrics, thresholds);
      }).pipe(Effect.provide(CoverageThreshold.layer)),
    );

    effectIt("should fail with CoverageThresholdError when not met", () =>
      Effect.gen(function* () {
        const threshold = yield* CoverageThreshold;

        const thresholds = { lines: 90, functions: 90, branches: 90 };
        const metrics = makeMetrics({
          lines: { total: 10, covered: 5, skipped: 0, pct: 50 },
          functions: { total: 5, covered: 2, skipped: 0, pct: 40 },
          branches: { total: 20, covered: 8, skipped: 0, pct: 40 },
        });

        const error = yield* threshold.enforceThresholds(metrics, thresholds).pipe(Effect.flip);
        expect(error instanceof CoverageThresholdError).toBe(true);
      }).pipe(Effect.provide(CoverageThreshold.layer)),
    );
  });
});

describe("Error classes", () => {
  it("should create CoverageCollectionError with reason", () => {
    const error = new CoverageCollectionError({ reason: "CDP connection failed" });
    expect(error.reason).toBe("CDP connection failed");
    expect(error.message).toContain("CDP connection failed");
  });

  it("should create CoverageProcessingError with reason", () => {
    const error = new CoverageProcessingError({ reason: "Invalid coverage data" });
    expect(error.reason).toBe("Invalid coverage data");
    expect(error.message).toContain("Invalid coverage data");
  });

  it("should create CoverageThresholdError with metric details", () => {
    const error = new CoverageThresholdError({
      metric: "lines",
      actual: 50,
      threshold: 80,
    });
    expect(error.metric).toBe("lines");
    expect(error.actual).toBe(50);
    expect(error.threshold).toBe(80);
    expect(error.message).toContain("lines");
    expect(error.message).toContain("50");
    expect(error.message).toContain("80");
  });
});
