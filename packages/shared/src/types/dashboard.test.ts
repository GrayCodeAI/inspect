import { describe, it, expect } from "vitest";
import type {
  DashboardEvent,
  DashboardRunState,
  DashboardSummary,
  DashboardSnapshot,
  DashboardCommand,
  DashboardSpawnConfig,
  DashboardLogEntry,
  DashboardStepSnapshot,
  DashboardAgentActivity,
  AgentActivityType,
} from "./dashboard.js";

describe("Dashboard types", () => {
  it("DashboardRunState has all required fields", () => {
    const run: DashboardRunState = {
      runId: "run-1",
      testName: "Test login",
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
    };
    expect(run.runId).toBe("run-1");
    expect(run.status).toBe("running");
  });

  it("DashboardEvent discriminated union works", () => {
    const events: DashboardEvent[] = [
      { type: "run:started", data: { runId: "1", testName: "", device: "", browser: "", agent: "", status: "queued", phase: "planning", currentStep: 0, totalSteps: 0, steps: [], tokenCount: 0, elapsed: 0, logs: [], startedAt: 0 } },
      { type: "run:progress", data: { runId: "1", phase: "executing", currentStep: 1, totalSteps: 5, tokenCount: 50, elapsed: 1000 } },
      { type: "run:step_completed", data: { runId: "1", step: { index: 0, description: "Navigate", status: "pass" } } },
      { type: "run:screenshot", data: { runId: "1", screenshot: "base64", timestamp: 0 } },
      { type: "run:log", data: { runId: "1", level: "info", message: "ok", timestamp: 0 } },
      { type: "run:completed", data: { runId: "1", status: "completed", duration: 5000, passed: true } },
      { type: "summary:updated", data: { totalRuns: 1, completed: 1, passed: 1, failed: 0, running: 0, queued: 0, elapsed: 5000 } },
    ];
    expect(events).toHaveLength(7);
    expect(events[0].type).toBe("run:started");
  });

  it("DashboardCommand discriminated union works", () => {
    const cmds: DashboardCommand[] = [
      { type: "spawn_run", config: { instruction: "test", devices: ["desktop-chrome"] } },
      { type: "cancel_run", runId: "run-1" },
      { type: "cancel_all" },
    ];
    expect(cmds).toHaveLength(3);
  });

  it("DashboardSnapshot contains runs and summary", () => {
    const snap: DashboardSnapshot = {
      runs: [],
      summary: { totalRuns: 0, completed: 0, passed: 0, failed: 0, running: 0, queued: 0, elapsed: 0 },
    };
    expect(snap.runs).toHaveLength(0);
    expect(snap.summary.totalRuns).toBe(0);
  });

  it("AgentActivityType covers all activities", () => {
    const types: AgentActivityType[] = [
      "navigating", "clicking", "typing", "scrolling",
      "waiting", "thinking", "verifying", "capturing",
    ];
    expect(types).toHaveLength(8);
  });

  it("DashboardLogEntry has required fields", () => {
    const entry: DashboardLogEntry = {
      runId: "run-1",
      level: "error",
      message: "Something failed",
      timestamp: Date.now(),
    };
    expect(entry.level).toBe("error");
  });

  it("DashboardStepSnapshot supports optional fields", () => {
    const minimal: DashboardStepSnapshot = {
      index: 0,
      description: "Navigate",
      status: "pass",
    };
    expect(minimal.duration).toBeUndefined();
    expect(minimal.toolCall).toBeUndefined();

    const full: DashboardStepSnapshot = {
      index: 1,
      description: "Click button",
      status: "fail",
      duration: 1200,
      toolCall: "browser_click(...)",
    };
    expect(full.duration).toBe(1200);
  });

  it("DashboardSpawnConfig has required and optional fields", () => {
    const minimal: DashboardSpawnConfig = {
      instruction: "test login",
      devices: ["desktop-chrome"],
    };
    expect(minimal.url).toBeUndefined();

    const full: DashboardSpawnConfig = {
      instruction: "test checkout",
      url: "https://example.com",
      agent: "gpt",
      mode: "hybrid",
      browser: "firefox",
      devices: ["desktop-chrome", "iphone-15"],
      headed: true,
      a11y: true,
      lighthouse: false,
    };
    expect(full.devices).toHaveLength(2);
  });
});
