import { describe, it, expect } from "vitest";
import { ActHandler } from "./act.js";
import type { LLMClient } from "./act.js";

// Minimal mock LLM — never called in these tests
const mockLLM: LLMClient = {
  async chat() {
    return { content: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  },
};

function handler() {
  return new ActHandler(mockLLM);
}

describe("ActHandler", () => {
  describe("buildCacheKey (private)", () => {
    it("combines origin+pathname with instruction", () => {
      const h = handler();
      const key = h.buildCacheKey("https://example.com/page?q=1", "Click login");
      expect(key).toBe("https://example.com/page::Click login");
    });

    it("ignores query parameters", () => {
      const h = handler();
      const k1 = h.buildCacheKey("https://example.com/page?a=1", "Click");
      const k2 = h.buildCacheKey("https://example.com/page?b=2", "Click");
      expect(k1).toBe(k2);
    });

    it("falls back to raw URL for invalid URLs", () => {
      const h = handler();
      const key = h.buildCacheKey("not-a-url", "Click");
      expect(key).toBe("not-a-url::Click");
    });

    it("different paths produce different keys", () => {
      const h = handler();
      const k1 = h.buildCacheKey("https://example.com/a", "Click");
      const k2 = h.buildCacheKey("https://example.com/b", "Click");
      expect(k1).not.toBe(k2);
    });
  });

  describe("parseActionResponse (private)", () => {
    it("parses plain JSON", () => {
      const h = handler();
      const action = h.parseActionResponse('{"type":"click","ref":"e1"}');
      expect(action.type).toBe("click");
      expect(action.target).toBe("e1");
    });

    it("parses JSON in markdown code block", () => {
      const h = handler();
      const action = h.parseActionResponse('```json\n{"type":"fill","ref":"e2","value":"hello"}\n```');
      expect(action.type).toBe("fill");
      expect(action.target).toBe("e2");
      expect(action.value).toBe("hello");
    });

    it("generates description from type and ref", () => {
      const h = handler();
      const action = h.parseActionResponse('{"type":"click","ref":"e5"}');
      expect(action.description).toContain("click");
      expect(action.description).toContain("e5");
    });

    it("uses provided description if present", () => {
      const h = handler();
      const action = h.parseActionResponse('{"type":"click","ref":"e1","description":"Click the submit button"}');
      expect(action.description).toBe("Click the submit button");
    });

    it("throws on invalid JSON", () => {
      const h = handler();
      expect(() => h.parseActionResponse("not json at all")).toThrow("Failed to parse LLM action response");
    });

    it("sets timestamp", () => {
      const h = handler();
      const action = h.parseActionResponse('{"type":"click","ref":"e1"}');
      expect(action.timestamp).toBeGreaterThan(0);
    });
  });
});
