import { describe, it, expect } from "vitest";
import { FlakinessDetector } from "./flakiness.js";
import type { TestExecution } from "./flakiness.js";

function makeExecution(testId: string, passed: boolean, durationMs: number = 100): TestExecution {
  return {
    testId,
    testName: `Test ${testId}`,
    passed,
    durationMs,
    retry: 0,
    timestamp: Date.now(),
  };
}

describe("FlakinessDetector", () => {
  describe("record", () => {
    it("should record test executions", () => {
      const detector = new FlakinessDetector();
      detector.record(makeExecution("t1", true));
      detector.record(makeExecution("t1", false));
      detector.record(makeExecution("t1", true));
      const score = detector.getScore("t1");
      expect(score).not.toBeNull();
    });

    it("should return null with insufficient data", () => {
      const detector = new FlakinessDetector();
      detector.record(makeExecution("t1", true));
      detector.record(makeExecution("t1", false));
      // minRuns is 3 by default
      expect(detector.getScore("t1")).toBeNull();
    });

    it("should batch record executions", () => {
      const detector = new FlakinessDetector();
      detector.recordBatch([
        makeExecution("t1", true),
        makeExecution("t1", false),
        makeExecution("t1", true),
      ]);
      expect(detector.getScore("t1")).not.toBeNull();
    });
  });

  describe("getScore", () => {
    it("should detect stable tests", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector.record(makeExecution("t1", true));
      }
      const score = detector.getScore("t1")!;
      expect(score.recommendation).toBe("stable");
      expect(score.passRate).toBe(1);
      expect(score.score).toBeLessThan(20);
    });

    it("should detect broken tests", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector.record(makeExecution("t1", false));
      }
      const score = detector.getScore("t1")!;
      expect(score.recommendation).toBe("broken");
      expect(score.passRate).toBe(0);
    });

    it("should detect flaky tests (alternating pass/fail)", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 20; i++) {
        detector.record(makeExecution("t1", i % 2 === 0));
      }
      const score = detector.getScore("t1")!;
      expect(score.recommendation).toBe("flaky");
      expect(score.passRate).toBeCloseTo(0.5, 1);
      expect(score.score).toBeGreaterThan(40);
    });

    it("should calculate pass rate correctly", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 7; i++) {
        detector.record(makeExecution("t1", true));
      }
      for (let i = 0; i < 3; i++) {
        detector.record(makeExecution("t1", false));
      }
      const score = detector.getScore("t1")!;
      expect(score.passRate).toBe(0.7);
      expect(score.passedRuns).toBe(7);
      expect(score.failedRuns).toBe(3);
      expect(score.totalRuns).toBe(10);
    });

    it("should detect failure patterns", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector.record({
          ...makeExecution("t1", i < 5),
          error: i < 5 ? undefined : "Timeout waiting for selector",
        });
      }
      const score = detector.getScore("t1")!;
      expect(score.failurePatterns).toContain("timeout");
      expect(score.failurePatterns).toContain("selector-mismatch");
    });

    it("should calculate confidence based on sample size", () => {
      const detector = new FlakinessDetector();
      // 5 runs = 25% confidence
      for (let i = 0; i < 5; i++) {
        detector.record(makeExecution("t1", i % 2 === 0));
      }
      const score5 = detector.getScore("t1")!;
      expect(score5.confidence).toBeCloseTo(0.25, 1);

      // 20 runs = 100% confidence
      for (let i = 0; i < 15; i++) {
        detector.record(makeExecution("t1", i % 2 === 0));
      }
      const score20 = detector.getScore("t1")!;
      expect(score20.confidence).toBe(1);
    });
  });

  describe("getReport", () => {
    it("should generate a full report", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector.record(makeExecution("stable", true));
        detector.record(makeExecution("flaky", i % 2 === 0));
        detector.record(makeExecution("broken", false));
      }

      const report = detector.getReport();
      expect(report.totalTests).toBe(3);
      expect(report.stableTests).toBe(1);
      expect(report.flakyTests).toBe(1);
      expect(report.brokenTests).toBe(1);
      expect(report.topFlaky.length).toBeGreaterThan(0);
    });
  });

  describe("getPassConfidence", () => {
    it("should return pass confidence", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector.record(makeExecution("t1", true));
      }
      expect(detector.getPassConfidence("t1")).toBe(1);
    });

    it("should return 0.5 for unknown tests", () => {
      const detector = new FlakinessDetector();
      expect(detector.getPassConfidence("unknown")).toBe(0.5);
    });
  });

  describe("isFlaky", () => {
    it("should return true for flaky tests", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 20; i++) {
        detector.record(makeExecution("t1", i % 2 === 0));
      }
      expect(detector.isFlaky("t1")).toBe(true);
    });

    it("should return false for stable tests", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector.record(makeExecution("t1", true));
      }
      expect(detector.isFlaky("t1")).toBe(false);
    });
  });

  describe("getRetryableTests", () => {
    it("should return only flaky/needs-investigation tests", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 20; i++) {
        detector.record(makeExecution("stable", true));
        detector.record(makeExecution("flaky", i % 2 === 0));
        detector.record(makeExecution("broken", false));
      }
      const retryable = detector.getRetryableTests();
      expect(
        retryable.every((s) => s.recommendation !== "stable" && s.recommendation !== "broken"),
      ).toBe(true);
    });
  });

  describe("export/import", () => {
    it("should export and import history", () => {
      const detector1 = new FlakinessDetector();
      for (let i = 0; i < 10; i++) {
        detector1.record(makeExecution("t1", i % 2 === 0));
      }
      const exported = detector1.export();

      const detector2 = new FlakinessDetector();
      detector2.import(exported);
      const score = detector2.getScore("t1");
      expect(score).not.toBeNull();
      expect(score?.totalRuns).toBe(10);
    });
  });

  describe("clear", () => {
    it("should clear specific test", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 5; i++) {
        detector.record(makeExecution("t1", true));
        detector.record(makeExecution("t2", false));
      }
      detector.clear("t1");
      expect(detector.getScore("t1")).toBeNull();
      expect(detector.getScore("t2")).not.toBeNull();
    });

    it("should clear all tests", () => {
      const detector = new FlakinessDetector();
      for (let i = 0; i < 5; i++) {
        detector.record(makeExecution("t1", true));
      }
      detector.clear();
      expect(detector.getAllScores().length).toBe(0);
    });
  });
});
