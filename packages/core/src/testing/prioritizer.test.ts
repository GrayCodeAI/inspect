import { describe, it, expect } from "vitest";
import { TestPrioritizer } from "./prioritizer.js";
import type { TestEntry } from "./prioritizer.js";

describe("TestPrioritizer", () => {
  const prioritizer = new TestPrioritizer();

  function makeTest(overrides: Partial<TestEntry> = {}): TestEntry {
    return {
      id: `test-${Math.random().toString(36).slice(2, 6)}`,
      name: "Sample test",
      ...overrides,
    };
  }

  it("ranks flaky tests higher", () => {
    const result = prioritizer.prioritize({
      tests: [
        makeTest({ id: "stable", name: "Stable test", flakinessScore: 5, passRate: 0.98 }),
        makeTest({ id: "flaky", name: "Flaky test", flakinessScore: 80, passRate: 0.5 }),
      ],
    });

    expect(result.ranked[0].test.id).toBe("flaky");
    expect(result.ranked[0].score).toBeGreaterThan(result.ranked[1].score);
  });

  it("ranks recently failed tests higher", () => {
    const now = Date.now();
    const result = prioritizer.prioritize({
      tests: [
        makeTest({ id: "old-fail", name: "Old failure", lastFailedAt: now - 7 * 24 * 60 * 60 * 1000 }),
        makeTest({ id: "recent-fail", name: "Recent failure", lastFailedAt: now - 30 * 60 * 1000 }),
      ],
    });

    expect(result.ranked[0].test.id).toBe("recent-fail");
  });

  it("ranks tests covering changed files higher", () => {
    const result = prioritizer.prioritize({
      tests: [
        makeTest({ id: "no-overlap", name: "No overlap", coveredFiles: ["src/other.ts"] }),
        makeTest({ id: "overlap", name: "Has overlap", coveredFiles: ["src/login.ts", "src/auth.ts"] }),
      ],
      changedFiles: ["src/login.ts"],
    });

    expect(result.ranked[0].test.id).toBe("overlap");
  });

  it("identifies skippable tests", () => {
    const result = prioritizer.prioritize({
      tests: [
        makeTest({ id: "risky", flakinessScore: 90, lastFailedAt: Date.now(), passRate: 0.3 }),
        makeTest({ id: "safe", flakinessScore: 0, passRate: 1.0 }),
      ],
    });

    expect(result.skippable.some((t) => t.id === "safe")).toBe(true);
    expect(result.skippable.some((t) => t.id === "risky")).toBe(false);
  });

  it("respects limit parameter", () => {
    const tests = Array.from({ length: 10 }, (_, i) =>
      makeTest({ id: `test-${i}`, flakinessScore: i * 10 }),
    );

    const result = prioritizer.prioritize({ tests, limit: 3 });
    expect(result.ranked).toHaveLength(3);
  });

  it("provides reason for high-priority tests", () => {
    const result = prioritizer.prioritize({
      tests: [
        makeTest({
          id: "risky",
          flakinessScore: 80,
          lastFailedAt: Date.now(),
          passRate: 0.3,
          coveredFiles: ["src/main.ts"],
        }),
      ],
      changedFiles: ["src/main.ts"],
    });

    expect(result.ranked[0].reason).toContain("flaky");
    expect(result.ranked[0].reason).toContain("recently failed");
  });

  it("custom weights change ranking", () => {
    const tests = [
      makeTest({ id: "flaky", flakinessScore: 90, lastDurationMs: 30000 }),
      makeTest({ id: "fast", flakinessScore: 10, lastDurationMs: 1000 }),
    ];

    // Heavy weight on speed
    const speedResult = prioritizer.prioritize({
      tests,
      weights: { speed: 0.9, flakiness: 0.025, failureRecency: 0.025, changeOverlap: 0.025, reliability: 0.025 },
    });

    expect(speedResult.ranked[0].test.id).toBe("fast");
  });

  it("estimates total duration", () => {
    const result = prioritizer.prioritize({
      tests: [
        makeTest({ lastDurationMs: 5000 }),
        makeTest({ lastDurationMs: 10000 }),
      ],
    });

    expect(result.stats.estimatedDurationMs).toBe(15000);
  });

  it("handles tests with no metadata", () => {
    const result = prioritizer.prioritize({
      tests: [makeTest(), makeTest()],
    });

    expect(result.ranked).toHaveLength(2);
    expect(result.stats.total).toBe(2);
  });
});
