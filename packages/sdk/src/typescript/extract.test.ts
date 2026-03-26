import { describe, it, expect } from "vitest";
import { ExtractHandler } from "./extract.js";
import type { LLMClient } from "./act.js";

const mockLLM: LLMClient = {
  async chat() {
    return { content: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  },
};

function handler() {
  return new ExtractHandler(mockLLM);
}

describe("ExtractHandler", () => {
  describe("parseJsonResponse (private)", () => {
    it("parses plain JSON object", () => {
      const h = handler() as any;
      expect(h.parseJsonResponse('{"name":"Alice","age":30}')).toEqual({ name: "Alice", age: 30 });
    });

    it("parses plain JSON array", () => {
      const h = handler() as any;
      expect(h.parseJsonResponse('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it("extracts JSON from markdown code block", () => {
      const h = handler() as any;
      const input = '```json\n{"result": "success"}\n```';
      expect(h.parseJsonResponse(input)).toEqual({ result: "success" });
    });

    it("extracts JSON from mixed content", () => {
      const h = handler() as any;
      const input = 'Here is the data:\n{"items": [1, 2]}\nEnd of response.';
      expect(h.parseJsonResponse(input)).toEqual({ items: [1, 2] });
    });

    it("returns null for unparseable content", () => {
      const h = handler() as any;
      expect(h.parseJsonResponse("just plain text with no JSON")).toBeNull();
    });

    it("handles nested objects", () => {
      const h = handler() as any;
      const input = '{"user": {"name": "Bob", "address": {"city": "NYC"}}}';
      const result = h.parseJsonResponse(input);
      expect(result.user.address.city).toBe("NYC");
    });

    it("handles empty JSON object", () => {
      const h = handler() as any;
      expect(h.parseJsonResponse("{}")).toEqual({});
    });

    it("handles code block without json specifier", () => {
      const h = handler() as any;
      const input = '```\n{"key": "value"}\n```';
      expect(h.parseJsonResponse(input)).toEqual({ key: "value" });
    });
  });
});
