import { describe, it, expect, beforeEach } from "vitest";
import { LoopDetector } from "./detector.js";

describe("LoopDetector", () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  describe("no loop scenarios", () => {
    it("returns no loop with fewer than 4 actions", () => {
      detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      detector.record({ type: "type", ref: "e2", url: "https://example.com" });
      const result = detector.detectLoop();
      expect(result.detected).toBe(false);
    });

    it("returns no loop with diverse actions", () => {
      const actions = [
        { type: "click", ref: "e1", url: "https://example.com" },
        { type: "type", ref: "e2", value: "hello", url: "https://example.com" },
        { type: "navigate", url: "https://example.com/page2" },
        { type: "click", ref: "e3", url: "https://example.com/page2" },
        { type: "scroll", url: "https://example.com/page2" },
        { type: "click", ref: "e4", url: "https://example.com/page2" },
      ];
      for (const action of actions) {
        detector.record(action);
      }
      const result = detector.detectLoop();
      expect(result.detected).toBe(false);
    });
  });

  describe("stuck detection", () => {
    it("detects when the same action repeats 3+ times", () => {
      const action = { type: "click", ref: "e1", url: "https://example.com" };
      // Need at least 4 records for detectLoop to analyze (it checks history.length < 4)
      detector.record(action);
      detector.record(action);
      detector.record(action);
      detector.record(action);
      const result = detector.detectLoop();
      expect(result.detected).toBe(true);
      expect(result.loopType).toBe("stuck");
      expect(result.repetitions).toBeGreaterThanOrEqual(3);
    });

    it("detects stuck with 5 repetitions", () => {
      for (let i = 0; i < 5; i++) {
        detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      }
      const result = detector.detectLoop();
      expect(result.detected).toBe(true);
      expect(result.loopType).toBe("stuck");
      expect(result.repetitions).toBe(5);
    });
  });

  describe("oscillating detection", () => {
    it("detects A -> B -> A -> B pattern", () => {
      const actionA = { type: "click", ref: "e1", url: "https://example.com/page1" };
      const actionB = { type: "click", ref: "e2", url: "https://example.com/page2" };
      detector.record(actionA);
      detector.record(actionB);
      detector.record(actionA);
      detector.record(actionB);
      const result = detector.detectLoop();
      expect(result.detected).toBe(true);
      expect(result.loopType).toBe("oscillating");
    });
  });

  describe("getNudge", () => {
    it("returns informational nudge when no loop detected", () => {
      const nudge = detector.getNudge();
      expect(nudge.severity).toBe("info");
      expect(nudge.message).toContain("No loop detected");
      expect(nudge.suggestions).toEqual([]);
    });

    it("returns non-empty suggestions when stuck loop is detected", () => {
      for (let i = 0; i < 4; i++) {
        detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      }
      detector.detectLoop();
      const nudge = detector.getNudge();
      expect(nudge.message).toBeTruthy();
      expect(nudge.message.length).toBeGreaterThan(0);
      expect(nudge.suggestions.length).toBeGreaterThan(0);
    });

    it("escalates severity after multiple loop detections", () => {
      // Trigger first loop (need 4+ for detectLoop to analyze)
      for (let i = 0; i < 4; i++) {
        detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      }
      detector.detectLoop();

      // Trigger second loop
      for (let i = 0; i < 4; i++) {
        detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      }
      detector.detectLoop();

      const nudge = detector.getNudge();
      expect(["warning", "critical"]).toContain(nudge.severity);
    });
  });

  describe("reset", () => {
    it("clears all history and detection state", () => {
      for (let i = 0; i < 5; i++) {
        detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      }
      detector.detectLoop();
      expect(detector.getLoopCount()).toBeGreaterThan(0);
      expect(detector.getHistory().length).toBeGreaterThan(0);

      detector.reset();
      expect(detector.getLoopCount()).toBe(0);
      expect(detector.getHistory().length).toBe(0);

      const result = detector.detectLoop();
      expect(result.detected).toBe(false);
    });
  });

  describe("getHistory", () => {
    it("returns a copy of the action history", () => {
      detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      detector.record({ type: "type", ref: "e2", value: "hi", url: "https://example.com" });

      const history = detector.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].type).toBe("click");
      expect(history[1].type).toBe("type");
      expect(history[1].value).toBe("hi");

      // Verify it is a copy
      history.push({
        type: "noop",
        url: "https://example.com",
        timestamp: 0,
      });
      expect(detector.getHistory().length).toBe(2);
    });
  });

  describe("record", () => {
    it("adds timestamp and hash to recorded actions", () => {
      detector.record({ type: "click", ref: "e1", url: "https://example.com" });
      const history = detector.getHistory();
      expect(history[0].timestamp).toBeGreaterThan(0);
      expect(history[0].hash).toBeTruthy();
    });
  });
});
