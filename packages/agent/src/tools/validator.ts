// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Tool Input/Output Validator
// ──────────────────────────────────────────────────────────────────────────────

import type { ToolParameterSchema } from "./registry.js";

/** Validation error */
export interface ValidationError {
  field: string;
  message: string;
  expected?: string;
  received?: unknown;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates tool arguments against a JSON Schema definition.
 */
export class ToolValidator {
  /**
   * Validate input arguments against a tool's parameter schema.
   */
  static validateInput(
    args: Record<string, unknown>,
    schema: ToolParameterSchema,
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Check required fields
    for (const field of schema.required ?? []) {
      if (args[field] === undefined || args[field] === null) {
        errors.push({
          field,
          message: `Required field "${field}" is missing`,
          expected: "defined value",
          received: args[field],
        });
      }
    }

    // Validate each property
    for (const [field, prop] of Object.entries(schema.properties)) {
      const value = args[field];
      if (value === undefined || value === null) continue;

      // Type check
      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (prop.type !== actualType) {
        errors.push({
          field,
          message: `Field "${field}" expected type "${prop.type}", got "${actualType}"`,
          expected: prop.type,
          received: value,
        });
        continue;
      }

      // Enum check
      if (prop.enum && !prop.enum.includes(String(value))) {
        errors.push({
          field,
          message: `Field "${field}" must be one of: ${prop.enum.join(", ")}`,
          expected: prop.enum.join(" | "),
          received: value,
        });
      }

      // String length
      if (prop.type === "string" && typeof value === "string") {
        const propRecord = prop as Record<string, unknown>;
        if (
          typeof propRecord.minLength === "number" &&
          value.length < (propRecord.minLength as number)
        ) {
          errors.push({
            field,
            message: `Field "${field}" must be at least ${propRecord.minLength} characters`,
            received: value,
          });
        }
        if (
          typeof propRecord.maxLength === "number" &&
          value.length > (propRecord.maxLength as number)
        ) {
          errors.push({
            field,
            message: `Field "${field}" must be at most ${propRecord.maxLength} characters`,
            received: value,
          });
        }
      }

      // Number range
      if (prop.type === "number" && typeof value === "number") {
        const propRecord = prop as Record<string, unknown>;
        if (typeof propRecord.minimum === "number" && value < (propRecord.minimum as number)) {
          errors.push({
            field,
            message: `Field "${field}" must be >= ${propRecord.minimum}`,
            received: value,
          });
        }
        if (typeof propRecord.maximum === "number" && value > (propRecord.maximum as number)) {
          errors.push({
            field,
            message: `Field "${field}" must be <= ${propRecord.maximum}`,
            received: value,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate tool output/result.
   */
  static validateOutput(result: unknown, expectedType?: string): ValidationResult {
    const errors: ValidationError[] = [];

    if (expectedType) {
      const actualType = Array.isArray(result) ? "array" : typeof result;
      if (expectedType !== actualType) {
        errors.push({
          field: "output",
          message: `Expected output type "${expectedType}", got "${actualType}"`,
          expected: expectedType,
          received: result,
        });
      }
    }

    // Check for ToolResult shape
    if (typeof result === "object" && result !== null) {
      const obj = result as Record<string, unknown>;
      if ("success" in obj && typeof obj.success !== "boolean") {
        errors.push({
          field: "success",
          message: "ToolResult.success must be a boolean",
          expected: "boolean",
          received: obj.success,
        });
      }
      if ("content" in obj && typeof obj.content !== "string") {
        errors.push({
          field: "content",
          message: "ToolResult.content must be a string",
          expected: "string",
          received: obj.content,
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Sanitize and apply defaults to input arguments.
   */
  static sanitize(
    args: Record<string, unknown>,
    schema: ToolParameterSchema,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [field, prop] of Object.entries(schema.properties)) {
      if (args[field] !== undefined) {
        // Coerce types
        if (prop.type === "string" && typeof args[field] !== "string") {
          result[field] = String(args[field]);
        } else if (prop.type === "number" && typeof args[field] !== "number") {
          result[field] = Number(args[field]);
        } else if (prop.type === "boolean" && typeof args[field] !== "boolean") {
          result[field] = Boolean(args[field]);
        } else {
          result[field] = args[field];
        }
      } else if (prop.default !== undefined) {
        result[field] = prop.default;
      }
    }

    // Pass through unknown fields
    for (const key of Object.keys(args)) {
      if (!(key in result)) {
        result[key] = args[key];
      }
    }

    return result;
  }
}
