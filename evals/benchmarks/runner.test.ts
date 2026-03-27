import { describe, it, expect } from "vitest";
import {
  BenchmarkRunner,
  BENCHMARK_SUITES,
  MINIWOB_TASKS,
  WEBARENA_TASKS,
  WORKARENA_TASKS,
} from "./runner.js";

describe("BenchmarkSuites", () => {
  it("should have miniwob tasks", () => {
    expect(MINIWOB_TASKS.length).toBeGreaterThan(0);
    for (const task of MINIWOB_TASKS) {
      expect(task.id).toBeDefined();
      expect(task.name).toBeDefined();
      expect(task.suite).toBe("miniwob");
      expect(task.goal).toBeDefined();
      expect(task.maxSteps).toBeGreaterThan(0);
      expect(task.timeout).toBeGreaterThan(0);
    }
  });

  it("should have webarena tasks", () => {
    expect(WEBARENA_TASKS.length).toBeGreaterThan(0);
    for (const task of WEBARENA_TASKS) {
      expect(task.suite).toBe("webarena");
    }
  });

  it("should have workarena tasks", () => {
    expect(WORKARENA_TASKS.length).toBeGreaterThan(0);
    for (const task of WORKARENA_TASKS) {
      expect(task.suite).toBe("workarena");
    }
  });

  it("should have all suites in BENCHMARK_SUITES", () => {
    expect(BENCHMARK_SUITES.miniwob).toBeDefined();
    expect(BENCHMARK_SUITES.webarena).toBeDefined();
    expect(BENCHMARK_SUITES.workarena).toBeDefined();
  });
});

describe("BenchmarkRunner", () => {
  describe("addSuite / addTask / withConcurrency", () => {
    it("should add a suite", () => {
      const runner = new BenchmarkRunner();
      runner.addSuite("miniwob");
      // Suite added internally
    });

    it("should add a custom task", () => {
      const runner = new BenchmarkRunner();
      runner.addTask({
        id: "custom",
        name: "Custom Task",
        suite: "custom",
        url: "about:blank",
        goal: "Do something",
        maxSteps: 5,
        timeout: 10_000,
      });
    });

    it("should set concurrency", () => {
      const runner = new BenchmarkRunner();
      runner.withConcurrency(5);
    });
  });

  describe("run", () => {
    it("should run all tasks and return results", async () => {
      const runner = new BenchmarkRunner();
      runner.addTask({
        id: "test-1",
        name: "Test Task",
        suite: "test",
        url: "about:blank",
        goal: "Test",
        maxSteps: 5,
        timeout: 10_000,
      });

      const result = await runner.run(async (task) => ({
        success: true,
        steps: [
          { stepIndex: 0, action: "click", success: true, url: task.url, timestamp: Date.now() },
        ],
      }));

      expect(result.totalTasks).toBe(1);
      expect(result.passedTasks).toBe(1);
      expect(result.failedTasks).toBe(0);
      expect(result.successRate).toBe(1);
      expect(result.results.length).toBe(1);
      expect(result.results[0].success).toBe(true);
    });

    it("should handle task failures", async () => {
      const runner = new BenchmarkRunner();
      runner.addTask({
        id: "fail-1",
        name: "Failing Task",
        suite: "test",
        url: "about:blank",
        goal: "Fail",
        maxSteps: 5,
        timeout: 10_000,
      });

      const result = await runner.run(async () => ({
        success: false,
        steps: [],
        error: "Something went wrong",
      }));

      expect(result.passedTasks).toBe(0);
      expect(result.failedTasks).toBe(1);
      expect(result.successRate).toBe(0);
    });

    it("should run multiple tasks in parallel", async () => {
      const runner = new BenchmarkRunner();
      runner.withConcurrency(2);
      for (let i = 0; i < 4; i++) {
        runner.addTask({
          id: `task-${i}`,
          name: `Task ${i}`,
          suite: "test",
          url: "about:blank",
          goal: "Test",
          maxSteps: 5,
          timeout: 10_000,
        });
      }

      const result = await runner.run(async () => ({
        success: true,
        steps: [],
      }));

      expect(result.totalTasks).toBe(4);
      expect(result.passedTasks).toBe(4);
    });
  });

  describe("compare", () => {
    it("should compare two benchmark results", () => {
      const resultA = {
        suite: "test",
        totalTasks: 5,
        passedTasks: 4,
        failedTasks: 1,
        successRate: 0.8,
        averageSteps: 3,
        averageDurationMs: 100,
        averageReward: 0.8,
        results: [],
        timestamp: Date.now(),
      };
      const resultB = {
        suite: "test",
        totalTasks: 5,
        passedTasks: 3,
        failedTasks: 2,
        successRate: 0.6,
        averageSteps: 4,
        averageDurationMs: 150,
        averageReward: 0.6,
        results: [],
        timestamp: Date.now(),
      };

      const comparison = BenchmarkRunner.compare(resultA, resultB);
      expect(comparison.agentA).toBe(resultA);
      expect(comparison.agentB).toBe(resultB);
      expect(comparison.averageRewardDiff).toBeCloseTo(0.2);
      expect(comparison.averageStepsDiff).toBeCloseTo(-1);
    });
  });

  describe("export", () => {
    it("should export results as JSON", () => {
      const result = {
        suite: "test",
        totalTasks: 1,
        passedTasks: 1,
        failedTasks: 0,
        successRate: 1,
        averageSteps: 1,
        averageDurationMs: 100,
        averageReward: 1,
        results: [],
        timestamp: Date.now(),
      };
      const json = BenchmarkRunner.export(result);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe("leaderboard", () => {
    it("should rank agents by score", () => {
      const results = [
        {
          agent: "Agent A",
          result: {
            suite: "test",
            totalTasks: 10,
            passedTasks: 8,
            failedTasks: 2,
            successRate: 0.8,
            averageSteps: 3,
            averageDurationMs: 100,
            averageReward: 0.8,
            results: [],
            timestamp: Date.now(),
          },
        },
        {
          agent: "Agent B",
          result: {
            suite: "test",
            totalTasks: 10,
            passedTasks: 9,
            failedTasks: 1,
            successRate: 0.9,
            averageSteps: 2,
            averageDurationMs: 80,
            averageReward: 0.9,
            results: [],
            timestamp: Date.now(),
          },
        },
      ];

      const board = BenchmarkRunner.leaderboard(results);
      expect(board.length).toBe(2);
      expect(board[0].agent).toBe("Agent B"); // Higher score
      expect(board[0].rank).toBe(1);
      expect(board[1].agent).toBe("Agent A");
      expect(board[1].rank).toBe(2);
    });
  });
});
