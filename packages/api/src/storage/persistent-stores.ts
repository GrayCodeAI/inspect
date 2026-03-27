// ============================================================================
// @inspect/api - Persistent Store Implementations
// ============================================================================

import { generateId } from "@inspect/shared";
import type { Task, WorkflowDefinition, WorkflowRun } from "@inspect/shared";
import type { TaskStore } from "../routes/tasks.js";
import type { WorkflowStore } from "../routes/workflows.js";
import type { SessionManager, BrowserSession } from "../routes/sessions.js";
import { JsonStore } from "./json-store.js";

// ── Persistent Task Store ──────────────────────────────────────────────────

/**
 * File-backed task store. Tasks persist across server restarts.
 */
export class PersistentTaskStore implements TaskStore {
  private store: JsonStore<Task>;
  private cancelledTasks: Set<string> = new Set();
  private executor?: (task: Task) => Promise<void>;

  constructor(dataDir: string, executor?: (task: Task) => Promise<void>) {
    this.store = new JsonStore<Task>(dataDir, "tasks");
    this.executor = executor;

    // Restore cancelled set from persisted data
    for (const task of this.store.list()) {
      if (task.status === "cancelled") {
        this.cancelledTasks.add(task.id);
      }
      // Mark any previously "running" tasks as failed (server crashed)
      if (task.status === "running" || task.status === "queued") {
        task.status = "failed";
        task.error = "Server restarted during execution";
        task.completedAt = Date.now();
        this.store.set(task.id, task);
      }
    }
  }

  setExecutor(executor: (task: Task) => Promise<void>): void {
    this.executor = executor;
  }

  get(id: string): Task | undefined {
    return this.store.get(id);
  }

  set(id: string, task: Task): void {
    this.store.set(id, task);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  list(): Task[] {
    return this.store.list();
  }

  async execute(id: string): Promise<void> {
    const task = this.store.get(id);
    if (!task) throw new Error("Task not found");

    task.status = "running";
    task.startedAt = Date.now();
    this.store.set(id, task);

    if (this.executor) {
      try {
        await this.executor(task);
        // Persist final state
        this.store.set(id, task);
      } catch (err) {
        task.status = "failed";
        task.error = err instanceof Error ? err.message : String(err);
        task.completedAt = Date.now();
        this.store.set(id, task);
        throw err;
      }
    } else {
      if (!this.cancelledTasks.has(id)) {
        task.status = "completed";
        task.completedAt = Date.now();
        this.store.set(id, task);
      }
    }
  }

  cancel(id: string): void {
    this.cancelledTasks.add(id);
    const task = this.store.get(id);
    if (task) {
      task.status = "cancelled";
      task.completedAt = Date.now();
      this.store.set(id, task);
    }
  }
}

// ── Persistent Workflow Store ──────────────────────────────────────────────

/**
 * File-backed workflow and run store.
 */
export class PersistentWorkflowStore implements WorkflowStore {
  private workflows: JsonStore<WorkflowDefinition>;
  private runs: JsonStore<WorkflowRun>;
  private workflowExecutor?: (workflow: WorkflowDefinition, params?: Record<string, unknown>) => Promise<WorkflowRun>;

  constructor(
    dataDir: string,
    executor?: (workflow: WorkflowDefinition, params?: Record<string, unknown>) => Promise<WorkflowRun>,
  ) {
    this.workflows = new JsonStore<WorkflowDefinition>(dataDir, "workflows");
    this.runs = new JsonStore<WorkflowRun>(dataDir, "workflow-runs");
    this.workflowExecutor = executor;

    // Mark any previously running runs as failed
    for (const run of this.runs.list()) {
      if (run.status === "running") {
        run.status = "failed";
        run.error = "Server restarted during execution";
        run.completedAt = Date.now();
        this.runs.set(run.id, run);
      }
    }
  }

  setExecutor(
    executor: (workflow: WorkflowDefinition, params?: Record<string, unknown>) => Promise<WorkflowRun>,
  ): void {
    this.workflowExecutor = executor;
  }

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  setWorkflow(id: string, workflow: WorkflowDefinition): void {
    this.workflows.set(id, workflow);
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  listWorkflows(): WorkflowDefinition[] {
    return this.workflows.list();
  }

  getRun(id: string): WorkflowRun | undefined {
    return this.runs.get(id);
  }

  setRun(id: string, run: WorkflowRun): void {
    this.runs.set(id, run);
  }

  listRuns(workflowId?: string): WorkflowRun[] {
    if (workflowId) {
      return this.runs.filter((r) => r.workflowId === workflowId);
    }
    return this.runs.list();
  }

  async executeWorkflow(id: string, params?: Record<string, unknown>): Promise<WorkflowRun> {
    const workflow = this.workflows.get(id);
    if (!workflow) throw new Error("Workflow not found");

    if (this.workflowExecutor) {
      const run = await this.workflowExecutor(workflow, params);
      this.runs.set(run.id, run);
      return run;
    }

    // Default: create a run record
    const run: WorkflowRun = {
      id: generateId(),
      workflowId: id,
      status: "completed",
      parameters: params ?? {},
      blockResults: {},
      startedAt: Date.now(),
      completedAt: Date.now(),
      duration: 0,
    };

    this.runs.set(run.id, run);
    return run;
  }

  cancelRun(runId: string): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = "cancelled";
      run.completedAt = Date.now();
      this.runs.set(runId, run);
    }
  }

  continueRun(runId: string, _data?: unknown): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = "running";
      this.runs.set(runId, run);
    }
  }
}

// ── Persistent Session Manager ─────────────────────────────────────────────

/**
 * File-backed session manager. Sessions persist for history/analytics.
 */
export class PersistentSessionManager implements SessionManager {
  private store: JsonStore<BrowserSession>;

  constructor(dataDir: string) {
    this.store = new JsonStore<BrowserSession>(dataDir, "sessions");

    // Mark any previously active sessions as closed (server restarted)
    for (const session of this.store.list()) {
      if (session.status === "active" || session.status === "idle") {
        session.status = "closed";
        this.store.set(session.id, session);
      }
    }
  }

  async create(options?: Record<string, unknown>): Promise<BrowserSession> {
    const session: BrowserSession = {
      id: generateId(),
      status: "active",
      browserType: (options?.browserType as string) ?? "chromium",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      metadata: options,
    };

    this.store.set(session.id, session);
    return session;
  }

  get(id: string): BrowserSession | undefined {
    return this.store.get(id);
  }

  list(): BrowserSession[] {
    return this.store.list();
  }

  async close(id: string): Promise<boolean> {
    const session = this.store.get(id);
    if (!session) return false;
    session.status = "closed";
    this.store.set(id, session);
    return true;
  }
}
