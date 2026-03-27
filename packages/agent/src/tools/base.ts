// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Base Tool Abstract Class
// ──────────────────────────────────────────────────────────────────────────────

import type { ToolHandler, ToolParameterSchema, ToolResult } from "./registry.js";

/** Tool metadata that every tool must define */
export interface ToolMetadata {
  name: string;
  description: string;
  version: string;
  category: string;
  schema: ToolParameterSchema;
  readOnly?: boolean;
  destructive?: boolean;
  estimatedDuration?: number;
}

/**
 * Abstract base class for tools.
 *
 * Extend this class to create type-safe tools with built-in validation,
 * error handling, and lifecycle hooks.
 *
 * Usage:
 * ```ts
 * class MyTool extends BaseTool {
 *   readonly metadata: ToolMetadata = {
 *     name: "my_tool",
 *     description: "Does something useful",
 *     version: "1.0.0",
 *     category: "custom",
 *     schema: { type: "object", properties: { input: { type: "string", description: "Input value" } } }
 *   };
 *
 *   async execute(args: Record<string, unknown>): Promise<ToolResult> {
 *     return { success: true, content: `Processed: ${args.input}` };
 *   }
 * }
 * ```
 */
export abstract class BaseTool {
  abstract readonly metadata: ToolMetadata;

  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Called before execution. Return false to skip execution.
   */
  async beforeExecute(_args: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  /**
   * Called after execution with the result.
   */
  async afterExecute(_args: Record<string, unknown>, _result: ToolResult): Promise<void> {
    // Override in subclasses for post-execution logic
  }

  /**
   * Validate arguments against the tool's schema.
   */
  validate(args: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const required = this.metadata.schema.required ?? [];

    for (const field of required) {
      if (args[field] === undefined || args[field] === null) {
        errors.push(`Missing required field: "${field}"`);
      }
    }

    for (const [key, prop] of Object.entries(this.metadata.schema.properties)) {
      if (args[key] === undefined) continue;

      const value = args[key];
      const expectedType = prop.type;

      if (expectedType === "string" && typeof value !== "string") {
        errors.push(`Field "${key}" must be a string, got ${typeof value}`);
      } else if (expectedType === "number" && typeof value !== "number") {
        errors.push(`Field "${key}" must be a number, got ${typeof value}`);
      } else if (expectedType === "boolean" && typeof value !== "boolean") {
        errors.push(`Field "${key}" must be a boolean, got ${typeof value}`);
      }

      if (prop.enum && !prop.enum.includes(String(value))) {
        errors.push(`Field "${key}" must be one of: ${prop.enum.join(", ")}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Create a ToolHandler function from this tool instance.
   */
  toHandler(): ToolHandler {
    return async (args) => {
      const validation = this.validate(args);
      if (!validation.valid) {
        return {
          success: false,
          content: `Validation failed: ${validation.errors.join("; ")}`,
          error: validation.errors.join("; "),
        };
      }

      const shouldProceed = await this.beforeExecute(args);
      if (!shouldProceed) {
        return { success: false, content: "Execution skipped (beforeExecute returned false)" };
      }

      let result: ToolResult;
      try {
        result = await this.execute(args);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result = {
          success: false,
          content: `Tool "${this.metadata.name}" failed: ${msg}`,
          error: msg,
        };
      }

      await this.afterExecute(args, result);
      return result;
    };
  }

  /**
   * Get LLM-compatible tool definition.
   */
  toDefinition(): { name: string; description: string; parameters: Record<string, unknown> } {
    return {
      name: this.metadata.name,
      description: this.metadata.description,
      parameters: this.metadata.schema as unknown as Record<string, unknown>,
    };
  }
}
