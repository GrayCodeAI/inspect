import { describe, it, expect, vi, beforeEach } from "vitest";
import { WatchEngine } from "./watch-engine.js";

describe("WatchEngine", () => {
  let engine: WatchEngine;

  beforeEach(() => {
    engine = new WatchEngine({
      cwd: process.cwd(),
      pollIntervalMs: 1000,
      settleDelayMs: 500,
    });
  });

  it("should initialize with idle state", () => {
    const state = engine.getState();
    expect(state.status).toBe("idle");
    expect(state.lastRunId).toBe(0);
    expect(state.pendingRerun).toBe(false);
  });

  it("should register event listeners", () => {
    const handler = vi.fn();
    engine.on("polling", handler);
    engine.emit({ type: "polling", timestamp: Date.now() });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should register wildcard listeners", () => {
    const handler = vi.fn();
    engine.on("*", handler);
    engine.emit({ type: "stopped", timestamp: Date.now() });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should set status to stopped on stop", () => {
    engine.stop();
    expect(engine.getState().status).toBe("stopped");
  });
});
