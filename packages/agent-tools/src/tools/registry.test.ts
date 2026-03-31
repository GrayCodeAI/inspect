// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Tool Registry Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "./registry.js";
import { ToolValidator } from "./validator.js";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe("built-in tools", () => {
    it("should register built-in tools on construction", () => {
      expect(registry.size).toBeGreaterThan(0);
    });

    it("should have click tool", () => {
      expect(registry.has("click")).toBe(true);
    });

    it("should have type tool", () => {
      expect(registry.has("type")).toBe(true);
    });

    it("should have navigate tool", () => {
      expect(registry.has("navigate")).toBe(true);
    });

    it("should have screenshot tool", () => {
      expect(registry.has("screenshot")).toBe(true);
    });

    it("should have assert tool", () => {
      expect(registry.has("assert")).toBe(true);
    });

    it("should have scroll tool", () => {
      expect(registry.has("scroll")).toBe(true);
    });

    it("should have select tool", () => {
      expect(registry.has("select")).toBe(true);
    });

    it("should have hover tool", () => {
      expect(registry.has("hover")).toBe(true);
    });

    it("should have wait tool", () => {
      expect(registry.has("wait")).toBe(true);
    });

    it("should have done tool", () => {
      expect(registry.has("done")).toBe(true);
    });
  });

  describe("register", () => {
    it("should register a custom tool", () => {
      registry.register(
        "my_tool",
        "A custom tool",
        { type: "object", properties: { input: { type: "string", description: "Input" } } },
        async (args) => ({ success: true, content: String(args.input) }),
      );

      expect(registry.has("my_tool")).toBe(true);
    });

    it("should throw on duplicate registration", () => {
      registry.register("dup_tool", "Duplicate", { type: "object", properties: {} }, async () => ({
        success: true,
        content: "",
      }));

      expect(() =>
        registry.register(
          "dup_tool",
          "Duplicate",
          { type: "object", properties: {} },
          async () => ({
            success: true,
            content: "",
          }),
        ),
      ).toThrow('Tool "dup_tool" is already registered');
    });
  });

  describe("execute", () => {
    it("should execute a tool successfully", async () => {
      const result = await registry.execute("click", { ref: "e1" });
      expect(result.success).toBe(true);
      expect(result.content).toContain("Clicked");
    });

    it("should return error for unknown tool", async () => {
      const result = await registry.execute("nonexistent", {});
      expect(result.success).toBe(false);
      expect(result.error).toContain("not registered");
    });

    it("should execute type tool", async () => {
      const result = await registry.execute("type", { ref: "e1", text: "hello" });
      expect(result.success).toBe(true);
      expect(result.content).toContain("Typed");
    });

    it("should execute navigate tool", async () => {
      const result = await registry.execute("navigate", { url: "https://example.com" });
      expect(result.success).toBe(true);
      expect(result.content).toContain("Navigated");
    });
  });

  describe("getTools", () => {
    it("should return LLM tool definitions", () => {
      const tools = registry.getTools();
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
      }
    });
  });

  describe("getToolsByCategory", () => {
    it("should filter tools by category", () => {
      const browserTools = registry.getToolsByCategory("browser");
      expect(browserTools.length).toBeGreaterThan(0);

      const controlTools = registry.getToolsByCategory("control");
      expect(controlTools.length).toBeGreaterThan(0);
    });
  });

  describe("listNames", () => {
    it("should list all tool names", () => {
      const names = registry.listNames();
      expect(names).toContain("click");
      expect(names).toContain("type");
      expect(names).toContain("navigate");
      expect(names).toContain("done");
    });
  });

  describe("unregister", () => {
    it("should unregister a tool", () => {
      const removed = registry.unregister("click");
      expect(removed).toBe(true);
      expect(registry.has("click")).toBe(false);
    });

    it("should return false for non-existent tool", () => {
      const removed = registry.unregister("nonexistent");
      expect(removed).toBe(false);
    });
  });
});

describe("ToolValidator", () => {
  describe("validateInput", () => {
    it("should validate required fields", () => {
      const result = ToolValidator.validateInput(
        {},
        {
          type: "object",
          properties: { name: { type: "string", description: "Name" } },
          required: ["name"],
        },
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].field).toBe("name");
    });

    it("should pass validation with correct input", () => {
      const result = ToolValidator.validateInput(
        { name: "test" },
        {
          type: "object",
          properties: { name: { type: "string", description: "Name" } },
          required: ["name"],
        },
      );
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("should validate enum values", () => {
      const result = ToolValidator.validateInput(
        { color: "purple" },
        {
          type: "object",
          properties: {
            color: { type: "string", description: "Color", enum: ["red", "blue", "green"] },
          },
        },
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("must be one of");
    });

    it("should pass with valid enum value", () => {
      const result = ToolValidator.validateInput(
        { color: "red" },
        {
          type: "object",
          properties: {
            color: { type: "string", description: "Color", enum: ["red", "blue", "green"] },
          },
        },
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("validateOutput", () => {
    it("should validate ToolResult shape", () => {
      const result = ToolValidator.validateOutput({ success: true, content: "ok" });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid success type", () => {
      const result = ToolValidator.validateOutput({ success: "yes", content: "ok" });
      expect(result.valid).toBe(false);
    });
  });

  describe("sanitize", () => {
    it("should apply defaults", () => {
      const result = ToolValidator.sanitize(
        {},
        {
          type: "object",
          properties: {
            timeout: { type: "number", description: "Timeout", default: 5000 },
          },
        },
      );
      expect(result.timeout).toBe(5000);
    });

    it("should coerce types", () => {
      const result = ToolValidator.sanitize(
        { count: "42" },
        {
          type: "object",
          properties: { count: { type: "number", description: "Count" } },
        },
      );
      expect(result.count).toBe(42);
    });
  });
});
