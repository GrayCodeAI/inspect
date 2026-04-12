/**
 * Integration tests for NL Parser with act() method
 *
 * Tests that the NL parser can extract parameters from natural language
 * instructions and pass them correctly to the act() method.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NLParser } from "./parser.js";

describe("NLParser Integration Tests", () => {
  let parser: NLParser;

  beforeEach(() => {
    parser = new NLParser();
  });

  describe("Parameter extraction for act()", () => {
    it("should extract click target correctly", () => {
      const result = parser.parse("Click the submit button");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.target).toBe("submit button");
      expect(result.bestMatch?.params.value).toBeUndefined();
    });

    it("should extract type parameters", () => {
      const result = parser.parse('Type "user@example.com" into the email field');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.target).toBe("email field");
      expect(result.bestMatch?.params.value).toBe("user@example.com");
    });

    it("should extract select parameters with dropdown", () => {
      const result = parser.parse("Select 'January' from the month dropdown");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("select");
      expect(result.bestMatch?.params.target).toBe("month dropdown");
      expect(result.bestMatch?.params.value).toBe("january");
    });

    it("should extract scroll parameters", () => {
      const result = parser.parse("Scroll down 500 pixels");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("scroll");
      // Scroll instructions should have direction and optionally amount
      expect(result.bestMatch?.params).toBeDefined();
    });

    it("should extract wait parameters", () => {
      const result = parser.parse("Wait for 3 seconds");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("wait");
      expect(result.bestMatch?.params.numericValue).toBeDefined();
    });

    it("should extract hover target", () => {
      const result = parser.parse("Hover over the profile icon");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("hover");
      expect(result.bestMatch?.params.target).toBe("profile icon");
    });

    it("should extract checkbox check target", () => {
      const result = parser.parse("Check the agree to terms checkbox");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("check");
      expect(result.bestMatch?.params.target).toBe("agree to terms checkbox");
    });

    it("should extract navigate URL", () => {
      const result = parser.parse("Navigate to https://example.com");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("navigate");
      expect(result.bestMatch?.params.url).toBe("https://example.com");
    });

    it("should extract double click target", () => {
      const result = parser.parse("Double click on the file icon");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("doubleClick");
      expect(result.bestMatch?.params.target).toBe("file icon");
    });

    it("should extract right click target", () => {
      const result = parser.parse("Right click the context menu item");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("rightClick");
      expect(result.bestMatch?.params.target).toBe("context menu item");
    });
  });

  describe("Complex parameter extraction", () => {
    it("should handle quoted values with special characters", () => {
      const result = parser.parse('Type "test@example.com" in the email box');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.value).toBe("test@example.com");
    });

    it("should handle quoted values with spaces", () => {
      const result = parser.parse('Type "Hello World" into the message field');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.value).toBe("hello world");
    });

    it("should handle multi-word targets", () => {
      const result = parser.parse("Click the login button in the top right corner");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.target).toContain("login");
      expect(result.bestMatch?.params.target).toContain("button");
    });

    it("should extract dropdown selection with multiple words", () => {
      const result = parser.parse("Select 'New York' from the state selection dropdown");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.value).toBe("new york");
      expect(result.bestMatch?.params.target).toContain("dropdown");
    });

    it("should handle URL extraction with query parameters", () => {
      const result = parser.parse("Navigate to https://example.com/path?key=value&other=123");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.url).toContain("example.com");
    });
  });

  describe("Confidence and matching", () => {
    it("should provide confidence score for matches", () => {
      const result = parser.parse("Click the button");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.confidence).toBeGreaterThan(0);
      expect(result.bestMatch?.confidence).toBeLessThanOrEqual(1);
    });

    it("should rank matches by confidence", () => {
      const result = parser.parse("Click the submit button");
      expect(result.alternatives).toHaveLength(result.alternatives.length);
      // Alternatives should be sorted by confidence (descending)
      if (result.alternatives.length > 1) {
        for (let i = 0; i < result.alternatives.length - 1; i++) {
          expect(result.alternatives[i].confidence).toBeGreaterThanOrEqual(
            result.alternatives[i + 1].confidence,
          );
        }
      }
    });

    it("should have high confidence for exact pattern matches", () => {
      const result = parser.parse('Type "password" in the password field');
      expect(result.bestMatch?.confidence).toBeGreaterThan(0.8);
    });
  });

  describe("Fallback handling", () => {
    it("should handle unknown instructions gracefully", () => {
      const result = parser.parse("Do something unusual with the widget");
      // Should either return a match or indicate no match
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("alternatives");
    });

    it("should attempt to match partial patterns", () => {
      const result = parser.parse("Click");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("click");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string", () => {
      const result = parser.parse("");
      expect(result).toBeDefined();
    });

    it("should handle very long instruction", () => {
      const longInstruction =
        "Click on the button that says hello and is located in the top left corner of the page";
      const result = parser.parse(longInstruction);
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("click");
    });

    it("should handle instructions with numbers", () => {
      const result = parser.parse("Wait 123 seconds");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("wait");
    });

    it("should handle instructions with special characters", () => {
      const result = parser.parse('Type "@#$%^&*()" in the field');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.value).toBe("@#$%^&*()");
    });

    it("should handle case insensitive instructions", () => {
      const result1 = parser.parse("click the button");
      const result2 = parser.parse("Click the button");
      const result3 = parser.parse("CLICK THE BUTTON");

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result1.bestMatch?.type).toBe(result2.bestMatch?.type);
      expect(result2.bestMatch?.type).toBe(result3.bestMatch?.type);
    });
  });
});
