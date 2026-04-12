// ──────────────────────────────────────────────────────────────────────────────
// NL Parser Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { NLParser, createNLParser, parseInstruction, getSupportedPatterns } from "./parser.js";

describe("NLParser", () => {
  let parser: NLParser;

  beforeEach(() => {
    parser = new NLParser();
  });

  describe("click actions", () => {
    it("should parse basic click", () => {
      const result = parser.parse("Click the login button");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("click");
      expect(result.bestMatch?.params.target).toBe("login button");
    });

    it("should parse click variations", () => {
      const variations = [
        "Click submit",
        "Click on the menu",
        "Tap on the icon",
        "Press the enter button",
      ];

      for (const instruction of variations) {
        const result = parser.parse(instruction);
        expect(result.success).toBe(true);
        expect(result.bestMatch?.type).toBe("click");
      }
    });

    it("should parse double click", () => {
      const result = parser.parse("Double-click the file");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("doubleClick");
    });

    it("should parse right click", () => {
      const result = parser.parse("Right-click on the image");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("rightClick");
    });
  });

  describe("type actions", () => {
    it("should parse type with value", () => {
      const result = parser.parse('Type "hello world" in the search box');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("type");
      expect(result.bestMatch?.params.target).toBe("search box");
      expect(result.bestMatch?.params.value).toBe("hello world");
    });

    it("should parse fill action", () => {
      const result = parser.parse('Fill the email field with "test@example.com"');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("type");
      expect(result.bestMatch?.params.target).toBe("email field");
      expect(result.bestMatch?.params.value).toBe("test@example.com");
    });

    it("should parse enter action", () => {
      const result = parser.parse("Enter username in the login field");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("type");
    });

    it("should parse clear action", () => {
      const result = parser.parse("Clear the search field");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("clear");
    });
  });

  describe("select actions", () => {
    it("should parse select from dropdown", () => {
      const result = parser.parse("Select 'United States' from the country dropdown");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("select");
      expect(result.bestMatch?.params.value).toBe("united states");
      expect(result.bestMatch?.params.target).toBe("country dropdown");
    });

    it("should parse choose action", () => {
      const result = parser.parse("Choose 'Large' from the size menu");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("select");
    });

    it("should parse checkbox check", () => {
      const result = parser.parse("Check the terms checkbox");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("check");
    });

    it("should parse checkbox uncheck", () => {
      const result = parser.parse("Uncheck the newsletter option");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("uncheck");
    });
  });

  describe("navigation actions", () => {
    it("should parse navigate to URL", () => {
      const result = parser.parse("Navigate to https://example.com");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("navigate");
      expect(result.bestMatch?.params.url).toBe("https://example.com");
    });

    it("should parse go to URL", () => {
      const result = parser.parse("Go to google.com");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("navigate");
    });

    it("should parse go back", () => {
      const result = parser.parse("Go back");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("goBack");
    });

    it("should parse refresh", () => {
      const result = parser.parse("Refresh the page");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("refresh");
    });
  });

  describe("scroll actions", () => {
    it("should parse scroll down", () => {
      const result = parser.parse("Scroll down");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("scroll");
      expect(result.bestMatch?.params.direction).toBe("down");
    });

    it("should parse scroll with amount", () => {
      const result = parser.parse("Scroll down by 500");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.direction).toBe("down");
      expect(result.bestMatch?.params.numericValue).toBe(500);
    });

    it("should parse scroll to element", () => {
      const result = parser.parse("Scroll to the footer");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("scrollTo");
      expect(result.bestMatch?.params.target).toBe("footer");
    });
  });

  describe("wait actions", () => {
    it("should parse wait for seconds", () => {
      const result = parser.parse("Wait 3 seconds");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("wait");
      expect(result.bestMatch?.params.timeout).toBe(3000);
    });

    it("should parse wait for element", () => {
      const result = parser.parse("Wait for the modal to appear");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("wait");
      expect(result.bestMatch?.params.target).toBe("modal to appear");
    });
  });

  describe("keyboard actions", () => {
    it("should parse press key", () => {
      const result = parser.parse("Press the Enter key");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("press");
      expect(result.bestMatch?.params.key).toBe("enter");
    });

    it("should parse enter key shorthand", () => {
      const result = parser.parse("Press enter");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.key).toBe("Enter");
    });

    it("should parse escape key", () => {
      const result = parser.parse("Press escape");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.params.key).toBe("Escape");
    });
  });

  describe("assertion actions", () => {
    it("should parse verify visible", () => {
      const result = parser.parse("Verify the button is visible");
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("assert");
      expect(result.bestMatch?.params.target).toBe("button");
      expect(result.bestMatch?.params.assertion).toBe("visible");
    });

    it("should parse check text contains", () => {
      const result = parser.parse('Check the header contains "Welcome"');
      expect(result.success).toBe(true);
      expect(result.bestMatch?.type).toBe("assert");
      expect(result.bestMatch?.params.expectedValue).toBe("welcome");
    });
  });

  describe("confidence scoring", () => {
    it("should return high confidence for exact matches", () => {
      const result = parser.parse("Click the button");
      expect(result.bestMatch?.confidence).toBeGreaterThan(0.8);
    });

    it("should provide alternatives for ambiguous instructions", () => {
      const result = parser.parse("Press the button");
      expect(result.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe("entity extraction", () => {
    it("should extract URLs", () => {
      const result = parser.parse("Go to https://example.com/path");
      const urlEntities = result.bestMatch?.entities.filter((e) => e.type === "url");
      expect(urlEntities?.length).toBe(1);
      expect(urlEntities?.[0].value).toBe("https://example.com/path");
    });

    it("should extract numbers", () => {
      const result = parser.parse("Wait 5 seconds");
      const numEntities = result.bestMatch?.entities.filter((e) => e.type === "number");
      expect(numEntities?.length).toBe(1);
      expect(numEntities?.[0].value).toBe("5");
    });

    it("should extract quoted text", () => {
      const result = parser.parse('Type "hello world" in the field');
      const textEntities = result.bestMatch?.entities.filter((e) => e.type === "text");
      expect(textEntities?.length).toBe(1);
      expect(textEntities?.[0].value).toBe("hello world");
    });
  });

  describe("element descriptor parsing", () => {
    it("should detect button role", () => {
      const descriptor = parser.parseElementDescriptor("Click the submit button");
      expect(descriptor.role).toBe("button");
    });

    it("should detect link role", () => {
      const descriptor = parser.parseElementDescriptor("Click the home link");
      expect(descriptor.role).toBe("link");
    });

    it("should detect input role", () => {
      const descriptor = parser.parseElementDescriptor("Fill the email field");
      expect(descriptor.role).toBe("input");
    });

    it("should extract index", () => {
      const descriptor = parser.parseElementDescriptor("Click the first button");
      expect(descriptor.index).toBe(0);
    });

    it("should extract text content", () => {
      const descriptor = parser.parseElementDescriptor("Click the submit button");
      expect(descriptor.text).toBe("submit");
    });
  });

  describe("validation", () => {
    it("should validate supported instructions", () => {
      const result = parser.validate("Click the button");
      expect(result.valid).toBe(true);
    });

    it("should reject unsupported instructions", () => {
      const result = parser.validate("Do something completely random");
      expect(result.valid).toBe(false);
    });

    it("should suggest corrections for typos", () => {
      const result = parser.validate("Clik the button");
      expect(result.suggestion).toBeDefined();
    });
  });

  describe("batch parsing", () => {
    it("should parse multiple instructions", () => {
      const instructions = ["Click the button", "Fill the input", "Scroll down"];
      const results = parser.parseBatch(instructions);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("custom patterns", () => {
    it("should support custom patterns", () => {
      parser.addCustomPatterns([
        {
          name: "custom_action",
          actionType: "custom",
          patterns: [/custom:\s*(.+)/i],
          extractors: [(match) => ({ value: match[1] })],
          priority: 100,
          examples: ["custom: do something"],
        },
      ]);

      const result = parser.parse("custom: my action");
      expect(result.bestMatch?.type).toBe("custom");
    });
  });

  describe("stats", () => {
    it("should return parser statistics", () => {
      const stats = parser.getStats();
      expect(stats.patternCount).toBeGreaterThan(0);
      expect(stats.config).toBeDefined();
    });
  });

  describe("convenience functions", () => {
    it("parseInstruction should work without creating parser", () => {
      const result = parseInstruction("Click the button");
      expect(result.success).toBe(true);
    });

    it("getSupportedPatterns should return all patterns", () => {
      const patterns = getSupportedPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it("createNLParser should create parser with config", () => {
      const customParser = createNLParser({ minConfidence: 0.9 });
      expect(customParser).toBeInstanceOf(NLParser);
    });
  });

  describe("edge cases", () => {
    it("should handle empty strings", () => {
      const result = parser.parse("");
      expect(result.success).toBe(false);
    });

    it("should handle very long instructions", () => {
      const longInstruction = "Click ".repeat(100) + "the button";
      const result = parser.parse(longInstruction);
      expect(result.success).toBe(true);
    });

    it("should handle special characters", () => {
      const result = parser.parse('Click "Submit" <button> & test');
      expect(result.success).toBe(true);
    });

    it("should be case insensitive", () => {
      const result1 = parser.parse("CLICK THE BUTTON");
      const result2 = parser.parse("click the button");
      expect(result1.bestMatch?.type).toBe(result2.bestMatch?.type);
    });
  });

  describe("timeout", () => {
    it("should respect max parse time", () => {
      const fastParser = new NLParser({ maxParseTime: 1 });
      const result = fastParser.parse("Click the button");
      expect(result.success).toBe(true);
      expect(result.parseTime).toBeLessThan(100);
    });
  });
});
