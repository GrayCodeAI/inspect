// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Tool Decorator Tests
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { registerDecoratedTools, toolAction } from "./decorators.js";
import { ToolRegistry } from "./registry.js";
import type { ToolResult } from "./registry.js";
import type { ToolActionMetadata } from "./decorators.js";

function createTestProvider() {
  const provider = {
    testTool: async (args: Record<string, unknown>): Promise<ToolResult> => {
      return { success: true, content: `Echo: ${args.message}` };
    },
    failingTool: async (_args: Record<string, unknown>): Promise<ToolResult> => {
      throw new Error("Always fails");
    },
    regularMethod: () => "not a tool",
  };

  // Attach metadata to simulate decorator behavior
  (provider.testTool as unknown as { __toolMetadata: ToolActionMetadata }).__toolMetadata = {
    name: "test_tool",
    description: "A test tool",
    category: "testing",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to echo" },
      },
      required: ["message"],
    },
  };

  (provider.failingTool as unknown as { __toolMetadata: ToolActionMetadata }).__toolMetadata = {
    name: "failing_tool",
    description: "A tool that fails",
    retries: 2,
  };

  return provider;
}

describe("toolAction decorator", () => {
  it("should attach metadata to decorated methods", () => {
    const provider = createTestProvider();
    const method = provider.testTool as unknown as { __toolMetadata?: { name: string } };
    expect(method.__toolMetadata).toBeDefined();
    expect(method.__toolMetadata?.name).toBe("test_tool");
  });

  it("should not attach metadata to regular methods", () => {
    const provider = createTestProvider();
    const method = provider.regularMethod as unknown as { __toolMetadata?: unknown };
    expect(method.__toolMetadata).toBeUndefined();
  });
});

describe("registerDecoratedTools", () => {
  it("should register decorated tools into a registry", () => {
    const registry = new ToolRegistry();
    const provider = createTestProvider();

    const count = registerDecoratedTools(
      (name, desc, schema, handler, opts) => registry.register(name, desc, schema, handler, opts),
      provider as unknown as Record<string, unknown>,
    );

    expect(count).toBe(2);
    expect(registry.has("test_tool")).toBe(true);
    expect(registry.has("failing_tool")).toBe(true);
  });

  it("should execute decorated tool successfully", async () => {
    const registry = new ToolRegistry();
    const provider = createTestProvider();

    registerDecoratedTools(
      (name, desc, schema, handler, opts) => registry.register(name, desc, schema, handler, opts),
      provider as unknown as Record<string, unknown>,
    );

    const result = await registry.execute("test_tool", { message: "hello" });
    expect(result.success).toBe(true);
    expect(result.content).toBe("Echo: hello");
  });

  it("should handle tool with retries on failure", async () => {
    const registry = new ToolRegistry();
    const provider = createTestProvider();

    registerDecoratedTools(
      (name, desc, schema, handler, opts) => registry.register(name, desc, schema, handler, opts),
      provider as unknown as Record<string, unknown>,
    );

    const result = await registry.execute("failing_tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Always fails");
  });
});

describe("toolAction function (decorator factory)", () => {
  it("should be a function", () => {
    expect(typeof toolAction).toBe("function");
  });

  it("should return a decorator function", () => {
    const decorator = toolAction({ name: "test", description: "test" });
    expect(typeof decorator).toBe("function");
  });
});
