// ============================================================================
// @inspect/api - Task Routes
// ============================================================================

import { generateId } from "@inspect/shared";
import type { Task, TaskStatus, TaskDefinition } from "@inspect/shared";
import type { APIServer, APIRequest, APIResponse } from "../server.js";

/**
 * Register task routes on the API server.
 *
 * POST /api/tasks         - Create and run a task
 * GET  /api/tasks/:id     - Get task status
 * POST /api/tasks/:id/cancel - Cancel a running task
 * GET  /api/tasks/:id/artifacts - Get task artifacts
 */
export function registerTaskRoutes(
  server: APIServer,
  taskStore: TaskStore,
): void {
  // POST /api/tasks - Create and run a task
  server.post("/api/tasks", async (req: APIRequest, res: APIResponse) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Request body must be a JSON object" });
      return;
    }

    if (!body.prompt || typeof body.prompt !== "string" || !body.prompt.toString().trim()) {
      res.status(400).json({ error: "Missing or empty required field: prompt" });
      return;
    }

    if (!body.url || typeof body.url !== "string") {
      res.status(400).json({ error: "Missing or invalid required field: url" });
      return;
    }

    // Validate URL format
    try {
      const parsed = new URL(String(body.url));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        res.status(400).json({ error: "URL must use http or https protocol" });
        return;
      }
    } catch {
      res.status(400).json({ error: "Invalid URL format" });
      return;
    }

    // Validate and clamp numeric fields
    const maxSteps = Math.min(Math.max(Number(body.maxSteps) || 25, 1), 100);
    const maxIterations = Math.min(Math.max(Number(body.maxIterations) || 10, 1), 50);

    // Validate webhook URL if provided
    if (body.webhookCallbackUrl !== undefined) {
      if (typeof body.webhookCallbackUrl !== "string") {
        res.status(400).json({ error: "webhookCallbackUrl must be a string" });
        return;
      }
      try {
        new URL(body.webhookCallbackUrl);
      } catch {
        res.status(400).json({ error: "Invalid webhookCallbackUrl format" });
        return;
      }
    }

    const definition: TaskDefinition = {
      prompt: String(body.prompt).trim(),
      url: String(body.url),
      maxSteps,
      maxIterations,
      errorCodes: body.errorCodes as Record<string, string> | undefined,
      extractionSchema: body.extractionSchema as Record<string, unknown> | undefined,
      navigationPayload: body.navigationPayload as Record<string, unknown> | undefined,
      webhookCallbackUrl: body.webhookCallbackUrl as string | undefined,
      totpCredentialId: body.totpCredentialId as string | undefined,
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
      const stored = taskStore.get(task.id);
      if (stored) {
        stored.status = "failed";
        stored.error = err instanceof Error ? err.message : String(err);
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
            passed: task.result.passed,
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
  server.post(
    "/api/tasks/:id/cancel",
    (req: APIRequest, res: APIResponse) => {
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
    },
  );

  // GET /api/tasks/:id/artifacts - Get task artifacts
  server.get(
    "/api/tasks/:id/artifacts",
    (req: APIRequest, res: APIResponse) => {
      const task = taskStore.get(req.params.id);
      if (!task) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      res.json({
        taskId: task.id,
        artifacts: task.artifacts ?? [],
      });
    },
  );
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
