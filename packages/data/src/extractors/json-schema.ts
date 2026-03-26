// ============================================================================
// @inspect/data - JSON Schema Extractor
// ============================================================================

/** JSON Schema definition */
export interface JSONSchemaDefinition {
  type?: string;
  properties?: Record<string, JSONSchemaDefinition>;
  items?: JSONSchemaDefinition;
  required?: string[];
  description?: string;
  enum?: unknown[];
  format?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchemaDefinition;
  oneOf?: JSONSchemaDefinition[];
  anyOf?: JSONSchemaDefinition[];
  allOf?: JSONSchemaDefinition[];
}

/** LLM interface */
export interface SchemaExtractorLLM {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}

/** Page content */
export interface SchemaPageContent {
  url: string;
  html?: string;
  text?: string;
  markdown?: string;
}

/** Extraction result */
export interface JSONSchemaExtractionResult {
  data: unknown;
  valid: boolean;
  errors: string[];
  attempts: number;
}

/**
 * JSONSchemaExtractor extracts structured data using JSON Schema validation.
 * Sends page content + schema to an LLM, validates the response against
 * the schema, and retries on validation failure with error feedback.
 */
export class JSONSchemaExtractor {
  private maxRetries: number;

  constructor(options?: { maxRetries?: number }) {
    this.maxRetries = options?.maxRetries ?? 3;
  }

  /**
   * Extract data from page content using a JSON Schema for validation.
   */
  async extractWithJSONSchema(
    instruction: string,
    schema: JSONSchemaDefinition,
    page: SchemaPageContent,
    llm: SchemaExtractorLLM,
  ): Promise<JSONSchemaExtractionResult> {
    const content = page.markdown ?? page.text ?? page.html ?? "";
    let lastErrors: string[] = [];

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const errorHint =
        attempt > 1
          ? `\n\nPrevious extraction had these validation errors:\n${lastErrors.join("\n")}\nPlease correct these issues.`
          : "";

      const systemPrompt = `You are a structured data extractor. Extract data from the provided content according to the instruction and return ONLY valid JSON matching the provided schema. No explanation, no markdown.`;

      const userPrompt = `${instruction}

JSON Schema for the output:
${JSON.stringify(schema, null, 2)}

Content from ${page.url}:
${content.slice(0, 8000)}
${errorHint}

Return ONLY valid JSON.`;

      try {
        const response = await llm.complete(userPrompt, systemPrompt);
        const parsed = this.parseJSON(response);

        if (parsed === null) {
          lastErrors = ["LLM response is not valid JSON"];
          continue;
        }

        // Apply field mapping and type conversion
        const mapped = this.mapAndConvert(parsed, schema);

        // Validate
        const errors = this.validate(mapped, schema);
        if (errors.length === 0) {
          return { data: mapped, valid: true, errors: [], attempts: attempt };
        }

        lastErrors = errors;
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
   * Validate data against a JSON Schema.
   */
  validate(
    data: unknown,
    schema: JSONSchemaDefinition,
    path: string = "",
  ): string[] {
    const errors: string[] = [];
    const prefix = path ? `${path}: ` : "";

    if (data === undefined || data === null) {
      if (schema.default !== undefined) return errors;
      return errors;
    }

    // Type validation
    if (schema.type) {
      const actualType = this.getType(data);
      if (schema.type === "integer") {
        if (typeof data !== "number" || !Number.isInteger(data)) {
          errors.push(`${prefix}expected integer, got ${actualType}`);
        }
      } else if (actualType !== schema.type) {
        errors.push(`${prefix}expected ${schema.type}, got ${actualType}`);
        return errors;
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push(
        `${prefix}value must be one of: ${schema.enum.map(String).join(", ")}`,
      );
    }

    // String validations
    if (typeof data === "string") {
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push(
          `${prefix}string too short (min ${schema.minLength})`,
        );
      }
      if (schema.maxLength !== undefined && data.length > schema.maxLength) {
        errors.push(
          `${prefix}string too long (max ${schema.maxLength})`,
        );
      }
      if (schema.pattern) {
        if (!new RegExp(schema.pattern).test(data)) {
          errors.push(
            `${prefix}does not match pattern: ${schema.pattern}`,
          );
        }
      }
      if (schema.format) {
        const formatError = this.validateFormat(data, schema.format);
        if (formatError) {
          errors.push(`${prefix}${formatError}`);
        }
      }
    }

    // Number validations
    if (typeof data === "number") {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${prefix}value ${data} is below minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${prefix}value ${data} exceeds maximum ${schema.maximum}`);
      }
    }

    // Object validations
    if (schema.type === "object" && typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;

      // Required fields
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in obj) || obj[key] === undefined) {
            errors.push(`${prefix}missing required field '${key}'`);
          }
        }
      }

      // Property validations
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            errors.push(
              ...this.validate(
                obj[key],
                propSchema,
                path ? `${path}.${key}` : key,
              ),
            );
          }
        }
      }
    }

    // Array validations
    if (schema.type === "array" && Array.isArray(data) && schema.items) {
      for (let i = 0; i < data.length; i++) {
        errors.push(
          ...this.validate(data[i], schema.items, `${path}[${i}]`),
        );
      }
    }

    return errors;
  }

  /**
   * Map and convert data to match schema types.
   */
  mapAndConvert(
    data: unknown,
    schema: JSONSchemaDefinition,
  ): unknown {
    if (data === null || data === undefined) {
      return schema.default ?? data;
    }

    switch (schema.type) {
      case "string":
        return String(data);
      case "number":
      case "integer": {
        const num = Number(data);
        return isNaN(num) ? data : num;
      }
      case "boolean": {
        if (typeof data === "string") {
          return ["true", "1", "yes"].includes(data.toLowerCase());
        }
        return Boolean(data);
      }
      case "array": {
        if (!Array.isArray(data)) {
          return [data];
        }
        if (schema.items) {
          return data.map((item) => this.mapAndConvert(item, schema.items!));
        }
        return data;
      }
      case "object": {
        if (typeof data !== "object" || Array.isArray(data)) return data;
        if (!schema.properties) return data;

        const obj = data as Record<string, unknown>;
        const result: Record<string, unknown> = {};

        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            result[key] = this.mapAndConvert(obj[key], propSchema);
          } else {
            // Case-insensitive lookup
            const match = Object.keys(obj).find(
              (k) => k.toLowerCase() === key.toLowerCase(),
            );
            if (match) {
              result[key] = this.mapAndConvert(obj[match], propSchema);
            } else if (propSchema.default !== undefined) {
              result[key] = propSchema.default;
            }
          }
        }

        return result;
      }
      default:
        return data;
    }
  }

  /**
   * Validate format strings.
   */
  private validateFormat(value: string, format: string): string | null {
    switch (format) {
      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
          ? null
          : "invalid email format";
      case "uri":
      case "url":
        try {
          new URL(value);
          return null;
        } catch {
          return "invalid URL format";
        }
      case "date":
        return isNaN(Date.parse(value)) ? "invalid date format" : null;
      case "date-time":
        return isNaN(Date.parse(value))
          ? "invalid date-time format"
          : null;
      case "uuid":
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
          ? null
          : "invalid UUID format";
      case "ipv4":
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(value)
          ? null
          : "invalid IPv4 format";
      default:
        return null;
    }
  }

  private getType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }

  private parseJSON(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          // Fall through
        }
      }
      const objMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[1]);
        } catch {
          // Fall through
        }
      }
      return null;
    }
  }
}
