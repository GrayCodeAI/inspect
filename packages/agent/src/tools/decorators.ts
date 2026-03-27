// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Tool Decorators for Registration
// ──────────────────────────────────────────────────────────────────────────────

import type { ToolHandler, ToolParameterSchema, ToolResult } from "./registry.js";

/** Metadata for a tool action */
export interface ToolActionMetadata {
  name: string;
  description: string;
  version?: string;
  category?: string;
  schema?: ToolParameterSchema;
  timeout?: number;
  retries?: number;
  readOnly?: boolean;
}

/** Decorated method that carries tool metadata */
export interface DecoratedMethod {
  (...args: unknown[]): Promise<ToolResult>;
  __toolMetadata?: ToolActionMetadata;
}

/**
 * Decorator factory for marking methods as tool actions.
 *
 * Usage:
 * ```ts
 * class MyTools {
 *   @toolAction({
 *     name: "fill_login",
 *     description: "Fill login form",
 *     schema: { type: "object", properties: { user: { type: "string", description: "Username" } } }
 *   })
 *   async fillLogin(args: Record<string, unknown>): Promise<ToolResult> {
 *     return { success: true, content: "Logged in" };
 *   }
 * }
 * ```
 */
export function toolAction(metadata: ToolActionMetadata) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as DecoratedMethod;
    originalMethod.__toolMetadata = metadata;
    return descriptor;
  };
}

/**
 * Register all decorated methods from a class instance into a registry.
 *
 * Usage:
 * ```ts
 * const registry = new ToolRegistry();
 * registerDecoratedTools(registry, new MyTools());
 * ```
 */
export function registerDecoratedTools(
  registerFn: (
    name: string,
    description: string,
    schema: ToolParameterSchema,
    handler: ToolHandler,
    opts?: { builtin?: boolean; category?: string },
  ) => void,
  instance: Record<string, unknown>,
): number {
  let count = 0;

  for (const key of Object.keys(instance)) {
    const method = instance[key] as DecoratedMethod | undefined;
    if (typeof method !== "function" || !method.__toolMetadata) continue;

    const meta = method.__toolMetadata;
    const schema: ToolParameterSchema = meta.schema ?? { type: "object", properties: {} };

    const handler: ToolHandler = async (args) => {
      let result: ToolResult;
      let attempts = 0;
      const maxAttempts = (meta.retries ?? 0) + 1;

      while (attempts < maxAttempts) {
        try {
          if (meta.timeout) {
            result = await Promise.race([
              method.call(instance, args) as Promise<ToolResult>,
              new Promise<ToolResult>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Tool "${meta.name}" timed out after ${meta.timeout}ms`)),
                  meta.timeout,
                ),
              ),
            ]);
          } else {
            result = (await method.call(instance, args)) as unknown as ToolResult;
          }
          return result;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Tool "${meta.name}" failed: ${msg}`, error: msg };
          }
        }
      }

      return { success: false, content: "Unreachable", error: "Unreachable" };
    };

    registerFn(meta.name, meta.description, schema, handler, {
      builtin: false,
      category: meta.category ?? "custom",
    });
    count++;
  }

  return count;
}

/**
 * Decorator for marking a class as a tool provider.
 * All methods with @toolAction will be auto-registered.
 */
/**
 * Decorator for marking a class as a tool provider.
 * All methods with @toolAction will be auto-registered.
 * Note: This is a marker decorator - use registerDecoratedTools() to actually register tools.
 */
export function toolProvider(_options?: { namespace?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (target: any): any {
    // Add a helper method to the prototype
    target.prototype.getToolMetadata = function (): ToolActionMetadata[] {
      const metadata: ToolActionMetadata[] = [];
      for (const key of Object.keys(this)) {
        const method = this[key] as DecoratedMethod | undefined;
        if (typeof method === "function" && method.__toolMetadata) {
          metadata.push(method.__toolMetadata);
        }
      }
      return metadata;
    };
    return target;
  };
}
