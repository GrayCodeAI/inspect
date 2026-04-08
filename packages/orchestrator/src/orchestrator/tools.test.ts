import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Tools } from "./tools.js";

describe("Tools", () => {
  let tools: Tools;

  beforeEach(() => {
    tools = new Tools();
  });

  describe("getAgentTools", () => {
    it("should return available agent tools based on context", async () => {
      const toolsList = await Effect.runPromise(
        tools.getAgentTools({
          context: "testing",
          availableTools: ["visualRegression", "accessibility", "security"],
        }),
      );
      expect(toolsList).toBeInstanceOf(Array);
      expect(toolsList).toHaveLength(3);
      expect(toolsList).toContain("visualRegression");
      expect(toolsList).toContain("accessibility");
      expect(toolsList).toContain("security");
    });

    it("should filter tools based on mode", async () => {
      const toolsList = await Effect.runPromise(
        tools.getAgentTools({
          context: "testing",
          availableTools: ["visualRegression", "accessibility", "security", "lighthouse"],
          mode: "dom",
        }),
      );
      expect(toolsList).toHaveLength(4); // All tools available in dom mode
    });

    it("should return only visual tools when mode is visual", async () => {
      const toolsList = await Effect.runPromise(
        tools.getAgentTools({
          context: "testing",
          availableTools: ["visualRegression", "accessibility", "security", "lighthouse"],
          mode: "visual",
        }),
      );
      expect(toolsList).toHaveLength(1);
      expect(toolsList).toContain("visualRegression");
    });
  });

  describe("getNonVisualTools", () => {
    it("should return non-visual tools", async () => {
      const toolsList = await Effect.runPromise(
        tools.getNonVisualTools({
          context: "testing",
          availableTools: ["visualRegression", "accessibility", "security", "lighthouse"],
        }),
      );
      expect(toolsList).toHaveLength(3);
      expect(toolsList).not.toContain("visualRegression");
    });

    it("should respect mode restrictions", async () => {
      const toolsList = await Effect.runPromise(
        tools.getNonVisualTools({
          context: "testing",
          availableTools: ["visualRegression", "accessibility", "security", "lighthouse"],
          mode: "visual",
        }),
      );
      expect(toolsList).toHaveLength(0); // No non-visual tools in visual mode
    });
  });

  describe("getCacheableTools", () => {
    it("should return cacheable tools", async () => {
      const toolsList = await Effect.runPromise(
        tools.getCacheableTools({
          context: "testing",
          availableTools: ["visualRegression", "accessibility", "security", "lighthouse"],
        }),
      );
      expect(toolsList).toBeInstanceOf(Array);
      expect(toolsList).toContain("visualRegression");
      expect(toolsList).toContain("accessibility");
    });

    it("should exclude non-cacheable tools", async () => {
      const toolsList = await Effect.runPromise(
        tools.getCacheableTools({
          context: "testing",
          availableTools: ["visualRegression", "security", "lighthouse"],
        }),
      );
      expect(toolsList).not.toContain("security"); // Assume security is not cacheable
    });
  });

  describe("getTool", () => {
    it("should return tool implementation for a given name", async () => {
      const tool = await Effect.runPromise(
        tools.getTool({
          name: "visualRegression",
          context: "testing",
        }),
      );
      expect(tool).toBeInstanceOf(Object);
      expect(tool).toHaveProperty("execute");
      expect(tool).toHaveProperty("description", "Visual regression testing tool");
    });

    it("should throw if tool not found", async () => {
      await expect(
        Effect.runPromise(
          tools.getTool({
            name: "nonexistent",
            context: "testing",
          }),
        ),
      ).rejects.toThrow("Tool not found");
    });

    it("should respect mode restrictions", async () => {
      const tool = await Effect.runPromise(
        tools.getTool({
          name: "accessibility",
          context: "testing",
          mode: "visual",
        }),
      );
      expect(tool).toBeNull(); // accessibility not available in visual mode
    });
  });

  describe("executeTool", () => {
    it("should execute a tool with given arguments", async () => {
      const result = await Effect.runPromise(
        tools.executeTool({
          name: "visualRegression",
          args: { screenshotPath: "test.png", baselinePath: "baseline.png" },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("diffPercentage");
    });

    it("should handle tool execution errors gracefully", async () => {
      const result = await Effect.runPromise(
        tools.executeTool({
          name: "visualRegression",
          args: { screenshotPath: "nonexistent.png", baselinePath: "baseline.png" },
        }),
      );
      expect(result).toBeInstanceOf(Object);
      expect(result.success).toBe(false);
      expect(result.error).toBeString();
    });
  });
});
