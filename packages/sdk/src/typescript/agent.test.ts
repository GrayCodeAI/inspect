import { describe, it, expect } from "vitest";
import { AgentHandler } from "./agent.js";
import type { LLMClient } from "./act.js";
import { ActHandler } from "./act.js";
import { ExtractHandler } from "./extract.js";
import { ObserveHandler } from "./observe.js";

const mockLLM: LLMClient = {
  async chat() {
    return { content: "", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  },
};

function handler() {
  return new AgentHandler(mockLLM, {
    actHandler: new ActHandler(mockLLM),
    extractHandler: new ExtractHandler(mockLLM),
    observeHandler: new ObserveHandler(mockLLM),
  });
}

describe("AgentHandler", () => {
  describe("buildSystemPrompt (private)", () => {
    it("includes the goal instruction", () => {
      const h = handler() as any;
      const prompt = h.buildSystemPrompt("Buy a red hat");
      expect(prompt).toContain("Goal: Buy a red hat");
    });

    it("uses custom prompt when provided", () => {
      const h = handler() as any;
      const prompt = h.buildSystemPrompt("Do the thing", "You are a custom agent.");
      expect(prompt).toContain("You are a custom agent.");
      expect(prompt).toContain("Goal: Do the thing");
    });

    it("substitutes template variables", () => {
      const h = handler() as any;
      const prompt = h.buildSystemPrompt("Search for {{product}}", undefined, { product: "shoes" });
      expect(prompt).toContain("Search for shoes");
      expect(prompt).not.toContain("{{product}}");
    });

    it("handles multiple variable substitutions", () => {
      const h = handler() as any;
      const prompt = h.buildSystemPrompt("Go to {{url}} and buy {{item}}", undefined, {
        url: "example.com",
        item: "laptop",
      });
      expect(prompt).toContain("Go to example.com and buy laptop");
    });

    it("includes JSON response format instructions", () => {
      const h = handler() as any;
      const prompt = h.buildSystemPrompt("Test task");
      expect(prompt).toContain("thought");
      expect(prompt).toContain("action");
      expect(prompt).toContain("goalComplete");
    });
  });

  describe("buildPageDescription (private)", () => {
    it("includes URL and title", () => {
      const h = handler() as any;
      const desc = h.buildPageDescription({
        url: "https://example.com",
        title: "Example Page",
        elements: [],
        timestamp: Date.now(),
      });
      expect(desc).toContain("URL: https://example.com");
      expect(desc).toContain("Title: Example Page");
    });

    it("lists interactive elements", () => {
      const h = handler() as any;
      const desc = h.buildPageDescription({
        url: "https://example.com",
        title: "Test",
        elements: [
          { ref: "e1", role: "button", name: "Submit", visible: true, interactable: true, xpath: "", bounds: { x: 0, y: 0, width: 0, height: 0 } },
          { ref: "e2", role: "paragraph", name: "", visible: true, interactable: false, textContent: "Some text", xpath: "", bounds: { x: 0, y: 0, width: 0, height: 0 } },
        ],
        timestamp: Date.now(),
      });
      expect(desc).toContain('[e1] button "Submit"');
      expect(desc).toContain("Interactive elements:");
    });

    it("lists non-interactive text content", () => {
      const h = handler() as any;
      const desc = h.buildPageDescription({
        url: "https://example.com",
        title: "Test",
        elements: [
          { ref: "e1", role: "paragraph", name: "", visible: true, interactable: false, textContent: "Hello world", xpath: "", bounds: { x: 0, y: 0, width: 0, height: 0 } },
        ],
        timestamp: Date.now(),
      });
      expect(desc).toContain("[e1] paragraph: Hello world");
    });

    it("filters out non-visible elements", () => {
      const h = handler() as any;
      const desc = h.buildPageDescription({
        url: "https://example.com",
        title: "Test",
        elements: [
          { ref: "e1", role: "button", name: "Hidden", visible: false, interactable: true, xpath: "", bounds: { x: 0, y: 0, width: 0, height: 0 } },
        ],
        timestamp: Date.now(),
      });
      expect(desc).not.toContain("Hidden");
    });
  });

  describe("parsePlan (private)", () => {
    it("parses a complete plan", () => {
      const h = handler() as any;
      const plan = h.parsePlan(JSON.stringify({
        thought: "I need to click the button",
        action: { type: "click", instruction: "Click submit" },
        goalComplete: false,
      }));
      expect(plan.thought).toBe("I need to click the button");
      expect(plan.action?.type).toBe("click");
      expect(plan.goalComplete).toBe(false);
    });

    it("parses plan from markdown code block", () => {
      const h = handler() as any;
      const plan = h.parsePlan('```json\n{"thought":"thinking","action":null,"goalComplete":true,"summary":"Done"}\n```');
      expect(plan.goalComplete).toBe(true);
      expect(plan.summary).toBe("Done");
      expect(plan.action).toBeNull();
    });

    it("handles plan with extracted data", () => {
      const h = handler() as any;
      const plan = h.parsePlan(JSON.stringify({
        thought: "Extracting data",
        action: null,
        goalComplete: true,
        extractedData: { price: "$29.99" },
        summary: "Found the price",
      }));
      expect(plan.extractedData).toEqual({ price: "$29.99" });
    });

    it("falls back gracefully for invalid JSON", () => {
      const h = handler() as any;
      const plan = h.parsePlan("This is not JSON at all");
      expect(plan.thought).toBe("This is not JSON at all");
      expect(plan.action).toBeNull();
      expect(plan.goalComplete).toBe(false);
    });

    it("extracts JSON even with leading text", () => {
      const h = handler() as any;
      const plan = h.parsePlan('Here is my plan:\n{"thought":"do it","action":{"type":"click","instruction":"click btn"},"goalComplete":false}');
      expect(plan.thought).toBe("do it");
      expect(plan.action?.type).toBe("click");
    });
  });
});
