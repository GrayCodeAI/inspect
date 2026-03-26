// ============================================================================
// @inspect/workflow - Data Extraction Block
// ============================================================================

import type { WorkflowBlock } from "@inspect/shared";
import { WorkflowContext } from "../engine/context.js";

/** JSON Schema definition for extraction */
export interface ExtractionSchema {
  type: string;
  properties?: Record<string, ExtractionSchema>;
  items?: ExtractionSchema;
  required?: string[];
  description?: string;
  enum?: unknown[];
  format?: string;
  default?: unknown;
}

/** Extraction result */
export interface ExtractionResult {
  data: unknown;
  valid: boolean;
  errors: string[];
  source: string;
}

/**
 * DataExtractionBlock extracts structured data from page content or
 * previous block output using a JSON schema for validation.
 * Integrates with LLM for intelligent extraction when available.
 */
export class DataExtractionBlock {
  private llmExtractor?: (
    instruction: string,
    content: string,
    schema: ExtractionSchema,
  ) => Promise<unknown>;

  /**
   * Register an LLM-based extractor for intelligent data extraction.
   */
  setLLMExtractor(
    extractor: (
      instruction: string,
      content: string,
      schema: ExtractionSchema,
    ) => Promise<unknown>,
  ): void {
    this.llmExtractor = extractor;
  }

  /**
   * Execute the extraction block.
   *
   * Parameters:
   * - instruction: NL description of what to extract
   * - schema: JSON Schema describing expected output shape
   * - source: context variable name containing input data (defaults to "lastOutput")
   * - retries: number of validation retries (default: 2)
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<ExtractionResult> {
    const params = block.parameters;
    const instruction = context.render(String(params.instruction ?? ""));
    const schema = (params.schema as ExtractionSchema) ?? { type: "object" };
    const sourceKey = String(params.source ?? "lastOutput");
    const maxRetries = (params.retries as number) ?? 2;

    const sourceData = context.get(sourceKey);
    const sourceStr =
      typeof sourceData === "string"
        ? sourceData
        : JSON.stringify(sourceData ?? "");

    let lastErrors: string[] = [];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let extracted: unknown;

        if (this.llmExtractor && instruction) {
          // Use LLM for intelligent extraction
          const retryHint =
            attempt > 0
              ? `\n\nPrevious attempt had validation errors: ${lastErrors.join("; ")}. Please fix these issues.`
              : "";
          extracted = await this.llmExtractor(
            instruction + retryHint,
            sourceStr,
            schema,
          );
        } else {
          // Try direct JSON parsing
          extracted = this.directExtract(sourceStr, schema);
        }

        // Validate against schema
        const errors = this.validateSchema(extracted, schema);
        if (errors.length === 0) {
          return {
            data: extracted,
            valid: true,
            errors: [],
            source: sourceKey,
          };
        }

        lastErrors = errors;

        if (attempt === maxRetries) {
          return {
            data: extracted,
            valid: false,
            errors,
            source: sourceKey,
          };
        }
      } catch (error) {
        lastErrors = [
          error instanceof Error ? error.message : String(error),
        ];

        if (attempt === maxRetries) {
          return {
            data: null,
            valid: false,
            errors: lastErrors,
            source: sourceKey,
          };
        }
      }
    }

    return {
      data: null,
      valid: false,
      errors: lastErrors,
      source: sourceKey,
    };
  }

  /**
   * Direct extraction attempt: parse JSON and map fields based on schema.
   */
  private directExtract(
    source: string,
    schema: ExtractionSchema,
  ): unknown {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(source);
      if (schema.type === "object" && schema.properties) {
        return this.mapToSchema(parsed, schema);
      }
      return parsed;
    } catch {
      // Not JSON - try to extract structured data from text
    }

    // Try to extract key-value pairs from text
    if (schema.type === "object" && schema.properties) {
      const result: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const pattern = new RegExp(
          `(?:${key}|${this.camelToWords(key)})\\s*[:\\-=]\\s*(.+?)(?:\\n|$)`,
          "i",
        );
        const match = source.match(pattern);
        if (match) {
          result[key] = this.coerceType(match[1].trim(), propSchema);
        } else if (propSchema.default !== undefined) {
          result[key] = propSchema.default;
        }
      }
      return result;
    }

    // If schema expects array, try splitting by newlines
    if (schema.type === "array") {
      return source
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }

    return source;
  }

  /**
   * Map parsed data to match schema structure.
   */
  private mapToSchema(
    data: unknown,
    schema: ExtractionSchema,
  ): unknown {
    if (!schema.properties || typeof data !== "object" || data === null) {
      return data;
    }

    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        result[key] = this.coerceType(obj[key], propSchema);
      } else {
        // Try case-insensitive lookup
        const lowerKey = key.toLowerCase();
        const found = Object.entries(obj).find(
          ([k]) => k.toLowerCase() === lowerKey,
        );
        if (found) {
          result[key] = this.coerceType(found[1], propSchema);
        } else if (propSchema.default !== undefined) {
          result[key] = propSchema.default;
        }
      }
    }

    return result;
  }

  /**
   * Coerce a value to match the expected schema type.
   */
  private coerceType(value: unknown, schema: ExtractionSchema): unknown {
    if (value === null || value === undefined) return value;

    switch (schema.type) {
      case "string":
        return String(value);
      case "number":
      case "integer": {
        const num = Number(value);
        return isNaN(num) ? value : num;
      }
      case "boolean":
        if (typeof value === "string") {
          return ["true", "yes", "1"].includes(value.toLowerCase());
        }
        return Boolean(value);
      case "array":
        if (Array.isArray(value)) return value;
        if (typeof value === "string") return value.split(",").map((s) => s.trim());
        return [value];
      case "object":
        if (typeof value === "object" && !Array.isArray(value)) {
          if (schema.properties) {
            return this.mapToSchema(value, schema);
          }
          return value;
        }
        if (typeof value === "string") {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      default:
        return value;
    }
  }

  /**
   * Validate data against a JSON schema.
   */
  validateSchema(data: unknown, schema: ExtractionSchema): string[] {
    const errors: string[] = [];
    this.validateNode(data, schema, "", errors);
    return errors;
  }

  private validateNode(
    data: unknown,
    schema: ExtractionSchema,
    path: string,
    errors: string[],
  ): void {
    const prefix = path ? `${path}: ` : "";

    // Type check
    if (schema.type) {
      const actualType = this.getType(data);
      if (schema.type === "integer") {
        if (typeof data !== "number" || !Number.isInteger(data)) {
          errors.push(`${prefix}expected integer but got ${actualType}`);
        }
      } else if (actualType !== schema.type && data !== null && data !== undefined) {
        errors.push(
          `${prefix}expected type '${schema.type}' but got '${actualType}'`,
        );
        return;
      }
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push(
        `${prefix}value must be one of: ${schema.enum.map(String).join(", ")}`,
      );
    }

    // Object property checks
    if (
      schema.type === "object" &&
      schema.properties &&
      typeof data === "object" &&
      data !== null
    ) {
      const obj = data as Record<string, unknown>;

      // Required fields
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in obj) || obj[key] === undefined) {
            errors.push(`${prefix}missing required field '${key}'`);
          }
        }
      }

      // Validate each property
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          this.validateNode(
            obj[key],
            propSchema,
            path ? `${path}.${key}` : key,
            errors,
          );
        }
      }
    }

    // Array items check
    if (schema.type === "array" && schema.items && Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        this.validateNode(
          data[i],
          schema.items,
          `${path}[${i}]`,
          errors,
        );
      }
    }
  }

  private getType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  /**
   * Convert camelCase to space-separated words.
   */
  private camelToWords(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  }
}
