// ============================================================================
// @inspect/agent - User-Defined Tool Registration
//
// Allows users to register custom tools that the agent can call during testing.
// Inspired by Browser Use's @tools.action decorator pattern.
// ============================================================================

export interface UserToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
  handler: (params: Record<string, unknown>) => Promise<string | Record<string, unknown>>;
}

/**
 * UserToolRegistry manages custom tools that extend the agent's capabilities.
 *
 * Usage:
 * ```ts
 * const tools = new UserToolRegistry();
 *
 * tools.register({
 *   name: "check_database",
 *   description: "Check if a user exists in the database",
 *   parameters: { email: { type: "string", description: "User email" } },
 *   handler: async ({ email }) => {
 *     const exists = await db.users.findByEmail(email);
 *     return exists ? "User exists" : "User not found";
 *   },
 * });
 *
 * // Agent can now call "check_database" during testing
 * ```
 */
export class UserToolRegistry {
  private tools = new Map<string, UserToolDefinition>();

  /**
   * Register a custom tool.
   */
  register(tool: UserToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Execute a registered tool.
   */
  async execute(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.handler(params);
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  /**
   * Get all tool definitions (for injecting into LLM context).
   */
  getDefinitions(): UserToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool descriptions formatted for LLM prompt.
   */
  getPromptContext(): string {
    if (this.tools.size === 0) return "";

    const lines = ["Available custom tools:"];
    for (const tool of this.tools.values()) {
      const params = tool.parameters
        ? Object.entries(tool.parameters)
            .map(([k, v]) => `${k}: ${v.type}${v.required ? " (required)" : ""}`)
            .join(", ")
        : "none";
      lines.push(`- ${tool.name}(${params}): ${tool.description}`);
    }
    return lines.join("\n");
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool count.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Remove a tool.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools.
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Helper decorator for defining tools inline.
 */
export function defineTool(
  name: string,
  description: string,
  handler: UserToolDefinition["handler"],
): UserToolDefinition {
  return { name, description, handler };
}
