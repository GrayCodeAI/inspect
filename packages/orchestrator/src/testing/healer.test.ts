import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { HealingService } from "./healing/healer.js";

describe("HealingService", () => {
  let healer: HealingService;

  beforeEach(() => {
    healer = new HealingService();
  });

  describe("heal", () => {
    it("should attempt to heal a failed step", async () => {
      const result = await Effect.runPromise(
        healer.heal({
          stepIndex: 0,
          failedSelector: "#submit-button",
          alternatives: ["button.submit", "input[type='submit']"],
          context: { url: "http://example.com", screenshot: "base64..." },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("healed", true);
      expect(result).toHaveProperty("healedSelector");
      expect(result).toHaveProperty("confidence");
    });

    it("should return original selector if healing fails", async () => {
      const result = await Effect.runPromise(
        healer.heal({
          stepIndex: 0,
          failedSelector: "#nonexistent",
          alternatives: [],
          context: { url: "http://example.com", screenshot: "base64..." },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.healed).toBe(false);
      expect(result.originalSelector).toEqual("#nonexistent");
    });

    it("should use DOMDiff to identify changes", async () => {
      const result = await Effect.runPromise(
        healer.heal({
          stepIndex: 0,
          failedSelector: "#old-element",
          alternatives: ["#new-element", ".new-class"],
          context: { url: "http://example.com", domSnapshot: "snapshot-data" },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.domChanges).toBeInstanceOf(Array);
      expect(result.domChanges?.length).toBeGreaterThan(0);
    });
  });

  describe("healSelector", () => {
    it("should heal a selector using alternative strategies", async () => {
      const result = await Effect.runPromise(
        healer.healSelector({
          failedSelector: "#submit-button",
          alternatives: ["button.submit", "input[type='submit']"],
          context: { url: "http://example.com", domSnapshot: "snapshot-data" },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.healed).toBe(true);
      expect(result.healedSelector).toBeString();
    });

    it("should fall back to DOMDiff analysis", async () => {
      const result = await Effect.runPromise(
        healer.healSelector({
          failedSelector: "#missing-element",
          alternatives: [],
          context: { url: "http://example.com", domSnapshot: "snapshot-data" },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.domChanges).toBeInstanceOf(Array);
    });
  });

  describe("recoverFromFailure", () => {
    it("should attempt multiple recovery strategies", async () => {
      const result = await Effect.runPromise(
        healer.recoverFromFailure({
          stepIndex: 0,
          failureType: "element_not_found",
          context: { url: "http://example.com", screenshot: "base64..." },
          strategies: ["reScan", "healSelector", "retry"],
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.success).toBe(true);
      expect(result.strategy).toBeString();
      expect(result.healedSelector).toBeString();
    });

    it("should return failure if no strategy succeeds", async () => {
      const result = await Effect.runPromise(
        healer.recoverFromFailure({
          stepIndex: 0,
          failureType: "captcha_detected",
          context: { url: "http://example.com", screenshot: "base64..." },
          strategies: ["skip"], // Skip is the only strategy and it returns false
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.success).toBe(false);
      expect(result.strategy).toEqual("skip");
    });
  });

  describe("getHealingStrategies", () => {
    it("should return appropriate strategies for failure type", async () => {
      const strategies = await Effect.runPromise(healer.getHealingStrategies("element_not_found"));
      expect(strategies).toBeInstanceOf(Array);
      expect(strategies).toContain("reScan");
      expect(strategies).toContain("healSelector");
      expect(strategies).toContain("waitForLoad");
    });

    it("should return empty array for unknown failure type", async () => {
      const strategies = await Effect.runPromise(
        healer.getHealingStrategies("unknown_failure" as any),
      );
      expect(strategies).toHaveLength(0);
    });
  });

  describe("analyzeDOMChanges", () => {
    it("should compare DOM snapshots and identify changes", async () => {
      const changes = await Effect.runPromise(
        healer.analyzeDOMChanges("snapshot-before", "snapshot-after", "#submit-button"),
      );
      expect(changes).toBeInstanceOf(Array);
      expect(changes[0]).toHaveProperty("type");
      expect(changes[0]).toHaveProperty("selector");
      expect(changes[0]).toHaveProperty("oldText");
      expect(changes[0]).toHaveProperty("newText");
    });

    it("should return empty array if no changes detected", async () => {
      const changes = await Effect.runPromise(
        healer.analyzeDOMChanges("snapshot-before", "snapshot-before", "#submit-button"),
      );
      expect(changes).toHaveLength(0);
    });
  });
});
