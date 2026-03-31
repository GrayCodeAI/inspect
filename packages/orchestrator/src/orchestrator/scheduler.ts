import type { DeviceConfig } from "@inspect/devices";
import type { ExecutionConfig, ExecutionResult, ExecutorDependencies } from "./executor.js";
import { TestExecutor } from "./executor.js";

export interface SchedulerConfig {
  /** Maximum number of concurrent test executions. */
  concurrency: number;
  /** If true, fail fast on first test failure. */
  failFast: boolean;
  /** Global timeout for all tests combined (ms). */
  globalTimeoutMs: number;
}

export interface ScheduledRun {
  id: string;
  device: DeviceConfig;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: ExecutionResult;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface TestTask {
  config: ExecutionConfig;
  device: DeviceConfig;
}

/**
 * TestScheduler manages parallel execution of tests across multiple devices.
 * It maintains a device pool, manages concurrency, and aggregates results.
 */
export class TestScheduler {
  private config: SchedulerConfig;
  private deps: ExecutorDependencies;
  private runs: Map<string, ScheduledRun> = new Map();
  private activeCount = 0;
  private aborted = false;

  constructor(config: Partial<SchedulerConfig> = {}, deps: ExecutorDependencies) {
    this.config = {
      concurrency: config.concurrency ?? 3,
      failFast: config.failFast ?? false,
      globalTimeoutMs: config.globalTimeoutMs ?? 600_000, // 10 minutes
    };
    this.deps = deps;
  }

  /**
   * Schedule tests to run in parallel across the given devices.
   * Returns results for each device.
   */
  async scheduleParallel(
    baseConfig: Omit<ExecutionConfig, "device">,
    devices: DeviceConfig[],
  ): Promise<Map<string, ScheduledRun>> {
    const tasks: TestTask[] = devices.map((device) => ({
      config: { ...baseConfig, device },
      device,
    }));

    // Initialize runs
    for (const task of tasks) {
      const id = `run_${task.device.name}_${Date.now()}`;
      this.runs.set(id, {
        id,
        device: task.device,
        status: "queued",
      });
    }

    // Global timeout — marks scheduler as aborted so no new tasks start.
    // Already-running tasks will finish their current step but won't
    // start new steps (the executor checks its own timeout).
    const globalTimer = setTimeout(() => {
      this.abort();
      // Mark any still-running runs as failed due to timeout
      for (const run of this.runs.values()) {
        if (run.status === "running") {
          run.status = "failed";
          run.error = "Global timeout exceeded";
          run.completedAt = new Date();
        }
      }
    }, this.config.globalTimeoutMs);

    // Process task queue with concurrency limit
    const taskQueue = [...tasks];
    const runIds = [...this.runs.keys()];
    let taskIndex = 0;
    const promises: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      while (taskIndex < taskQueue.length && !this.aborted) {
        if (this.activeCount >= this.config.concurrency) {
          // Wait for a slot
          await delay(100);
          continue;
        }

        const currentIndex = taskIndex++;
        const task = taskQueue[currentIndex];
        const runId = runIds[currentIndex];

        if (!task || !runId) break;

        this.activeCount++;
        const run = this.runs.get(runId)!;
        run.status = "running";
        run.startedAt = new Date();

        try {
          const executor = new TestExecutor(task.config, this.deps);
          const result = await executor.execute();

          run.result = result;
          run.status = "completed";
          run.completedAt = new Date();

          // Fail fast check
          if (this.config.failFast && result.status !== "pass") {
            this.abort();
          }
        } catch (err) {
          run.status = "failed";
          run.error = err instanceof Error ? err.message : String(err);
          run.completedAt = new Date();

          if (this.config.failFast) {
            this.abort();
          }
        } finally {
          this.activeCount--;
        }
      }
    };

    // Start workers up to concurrency limit
    const workerCount = Math.min(this.config.concurrency, tasks.length);
    for (let i = 0; i < workerCount; i++) {
      promises.push(processNext());
    }

    await Promise.all(promises);
    clearTimeout(globalTimer);

    // Mark any remaining queued runs as cancelled
    for (const run of this.runs.values()) {
      if (run.status === "queued") {
        run.status = "cancelled";
      }
    }

    return this.runs;
  }

  /**
   * Run tests sequentially across devices (useful for debugging).
   */
  async scheduleSequential(
    baseConfig: Omit<ExecutionConfig, "device">,
    devices: DeviceConfig[],
  ): Promise<Map<string, ScheduledRun>> {
    for (const device of devices) {
      if (this.aborted) break;

      const id = `run_${device.name}_${Date.now()}`;
      const run: ScheduledRun = {
        id,
        device,
        status: "running",
        startedAt: new Date(),
      };
      this.runs.set(id, run);

      try {
        const executor = new TestExecutor(
          {
            ...baseConfig,
            device,
          },
          this.deps,
        );
        const result = await executor.execute();

        run.result = result;
        run.status = "completed";
        run.completedAt = new Date();

        if (this.config.failFast && result.status !== "pass") {
          this.abort();
        }
      } catch (err) {
        run.status = "failed";
        run.error = err instanceof Error ? err.message : String(err);
        run.completedAt = new Date();

        if (this.config.failFast) {
          this.abort();
        }
      }
    }

    return this.runs;
  }

  /**
   * Get a summary of all runs.
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    cancelled: number;
    running: number;
  } {
    let passed = 0;
    let failed = 0;
    let cancelled = 0;
    let running = 0;

    for (const run of this.runs.values()) {
      if (run.status === "completed" && run.result?.status === "pass") passed++;
      else if (run.status === "completed" || run.status === "failed") failed++;
      else if (run.status === "cancelled") cancelled++;
      else if (run.status === "running") running++;
    }

    return {
      total: this.runs.size,
      passed,
      failed,
      cancelled,
      running,
    };
  }

  /**
   * Compare results across devices to find device-specific issues.
   */
  compareResults(): Array<{
    step: string;
    inconsistencies: Array<{
      device: string;
      status: string;
      error?: string;
    }>;
  }> {
    const stepMap = new Map<string, Array<{ device: string; status: string; error?: string }>>();

    for (const run of this.runs.values()) {
      if (!run.result?.steps) continue;

      for (const step of run.result.steps) {
        if (!stepMap.has(step.description)) {
          stepMap.set(step.description, []);
        }
        stepMap.get(step.description)!.push({
          device: run.device.name,
          status: step.status,
          error: step.error,
        });
      }
    }

    // Find steps where results differ across devices
    const inconsistencies: Array<{
      step: string;
      inconsistencies: Array<{
        device: string;
        status: string;
        error?: string;
      }>;
    }> = [];

    for (const [step, results] of stepMap) {
      const statuses = new Set(results.map((r) => r.status));
      if (statuses.size > 1) {
        inconsistencies.push({ step, inconsistencies: results });
      }
    }

    return inconsistencies;
  }

  /**
   * Abort all running and queued tests.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Reset the scheduler for a new run.
   */
  reset(): void {
    this.runs.clear();
    this.activeCount = 0;
    this.aborted = false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
