import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { DashboardOrchestrator } from "./dashboard.js";

describe("DashboardOrchestrator", () => {
  let orchestrator: DashboardOrchestrator;

  beforeEach(() => {
    orchestrator = new DashboardOrchestrator({
      bus: new (class {
        events: any[] = [];
        emit(event: any) {
          this.events.push(event);
        }
        on() {}
        onAny() {}
      })(),
    });
  });

  describe("constructor", () => {
    it("should initialize with default state", () => {
      expect(orchestrator).toBeInstanceOf(DashboardOrchestrator);
    });
  });

  describe("getSnapshot", () => {
    it("should return a snapshot of current dashboard state", async () => {
      const snapshot = await Effect.runPromise(orchestrator.getSnapshot());
      expect(snapshot).toBeInstanceOf(Object);
      expect(snapshot).toHaveProperty("runs");
      expect(snapshot).toHaveProperty("summary");
      expect(snapshot).toHaveProperty("flakiness");
    });
  });

  describe("getRun", () => {
    it("should return run state if exists", async () => {
      const runId = "test-run";
      orchestrator["runs"].set(runId, {
        runId,
        status: "queued" as const,
        phase: "planning" as const,
        currentStep: 0,
        totalSteps: 0,
        tokenCount: 0,
        elapsed: 0,
        steps: [],
        logs: [],
      });

      const run = await Effect.runPromise(orchestrator.getRun(runId));
      expect(run).toBeDefined();
      expect(run?.runId).toEqual(runId);
    });

    it("should return undefined if run doesn't exist", async () => {
      const run = await Effect.runPromise(orchestrator.getRun("nonexistent"));
      expect(run).toBeUndefined();
    });
  });

  describe("spawnRuns", () => {
    it("should create runs for multiple devices", async () => {
      const runs = await Effect.runPromise(
        orchestrator.spawnRuns({
          instruction: "Test login",
          url: "http://example.com",
          devices: [
            { name: "desktop", viewport: { width: 1920, height: 1080 } },
            { name: "mobile", viewport: { width: 375, height: 667 } },
          ],
          agent: "claude",
          mode: "dom",
          browser: "chromium",
        }),
      );
      expect(runs).toHaveLength(2);
      expect(runs[0]).toContain("run_");
      expect(runs[1]).toContain("run_");
    });

    it("should emit run:started event", async () => {
      const events: any[] = [];
      orchestrator.on("run:started", (event) => events.push(event));

      await Effect.runPromise(
        orchestrator.spawnRuns({
          instruction: "Test login",
          url: "http://example.com",
          devices: [{ name: "desktop", viewport: { width: 1920, height: 1080 } }],
          agent: "claude",
          mode: "dom",
          browser: "chromium",
        }),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toEqual("run:started");
      expect(events[0].data).toHaveProperty("runId");
    });
  });

  describe("cancelRun", () => {
    it("should cancel a specific run", async () => {
      const runId = "test-run";
      orchestrator["runs"].set(runId, {
        runId,
        status: "running",
        phase: "executing",
        currentStep: 1,
        totalSteps: 10,
        tokenCount: 500,
        elapsed: 1000,
        steps: [],
        logs: [],
      });

      const success = await Effect.runPromise(orchestrator.cancelRun(runId));
      expect(success).toBe(true);

      const run = orchestrator["runs"].get(runId);
      expect(run?.status).toEqual("cancelled");
    });

    it("should return false if run doesn't exist or already completed", async () => {
      const success1 = await Effect.runPromise(orchestrator.cancelRun("nonexistent"));
      expect(success1).toBe(false);

      orchestrator["runs"].set("completed-run", {
        runId: "completed-run",
        status: "completed",
        phase: "done",
        currentStep: 10,
        totalSteps: 10,
        tokenCount: 1000,
        elapsed: 2000,
        steps: [],
        logs: [],
      });

      const success2 = await Effect.runPromise(orchestrator.cancelRun("completed-run"));
      expect(success2).toBe(false);
    });
  });

  describe("cancelAll", () => {
    it("should cancel all active runs", async () => {
      orchestrator["runs"].set("run1", {
        runId: "run1",
        status: "running",
        phase: "executing",
        currentStep: 1,
        totalSteps: 10,
        tokenCount: 500,
        elapsed: 1000,
        steps: [],
        logs: [],
      });
      orchestrator["runs"].set("run2", {
        runId: "run2",
        status: "queued",
        phase: "planning",
        currentStep: 0,
        totalSteps: 5,
        tokenCount: 0,
        elapsed: 0,
        steps: [],
        logs: [],
      });

      await Effect.runPromise(orchestrator.cancelAll());

      expect(orchestrator["runs"].get("run1")?.status).toEqual("cancelled");
      expect(orchestrator["runs"].get("run2")?.status).toEqual("cancelled");
    });
  });

  describe("clearCompleted", () => {
    it("should remove completed and failed runs from state", async () => {
      orchestrator["runs"].set("completed-run", {
        runId: "completed-run",
        status: "completed",
        phase: "done",
        currentStep: 10,
        totalSteps: 10,
        tokenCount: 1000,
        elapsed: 2000,
        steps: [],
        logs: [],
      });
      orchestrator["runs"].set("failed-run", {
        runId: "failed-run",
        status: "failed",
        phase: "done",
        currentStep: 5,
        totalSteps: 10,
        tokenCount: 500,
        elapsed: 1500,
        steps: [],
        logs: [],
      });
      orchestrator["runs"].set("queued-run", {
        runId: "queued-run",
        status: "queued",
        phase: "planning",
        currentStep: 0,
        totalSteps: 5,
        tokenCount: 0,
        elapsed: 0,
        steps: [],
        logs: [],
      });

      await Effect.runPromise(orchestrator.clearCompleted());

      expect(orchestrator["runs"].size).toEqual(1);
      expect(orchestrator["runs"].get("queued-run")).toBeDefined();
    });
  });

  describe("getSnapshot", () => {
    it("should include flakiness report", async () => {
      const snapshot = await Effect.runPromise(orchestrator.getSnapshot());
      expect(snapshot.flakiness).toBeInstanceOf(Object);
      expect(snapshot.flakiness).toHaveProperty("totalTests");
      expect(snapshot.flakiness).toHaveProperty("stableTests");
      expect(snapshot.flakiness).toHaveProperty("flakyTests");
      expect(snapshot.flakiness).toHaveProperty("brokenTests");
    });
  });
});
