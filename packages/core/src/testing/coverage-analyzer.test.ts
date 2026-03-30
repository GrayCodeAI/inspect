import { describe, it, expect } from "vitest";
import { TestCoverageAnalyzer } from "./coverage-analyzer.js";

describe("TestCoverageAnalyzer", () => {
  it("should analyze coverage for a directory", () => {
    const analyzer = new TestCoverageAnalyzer(process.cwd());
    const report = analyzer.analyze(["packages/shared/src/types/index.ts"]);
    expect(report).toHaveProperty("changedFiles");
    expect(report).toHaveProperty("coveredFiles");
    expect(report).toHaveProperty("uncoveredFiles");
    expect(report).toHaveProperty("coveragePercentage");
    expect(report.coveragePercentage).toBeGreaterThanOrEqual(0);
    expect(report.coveragePercentage).toBeLessThanOrEqual(100);
  });

  it("should return 100% coverage for empty changed files", () => {
    const analyzer = new TestCoverageAnalyzer(process.cwd());
    const report = analyzer.analyze([]);
    expect(report.coveragePercentage).toBe(100);
  });

  it("should detect test files", () => {
    const analyzer = new TestCoverageAnalyzer(process.cwd());
    const report = analyzer.analyze([]);
    expect(report.testFiles.length).toBeGreaterThan(0);
  });
});
