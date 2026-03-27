import { describe, it, expect } from "vitest";
import { RewardShaper, BuiltinRewards } from "./reward.js";

describe("BuiltinRewards", () => {
  const baseState = {
    stepIndex: 0,
    totalSteps: 5,
    goalComplete: false,
    actions: [],
    url: "https://example.com",
    elements: [],
    previousReward: 0,
  };

  describe("completion", () => {
    it("should return 1.0 when goal complete", () => {
      const reward = BuiltinRewards.completion({ ...baseState, goalComplete: true });
      expect(reward).toBe(1.0);
    });

    it("should return 0.0 when goal not complete", () => {
      const reward = BuiltinRewards.completion({ ...baseState, goalComplete: false });
      expect(reward).toBe(0.0);
    });
  });

  describe("elementInteraction", () => {
    it("should reward successful interactions", () => {
      const state = {
        ...baseState,
        totalSteps: 5,
        actions: [
          { type: "click", success: true, timestamp: 0 },
          { type: "click", success: true, timestamp: 1 },
        ],
      };
      const reward = BuiltinRewards.elementInteraction(state);
      expect(reward).toBeGreaterThan(0);
    });

    it("should return 0 with no actions", () => {
      const reward = BuiltinRewards.elementInteraction({ ...baseState, actions: [] });
      expect(reward).toBe(0);
    });
  });

  describe("efficiency", () => {
    it("should return higher reward for fewer steps when complete", () => {
      const few = BuiltinRewards.efficiency({ ...baseState, goalComplete: true, totalSteps: 2 });
      const many = BuiltinRewards.efficiency({ ...baseState, goalComplete: true, totalSteps: 20 });
      expect(few).toBeGreaterThan(many);
    });

    it("should return 0 when not complete", () => {
      const reward = BuiltinRewards.efficiency({ ...baseState, goalComplete: false });
      expect(reward).toBe(0);
    });
  });

  describe("errorPenalty", () => {
    it("should return 1.0 with no errors", () => {
      const state = {
        ...baseState,
        actions: [{ type: "click", success: true, timestamp: 0 }],
      };
      const reward = BuiltinRewards.errorPenalty(state);
      expect(reward).toBe(1.0);
    });

    it("should reduce reward for errors", () => {
      const state = {
        ...baseState,
        actions: [
          { type: "click", success: false, timestamp: 0 },
          { type: "click", success: false, timestamp: 1 },
        ],
      };
      const reward = BuiltinRewards.errorPenalty(state);
      expect(reward).toBeLessThan(1.0);
    });

    it("should not go below 0", () => {
      const state = {
        ...baseState,
        actions: Array.from({ length: 10 }, (_, i) => ({
          type: "click",
          success: false,
          timestamp: i,
        })),
      };
      const reward = BuiltinRewards.errorPenalty(state);
      expect(reward).toBe(0);
    });
  });

  describe("exploration", () => {
    it("should reward diverse interactions", () => {
      const state = {
        ...baseState,
        actions: [
          { type: "click", target: "e1", success: true, timestamp: 0 },
          { type: "click", target: "e2", success: true, timestamp: 1 },
          { type: "fill", target: "e3", success: true, timestamp: 2 },
        ],
      };
      const reward = BuiltinRewards.exploration(state);
      expect(reward).toBeGreaterThan(0);
    });
  });

  describe("composite", () => {
    it("should combine multiple rewards", () => {
      const composite = BuiltinRewards.composite({
        completion: 1.0,
        efficiency: 0.5,
        errorPenalty: 0.5,
      });
      const reward = composite({
        ...baseState,
        goalComplete: true,
        actions: [{ type: "click", success: true, timestamp: 0 }],
      });
      expect(reward).toBeGreaterThan(0);
      expect(reward).toBeLessThanOrEqual(1.0);
    });
  });
});

describe("RewardShaper", () => {
  const baseState = {
    stepIndex: 0,
    totalSteps: 5,
    goalComplete: true,
    actions: [{ type: "click", success: true, timestamp: 0 }],
    url: "https://example.com",
    elements: [],
    previousReward: 0,
  };

  describe("add / list / clear", () => {
    it("should add reward functions", () => {
      const shaper = new RewardShaper();
      shaper.add("test", BuiltinRewards.completion);
      expect(shaper.list().length).toBe(1);
      expect(shaper.list()[0].name).toBe("test");
    });

    it("should add builtin reward by name", () => {
      const shaper = new RewardShaper();
      shaper.addBuiltin("completion");
      expect(shaper.list().length).toBe(1);
    });

    it("should clear all rewards", () => {
      const shaper = new RewardShaper();
      shaper.add("test", BuiltinRewards.completion);
      shaper.clear();
      expect(shaper.list().length).toBe(0);
    });
  });

  describe("calculate", () => {
    it("should return completion reward when no rewards configured", async () => {
      const shaper = new RewardShaper();
      const reward = await shaper.calculate(baseState);
      expect(reward).toBe(1.0); // goalComplete is true
    });

    it("should calculate weighted average of rewards", async () => {
      const shaper = new RewardShaper();
      shaper.add("completion", BuiltinRewards.completion, { weight: 2.0 });
      shaper.add("efficiency", BuiltinRewards.efficiency, { weight: 1.0 });
      const reward = await shaper.calculate(baseState);
      expect(reward).toBeGreaterThan(0);
      expect(reward).toBeLessThanOrEqual(1.0);
    });
  });

  describe("calculateSequence", () => {
    it("should calculate rewards for multiple states", async () => {
      const shaper = new RewardShaper();
      shaper.addBuiltin("completion");
      const states = [
        { ...baseState, goalComplete: false },
        { ...baseState, goalComplete: true },
      ];
      const rewards = await shaper.calculateSequence(states);
      expect(rewards.length).toBe(2);
      expect(rewards[0]).toBe(0);
      expect(rewards[1]).toBe(1);
    });
  });

  describe("calculateCumulative", () => {
    it("should sum up step rewards", async () => {
      const shaper = new RewardShaper();
      shaper.addBuiltin("completion");
      const states = [
        { ...baseState, goalComplete: false },
        { ...baseState, goalComplete: true },
      ];
      const total = await shaper.calculateCumulative(states);
      expect(total).toBe(1);
    });
  });
});
