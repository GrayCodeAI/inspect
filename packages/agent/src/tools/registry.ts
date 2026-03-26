// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Tool Registry
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMToolDefinition } from "../providers/base.js";

/** JSON Schema for tool parameters */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: unknown;
    items?: Record<string, unknown>;
  }>;
  required?: string[];
}

/** Handler function for a tool */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

/** Result returned from a tool execution */
export interface ToolResult {
  /** Whether the tool succeeded */
  success: boolean;
  /** Text content of the result */
  content: string;
  /** Optional structured data */
  data?: unknown;
  /** Screenshot or image data (base64) */
  image?: string;
  /** Error message if failed */
  error?: string;
}

/** A registered tool entry */
export interface RegisteredTool {
  name: string;
  description: string;
  schema: ToolParameterSchema;
  handler: ToolHandler;
  /** Whether this is a built-in or custom tool */
  builtin: boolean;
  /** Category for organization */
  category?: string;
}

/**
 * Registry for tools available to the agent during test execution.
 *
 * Manages built-in browser actions (click, type, navigate) and
 * custom tools registered via @tools.action decorator pattern.
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  /**
   * Register a tool with the given name, schema, and handler.
   */
  register(
    name: string,
    description: string,
    schema: ToolParameterSchema,
    handler: ToolHandler,
    options?: { builtin?: boolean; category?: string },
  ): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }

    this.tools.set(name, {
      name,
      description,
      schema,
      handler,
      builtin: options?.builtin ?? false,
      category: options?.category,
    });
  }

  /**
   * Unregister a tool by name.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tools as LLM tool definitions.
   */
  getTools(): LLMToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema as unknown as Record<string, unknown>,
    }));
  }

  /**
   * Get tools filtered by category.
   */
  getToolsByCategory(category: string): LLMToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.category === category)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.schema as unknown as Record<string, unknown>,
      }));
  }

  /**
   * Execute a tool by name with the given arguments.
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        content: `Unknown tool: ${name}`,
        error: `Tool "${name}" is not registered`,
      };
    }

    try {
      return await tool.handler(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `Tool "${name}" failed: ${message}`,
        error: message,
      };
    }
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * List all tool names.
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get a specific tool definition.
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  // ── Built-in tools ───────────────────────────────────────────────────

  private registerBuiltins(): void {
    this.register(
      "click",
      "Click on an element identified by its reference ID",
      {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element reference ID (e.g., 'e15')" },
          button: { type: "string", description: "Mouse button", enum: ["left", "right", "middle"], default: "left" },
          clickCount: { type: "number", description: "Number of clicks (1=single, 2=double)", default: 1 },
          modifiers: { type: "string", description: "Modifier keys (Shift, Control, Alt, Meta)" },
        },
        required: ["ref"],
      },
      async (args) => ({
        success: true,
        content: `Clicked element ${args.ref}`,
        data: { action: "click", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "type",
      "Type text into an input element",
      {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element reference ID" },
          text: { type: "string", description: "Text to type" },
          clear: { type: "string", description: "Whether to clear existing text first", enum: ["true", "false"], default: "true" },
          pressEnter: { type: "string", description: "Whether to press Enter after typing", enum: ["true", "false"], default: "false" },
        },
        required: ["ref", "text"],
      },
      async (args) => ({
        success: true,
        content: `Typed "${args.text}" into element ${args.ref}`,
        data: { action: "type", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "navigate",
      "Navigate to a URL",
      {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" },
          waitUntil: { type: "string", description: "When to consider navigation done", enum: ["load", "domcontentloaded", "networkidle"], default: "load" },
        },
        required: ["url"],
      },
      async (args) => ({
        success: true,
        content: `Navigated to ${args.url}`,
        data: { action: "navigate", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "screenshot",
      "Take a screenshot of the current page or element",
      {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element reference for element screenshot (optional)" },
          fullPage: { type: "string", description: "Capture full page", enum: ["true", "false"], default: "false" },
          name: { type: "string", description: "Name for the screenshot" },
        },
      },
      async (args) => ({
        success: true,
        content: `Screenshot taken${args.name ? `: ${args.name}` : ""}`,
        data: { action: "screenshot", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "assert",
      "Make an assertion about the current page state",
      {
        type: "object",
        properties: {
          condition: { type: "string", description: "Natural language condition to verify" },
          ref: { type: "string", description: "Element reference to check (optional)" },
          expected: { type: "string", description: "Expected value (optional)" },
        },
        required: ["condition"],
      },
      async (args) => ({
        success: true,
        content: `Assertion: ${args.condition}`,
        data: { action: "assert", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "scroll",
      "Scroll the page or an element",
      {
        type: "object",
        properties: {
          direction: { type: "string", description: "Scroll direction", enum: ["up", "down", "left", "right"] },
          amount: { type: "number", description: "Pixels to scroll (default: 500)" },
          ref: { type: "string", description: "Element to scroll (optional, scrolls page if omitted)" },
        },
        required: ["direction"],
      },
      async (args) => ({
        success: true,
        content: `Scrolled ${args.direction} by ${args.amount ?? 500}px`,
        data: { action: "scroll", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "select",
      "Select an option from a dropdown/select element",
      {
        type: "object",
        properties: {
          ref: { type: "string", description: "Select element reference ID" },
          value: { type: "string", description: "Option value to select" },
          label: { type: "string", description: "Option label to select (alternative to value)" },
        },
        required: ["ref"],
      },
      async (args) => ({
        success: true,
        content: `Selected "${args.value ?? args.label}" in element ${args.ref}`,
        data: { action: "select", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "hover",
      "Hover over an element",
      {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element reference ID" },
        },
        required: ["ref"],
      },
      async (args) => ({
        success: true,
        content: `Hovered over element ${args.ref}`,
        data: { action: "hover", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "wait",
      "Wait for a condition or fixed time",
      {
        type: "object",
        properties: {
          milliseconds: { type: "number", description: "Fixed wait time in ms" },
          condition: { type: "string", description: "Wait for condition (element visible, text appears, etc.)" },
          ref: { type: "string", description: "Element to wait for" },
          timeout: { type: "number", description: "Maximum wait time in ms (default: 30000)" },
        },
      },
      async (args) => ({
        success: true,
        content: args.milliseconds
          ? `Waited ${args.milliseconds}ms`
          : `Waited for: ${args.condition ?? "element"} ${args.ref ?? ""}`,
        data: { action: "wait", ...args },
      }),
      { builtin: true, category: "browser" },
    );

    this.register(
      "done",
      "Signal that the current test instruction is complete",
      {
        type: "object",
        properties: {
          success: { type: "string", description: "Whether the test passed", enum: ["true", "false"] },
          summary: { type: "string", description: "Brief summary of what was done and findings" },
        },
        required: ["success", "summary"],
      },
      async (args) => ({
        success: args.success === "true",
        content: `Test complete: ${args.summary}`,
        data: { action: "done", ...args },
      }),
      { builtin: true, category: "control" },
    );
  }
}
