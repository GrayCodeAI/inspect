// ============================================================================
// @inspect/api - Task Routes
// ============================================================================

import { generateId, CreateTaskSchema, validateBody } from "@inspect/shared";
import type { Task, TaskStatus, TaskDefinition } from "@inspect/shared";
import type { APIServer, APIRequest, APIResponse } from "../server.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("api/tasks");

/**
 * Register task routes on the API server.
 *
 * POST /api/tasks         - Create and run a task
 * GET  /api/tasks/:id     - Get task status
 * POST /api/tasks/:id/cancel - Cancel a running task
 * GET  /api/tasks/:id/artifacts - Get task artifacts
 */
export function registerTaskRoutes(server: APIServer, taskStore: TaskStore): void {
  // POST /api/tasks - Create and run a task
  server.post("/api/tasks", async (req: APIRequest, res: APIResponse) => {
    const validation = validateBody(CreateTaskSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { data } = validation;

    const definition: TaskDefinition = {
      prompt: data.prompt,
      url: data.url,
      maxSteps: data.maxSteps,
      maxIterations: data.maxIterations,
      errorCodes: data.errorCodes,
      extractionSchema: data.extractionSchema,
      navigationPayload: data.navigationPayload,
      webhookCallbackUrl: data.webhookCallbackUrl,
      totpCredentialId: data.totpCredentialId,
    };

    const task: Task = {
      id: generateId(),
      status: "queued",
      definition,
      createdAt: Date.now(),
    };

    taskStore.set(task.id, task);

    // Start task execution asynchronously
    taskStore.execute(task.id).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("Task execution failed", { taskId: task.id, error: errMsg });
      const stored = taskStore.get(task.id);
      if (stored) {
        stored.status = "failed";
        stored.error = errMsg;
        stored.completedAt = Date.now();
      }
    });

    res.status(201).json({
      id: task.id,
      status: task.status,
      createdAt: task.createdAt,
    });
  });

  // GET /api/tasks/:id - Get task status
  server.get("/api/tasks/:id", (req: APIRequest, res: APIResponse) => {
    const task = taskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({
      id: task.id,
      status: task.status,
      definition: {
        prompt: task.definition.prompt,
        url: task.definition.url,
        maxSteps: task.definition.maxSteps,
      },
      result: task.result
        ? {
            passed: task.result.status === "passed",
            duration: task.result.duration,
            summary: task.result.summary,
            stepsCompleted: task.result.steps.length,
          }
        : undefined,
      extractedData: task.extractedData,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
    });
  });

  // POST /api/tasks/:id/cancel - Cancel a running task
  server.post("/api/tasks/:id/cancel", (req: APIRequest, res: APIResponse) => {
    const task = taskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (task.status !== "running" && task.status !== "queued") {
      res.status(400).json({
        error: `Cannot cancel task in '${task.status}' state`,
      });
      return;
    }

    task.status = "cancelled" as TaskStatus;
    task.completedAt = Date.now();
    taskStore.cancel(task.id);

    res.json({ id: task.id, status: task.status });
  });

  // GET /api/tasks/:id/artifacts - Get task artifacts
  server.get("/api/tasks/:id/artifacts", (req: APIRequest, res: APIResponse) => {
    const task = taskStore.get(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({
      taskId: task.id,
      artifacts: task.artifacts ?? [],
    });
  });
}

/**
 * Task store interface for managing task lifecycle.
 */
export interface TaskStore {
  get(id: string): Task | undefined;
  set(id: string, task: Task): void;
  delete(id: string): boolean;
  list(): Task[];
  execute(id: string): Promise<void>;
  cancel(id: string): void;
}

/**
 * In-memory task store implementation.
 */
export class InMemoryTaskStore implements TaskStore {
  private tasks: Map<string, Task> = new Map();
  private cancelledTasks: Set<string> = new Set();
  private executor?: (task: Task) => Promise<void>;

  constructor(executor?: (task: Task) => Promise<void>) {
    this.executor = executor;
  }

  setExecutor(executor: (task: Task) => Promise<void>): void {
    this.executor = executor;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  set(id: string, task: Task): void {
    this.tasks.set(id, task);
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  list(): Task[] {
    return Array.from(this.tasks.values());
  }

  async execute(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Task not found");

    task.status = "running";
    task.startedAt = Date.now();

    if (this.executor) {
      await this.executor(task);
    } else {
      // Default: mark as completed after brief delay
      await new Promise((r) => setTimeout(r, 100));
      if (!this.cancelledTasks.has(id)) {
        task.status = "completed";
        task.completedAt = Date.now();
      }
    }
  }

  cancel(id: string): void {
    this.cancelledTasks.add(id);
    const task = this.tasks.get(id);
    if (task) {
      task.status = "cancelled";
      task.completedAt = Date.now();
    }
  }
}
