import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { ParallelEngine, ParallelEngineConfig } from "./parallel-engine.js";

describe("ParallelEngine", () => {
  let engine: ParallelEngine;

  beforeEach(() => {
    engine = new ParallelEngine();
  });

  describe("submit", () => {
    it("should submit a task and return a promise", async () => {
      const task = jest.fn().mockResolvedValue("result");
      const promise = engine.submit(task, { priority: 1 });
      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toEqual("result");
      expect(task).toHaveBeenCalled();
    });

    it("should queue tasks when concurrency limit is reached", async () => {
      const config: ParallelEngineConfig = { maxConcurrent: 1, maxQueued: 2 };
      engine.configure(config);
      const task1 = jest.fn().mockResolvedValue("result1");
      const task2 = jest.fn().mockResolvedValue("result2");
      const task3 = jest.fn().mockResolvedValue("result3");
      const task4 = jest.fn().mockResolvedValue("result4");

      const p1 = engine.submit(task1, { priority: 1 });
      const p2 = engine.submit(task2, { priority: 1 });
      const p3 = engine.submit(task3, { priority: 1 });
      const p4 = engine.submit(task4, { priority: 1 });

      // First two should start immediately, third should queue, fourth should reject
      await Promise.race([p1, p2]);
      expect(task1).toHaveBeenCalled();
      expect(task2).toHaveBeenCalled();
      expect(task3).not.toHaveBeenCalled();
      await expect(p3).rejects.toThrow("Queue full");
      await expect(p4).rejects.toThrow("Queue full");
    });

    it("should execute higher priority tasks first", async () => {
      const config: ParallelEngineConfig = { maxConcurrent: 1, maxQueued: 3 };
      engine.configure(config);

      // Submit low priority task first
      const lowPriority = jest.fn().mockResolvedValue("low");
      engine.submit(lowPriority, { priority: 1 });

      // Submit high priority task second
      const highPriority = jest.fn().mockResolvedValue("high");
      const promise = engine.submit(highPriority, { priority: 10 });

      await expect(promise).resolves.toEqual("high");
      expect(highPriority).toHaveBeenCalled();
      expect(lowPriority).not.toHaveBeenCalled(); // Should be preempted by high priority

      // Now run low priority task
      await Promise.resolve(() => {}); // Give event loop a chance
      expect(lowPriority).toHaveBeenCalled();
    });
  });

  describe("pause", () => {
    it("should pause task execution", async () => {
      const config = { maxConcurrent: 2, maxQueued: 5 };
      engine.configure(config);
      const task1 = jest.fn().mockResolvedValue("result1");
      const task2 = jest.fn().mockResolvedValue("result2");
      const task3 = jest.fn().mockResolvedValue("result3");

      engine.submit(task1, { priority: 1 });
      engine.submit(task2, { priority: 1 });
      engine.submit(task3, { priority: 1 });

      engine.pause();

      // After pause, no tasks should be executing
      expect(task1).toHaveBeenCalled();
      expect(task2).not.toHaveBeenCalled(); // Should be paused
      expect(task3).not.toHaveBeenCalled();
    });

    it("should resume after pause", async () => {
      const config = { maxConcurrent: 1, maxQueued: 5 };
      engine.configure(config);
      const task1 = jest.fn().mockResolvedValue("result1");
      const task2 = jest.fn().mockResolvedValue("result2");

      engine.submit(task1, { priority: 1 });
      engine.pause();
      const promise2 = engine.submit(task2, { priority: 1 });
      engine.resume();

      await expect(promise2).resolves.toEqual("result2");
      expect(task2).toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("should clear all queued tasks", async () => {
      const config = { maxConcurrent: 1, maxQueued: 5 };
      engine.configure(config);
      const task1 = jest.fn().mockResolvedValue("result1");
      const task2 = jest.fn().mockResolvedValue("result2");
      const task3 = jest.fn().mockResolvedValue("result3");

      engine.submit(task1, { priority: 1 });
      engine.submit(task2, { priority: 1 });
      engine.submit(task3, { priority: 1 });

      engine.clear();

      expect(engine.getQueueLength()).toEqual(0);
      expect(engine.getRunningTasks()).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    it("should return engine statistics", async () => {
      const config = { maxConcurrent: 2, maxQueued: 5 };
      engine.configure(config);
      const task1 = jest.fn().mockResolvedValue("result1");
      const task2 = jest.fn().mockResolvedValue("result2");

      engine.submit(task1, { priority: 1 });
      engine.submit(task2, { priority: 1 });

      const stats = engine.getStats();
      expect(stats).toHaveProperty("queuedTasks", 0);
      expect(stats).toHaveProperty("runningTasks", 2);
      expect(stats).toHaveProperty("completedTasks", 0);
      expect(stats).toHaveProperty("failedTasks", 0);
      expect(stats).toHaveProperty("totalTasks", 2);
    });
  });

  describe("onTaskComplete", () => {
    it("should emit event when task completes", async () => {
      const handler = jest.fn();
      engine.on("task:complete", handler);

      const task = jest.fn().mockResolvedValue("result");
      await engine.submit(task, { priority: 1 });

      await new Promise(setImmediate); // Wait for event loop

      expect(handler).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});
