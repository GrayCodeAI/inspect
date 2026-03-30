import { describe, it, expect } from "vitest";
import { Scheduler } from "./scheduler.js";

describe("Scheduler", () => {
  it("executes queued tasks in priority order", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 1, priorityEnabled: true });
    const order: number[] = [];

    // First task fills the concurrency slot
    const p1 = scheduler.schedule(
      "low",
      async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 50));
        return "low";
      },
      1,
    );

    // These two get queued while the first runs
    const p2 = scheduler.schedule(
      "high",
      async () => {
        order.push(2);
        return "high";
      },
      10,
    );

    const p3 = scheduler.schedule(
      "medium",
      async () => {
        order.push(3);
        return "medium";
      },
      5,
    );

    await Promise.all([p1, p2, p3]);

    // First task starts immediately (order[0] = 1)
    // Then high priority (10) should execute before medium (5)
    expect(order[0]).toBe(1); // first task runs immediately
    expect(order[1]).toBe(2); // high priority queued first
    expect(order[2]).toBe(3); // medium priority
  });

  it("limits concurrency", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 2 });
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      scheduler.schedule(`task-${i}`, async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return i;
      }),
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("tracks statistics", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 4 });

    await scheduler.schedule("a", async () => "ok");
    await scheduler.schedule("b", async () => "ok");

    try {
      await scheduler.schedule("c", async () => {
        throw new Error("fail");
      });
    } catch {
      /* expected */
    }

    const stats = scheduler.getStats();
    expect(stats.totalScheduled).toBe(3);
    expect(stats.totalCompleted).toBe(2);
    expect(stats.totalFailed).toBe(1);
  });

  it("schedules batch of tasks", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 4 });

    const results = await scheduler.scheduleBatch([
      { nodeId: "a", execute: async () => "result-a" },
      { nodeId: "b", execute: async () => "result-b" },
    ]);

    expect(results.get("a")?.success).toBe(true);
    expect(results.get("a")?.result).toBe("result-a");
    expect(results.get("b")?.success).toBe(true);
    expect(results.get("b")?.result).toBe("result-b");
  });

  it("handles timeout", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 1, nodeTimeout: 50 });

    await expect(
      scheduler.schedule("slow", async () => {
        await new Promise((r) => setTimeout(r, 200));
        return "done";
      }),
    ).rejects.toThrow("timed out");
  });

  it("waits for drain", async () => {
    const scheduler = new Scheduler({ maxConcurrency: 2 });
    const results: number[] = [];

    scheduler.schedule("a", async () => {
      results.push(1);
    });
    scheduler.schedule("b", async () => {
      results.push(2);
    });
    scheduler.schedule("c", async () => {
      results.push(3);
    });

    await scheduler.drain();

    expect(results).toHaveLength(3);
  });
});
