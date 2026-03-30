/**
 * Parallel execution scheduler for agent graphs.
 * Manages concurrency limits, priority queuing, and resource allocation.
 */

export interface SchedulerConfig {
  /** Max concurrent node executions (default: 4) */
  maxConcurrency: number;
  /** Timeout for individual nodes in ms (default: 60000) */
  nodeTimeout: number;
  /** Enable priority scheduling (default: true) */
  priorityEnabled: boolean;
}

export interface SchedulerStats {
  totalScheduled: number;
  totalCompleted: number;
  totalFailed: number;
  averageWaitMs: number;
  averageExecutionMs: number;
  currentQueueSize: number;
  activeTasks: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrency: 4,
  nodeTimeout: 60_000,
  priorityEnabled: true,
};

interface QueuedTask {
  nodeId: string;
  priority: number;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

/**
 * Scheduler manages concurrent execution of agent nodes with
 * configurable parallelism, priority queuing, and resource limits.
 */
export class Scheduler {
  private config: SchedulerConfig;
  private queue: QueuedTask[] = [];
  private activeCount = 0;
  private stats: SchedulerStats = {
    totalScheduled: 0,
    totalCompleted: 0,
    totalFailed: 0,
    averageWaitMs: 0,
    averageExecutionMs: 0,
    currentQueueSize: 0,
    activeTasks: 0,
  };
  private waitTimes: number[] = [];
  private executionTimes: number[] = [];

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Schedule a task for execution. Returns a promise that resolves
   * when the task completes.
   */
  schedule(nodeId: string, execute: () => Promise<unknown>, priority = 0): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const task: QueuedTask = {
        nodeId,
        priority,
        execute,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.push(task);
      this.stats.totalScheduled++;
      this.stats.currentQueueSize = this.queue.length;

      if (this.config.priorityEnabled) {
        this.queue.sort((a, b) => b.priority - a.priority);
      }

      this.processNext();
    });
  }

  /**
   * Execute a batch of tasks respecting concurrency limits.
   */
  async scheduleBatch(
    tasks: Array<{ nodeId: string; execute: () => Promise<unknown>; priority?: number }>,
  ): Promise<Map<string, { success: boolean; result?: unknown; error?: Error }>> {
    const results = new Map<string, { success: boolean; result?: unknown; error?: Error }>();

    const promises = tasks.map(async (task) => {
      try {
        const result = await this.schedule(task.nodeId, task.execute, task.priority ?? 0);
        results.set(task.nodeId, { success: true, result });
      } catch (error) {
        results.set(task.nodeId, {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get current scheduler statistics.
   */
  getStats(): SchedulerStats {
    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      activeTasks: this.activeCount,
      averageWaitMs:
        this.waitTimes.length > 0
          ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
          : 0,
      averageExecutionMs:
        this.executionTimes.length > 0
          ? this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length
          : 0,
    };
  }

  /**
   * Wait for all pending tasks to complete.
   */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.activeCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Process the next task in the queue if concurrency allows.
   */
  private processNext(): void {
    if (this.activeCount >= this.config.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift()!;
    this.stats.currentQueueSize = this.queue.length;
    this.activeCount++;

    const waitMs = Date.now() - task.enqueuedAt;
    this.waitTimes.push(waitMs);
    if (this.waitTimes.length > 100) this.waitTimes.shift();

    const startMs = Date.now();
    const timeout = setTimeout(() => {
      this.activeCount--;
      this.stats.totalFailed++;
      task.reject(new Error(`Task "${task.nodeId}" timed out after ${this.config.nodeTimeout}ms`));
      this.processNext();
    }, this.config.nodeTimeout);

    task
      .execute()
      .then((result) => {
        clearTimeout(timeout);
        this.activeCount--;
        const execMs = Date.now() - startMs;
        this.executionTimes.push(execMs);
        if (this.executionTimes.length > 100) this.executionTimes.shift();
        this.stats.totalCompleted++;
        task.resolve(result);
        this.processNext();
      })
      .catch((error) => {
        clearTimeout(timeout);
        this.activeCount--;
        this.stats.totalFailed++;
        task.reject(error instanceof Error ? error : new Error(String(error)));
        this.processNext();
      });
  }
}
