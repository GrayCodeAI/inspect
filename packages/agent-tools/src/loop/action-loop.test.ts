import { describe, it, expect, beforeEach } from "vitest";
import { ActionLoopDetector } from "./action-loop.js";

describe("ActionLoopDetector", () => {
  let detector: ActionLoopDetector;

  beforeEach(() => {
    detector = new ActionLoopDetector({ threshold: 3, windowSize: 10, maxNudges: 2 });
  });

  it("does not detect loop with few actions", () => {
    detector.record("click", "Play");
    detector.record("click", "Play");
    expect(detector.check().detected).toBe(false);
  });

  it("detects loop at threshold", () => {
    detector.record("click", "Play");
    detector.record("click", "Play");
    detector.record("click", "Play");
    const nudge = detector.check();
    expect(nudge.detected).toBe(true);
    expect(nudge.repetitions).toBe(3);
    expect(nudge.repeatedAction).toContain("Play");
    expect(nudge.message).toBeTruthy();
  });

  it("does not false-positive on different actions", () => {
    detector.record("click", "Login");
    detector.record("type", "Email");
    detector.record("click", "Submit");
    expect(detector.check().detected).toBe(false);
  });

  it("escalates nudge messages", () => {
    for (let i = 0; i < 3; i++) detector.record("click", "Play");
    const nudge1 = detector.check();
    expect(nudge1.detected).toBe(true);
    expect(nudge1.forceStop).toBe(false);

    detector.record("click", "Play");
    const nudge2 = detector.check();
    expect(nudge2.detected).toBe(true);
    expect(nudge2.forceStop).toBe(false);

    detector.record("click", "Play");
    const nudge3 = detector.check();
    expect(nudge3.forceStop).toBe(true);
  });

  it("resets state", () => {
    for (let i = 0; i < 5; i++) detector.record("click", "Play");
    expect(detector.check().detected).toBe(true);

    detector.reset();
    expect(detector.check().detected).toBe(false);
    expect(detector.getState().actions).toBe(0);
  });

  it("respects window size", () => {
    const small = new ActionLoopDetector({ windowSize: 4, threshold: 3 });
    small.record("click", "A");
    small.record("click", "A");
    small.record("click", "B"); // breaks the streak
    small.record("click", "B");
    small.record("click", "A"); // only 1 "A" in window now
    expect(small.check().detected).toBe(false);
  });

  it("getState reports correctly", () => {
    detector.record("click", "A");
    detector.record("click", "B");
    const state = detector.getState();
    expect(state.actions).toBe(2);
    expect(state.nudges).toBe(0);
  });
});
