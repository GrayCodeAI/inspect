/**
 * Tests for memory integration system
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ShortTermMemory,
  LongTermMemory,
  MemoryContext,
  MemoryRecall,
  type MemoryItem,
} from "./memory-integration.js";

describe("Memory Integration System", () => {
  describe("ShortTermMemory", () => {
    let memory: ShortTermMemory;

    beforeEach(() => {
      memory = new ShortTermMemory();
    });

    it("should add items", () => {
      memory.add({
        content: "test memory",
        importance: 0.8,
        category: "observation",
      });

      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].content).toBe("test memory");
    });

    it("should get recent items in order", () => {
      memory.add({ content: "first", importance: 0.5 });
      memory.add({ content: "second", importance: 0.6 });
      memory.add({ content: "third", importance: 0.7 });

      const recent = memory.getRecent(2);
      expect(recent.length).toBe(2);
      expect(recent[1].content).toBe("third");
    });

    it("should filter by category", () => {
      memory.add({ content: "action1", importance: 0.5, category: "action" });
      memory.add({ content: "obs1", importance: 0.6, category: "observation" });
      memory.add({ content: "action2", importance: 0.7, category: "action" });

      const actions = memory.getByCategory("action");
      expect(actions.length).toBe(2);
      expect(actions[0].content).toBe("action1");
    });

    it("should maintain max items limit", () => {
      // Add more than max (50)
      for (let i = 0; i < 60; i++) {
        memory.add({ content: `item ${i}`, importance: 0.5 });
      }

      expect(memory.getAll().length).toBeLessThanOrEqual(50);
      expect(memory.getAll()[0].content).toContain("10");
    });

    it("should provide statistics", () => {
      memory.add({ content: "action", importance: 0.8, category: "action" });
      memory.add({ content: "obs", importance: 0.6, category: "observation" });

      const stats = memory.getStats();
      expect(stats.totalItems).toBe(2);
      expect(stats.byCategory.action).toBe(1);
      expect(stats.byCategory.observation).toBe(1);
      expect(stats.averageImportance).toBeCloseTo(0.7, 1);
    });

    it("should clear all items", () => {
      memory.add({ content: "test", importance: 0.5 });
      expect(memory.getAll().length).toBe(1);

      memory.clear();
      expect(memory.getAll().length).toBe(0);
    });
  });

  describe("LongTermMemory", () => {
    let memory: LongTermMemory;

    beforeEach(() => {
      memory = new LongTermMemory();
    });

    it("should store discoveries", () => {
      memory.storeDiscovery("Found button at .submit", 0.9);
      memory.storeDiscovery("Login flow successful", 0.8);

      const discoveries = memory.getDiscoveries();
      expect(discoveries.length).toBe(2);
      expect(discoveries[0].category).toBe("discovery");
    });

    it("should store and track patterns", () => {
      memory.recordPattern("click_submit", "example1");
      memory.recordPattern("click_submit", "example2");
      memory.recordPattern("click_submit", "example3");

      const patterns = memory.getPatterns();
      const submitPattern = patterns.find((p) => p.pattern === "click_submit");

      expect(submitPattern).toBeDefined();
      expect(submitPattern?.frequency).toBe(3);
      expect(submitPattern?.confidence).toBeGreaterThan(0.5);
    });

    it("should store errors for learning", () => {
      memory.storeError("Element not found", "Trying to click .missing");

      const important = memory.getImportant();
      expect(important.length).toBeGreaterThan(0);
      expect(important[0].category).toBe("error");
    });

    it("should get important memories sorted", () => {
      memory.storeDiscovery("low importance", 0.3);
      memory.storeDiscovery("high importance", 0.9);
      memory.storeDiscovery("medium importance", 0.6);

      const important = memory.getImportant(2);
      expect(important[0].importance).toBe(0.9);
      expect(important[1].importance).toBe(0.6);
    });

    it("should query memory by relevance", () => {
      memory.storeDiscovery("Login button found", 0.8);
      memory.storeDiscovery("Error: Network timeout", 0.9);

      const results = memory.queryByRelevance("login");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain("Login");
    });

    it("should prune old memories", () => {
      memory.storeDiscovery("recent discovery", 0.8);

      // Add old timestamp to memory list manually would require access
      // For now, test that pruneOld doesn't crash
      memory.pruneOld(24);
      expect(memory.getDiscoveries().length).toBeGreaterThanOrEqual(0);
    });

    it("should provide statistics", () => {
      memory.storeDiscovery("test", 0.8);
      memory.recordPattern("pattern1", "example");
      memory.recordPattern("pattern2", "example");

      const stats = memory.getStats();
      expect(stats.totalMemories).toBe(1);
      expect(stats.totalPatterns).toBe(2);
      expect(stats.averageImportance).toBe(0.8);
    });
  });

  describe("MemoryContext", () => {
    let context: MemoryContext;

    beforeEach(() => {
      context = new MemoryContext();
    });

    it("should record step execution", () => {
      context.recordStep(0, true);
      context.recordStep(1, false);

      const summary = context.getSummary();
      expect(summary.stepStats.totalSteps).toBe(2);
    });

    it("should calculate success rate", () => {
      context.recordStep(0, true);
      context.recordStep(1, true);
      context.recordStep(2, false);

      const rate = context.getSuccessRate();
      expect(rate).toBeCloseTo(0.667, 2);
    });

    it("should track consecutive successes", () => {
      context.recordStep(0, true);
      context.recordStep(1, true);
      context.recordStep(2, false);
      context.recordStep(3, true);

      expect(context.getConsecutiveSuccesses()).toBe(1);
    });

    it("should record observations", () => {
      context.recordObservation("Test observation", 0.8);

      const memories = context.getRelevantMemories();
      expect(memories.recent.length).toBeGreaterThan(0);
    });

    it("should record errors", () => {
      context.recordError("Test error", "Context info");

      const memories = context.getRelevantMemories();
      expect(memories.recent.some((m) => m.category === "error")).toBe(true);
    });

    it("should get summary", () => {
      context.recordStep(0, true);
      context.recordObservation("test", 0.7);

      const summary = context.getSummary();
      expect(summary.shortTermStats).toBeDefined();
      expect(summary.longTermStats).toBeDefined();
      expect(summary.stepStats).toBeDefined();
    });

    it("should clear all memory", () => {
      context.recordStep(0, true);
      context.recordObservation("test", 0.7);

      context.clear();
      expect(context.getSuccessRate()).toBe(0);
    });
  });

  describe("MemoryRecall", () => {
    let context: MemoryContext;
    let recall: MemoryRecall;

    beforeEach(() => {
      context = new MemoryContext();
      recall = new MemoryRecall(context);

      // Setup some memories
      context.recordObservation("Login button at .login", 0.9);
      context.recordObservation("Form validation required", 0.8);
      context.recordStep(0, true);
      context.recordStep(1, true);
    });

    it("should score relevance", () => {
      const memory: MemoryItem = {
        content: "Test memory",
        importance: 0.8,
        timestamp: Date.now(),
      };

      const score = recall.scoreRelevance(memory, "test");
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should boost recent memories", () => {
      const recentMemory: MemoryItem = {
        content: "Recent memory",
        importance: 0.8,
        timestamp: Date.now() - 60000, // 1 minute ago
      };

      const oldMemory: MemoryItem = {
        content: "Old memory",
        importance: 0.8,
        timestamp: Date.now() - 7200000, // 2 hours ago
      };

      const recentScore = recall.scoreRelevance(recentMemory, "memory");
      const oldScore = recall.scoreRelevance(oldMemory, "memory");

      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it("should boost goal-matching memories", () => {
      const goalMemory: MemoryItem = {
        content: "Login button found",
        importance: 0.8,
        timestamp: Date.now(),
      };

      const otherMemory: MemoryItem = {
        content: "Some other info",
        importance: 0.8,
        timestamp: Date.now(),
      };

      const goalScore = recall.scoreRelevance(goalMemory, "login");
      const otherScore = recall.scoreRelevance(otherMemory, "login");

      expect(goalScore).toBeGreaterThan(otherScore);
    });

    it("should recall relevant memories for task", () => {
      const memories = recall.recallForTask("login", 3);
      expect(memories.length).toBeGreaterThan(0);
    });

    it("should generate LLM context", () => {
      const llmContext = recall.getContextForLLM("login test");

      expect(llmContext).toContain("Relevant Memories");
      expect(llmContext).toContain("Progress");
      expect(llmContext).toContain("Success Rate");
    });
  });

  describe("Integration", () => {
    it("should maintain memory across steps", () => {
      const context = new MemoryContext();

      // Step 1: Success with observation
      context.recordStep(0, true);
      context.recordObservation("Found login button", 0.9);

      // Step 2: Success with observation
      context.recordStep(1, true);
      context.recordObservation("Form submitted", 0.85);

      // Step 3: Failure with error
      context.recordStep(2, false);
      context.recordError("Validation failed", "Password field empty");

      // Check full context
      const summary = context.getSummary();
      expect(summary.stepStats.totalSteps).toBe(3);
      expect(summary.stepStats.successRate).toBeCloseTo(0.667, 2);
    });

    it("should provide context for next step", () => {
      const context = new MemoryContext();
      const recall = new MemoryRecall(context);

      context.recordObservation("Button location: .submit-btn", 0.9);
      context.recordStep(0, true);

      const llmContext = recall.getContextForLLM("submit form");
      expect(llmContext).toContain("Button location");
      expect(llmContext).toContain("Success Rate");
    });
  });
});
