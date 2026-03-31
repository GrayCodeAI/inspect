// ============================================================================
// @inspect/workflow - Workflow Context
// ============================================================================

import type { WorkflowParameter } from "@inspect/core";

/**
 * WorkflowContext manages parameters, variables, and template rendering
 * for a workflow execution. Supports Handlebars-style {{var}} replacement
 * with optional strict mode validation.
 */
export class WorkflowContext {
  private parameters: Map<string, unknown> = new Map();
  private parameterSchema: Record<string, WorkflowParameter> = {};
  private strictMode: boolean;

  constructor(
    initialParams?: Record<string, unknown>,
    schema?: Record<string, WorkflowParameter>,
    strictMode: boolean = false,
  ) {
    this.strictMode = strictMode;
    if (schema) {
      this.parameterSchema = schema;
    }

    // Apply defaults from schema
    if (schema) {
      for (const [key, def] of Object.entries(schema)) {
        if (def.default !== undefined) {
          this.parameters.set(key, def.default);
        }
      }
    }

    // Override with provided initial params
    if (initialParams) {
      for (const [key, value] of Object.entries(initialParams)) {
        this.parameters.set(key, value);
      }
    }

    // Validate required params
    if (strictMode && schema) {
      this.validateRequired();
    }
  }

  /**
   * Set a parameter value.
   */
  set(key: string, value: unknown): void {
    if (this.strictMode && this.parameterSchema[key]) {
      this.validateType(key, value, this.parameterSchema[key]);
    }
    this.parameters.set(key, value);
  }

  /**
   * Get a parameter value. Returns undefined if not found.
   */
  get<T = unknown>(key: string): T | undefined {
    return this.parameters.get(key) as T | undefined;
  }

  /**
   * Check if a parameter exists.
   */
  has(key: string): boolean {
    return this.parameters.has(key);
  }

  /**
   * Delete a parameter.
   */
  delete(key: string): boolean {
    return this.parameters.delete(key);
  }

  /**
   * Get all parameters as a plain object.
   */
  toObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of this.parameters) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Merge additional parameters into context.
   */
  merge(params: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(params)) {
      this.set(key, value);
    }
  }

  /**
   * Get the number of parameters.
   */
  get size(): number {
    return this.parameters.size;
  }

  /**
   * Render a template string, replacing {{variable}} placeholders
   * with values from the context. Supports dot notation for nested access
   * (e.g., {{user.name}}) and {{#each items}} ... {{/each}} for arrays.
   *
   * @param template - The template string with {{var}} placeholders
   * @returns The rendered string with placeholders replaced
   * @throws Error if strict mode is enabled and a variable is missing
   */
  render(template: string): string {
    // Process {{#each array}} ... {{/each}} blocks
    let result = this.processEachBlocks(template);

    // Process {{#if var}} ... {{/if}} blocks
    result = this.processIfBlocks(result);

    // Process simple {{variable}} replacements
    result = result.replace(/\{\{([^#/}][^}]*?)\}\}/g, (_match, expr: string) => {
      const trimmed = expr.trim();
      const value = this.resolveExpression(trimmed);

      if (value === undefined) {
        if (this.strictMode) {
          throw new Error(
            `Template variable '${trimmed}' is not defined in workflow context`,
          );
        }
        return "";
      }

      if (typeof value === "object" && value !== null) {
        return JSON.stringify(value);
      }

      return String(value);
    });

    return result;
  }

  /**
   * Create a child context that inherits from this one.
   * Changes to the child don't affect the parent.
   */
  createChild(additionalParams?: Record<string, unknown>): WorkflowContext {
    const child = new WorkflowContext(
      this.toObject(),
      this.parameterSchema,
      this.strictMode,
    );
    if (additionalParams) {
      child.merge(additionalParams);
    }
    return child;
  }

  /**
   * Process {{#each array}}...{{/each}} blocks.
   */
  private processEachBlocks(template: string): string {
    const eachRegex = /\{\{#each\s+(\w[\w.]*)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    return template.replace(eachRegex, (_match, varName: string, body: string) => {
      const arr = this.resolveExpression(varName);
      if (!Array.isArray(arr)) {
        if (this.strictMode) {
          throw new Error(
            `Template #each variable '${varName}' is not an array`,
          );
        }
        return "";
      }

      return arr
        .map((item, index) => {
          // Create a temporary context for the iteration
          let rendered = body;
          // Replace {{@index}} with the current index
          rendered = rendered.replace(/\{\{@index\}\}/g, String(index));
          // Replace {{this}} with the current item
          rendered = rendered.replace(/\{\{this\}\}/g, String(item));
          // Replace {{this.property}} with item properties
          if (typeof item === "object" && item !== null) {
            rendered = rendered.replace(
              /\{\{this\.([^}]+)\}\}/g,
              (_m: string, prop: string) => {
                const val = (item as Record<string, unknown>)[prop.trim()];
                return val !== undefined ? String(val) : "";
              },
            );
          }
          return rendered;
        })
        .join("");
    });
  }

  /**
   * Process {{#if var}}...{{/if}} and {{#if var}}...{{else}}...{{/if}} blocks.
   */
  private processIfBlocks(template: string): string {
    const ifRegex =
      /\{\{#if\s+(\w[\w.]*)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
    return template.replace(
      ifRegex,
      (_match, varName: string, truthyBody: string, falsyBody?: string) => {
        const value = this.resolveExpression(varName);
        const isTruthy = Boolean(value);
        if (isTruthy) {
          return truthyBody;
        }
        return falsyBody ?? "";
      },
    );
  }

  /**
   * Resolve a dot-notation expression to a value.
   * Supports paths like "user.name", "items.0.id".
   */
  private resolveExpression(expr: string): unknown {
    const parts = expr.split(".");
    let value: unknown = this.parameters.get(parts[0]);

    for (let i = 1; i < parts.length; i++) {
      if (value === undefined || value === null) return undefined;
      if (typeof value === "object") {
        value = (value as Record<string, unknown>)[parts[i]];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Validate that all required parameters are present.
   */
  private validateRequired(): void {
    for (const [key, def] of Object.entries(this.parameterSchema)) {
      if (def.required && !this.parameters.has(key)) {
        throw new Error(`Required workflow parameter '${key}' is missing`);
      }
    }
  }

  /**
   * Validate a value against its parameter schema type.
   */
  private validateType(
    key: string,
    value: unknown,
    schema: WorkflowParameter,
  ): void {
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (schema.type === "array" && !Array.isArray(value)) {
      throw new Error(
        `Parameter '${key}' expected type 'array' but got '${actualType}'`,
      );
    }
    if (
      schema.type !== "array" &&
      schema.type !== "object" &&
      actualType !== schema.type
    ) {
      throw new Error(
        `Parameter '${key}' expected type '${schema.type}' but got '${actualType}'`,
      );
    }
    if (schema.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
      throw new Error(
        `Parameter '${key}' expected type 'object' but got '${actualType}'`,
      );
    }
  }
}
