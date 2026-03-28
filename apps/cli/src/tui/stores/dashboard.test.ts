import { describe, it, expect, beforeEach } from "vitest";
import { useDashboardStore } from "./dashboard.js";
import type { DashboardEvent, DashboardRunState } from "@inspect/shared";

function makeRun(overrides: Partial<DashboardRunState> = {}): DashboardRunState {
  return {
    runId: `run_${Math.random().toString(36).slice(2, 6)}`,
    testName: "Test login flow",
    device: "desktop-chrome",
    browser: "chromium",
    agent: "claude",
    status: "running",
    phase: "executing",
    currentStep: 1,
    totalSteps: 5,
    steps: [],
    tokenCount: 100,
    elapsed: 5000,
    logs: [],
    startedAt: Date.now(),
    ...overrides,
  };
}

describe("useDashboardStore", () => {
  beforeEach(() => {
    useDashboardStore.getState().reset();
  });

  it("starts with empty state", () => {
    const state = useDashboardStore.getState();
    expect(state.runs.size).toBe(0);
    expect(state.logs).toHaveLength(0);
    expect(state.summary.totalRuns).toBe(0);
  });

  it("handles run:started event", () => {
    const run = makeRun({ runId: "run-1" });
    const event: DashboardEvent = { type: "run:started", data: run };

    useDashboardStore.getState().handleEvent(event);

    const state = useDashboardStore.getState();
    expect(state.runs.size).toBe(1);
    expect(state.runs.get("run-1")?.testName).toBe("Test login flow");
  });

  it("handles run:progress event", () => {
    const run = makeRun({ runId: "run-1" });
    useDashboardStore.getState().handleEvent({ type: "run:started", data: run });

    useDashboardStore.getState().handleEvent({
      type: "run:progress",
      data: {
        runId: "run-1",
        phase: "verifying",
        currentStep: 4,
        totalSteps: 5,
        tokenCount: 500,
        elapsed: 12000,
      },
    });

    const updated = useDashboardStore.getState().runs.get("run-1");
    expect(updated?.phase).toBe("verifying");
    expect(updated?.currentStep).toBe(4);
    expect(updated?.tokenCount).toBe(500);
  });

  it("handles run:completed event", () => {
    const run = makeRun({ runId: "run-1" });
    useDashboardStore.getState().handleEvent({ type: "run:started", data: run });

    useDashboardStore.getState().handleEvent({
      type: "run:completed",
      data: { runId: "run-1", status: "completed", duration: 15000, passed: true },
    });

    const completed = useDashboardStore.getState().runs.get("run-1");
    expect(completed?.status).toBe("completed");
    expect(completed?.phase).toBe("done");
  });

  it("handles run:log event", () => {
    useDashboardStore.getState().handleEvent({
      type: "run:log",
      data: { runId: "run-1", level: "info", message: "Step 1 passed", timestamp: Date.now() },
    });

    const state = useDashboardStore.getState();
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].message).toBe("Step 1 passed");
  });

  it("handles run:step_completed event", () => {
    const run = makeRun({ runId: "run-1", steps: [{ index: 0, description: "Navigate", status: "running" }] });
    useDashboardStore.getState().handleEvent({ type: "run:started", data: run });

    useDashboardStore.getState().handleEvent({
      type: "run:step_completed",
      data: { runId: "run-1", step: { index: 0, description: "Navigate", status: "pass", duration: 1200 } },
    });

    const updated = useDashboardStore.getState().runs.get("run-1");
    expect(updated?.steps[0].status).toBe("pass");
    expect(updated?.steps[0].duration).toBe(1200);
  });

  it("handles run:screenshot event", () => {
    const run = makeRun({ runId: "run-1" });
    useDashboardStore.getState().handleEvent({ type: "run:started", data: run });

    useDashboardStore.getState().handleEvent({
      type: "run:screenshot",
      data: { runId: "run-1", screenshot: "base64data", timestamp: Date.now() },
    });

    const updated = useDashboardStore.getState().runs.get("run-1");
    expect(updated?.screenshot).toBe("base64data");
  });

  it("handles summary:updated event", () => {
    useDashboardStore.getState().handleEvent({
      type: "summary:updated",
      data: { totalRuns: 10, completed: 5, passed: 4, failed: 1, running: 3, queued: 2, elapsed: 30000 },
    });

    const state = useDashboardStore.getState();
    expect(state.summary.totalRuns).toBe(10);
    expect(state.summary.passed).toBe(4);
    expect(state.summary.running).toBe(3);
  });

  it("caps logs at 500 entries", () => {
    const { handleEvent } = useDashboardStore.getState();
    for (let i = 0; i < 520; i++) {
      handleEvent({
        type: "run:log",
        data: { runId: "run-1", level: "info", message: `log ${i}`, timestamp: Date.now() },
      });
    }

    const state = useDashboardStore.getState();
    expect(state.logs.length).toBe(500);
    // Should have the latest entries
    expect(state.logs[499].message).toBe("log 519");
  });

  it("selectRun updates selectedRunId", () => {
    useDashboardStore.getState().selectRun("run-1");
    expect(useDashboardStore.getState().selectedRunId).toBe("run-1");

    useDashboardStore.getState().selectRun(null);
    expect(useDashboardStore.getState().selectedRunId).toBeNull();
  });

  it("reset clears all state", () => {
    const run = makeRun({ runId: "run-1" });
    useDashboardStore.getState().handleEvent({ type: "run:started", data: run });
    useDashboardStore.getState().handleEvent({
      type: "run:log",
      data: { runId: "run-1", level: "info", message: "test", timestamp: Date.now() },
    });
    useDashboardStore.getState().selectRun("run-1");

    useDashboardStore.getState().reset();

    const state = useDashboardStore.getState();
    expect(state.runs.size).toBe(0);
    expect(state.logs).toHaveLength(0);
    expect(state.selectedRunId).toBeNull();
  });

  it("ignores progress for unknown runs", () => {
    // Should not throw
    useDashboardStore.getState().handleEvent({
      type: "run:progress",
      data: {
        runId: "nonexistent",
        phase: "executing",
        currentStep: 1,
        totalSteps: 5,
        tokenCount: 100,
        elapsed: 1000,
      },
    });

    expect(useDashboardStore.getState().runs.size).toBe(0);
  });
});
