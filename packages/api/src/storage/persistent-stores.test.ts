import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PersistentTaskStore,
  PersistentWorkflowStore,
  PersistentSessionManager,
} from "./persistent-stores.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("PersistentTaskStore", () => {
  let testDir: string;
  let store: PersistentTaskStore;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `task-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    store = new PersistentTaskStore(testDir);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("creates and retrieves tasks", () => {
    const task = {
      id: "task-1",
      status: "queued" as const,
      definition: { prompt: "test", url: "https://example.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    };
    store.set("task-1", task);
    expect(store.get("task-1")).toEqual(task);
  });

  it("lists all tasks", () => {
    store.set("t1", {
      id: "t1",
      status: "queued" as const,
      definition: { prompt: "a", url: "https://a.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });
    store.set("t2", {
      id: "t2",
      status: "completed" as const,
      definition: { prompt: "b", url: "https://b.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });
    expect(store.list()).toHaveLength(2);
  });

  it("cancels tasks", () => {
    store.set("t1", {
      id: "t1",
      status: "running" as const,
      definition: { prompt: "a", url: "https://a.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });
    store.cancel("t1");
    expect(store.get("t1")?.status).toBe("cancelled");
  });

  it("executes tasks with default executor", async () => {
    store.set("t1", {
      id: "t1",
      status: "queued" as const,
      definition: { prompt: "a", url: "https://a.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });
    await store.execute("t1");
    expect(store.get("t1")?.status).toBe("completed");
  });

  it("marks stale running tasks as failed on reload", async () => {
    store.set("t1", {
      id: "t1",
      status: "running" as const,
      definition: { prompt: "a", url: "https://a.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });

    // Wait for microtask save to complete
    await new Promise((r) => setTimeout(r, 10));

    // Reload from disk
    const store2 = new PersistentTaskStore(testDir);
    expect(store2.get("t1")?.status).toBe("failed");
    expect(store2.get("t1")?.error).toContain("Server restarted");
  });

  it("persists across instances", async () => {
    store.set("t1", {
      id: "t1",
      status: "completed" as const,
      definition: { prompt: "persist", url: "https://a.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });

    // Wait for microtask save to complete
    await new Promise((r) => setTimeout(r, 10));

    const store2 = new PersistentTaskStore(testDir);
    expect(store2.get("t1")?.definition.prompt).toBe("persist");
  });

  it("deletes tasks", () => {
    store.set("t1", {
      id: "t1",
      status: "queued" as const,
      definition: { prompt: "a", url: "https://a.com", maxSteps: 10, maxIterations: 5 },
      createdAt: Date.now(),
    });
    expect(store.delete("t1")).toBe(true);
    expect(store.get("t1")).toBeUndefined();
  });
});

describe("PersistentWorkflowStore", () => {
  let testDir: string;
  let store: PersistentWorkflowStore;

  beforeEach(() => {
    testDir = join(tmpdir(), `wf-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    store = new PersistentWorkflowStore(testDir);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("creates and retrieves workflows", () => {
    const wf = {
      id: "wf-1",
      name: "Test Workflow",
      version: 1,
      status: "draft" as const,
      blocks: [],
      templateEngine: "handlebars" as const,
      strictMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.setWorkflow("wf-1", wf);
    expect(store.getWorkflow("wf-1")?.name).toBe("Test Workflow");
  });

  it("lists workflows", () => {
    store.setWorkflow("wf-1", {
      id: "wf-1",
      name: "A",
      version: 1,
      status: "draft" as const,
      blocks: [],
      templateEngine: "handlebars" as const,
      strictMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    store.setWorkflow("wf-2", {
      id: "wf-2",
      name: "B",
      version: 1,
      status: "active" as const,
      blocks: [],
      templateEngine: "handlebars" as const,
      strictMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(store.listWorkflows()).toHaveLength(2);
  });

  it("deletes workflows", () => {
    store.setWorkflow("wf-1", {
      id: "wf-1",
      name: "A",
      version: 1,
      status: "draft" as const,
      blocks: [],
      templateEngine: "handlebars" as const,
      strictMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(store.deleteWorkflow("wf-1")).toBe(true);
    expect(store.getWorkflow("wf-1")).toBeUndefined();
  });

  it("executes workflows with default executor", async () => {
    store.setWorkflow("wf-1", {
      id: "wf-1",
      name: "A",
      version: 1,
      status: "active" as const,
      blocks: [],
      templateEngine: "handlebars" as const,
      strictMode: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const run = await store.executeWorkflow("wf-1", { key: "val" });
    expect(run.status).toBe("completed");
    expect(run.workflowId).toBe("wf-1");
  });

  it("stores and retrieves runs", () => {
    const run = {
      id: "run-1",
      workflowId: "wf-1",
      status: "completed" as const,
      parameters: {},
      blockResults: {},
      startedAt: Date.now(),
    };
    store.setRun("run-1", run);
    expect(store.getRun("run-1")?.workflowId).toBe("wf-1");
  });

  it("lists runs filtered by workflow", () => {
    store.setRun("r1", {
      id: "r1",
      workflowId: "wf-1",
      status: "completed" as const,
      parameters: {},
      blockResults: {},
      startedAt: Date.now(),
    });
    store.setRun("r2", {
      id: "r2",
      workflowId: "wf-2",
      status: "completed" as const,
      parameters: {},
      blockResults: {},
      startedAt: Date.now(),
    });
    store.setRun("r3", {
      id: "r3",
      workflowId: "wf-1",
      status: "failed" as const,
      parameters: {},
      blockResults: {},
      startedAt: Date.now(),
    });

    expect(store.listRuns("wf-1")).toHaveLength(2);
    expect(store.listRuns("wf-2")).toHaveLength(1);
    expect(store.listRuns()).toHaveLength(3);
  });

  it("cancels runs", () => {
    store.setRun("r1", {
      id: "r1",
      workflowId: "wf-1",
      status: "running" as const,
      parameters: {},
      blockResults: {},
      startedAt: Date.now(),
    });
    store.cancelRun("r1");
    expect(store.getRun("r1")?.status).toBe("cancelled");
  });
});

describe("PersistentSessionManager", () => {
  let testDir: string;
  let manager: PersistentSessionManager;

  beforeEach(() => {
    testDir = join(tmpdir(), `session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    manager = new PersistentSessionManager(testDir);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("creates sessions", async () => {
    const session = await manager.create({ browserType: "chromium" });
    expect(session.id).toBeTruthy();
    expect(session.status).toBe("active");
    expect(session.browserType).toBe("chromium");
  });

  it("retrieves sessions", async () => {
    const session = await manager.create();
    const retrieved = manager.get(session.id);
    expect(retrieved?.id).toBe(session.id);
  });

  it("lists sessions", async () => {
    await manager.create();
    await manager.create();
    expect(manager.list()).toHaveLength(2);
  });

  it("closes sessions", async () => {
    const session = await manager.create();
    const closed = await manager.close(session.id);
    expect(closed).toBe(true);
    expect(manager.get(session.id)?.status).toBe("closed");
  });

  it("returns false for closing nonexistent session", async () => {
    expect(await manager.close("nonexistent")).toBe(false);
  });

  it("marks active sessions as closed on reload", async () => {
    await manager.create();

    const manager2 = new PersistentSessionManager(testDir);
    const sessions = manager2.list();
    expect(sessions.every((s) => s.status === "closed")).toBe(true);
  });
});
