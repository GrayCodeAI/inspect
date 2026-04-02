/**
 * Tests for LLM streaming and advanced features
 */

import { describe, it, expect, vi } from "vitest";
import {
  StreamingLLMWrapper,
  FallbackLLMChain,
  LLMResponseValidator,
  TokenBudgetManager,
} from "./llm-streaming.js";

describe("LLM Streaming Support", () => {
  describe("StreamingLLMWrapper", () => {
    it("should fall back to regular chat if stream not available", async () => {
      const mockProvider = {
        chat: vi.fn().mockResolvedValue({
          content: '{"evaluation":{"success":true},"memory":[],"nextGoal":"","actions":[]}',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      const wrapper = new StreamingLLMWrapper(mockProvider);
      const result = await wrapper.chat({
        messages: [{ role: "user", content: "test" }],
        model: "claude-3-sonnet",
        temperature: 0.7,
        max_tokens: 2000,
      });

      expect(result.content).toBeDefined();
      expect(mockProvider.chat).toHaveBeenCalled();
    });

    it("should handle streaming provider", async () => {
      const mockProvider = {
        stream: async function* () {
          yield '{"eval';
          yield 'uation":{"success":true},';
          yield '"memory":[],"nextGoal":"","actions":[]}';
        },
      };

      const wrapper = new StreamingLLMWrapper(mockProvider);
      const result = await wrapper.chat({
        messages: [{ role: "user", content: "test" }],
        model: "claude-3-sonnet",
        temperature: 0.7,
        max_tokens: 2000,
      });

      expect(result.content).toContain("evaluation");
      expect(result.usage).toBeDefined();
    });
  });

  describe("FallbackLLMChain", () => {
    it("should use primary provider on success", async () => {
      const mockPrimary = {
        chat: vi.fn().mockResolvedValue({
          content: "primary response",
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      const mockFallback = {
        chat: vi.fn(),
      };

      const chain = new FallbackLLMChain(mockPrimary, mockFallback);
      const result = await chain.chat({
        messages: [{ role: "user", content: "test" }],
        model: "claude-3-sonnet",
        temperature: 0.7,
        max_tokens: 2000,
      });

      expect(result.content).toBe("primary response");
      expect(result.provider).toBe("primary");
      expect(mockFallback.chat).not.toHaveBeenCalled();
    });

    it("should fall back to secondary provider on primary failure", async () => {
      const mockPrimary = {
        chat: vi.fn().mockRejectedValue(new Error("Primary failed")),
      };

      const mockFallback = {
        chat: vi.fn().mockResolvedValue({
          content: "fallback response",
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      const chain = new FallbackLLMChain(mockPrimary, mockFallback);
      const result = await chain.chat({
        messages: [{ role: "user", content: "test" }],
        model: "claude-3-sonnet",
        temperature: 0.7,
        max_tokens: 2000,
      });

      expect(result.content).toBe("fallback response");
      expect(result.provider).toBe("fallback");
    });

    it("should throw if both providers fail", async () => {
      const mockPrimary = {
        chat: vi.fn().mockRejectedValue(new Error("Primary failed")),
      };

      const mockFallback = {
        chat: vi.fn().mockRejectedValue(new Error("Fallback failed")),
      };

      const chain = new FallbackLLMChain(mockPrimary, mockFallback);

      await expect(
        chain.chat({
          messages: [{ role: "user", content: "test" }],
          model: "claude-3-sonnet",
          temperature: 0.7,
          max_tokens: 2000,
        }),
      ).rejects.toThrow("Both LLM providers failed");
    });
  });

  describe("LLMResponseValidator", () => {
    it("should validate valid JSON response", () => {
      const response = '{"evaluation":{"success":true},"memory":[],"nextGoal":"","actions":[]}';
      const result = LLMResponseValidator.validateJSON(response);

      expect(result.valid).toBe(true);
      expect(result.parsed).toBeDefined();
    });

    it("should extract JSON from markdown", () => {
      const response = "```json\n" + '{"evaluation":{"success":true},"memory":[],"nextGoal":"","actions":[]}' + "\n```";
      const result = LLMResponseValidator.validateJSON(response);

      expect(result.valid).toBe(true);
    });

    it("should reject invalid JSON", () => {
      const response = "not valid json";
      const result = LLMResponseValidator.validateJSON(response);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should fix trailing commas", () => {
      const response = '{"evaluation":{"success":true,},"memory":[],"nextGoal":"","actions":[]}';
      const fixed = LLMResponseValidator.fixResponse(response);
      const result = LLMResponseValidator.validateJSON(fixed);

      expect(result.valid).toBe(true);
    });

    it("should validate and fix malformed response", () => {
      const response = "```json\n" + '{"evaluation":{"success":true,},"actions":[]}' + "\n```";
      const result = LLMResponseValidator.validateAndFix(response);

      expect(result.valid).toBe(true);
    });
  });

  describe("TokenBudgetManager", () => {
    it("should track tokens used", () => {
      const manager = new TokenBudgetManager();

      manager.addTokens(1000, 500);
      const status = manager.getStatus();

      expect(status.tokensUsed).toBe(1500);
    });

    it("should calculate cost correctly", () => {
      const manager = new TokenBudgetManager(0.003, 0.015);

      manager.addTokens(1000, 1000);
      const status = manager.getStatus();

      // Input: 1000 * $0.003/1K = $0.003
      // Output: 1000 * $0.015/1K = $0.015
      // Total: $0.018
      expect(status.costAccumulated).toBeCloseTo(0.018, 3);
    });

    it("should check if within budget", () => {
      const manager = new TokenBudgetManager();

      manager.addTokens(1000, 1000);
      expect(manager.isWithinBudget(1)).toBe(true); // $0.018 < $1

      manager.addTokens(100000, 100000);
      expect(manager.isWithinBudget(0.01)).toBe(false); // Over budget
    });

    it("should reset budget", () => {
      const manager = new TokenBudgetManager();

      manager.addTokens(1000, 1000);
      manager.reset();

      const status = manager.getStatus();
      expect(status.tokensUsed).toBe(0);
      expect(status.costAccumulated).toBe(0);
    });

    it("should estimate percentage of daily budget", () => {
      const manager = new TokenBudgetManager();

      manager.addTokens(1000, 1000); // ~$0.018
      const status = manager.getStatus();

      // Should be ~0.09% of $20/day budget
      expect(status.estimatedPercentageOfDay).toBeLessThan(1);
    });
  });
});
