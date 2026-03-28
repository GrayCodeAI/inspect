// ============================================================================
// @inspect/data - Zod Extractor
// ============================================================================

import type { z, ZodType, ZodError } from "zod";
import { createLogger } from "@inspect/observability";

const logger = createLogger("data/zod-extractor");

/** LLM interface for extraction */
export interface ExtractorLLM {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

/** Page content interface */
export interface PageContent {
  url: string;
  html?: string;
  text?: string;
  markdown?: string;
}

/** Zod extraction result */
export interface ZodExtractionResult<T> {
  data: T | null;
  valid: boolean;
  errors: string[];
  attempts: number;
}

/**
 * ZodExtractor sends page content and a schema description to an LLM,
 * validates the response with a Zod schema, and retries on validation failure.
 */
export class ZodExtractor {
  private maxRetries: number;

  constructor(options?: { maxRetries?: number }) {
    this.maxRetries = options?.maxRetries ?? 3;
  }

  /**
   * Extract structured data from page content using a Zod schema.
   *
   * @param instruction - Natural language extraction instruction
   * @param schema - Zod schema for validation
   * @param page - Page content to extract from
   * @param llm - LLM provider for intelligent extraction
   * @returns Validated extraction result
   */
  async extractWithZod<T>(
    instruction: string,
    schema: ZodType<T>,
    page: PageContent,
    llm: ExtractorLLM,
  ): Promise<ZodExtractionResult<T>> {
    const pageText = page.markdown ?? page.text ?? page.html ?? "";
    const schemaDescription = this.zodSchemaToDescription(schema);

    let lastErrors: string[] = [];

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const errorContext =
        attempt > 1
          ? `\n\nPrevious attempt had validation errors:\n${lastErrors.join("\n")}\nPlease fix these issues in your response.`
          : "";

      const systemPrompt = `You are a data extraction assistant. Extract structured data from the provided content according to the user's instruction. Respond with ONLY valid JSON that matches the required schema. Do not include any explanation or markdown formatting.`;

      const userPrompt = `Extract the following from this page content:

Instruction: ${instruction}

Required output schema:
${schemaDescription}

Page URL: ${page.url}
Page content:
${this.truncateContent(pageText, 8000)}
${errorContext}

Respond with ONLY the JSON data.`;

      try {
        const response = await llm.complete(userPrompt, systemPrompt);
        const parsed = this.parseJSON(response);

        if (parsed === null) {
          lastErrors = ["Failed to parse LLM response as JSON"];
          continue;
        }

        // Validate with Zod
        const result = schema.safeParse(parsed);

        if (result.success) {
          return {
            data: result.data,
            valid: true,
            errors: [],
            attempts: attempt,
          };
        }

        // Collect Zod errors
        lastErrors = this.formatZodErrors(result.error);
      } catch (error) {
        lastErrors = [
          error instanceof Error ? error.message : String(error),
        ];
      }
    }

    return {
      data: null,
      valid: false,
      errors: lastErrors,
      attempts: this.maxRetries,
    };
  }

  /**
   * Convert a Zod schema into a human-readable description for the LLM.
   */
  private zodSchemaToDescription(schema: ZodType): string {
    try {
      // Try to get the schema description from Zod's internal structure
      const def = (schema as unknown as { _def: Record<string, unknown> })._def;

      if (!def) return "A valid JSON object";

      return this.describeZodDef(def, 0);
    } catch (error) {
      logger.debug("Failed to describe Zod schema, using generic description", { error });
      return "A valid JSON object matching the expected structure";
    }
  }

  /**
   * Recursively describe a Zod definition.
   */
  private describeZodDef(
    def: Record<string, unknown>,
    depth: number,
  ): string {
    const indent = "  ".repeat(depth);
    const typeName = String(def.typeName ?? "");

    switch (typeName) {
      case "ZodObject": {
        const shape = def.shape as
          | (() => Record<string, { _def: Record<string, unknown> }>)
          | undefined;
        if (!shape) return `${indent}object`;

        const shapeObj =
          typeof shape === "function" ? shape() : shape;
        const lines = [`${indent}{`];
        for (const [key, value] of Object.entries(shapeObj)) {
          const fieldDef = (value as { _def: Record<string, unknown> })._def;
          const fieldDesc = this.describeZodDef(fieldDef, depth + 1);
          const isOptional =
            String(fieldDef.typeName) === "ZodOptional";
          lines.push(
            `${indent}  "${key}"${isOptional ? "?" : ""}: ${fieldDesc.trim()},`,
          );
        }
        lines.push(`${indent}}`);
        return lines.join("\n");
      }

      case "ZodString":
        return `${indent}string`;

      case "ZodNumber":
        return `${indent}number`;

      case "ZodBoolean":
        return `${indent}boolean`;

      case "ZodArray": {
        const innerType = def.type as
          | { _def: Record<string, unknown> }
          | undefined;
        if (innerType) {
          const inner = this.describeZodDef(innerType._def, depth);
          return `${indent}array of ${inner.trim()}`;
        }
        return `${indent}array`;
      }

      case "ZodOptional": {
        const innerType = def.innerType as
          | { _def: Record<string, unknown> }
          | undefined;
        if (innerType) {
          return this.describeZodDef(innerType._def, depth);
        }
        return `${indent}optional`;
      }

      case "ZodNullable": {
        const innerType = def.innerType as
          | { _def: Record<string, unknown> }
          | undefined;
        if (innerType) {
          return `${this.describeZodDef(innerType._def, depth).trim()} | null`;
        }
        return `${indent}nullable`;
      }

      case "ZodEnum": {
        const values = def.values as string[] | undefined;
        if (values) {
          return `${indent}one of: ${values.map((v) => `"${v}"`).join(", ")}`;
        }
        return `${indent}enum`;
      }

      case "ZodLiteral":
        return `${indent}${JSON.stringify(def.value)}`;

      case "ZodUnion": {
        const options = def.options as
          | Array<{ _def: Record<string, unknown> }>
          | undefined;
        if (options) {
          return options
            .map((o) => this.describeZodDef(o._def, depth).trim())
            .join(" | ");
        }
        return `${indent}union`;
      }

      case "ZodRecord":
        return `${indent}Record<string, unknown>`;

      case "ZodDate":
        return `${indent}date (ISO string)`;

      default:
        return `${indent}unknown`;
    }
  }

  /**
   * Format Zod validation errors into readable strings.
   */
  private formatZodErrors(error: ZodError): string[] {
    return error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    });
  }

  /**
   * Parse JSON from LLM response, handling markdown code fences.
   */
  private parseJSON(text: string): unknown | null {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch (error) {
      logger.debug("Direct JSON parse failed, trying fallback extraction", { error });
    }

    // Try extracting from code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]);
      } catch (error) {
        logger.debug("Failed to parse JSON from code fence", { error });
      }
    }

    // Try finding JSON object/array
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (error) {
        logger.debug("Failed to parse extracted JSON object/array", { error });
      }
    }

    return null;
  }

  /**
   * Truncate content to a maximum length.
   */
  private truncateContent(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return (
      text.slice(0, maxLength) + "\n...[content truncated]"
    );
  }
}
