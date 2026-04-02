/**
 * Parallel Execution Engine
 *
 * Distributes test execution across multiple workers for maximum throughput.
 * Supports dynamic load balancing and resource management.
 */

import { EventEmitter } from "events";

export interface ParallelExecutionConfig {
  /** Number of workers */
  workers: number;
  /** Worker type */
  workerType: "thread" | "process" | "container";
  /** Load balancing strategy */
  loadBalanceStrategy: "round-robin" | "least-loaded" | "capacity-based";
  /** Enable work stealing */
  workStealing: boolean;
  /** Batch size for distribution */
  batchSize: number;
  /** Worker startup timeout (ms) */
  startupTimeout: number;
  /** Worker idle timeout (ms) */
  idleTimeout: number;
  /** Max worker restarts */
  maxRestarts: number;
  /** Resource limits per worker */
  resourceLimits: ResourceLimits;
  /** On worker start */
  onWorkerStart?: (worker: WorkerInfo) => void;
  /** On worker stop */
  onWorkerStop?: (worker: WorkerInfo) => void;
  /** On task complete */
  onTaskComplete?: (result: ParallelTaskResult) => void;
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxConcurrentBrowsers: number;
}

export interface WorkerInfo {
  id: number;
  status: WorkerStatus;
  type: string;
  currentTask?: string;
  completedTasks: number;
  failedTasks: number;
  startedAt: number;
  lastActivity: number;
  resources: ResourceUsage;
  restarts: number;
}

export type WorkerStatus = "starting" | "idle" | "busy" | "stopping" | "stopped" | "error";

export interface ResourceUsage {
  memoryMB: number;
  cpuPercent: number;
  activeBrowsers: number;
}

export interface ParallelTask {
  id: string;
  name: string;
  type: string;
  data: unknown;
  priority: number;
  estimatedDuration: number;
  resourceRequirements: ResourceRequirements;
  dependencies: string[];
}

export interface ResourceRequirements {
  minMemoryMB: number;
  browsers: number;
}

export interface ParallelTaskResult {
  taskId: string;
  workerId: number;
  status: "success" | "failure" | "timeout" | "cancelled";
  result?: unknown;
  error?: string;
  duration: number;
  resourceUsage: ResourceUsage;
  timestamp: number;
}

export interface ExecutionStats {
  totalTasks: number;
  completed: number;
  failed: number;
  inProgress: number;
  queued: number;
  averageDuration: number;
  throughput: number; // tasks per minute
  workerUtilization: number; // percentage
}

export const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  workers: 4,
  workerType: "process",
  loadBalanceStrategy: "least-loaded",
  workStealing: true,
  batchSize: 10,
  startupTimeout: 30000,
  idleTimeout: 300000,
  maxRestarts: 3,
  resourceLimits: {
    maxMemoryMB: 2048,
    maxCpuPercent: 80,
    maxConcurrentBrowsers: 3,
  },
};

/**
 * Parallel Execution Engine
 *
 * Manages worker pool for distributed test execution.
 */
export class ParallelExecutionEngine extends EventEmitter {
  private config: ParallelExecutionConfig;
  private workers = new Map<number, WorkerInfo>();
  private taskQueue: ParallelTask[] = [];
  private inProgressTasks = new Map<string, { task: ParallelTask; workerId: number; startedAt: number }>();
  private results: ParallelTaskResult[] = [];
  private taskMap = new Map<string, ParallelTask>();
  private completedTasks = new Set<string>();
  private shutdownRequested = false;

  constructor(config: Partial<ParallelExecutionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PARALLEL_CONFIG, ...config };
  }

  /**
   * Initialize workers
   */
  async initialize(): Promise<void> {
    for (let i = 0; i < this.config.workers; i++) {
      await this.startWorker(i);
    }
  }

  /**
   * Start a worker
   */
  private async startWorker(id: number): Promise<WorkerInfo> {
    const worker: WorkerInfo = {
      id,
      status: "starting",
      type: this.config.workerType,
      completedTasks: 0,
      failedTasks: 0,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      resources: { memoryMB: 0, cpuPercent: 0, activeBrowsers: 0 },
      restarts: 0,
    };

    this.workers.set(id, worker);

    // Simulate worker startup
    await new Promise((resolve) => setTimeout(resolve, 100));

    worker.status = "idle";
    this.emit("worker:started", worker);
    this.config.onWorkerStart?.(worker);

    return worker;
  }

  /**
   * Submit tasks for execution
   */
  async submitTasks(tasks: ParallelTask[]): Promise<void> {
    // Validate no duplicate IDs
    for (const task of tasks) {
      if (this.taskMap.has(task.id)) {
        throw new Error(`Duplicate task ID: ${task.id}`);
      }
      this.taskMap.set(task.id, task);
    }

    // Filter out already completed dependencies
    const readyTasks = tasks.filter((t) =>
      t.dependencies.every((d) => this.completedTasks.has(d))
    );

    // Add to queue sorted by priority
    this.taskQueue.push(...readyTasks);
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    // Try to distribute immediately
    this.distributeTasks();
  }

  /**
   * Distribute tasks to workers
   */
  private distributeTasks(): void {
    if (this.shutdownRequested) return;

    while (this.taskQueue.length > 0) {
      const worker = this.selectWorker();
      if (!worker) break;

      const task = this.findSuitableTask(worker);
      if (!task) break;

      // Remove from queue
      const idx = this.taskQueue.findIndex((t) => t.id === task.id);
      if (idx > -1) this.taskQueue.splice(idx, 1);

      this.assignTask(task, worker);
    }
  }

  /**
   * Select best available worker
   */
  private selectWorker(): WorkerInfo | null {
    const idleWorkers = Array.from(this.workers.values()).filter(
      (w) => w.status === "idle"
    );

    if (idleWorkers.length === 0) return null;

    switch (this.config.loadBalanceStrategy) {
      case "round-robin":
        return idleWorkers[0];

      case "least-loaded":
        return idleWorkers.reduce((best, current) =>
          current.completedTasks < best.completedTasks ? current : best
        );

      case "capacity-based":
        return idleWorkers.reduce((best, current) =>
          current.resources.memoryMB < best.resources.memoryMB ? current : best
        );

      default:
        return idleWorkers[0];
    }
  }

  /**
   * Find task suitable for worker
   */
  private findSuitableTask(worker: WorkerInfo): ParallelTask | null {
    for (const task of this.taskQueue) {
      // Check dependencies
      if (!task.dependencies.every((d) => this.completedTasks.has(d))) {
        continue;
      }

      // Check resource requirements
      if (task.resourceRequirements.minMemoryMB > this.config.resourceLimits.maxMemoryMB) {
        continue;
      }

      if (task.resourceRequirements.browsers > this.config.resourceLimits.maxConcurrentBrowsers) {
        continue;
      }

      return task;
    }

    return null;
  }

  /**
   * Assign task to worker
   */
  private assignTask(task: ParallelTask, worker: WorkerInfo): void {
    worker.status = "busy";
    worker.currentTask = task.id;
    worker.lastActivity = Date.now();

    this.inProgressTasks.set(task.id, {
      task,
      workerId: worker.id,
      startedAt: Date.now(),
    });

    this.emit("task:started", { task, worker });

    // Execute task (simulated)
    this.executeTask(task, worker);
  }

  /**
   * Execute task on worker
   */
  private async executeTask(task: ParallelTask, worker: WorkerInfo): Promise<void> {
    const startTime = Date.now();

    try {
      // Simulate task execution
      await this.runTask(task, worker);

      const duration = Date.now() - startTime;

      const result: ParallelTaskResult = {
        taskId: task.id,
        workerId: worker.id,
        status: "success",
        duration,
        resourceUsage: { ...worker.resources },
        timestamp: Date.now(),
      };

      this.completeTask(task, worker, result);
    } catch (error) {
      const duration = Date.now() - startTime;

      const result: ParallelTaskResult = {
        taskId: task.id,
        workerId: worker.id,
        status: "failure",
        error: error instanceof Error ? error.message : String(error),
        duration,
        resourceUsage: { ...worker.resources },
        timestamp: Date.now(),
      };

      this.completeTask(task, worker, result);
    }
  }

  /**
   * Run actual task (placeholder)
   */
  private async runTask(task: ParallelTask, worker: WorkerInfo): Promise<unknown> {
    // Simulate work
    await new Promise((resolve) =>
      setTimeout(resolve, task.estimatedDuration || 1000)
    );

    // Simulate resource usage
    worker.resources.memoryMB = 100 + Math.random() * 500;
    worker.resources.cpuPercent = 10 + Math.random() * 30;

    return { taskId: task.id, completed: true };
  }

  /**
   * Complete task
   */
  private completeTask(
    task: ParallelTask,
    worker: WorkerInfo,
    result: ParallelTaskResult
  ): void {
    this.inProgressTasks.delete(task.id);
    this.results.push(result);
    this.completedTasks.add(task.id);

    // Update worker
    worker.status = "idle";
    worker.currentTask = undefined;
    worker.lastActivity = Date.now();

    if (result.status === "success") {
      worker.completedTasks++;
    } else {
      worker.failedTasks++;
    }

    // Unlock dependent tasks
    this.unlockDependentTasks(task.id);

    this.emit("task:completed", result);
    this.config.onTaskComplete?.(result);

    // Continue distribution
    this.distributeTasks();
  }

  /**
   * Unlock tasks that were waiting on this dependency
   */
  private unlockDependentTasks(completedTaskId: string): void {
    for (const [, task] of this.taskMap) {
      if (task.dependencies.includes(completedTaskId)) {
        // Check if all deps now complete
        if (task.dependencies.every((d) => this.completedTasks.has(d))) {
          // Add to queue if not already there
          if (!this.taskQueue.find((t) => t.id === task.id) &&
              !this.inProgressTasks.has(task.id) &&
              !this.completedTasks.has(task.id)) {
            this.taskQueue.push(task);
          }
        }
      }
    }

    // Re-sort
    this.taskQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Attempt work stealing
   */
  private attemptWorkStealing(busyWorker: WorkerInfo): void {
    if (!this.config.workStealing) return;

    // Find idle worker to steal for
    const idleWorker = Array.from(this.workers.values()).find(
      (w) => w.status === "idle"
    );

    if (!idleWorker) return;

    // In real implementation, would transfer task from busy to idle
    this.emit("work:stolen", { from: busyWorker.id, to: idleWorker.id });
  }

  /**
   * Wait for all tasks to complete
   */
  async waitForCompletion(): Promise<ParallelTaskResult[]> {
    while (
      this.taskQueue.length > 0 ||
      this.inProgressTasks.size > 0
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return this.results;
  }

  /**
   * Get execution statistics
   */
  getStats(): ExecutionStats {
    const completed = this.results.filter((r) => r.status === "success").length;
    const failed = this.results.filter((r) => r.status === "failure").length;
    const durations = this.results.map((r) => r.duration);

    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    const busyWorkers = Array.from(this.workers.values()).filter(
      (w) => w.status === "busy"
    ).length;

    return {
      totalTasks: this.taskMap.size,
      completed,
      failed,
      inProgress: this.inProgressTasks.size,
      queued: this.taskQueue.length,
      averageDuration: avgDuration,
      throughput: this.calculateThroughput(),
      workerUtilization: (busyWorkers / this.workers.size) * 100,
    };
  }

  /**
   * Calculate throughput (tasks per minute)
   */
  private calculateThroughput(): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recent = this.results.filter((r) => r.timestamp > oneMinuteAgo);
    return recent.length;
  }

  /**
   * Shutdown all workers
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;

    // Wait for in-progress tasks
    await this.waitForCompletion();

    // Stop all workers
    for (const worker of this.workers.values()) {
      worker.status = "stopping";
      await new Promise((resolve) => setTimeout(resolve, 50));
      worker.status = "stopped";
      this.emit("worker:stopped", worker);
      this.config.onWorkerStop?.(worker);
    }

    this.workers.clear();
  }

  /**
   * Cancel all pending tasks
   */
  cancelPending(): number {
    const count = this.taskQueue.length;
    this.taskQueue = [];
    return count;
  }

  /**
   * Restart failed workers
   */
  async restartFailedWorkers(): Promise<number> {
    let restarted = 0;

    for (const [id, worker] of this.workers) {
      if (worker.status === "error" && worker.restarts < this.config.maxRestarts) {
        await this.startWorker(id);
        restarted++;
      }
    }

    return restarted;
  }
}

/**
 * Convenience function
 */
export function createParallelEngine(
  config?: Partial<ParallelExecutionConfig>
): ParallelExecutionEngine {
  return new ParallelExecutionEngine(config);
}
