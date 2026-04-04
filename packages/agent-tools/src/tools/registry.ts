import { Schema, Predicate } from "effect";

export interface ToolParameterSchema {
  type: string;
  properties: Record<
    string,
    {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
      items?: Record<string, unknown>;
    }
  >;
  required?: string[];
}

export const ToolResult = Schema.Struct({
  success: Schema.Boolean,
  content: Schema.String,
  data: Schema.optional(Schema.Unknown),
  image: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type ToolResult = typeof ToolResult.Type;

export const LLMToolDefinition = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  parameters: Schema.Unknown,
});
export type LLMToolDefinition = typeof LLMToolDefinition.Type;

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface RegisteredTool {
  name: string;
  description: string;
  schema: ToolParameterSchema;
  handler: ToolHandler;
  builtin: boolean;
  category: string | undefined;
}

interface BuiltinToolDef {
  name: string;
  description: string;
  schema: ToolParameterSchema;
  handler: ToolHandler;
  category: string;
}

async function makeResult(result: Omit<ToolResult, keyof unknown>): Promise<ToolResult> {
  return result as ToolResult;
}

const builtinTools: BuiltinToolDef[] = [
  {
    name: "click",
    description: "Click on an element identified by its reference ID",
    schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID (e.g., 'e15')" },
        button: {
          type: "string",
          description: "Mouse button",
          enum: ["left", "right", "middle"],
          default: "left",
        },
        clickCount: {
          type: "number",
          description: "Number of clicks (1=single, 2=double)",
          default: 1,
        },
        modifiers: { type: "string", description: "Modifier keys (Shift, Control, Alt, Meta)" },
      },
      required: ["ref"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Clicked element ${String(args.ref)}`,
        data: { action: "click", ...args },
      }),
    category: "browser",
  },
  {
    name: "type",
    description: "Type text into an input element",
    schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
        text: { type: "string", description: "Text to type" },
        clear: {
          type: "string",
          description: "Whether to clear existing text first",
          enum: ["true", "false"],
          default: "true",
        },
        pressEnter: {
          type: "string",
          description: "Whether to press Enter after typing",
          enum: ["true", "false"],
          default: "false",
        },
      },
      required: ["ref", "text"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Typed "${String(args.text)}" into element ${String(args.ref)}`,
        data: { action: "type", ...args },
      }),
    category: "browser",
  },
  {
    name: "navigate",
    description: "Navigate to a URL",
    schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
        waitUntil: {
          type: "string",
          description: "When to consider navigation done",
          enum: ["load", "domcontentloaded", "networkidle"],
          default: "load",
        },
      },
      required: ["url"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Navigated to ${String(args.url)}`,
        data: { action: "navigate", ...args },
      }),
    category: "browser",
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page or element",
    schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference for element screenshot (optional)" },
        fullPage: {
          type: "string",
          description: "Capture full page",
          enum: ["true", "false"],
          default: "false",
        },
        name: { type: "string", description: "Name for the screenshot" },
      },
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: args.name ? `Screenshot taken: ${String(args.name)}` : "Screenshot taken",
        data: { action: "screenshot", ...args },
      }),
    category: "browser",
  },
  {
    name: "assert",
    description: "Make an assertion about the current page state",
    schema: {
      type: "object",
      properties: {
        condition: { type: "string", description: "Natural language condition to verify" },
        ref: { type: "string", description: "Element reference to check (optional)" },
        expected: { type: "string", description: "Expected value (optional)" },
      },
      required: ["condition"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Assertion: ${String(args.condition)}`,
        data: { action: "assert", ...args },
      }),
    category: "browser",
  },
  {
    name: "scroll",
    description: "Scroll the page or an element",
    schema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          description: "Scroll direction",
          enum: ["up", "down", "left", "right"],
        },
        amount: { type: "number", description: "Pixels to scroll (default: 500)" },
        ref: {
          type: "string",
          description: "Element to scroll (optional, scrolls page if omitted)",
        },
      },
      required: ["direction"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Scrolled ${String(args.direction)} by ${Number(args.amount ?? 500)}px`,
        data: { action: "scroll", ...args },
      }),
    category: "browser",
  },
  {
    name: "select",
    description: "Select an option from a dropdown/select element",
    schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Select element reference ID" },
        value: { type: "string", description: "Option value to select" },
        label: { type: "string", description: "Option label to select (alternative to value)" },
      },
      required: ["ref"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Selected "${String(args.value ?? args.label)}" in element ${String(args.ref)}`,
        data: { action: "select", ...args },
      }),
    category: "browser",
  },
  {
    name: "hover",
    description: "Hover over an element",
    schema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
      },
      required: ["ref"],
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: `Hovered over element ${String(args.ref)}`,
        data: { action: "hover", ...args },
      }),
    category: "browser",
  },
  {
    name: "wait",
    description: "Wait for a condition or fixed time",
    schema: {
      type: "object",
      properties: {
        milliseconds: { type: "number", description: "Fixed wait time in ms" },
        condition: {
          type: "string",
          description: "Wait for condition (element visible, text appears, etc.)",
        },
        ref: { type: "string", description: "Element to wait for" },
        timeout: { type: "number", description: "Maximum wait time in ms (default: 30000)" },
      },
    },
    handler: (args) =>
      makeResult({
        success: true,
        content: args.milliseconds
          ? `Waited ${Number(args.milliseconds)}ms`
          : `Waited for: ${String(args.condition ?? "element")} ${String(args.ref ?? "")}`,
        data: { action: "wait", ...args },
      }),
    category: "browser",
  },
  {
    name: "done",
    description: "Signal that the current test instruction is complete",
    schema: {
      type: "object",
      properties: {
        success: {
          type: "string",
          description: "Whether the test passed",
          enum: ["true", "false"],
        },
        summary: { type: "string", description: "Brief summary of what was done and findings" },
      },
      required: ["success", "summary"],
    },
    handler: (args) =>
      makeResult({
        success: args.success === "true",
        content: `Test complete: ${String(args.summary)}`,
        data: { action: "done", ...args },
      }),
    category: "control",
  },
];

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    this.registerBuiltins();
  }

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
      builtin: options?.builtin === true,
      category: options?.category,
    });
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  getTools(): LLMToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }));
  }

  getToolsByCategory(category: string): LLMToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.category === category)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      }));
  }

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

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  private registerBuiltins(): void {
    for (const builtin of builtinTools) {
      this.tools.set(builtin.name, {
        name: builtin.name,
        description: builtin.description,
        schema: builtin.schema,
        handler: builtin.handler,
        builtin: true,
        category: builtin.category,
      });
    }
  }
}
