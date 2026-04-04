/**
 * Multi-Agent Orchestration
 *
 * Coordinates multiple agent instances working on tasks in parallel.
 * Supports task distribution, load balancing, and result aggregation.
 */

import { EventEmitter } from "events";

export interface MultiAgentConfig {
  /** Maximum concurrent agents */
  maxConcurrentAgents: number;
  /** Task queue size */
  maxQueueSize: number;
  /** Agent idle timeout (ms) */
  agentIdleTimeout: number;
  /** Enable load balancing */
  loadBalancing: boolean;
  /** Strategy for task distribution */
  distributionStrategy: "round-robin" | "least-loaded" | "capability-based";
  /** Enable result aggregation */
  aggregateResults: boolean;
  /** Callback on task complete */
  onTaskComplete?: (result: TaskResult) => void;
  /** Callback on agent status change */
  onAgentStatusChange?: (agentId: string, status: AgentStatus) => void;
}

export interface AgentInstance {
  id: string;
  status: AgentStatus;
  capabilities: AgentCapability[];
  currentTask?: string;
  completedTasks: number;
  failedTasks: number;
  idleSince?: number;
  metadata: Record<string, unknown>;
}

export type AgentStatus = "idle" | "busy" | "starting" | "stopping" | "error";

export interface AgentCapability {
  name: string;
  level: "basic" | "intermediate" | "expert";
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  data: Record<string, unknown>;
  requiredCapabilities?: string[];
  maxRetries: number;
  timeout: number;
  createdAt: number;
  dependencies?: string[];
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: "success" | "failure" | "timeout" | "cancelled";
  data?: unknown;
  error?: string;
  duration: number;
  retries: number;
  completedAt: number;
}

export interface TaskBatch {
  id: string;
  name: string;
  tasks: Task[];
  strategy: "parallel" | "sequential" | "dag";
  onProgress?: (completed: number, total: number) => void;
}

export interface OrchestrationStats {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  queueSize: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
  throughput: number; // tasks per minute
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfig = {
  maxConcurrentAgents: 5,
  maxQueueSize: 100,
  agentIdleTimeout: 300000, // 5 minutes
  loadBalancing: true,
  distributionStrategy: "least-loaded",
  aggregateResults: true,
};

/**
 * Multi-Agent Orchestrator
 *
 * Manages a pool of agent instances, distributes tasks, and aggregates results.
 * Supports various distribution strategies and dependency management.
 */
export class MultiAgentOrchestrator extends EventEmitter {
  private config: MultiAgentConfig;
  private agents = new Map<string, AgentInstance>();
  private taskQueue: Task[] = [];
  private taskResults = new Map<string, TaskResult>();
  private runningTasks = new Map<string, { task: Task; agentId: string; startedAt: number }>();
  private taskPromises = new Map<
    string,
    { resolve: (result: TaskResult) => void; reject: (error: Error) => void }
  >();
  private roundRobinIndex = 0;
  private maintenanceInterval?: NodeJS.Timeout;

  constructor(config: Partial<MultiAgentConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
    this.startMaintenanceLoop();
  }

  /**
   * Register a new agent instance
   */
  registerAgent(
    id: string,
    capabilities: AgentCapability[] = [],
    metadata: Record<string, unknown> = {},
  ): AgentInstance {
    const agent: AgentInstance = {
      id,
      status: "idle",
      capabilities,
      completedTasks: 0,
      failedTasks: 0,
      idleSince: Date.now(),
      metadata,
    };

    this.agents.set(id, agent);
    this.emit("agent:registered", agent);
    this.config.onAgentStatusChange?.(id, "idle");

    // Process queue if tasks are waiting
    this.processQueue();

    return agent;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    // Cancel any running task
    if (agent.currentTask) {
      this.cancelTask(agent.currentTask, "Agent unregistered");
    }

    this.agents.delete(id);
    this.emit("agent:unregistered", { id });
  }

  /**
   * Submit a single task
   */
  async submitTask(task: Omit<Task, "id" | "createdAt">): Promise<TaskResult> {
    const fullTask: Task = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
    };

    // Check queue capacity
    if (this.taskQueue.length >= this.config.maxQueueSize) {
      throw new Error("Task queue is full");
    }

    // Add to queue
    this.taskQueue.push(fullTask);
    this.emit("task:queued", fullTask);

    // Sort by priority
    this.sortQueue();

    // Try to process immediately
    this.processQueue();

    // Return promise that resolves when task completes
    return new Promise((resolve, reject) => {
      this.taskPromises.set(fullTask.id, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.taskPromises.has(fullTask.id)) {
          this.taskPromises.delete(fullTask.id);
          reject(new Error(`Task ${fullTask.id} timed out`));
        }
      }, fullTask.timeout || 60000);
    });
  }

  /**
   * Submit a batch of tasks
   */
  async submitBatch(batch: Omit<TaskBatch, "id">): Promise<TaskResult[]> {
    const fullBatch: TaskBatch = {
      ...batch,
      id: `batch-${Date.now()}`,
    };

    this.emit("batch:started", fullBatch);

    switch (fullBatch.strategy) {
      case "parallel":
        return this.executeParallel(fullBatch);

      case "sequential":
        return this.executeSequential(fullBatch);

      case "dag":
        return this.executeDAG(fullBatch);

      default:
        throw new Error(`Unknown strategy: ${fullBatch.strategy}`);
    }
  }

  /**
   * Execute tasks in parallel
   */
  private async executeParallel(batch: TaskBatch): Promise<TaskResult[]> {
    const promises = batch.tasks.map((task) =>
      this.submitTask({
        type: task.type,
        priority: task.priority,
        data: task.data,
        requiredCapabilities: task.requiredCapabilities,
        maxRetries: task.maxRetries || 3,
        timeout: task.timeout || 60000,
      }),
    );

    const results = await Promise.allSettled(promises);

    batch.onProgress?.(results.filter((r) => r.status === "fulfilled").length, batch.tasks.length);

    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            taskId: batch.tasks[i].id || `task-${i}`,
            agentId: "",
            status: "failure" as const,
            error: r.reason?.message || "Unknown error",
            duration: 0,
            retries: 0,
            completedAt: Date.now(),
          },
    );
  }

  /**
   * Execute tasks sequentially
   */
  private async executeSequential(batch: TaskBatch): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (let i = 0; i < batch.tasks.length; i++) {
      const task = batch.tasks[i];

      try {
        const result = await this.submitTask({
          type: task.type,
          priority: task.priority,
          data: task.data,
          requiredCapabilities: task.requiredCapabilities,
          maxRetries: task.maxRetries || 3,
          timeout: task.timeout || 60000,
        });

        results.push(result);
      } catch (error) {
        results.push({
          taskId: task.id || `task-${i}`,
          agentId: "",
          status: "failure",
          error: error instanceof Error ? error.message : "Unknown error",
          duration: 0,
          retries: 0,
          completedAt: Date.now(),
        });
      }

      batch.onProgress?.(i + 1, batch.tasks.length);
    }

    return results;
  }

  /**
   * Execute tasks respecting DAG dependencies
   */
  private async executeDAG(batch: TaskBatch): Promise<TaskResult[]> {
    const completed = new Set<string>();
    const results = new Map<string, TaskResult>();
    const _tasks = new Map(batch.tasks.map((t) => [t.id, t]));

    // Build dependency graph
    const dependents = new Map<string, string[]>();
    for (const task of batch.tasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          if (!dependents.has(dep)) {
            dependents.set(dep, []);
          }
          dependents.get(dep)!.push(task.id);
        }
      }
    }

    // Execute tasks as dependencies are satisfied
    while (completed.size < batch.tasks.length) {
      const ready = batch.tasks.filter(
        (t) =>
          !completed.has(t.id) &&
          !this.isRunning(t.id) &&
          (!t.dependencies || t.dependencies.every((d) => completed.has(d))),
      );

      if (ready.length === 0 && this.runningCount() === 0) {
        // Deadlock or all tasks failed
        break;
      }

      // Submit ready tasks
      const promises = ready.map((task) =>
        this.submitTask({
          type: task.type,
          priority: task.priority,
          data: task.data,
          requiredCapabilities: task.requiredCapabilities,
          maxRetries: task.maxRetries || 3,
          timeout: task.timeout || 60000,
        }).then((result) => {
          completed.add(task.id);
          results.set(task.id, result);
          batch.onProgress?.(completed.size, batch.tasks.length);
        }),
      );

      // Wait for at least one task to complete
      if (promises.length > 0) {
        await Promise.race(promises);
      } else {
        // Wait a bit for running tasks
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return batch.tasks.map(
      (t) =>
        results.get(t.id) || {
          taskId: t.id,
          agentId: "",
          status: "cancelled",
          error: "Task not executed",
          duration: 0,
          retries: 0,
          completedAt: Date.now(),
        },
    );
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.hasIdleAgent()) {
      const task = this.taskQueue.shift();
      if (!task) break;

      const agent = this.selectAgent(task);
      if (!agent) {
        // Put back in queue
        this.taskQueue.unshift(task);
        break;
      }

      this.assignTask(task, agent);
    }
  }

  /**
   * Select best agent for task
   */
  private selectAgent(task: Task): AgentInstance | null {
    const idleAgents = Array.from(this.agents.values()).filter((a) => a.status === "idle");

    if (idleAgents.length === 0) return null;

    // Filter by capabilities if required
    let candidates = idleAgents;
    if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
      candidates = idleAgents.filter((agent) =>
        task.requiredCapabilities!.every((req) =>
          agent.capabilities.some((cap) => cap.name === req),
        ),
      );
    }

    if (candidates.length === 0) return null;

    switch (this.config.distributionStrategy) {
      case "round-robin": {
        const agent = candidates[this.roundRobinIndex % candidates.length];
        this.roundRobinIndex++;
        return agent;
      }

      case "least-loaded":
        return candidates.reduce((best, current) =>
          current.completedTasks < best.completedTasks ? current : best,
        );

      case "capability-based":
        // Pick agent with highest capability match score
        return candidates.reduce((best, current) => {
          const currentScore = this.calculateCapabilityScore(current, task);
          const bestScore = this.calculateCapabilityScore(best, task);
          return currentScore > bestScore ? current : best;
        });

      default:
        return candidates[0];
    }
  }

  /**
   * Calculate capability match score
   */
  private calculateCapabilityScore(agent: AgentInstance, task: Task): number {
    if (!task.requiredCapabilities) return 0;

    let score = 0;
    for (const req of task.requiredCapabilities) {
      const cap = agent.capabilities.find((c) => c.name === req);
      if (cap) {
        score += cap.level === "expert" ? 3 : cap.level === "intermediate" ? 2 : 1;
      }
    }

    return score;
  }

  /**
   * Assign task to agent
   */
  private assignTask(task: Task, agent: AgentInstance): void {
    agent.status = "busy";
    agent.currentTask = task.id;
    agent.idleSince = undefined;

    this.runningTasks.set(task.id, {
      task,
      agentId: agent.id,
      startedAt: Date.now(),
    });

    this.emit("task:started", { task, agent });
    this.config.onAgentStatusChange?.(agent.id, "busy");

    // Simulate task execution (actual implementation would call agent)
    this.executeTask(task, agent);
  }

  /**
   * Execute task on agent (placeholder)
   */
  private async executeTask(task: Task, agent: AgentInstance): Promise<void> {
    const startTime = Date.now();
    let retries = 0;

    const execute = async (): Promise<TaskResult> => {
      try {
        // Placeholder - actual implementation would call agent.execute()
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));

        return {
          taskId: task.id,
          agentId: agent.id,
          status: "success",
          data: { executed: true },
          duration: Date.now() - startTime,
          retries,
          completedAt: Date.now(),
        };
      } catch (error) {
        if (retries < task.maxRetries) {
          retries++;
          return execute();
        }

        return {
          taskId: task.id,
          agentId: agent.id,
          status: "failure",
          error: error instanceof Error ? error.message : "Unknown error",
          duration: Date.now() - startTime,
          retries,
          completedAt: Date.now(),
        };
      }
    };

    const result = await execute();
    this.completeTask(task.id, result);
  }

  /**
   * Complete a task
   */
  private completeTask(taskId: string, result: TaskResult): void {
    const running = this.runningTasks.get(taskId);
    if (!running) return;

    const agent = this.agents.get(running.agentId);
    if (agent) {
      agent.status = "idle";
      agent.currentTask = undefined;
      agent.idleSince = Date.now();

      if (result.status === "success") {
        agent.completedTasks++;
      } else {
        agent.failedTasks++;
      }

      this.config.onAgentStatusChange?.(agent.id, "idle");
    }

    this.runningTasks.delete(taskId);
    this.taskResults.set(taskId, result);

    // Resolve waiting promise
    const promise = this.taskPromises.get(taskId);
    if (promise) {
      if (result.status === "success") {
        promise.resolve(result);
      } else {
        promise.reject(new Error(result.error || "Task failed"));
      }
      this.taskPromises.delete(taskId);
    }

    this.emit("task:completed", result);
    this.config.onTaskComplete?.(result);

    // Process more tasks
    this.processQueue();
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string, reason: string): void {
    const running = this.runningTasks.get(taskId);
    if (running) {
      const result: TaskResult = {
        taskId,
        agentId: running.agentId,
        status: "cancelled",
        error: reason,
        duration: Date.now() - running.startedAt,
        retries: 0,
        completedAt: Date.now(),
      };

      this.completeTask(taskId, result);
    }
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    this.taskQueue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * Check if there's an idle agent
   */
  private hasIdleAgent(): boolean {
    return Array.from(this.agents.values()).some((a) => a.status === "idle");
  }

  /**
   * Check if task is currently running
   */
  private isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  /**
   * Count running tasks
   */
  private runningCount(): number {
    return this.runningTasks.size;
  }

  /**
   * Start maintenance loop
   */
  private startMaintenanceLoop(): void {
    this.maintenanceInterval = setInterval(() => {
      this.performMaintenance();
    }, 30000); // Every 30 seconds
  }

  /**
   * Perform maintenance tasks
   */
  private performMaintenance(): void {
    const now = Date.now();

    // Check for idle timeouts
    for (const agent of this.agents.values()) {
      if (
        agent.status === "idle" &&
        agent.idleSince &&
        now - agent.idleSince > this.config.agentIdleTimeout
      ) {
        this.emit("agent:idle-timeout", agent);
        // Could auto-unregister here
      }
    }

    // Check for timed out tasks
    for (const [taskId, running] of this.runningTasks) {
      if (now - running.startedAt > running.task.timeout) {
        this.cancelTask(taskId, "Task timed out");
      }
    }
  }

  /**
   * Get orchestration statistics
   */
  getStats(): OrchestrationStats {
    const agents = Array.from(this.agents.values());
    const results = Array.from(this.taskResults.values());

    const completedResults = results.filter((r) => r.status === "success");
    const avgDuration =
      completedResults.length > 0
        ? completedResults.reduce((sum, r) => sum + r.duration, 0) / completedResults.length
        : 0;

    return {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === "busy").length,
      idleAgents: agents.filter((a) => a.status === "idle").length,
      queueSize: this.taskQueue.length,
      completedTasks: agents.reduce((sum, a) => sum + a.completedTasks, 0),
      failedTasks: agents.reduce((sum, a) => sum + a.failedTasks, 0),
      averageTaskDuration: avgDuration,
      throughput: this.calculateThroughput(),
    };
  }

  /**
   * Calculate throughput (tasks per minute)
   */
  private calculateThroughput(): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recentTasks = Array.from(this.taskResults.values()).filter(
      (r) => r.completedAt > oneMinuteAgo,
    );
    return recentTasks.length;
  }

  /**
   * Get all agents
   */
  getAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get task queue
   */
  getQueue(): Task[] {
    return [...this.taskQueue];
  }

  /**
   * Get task result
   */
  getResult(taskId: string): TaskResult | undefined {
    return this.taskResults.get(taskId);
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    // Stop maintenance loop
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
    }

    // Cancel all running tasks
    for (const [taskId] of this.runningTasks) {
      this.cancelTask(taskId, "Orchestrator shutting down");
    }

    // Clear queue
    for (const task of this.taskQueue) {
      const promise = this.taskPromises.get(task.id);
      if (promise) {
        promise.reject(new Error("Orchestrator shutting down"));
      }
    }
    this.taskQueue = [];

    this.emit("shutdown");
  }
}

/**
 * Convenience function
 */
export function createMultiAgentOrchestrator(
  config?: Partial<MultiAgentConfig>,
): MultiAgentOrchestrator {
  return new MultiAgentOrchestrator(config);
}
