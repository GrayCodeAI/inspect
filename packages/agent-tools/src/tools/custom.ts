// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Custom Tools Support
// ──────────────────────────────────────────────────────────────────────────────

import {
  ToolRegistry,
  type ToolHandler,
  type ToolParameterSchema,
  type ToolResult,
} from "./registry.js";

/** Custom tool definition (user-created) */
export interface CustomToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, CustomToolParameter>;
  handler: ToolHandler;
}

/** Parameter definition for custom tools */
export interface CustomToolParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
}

/** Cloud skill reference for loading tools from a skill library */
export interface SkillReference {
  skillId: string;
  version?: string;
  endpoint?: string;
  apiKey?: string;
}

/**
 * Manages custom tool registration for the agent.
 *
 * Supports two patterns:
 * 1. Inline registration via `action()` (similar to @tools.action decorator)
 * 2. Loading from cloud skill library via `fromSkill()`
 */
export class CustomTools {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Register a custom action tool.
   *
   * Usage:
   * ```ts
   * customTools.action(
   *   "fill_login",
   *   "Fill in the login form with test credentials",
   *   async (args) => {
   *     // Custom logic
   *     return { success: true, content: "Filled login form" };
   *   },
   *   {
   *     username: { type: "string", description: "Username", required: true },
   *     password: { type: "string", description: "Password", required: true },
   *   }
   * );
   * ```
   */
  action(
    name: string,
    description: string,
    handler: ToolHandler,
    parameters?: Record<string, CustomToolParameter>,
  ): void {
    const schema = this.buildSchema(parameters);

    this.registry.register(
      name,
      description,
      schema,
      handler,
      { builtin: false, category: "custom" },
    );
  }

  /**
   * Register multiple custom tools at once.
   */
  registerAll(tools: CustomToolDefinition[]): void {
    for (const tool of tools) {
      this.action(
        tool.name,
        tool.description,
        tool.handler,
        tool.parameters,
      );
    }
  }

  /**
   * Load a tool from a cloud skill library.
   *
   * Skills are remote tool definitions with their own execution logic.
   * The skill is fetched from the skill endpoint and registered locally.
   */
  async fromSkill(ref: SkillReference): Promise<void> {
    const endpoint = ref.endpoint ?? "https://skills.inspect.dev/api/v1";
    const url = `${endpoint}/skills/${ref.skillId}${ref.version ? `?version=${ref.version}` : ""}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (ref.apiKey) {
      headers.Authorization = `Bearer ${ref.apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to load skill ${ref.skillId}: ${response.status} ${response.statusText}`,
      );
    }

    const skill = (await response.json()) as {
      name: string;
      description: string;
      parameters: Record<string, CustomToolParameter>;
      executeEndpoint: string;
    };

    // Create a handler that calls the skill's execution endpoint
    const executeUrl = skill.executeEndpoint;
    const skillHandler: ToolHandler = async (args) => {
      const execResponse = await fetch(executeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ arguments: args }),
      });

      if (!execResponse.ok) {
        const error = await execResponse.text();
        return {
          success: false,
          content: `Skill execution failed: ${error}`,
          error,
        };
      }

      const result = (await execResponse.json()) as ToolResult;
      return result;
    };

    this.action(skill.name, skill.description, skillHandler, skill.parameters);
  }

  /**
   * Create a composite tool that chains multiple tools together.
   */
  compose(
    name: string,
    description: string,
    steps: Array<{ tool: string; args: Record<string, unknown> | ((prev: ToolResult) => Record<string, unknown>) }>,
  ): void {
    const handler: ToolHandler = async () => {
      const results: ToolResult[] = [];
      let lastResult: ToolResult = { success: true, content: "" };

      for (const step of steps) {
        const args = typeof step.args === "function"
          ? step.args(lastResult)
          : step.args;

        const result = await this.registry.execute(step.tool, args);
        results.push(result);
        lastResult = result;

        if (!result.success) {
          return {
            success: false,
            content: `Composite tool failed at step "${step.tool}": ${result.error}`,
            error: result.error,
            data: { results },
          };
        }
      }

      return {
        success: true,
        content: `Composite tool "${name}" completed ${steps.length} steps`,
        data: { results },
      };
    };

    this.action(name, description, handler);
  }

  /**
   * Remove a custom tool by name.
   */
  remove(name: string): boolean {
    return this.registry.unregister(name);
  }

  /**
   * List all custom (non-builtin) tools.
   */
  listCustom(): string[] {
    return this.registry.listNames().filter((name) => {
      const tool = this.registry.getTool(name);
      return tool && !tool.builtin;
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildSchema(parameters?: Record<string, CustomToolParameter>): ToolParameterSchema {
    if (!parameters) {
      return { type: "object", properties: {} };
    }

    const properties: ToolParameterSchema["properties"] = {};
    const required: string[] = [];

    for (const [name, param] of Object.entries(parameters)) {
      properties[name] = {
        type: param.type,
        description: param.description,
      };

      if (param.enum) {
        properties[name].enum = param.enum;
      }

      if (param.default !== undefined) {
        properties[name].default = param.default;
      }

      if (param.required) {
        required.push(name);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }
}
