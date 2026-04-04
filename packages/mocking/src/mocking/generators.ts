// ============================================================================
// @inspect/quality - Mock Generator (HAR + OpenAPI)
// ============================================================================

import { readFile } from "node:fs/promises";
import type { MockHandler } from "./handlers.js";
import { rest, response } from "./handlers.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("quality/mock-generators");

/** HAR Archive format (simplified) */
interface HARData {
  log: {
    entries: HAREntry[];
  };
}

interface HAREntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
      text?: string;
    };
  };
}

/** OpenAPI spec format (simplified) */
interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title: string; version: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
  };
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    content?: Record<string, { schema: OpenAPISchema }>;
  };
  responses?: Record<string, OpenAPIResponse>;
}

interface OpenAPIResponse {
  description?: string;
  content?: Record<
    string,
    {
      schema: OpenAPISchema;
      example?: unknown;
      examples?: Record<string, { value: unknown }>;
    }
  >;
}

interface OpenAPIParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: OpenAPISchema;
  example?: unknown;
}

interface OpenAPISchema {
  type?: string;
  format?: string;
  items?: OpenAPISchema;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
  $ref?: string;
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  description?: string;
  nullable?: boolean;
}

/**
 * MockGenerator creates mock handlers from HAR files and OpenAPI specs.
 */
export class MockGenerator {
  /**
   * Generate mock handlers from a HAR (HTTP Archive) file.
   * Each recorded request/response becomes a handler.
   */
  async fromHAR(harFile: string): Promise<MockHandler[]> {
    const content = await readFile(harFile, "utf-8");
    const har: HARData = JSON.parse(content);
    const handlers: MockHandler[] = [];

    for (const entry of har.log.entries) {
      const method = entry.request.method.toUpperCase();
      const url = new URL(entry.request.url);
      const path = url.pathname;
      const status = entry.response.status;
      const responseBody = entry.response.content.text ?? "";
      const responseHeaders: Record<string, string> = {};

      for (const header of entry.response.headers) {
        // Skip hop-by-hop headers
        if (["transfer-encoding", "connection", "keep-alive"].includes(header.name.toLowerCase())) {
          continue;
        }
        responseHeaders[header.name] = header.value;
      }

      let body: unknown;
      try {
        body = JSON.parse(responseBody);
      } catch (error) {
        logger.debug("Failed to parse HAR response body as JSON, using raw string", {
          path,
          error,
        });
        body = responseBody;
      }

      const restMethod = method.toLowerCase() as keyof typeof rest;
      const handlerFn = rest[restMethod];

      if (typeof handlerFn === "function") {
        handlers.push(
          handlerFn(path, () => ({
            status,
            headers: responseHeaders,
            body,
          })),
        );
      }
    }

    return handlers;
  }

  /**
   * Generate mock handlers from an OpenAPI (Swagger) specification.
   * Uses example data from the spec to generate responses.
   */
  async fromOpenAPI(specFile: string): Promise<MockHandler[]> {
    const content = await readFile(specFile, "utf-8");
    const spec: OpenAPISpec = JSON.parse(content);
    const handlers: MockHandler[] = [];

    // Resolve $ref references
    const resolver = new SchemaResolver(spec);

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const methods: Array<[string, OpenAPIOperation | undefined]> = [
        ["get", pathItem.get],
        ["post", pathItem.post],
        ["put", pathItem.put],
        ["patch", pathItem.patch],
        ["delete", pathItem.delete],
        ["head", pathItem.head],
        ["options", pathItem.options],
      ];

      for (const [method, operation] of methods) {
        if (!operation) continue;

        // Find the success response (2xx)
        const successCode = this.findSuccessCode(operation.responses ?? {});
        const responseSpec = operation.responses?.[successCode];

        if (!responseSpec) continue;

        // Generate response body from schema
        const contentType = responseSpec.content?.["application/json"];
        let body: unknown = null;

        if (contentType) {
          if (contentType.example !== undefined) {
            body = contentType.example;
          } else if (contentType.examples) {
            const firstExample = Object.values(contentType.examples)[0];
            body = firstExample?.value;
          } else if (contentType.schema) {
            const resolvedSchema = resolver.resolve(contentType.schema);
            body = this.generateFromSchema(resolvedSchema);
          }
        }

        // Convert OpenAPI path params (/users/{id}) to handler params (/users/:id)
        const handlerPath = path.replace(/\{(\w+)\}/g, ":$1");
        const status = parseInt(successCode, 10) || 200;

        const restMethod = method as keyof typeof rest;
        const handlerFn = rest[restMethod];

        if (typeof handlerFn === "function") {
          handlers.push(handlerFn(handlerPath, () => response(status, body)));
        }
      }
    }

    return handlers;
  }

  /**
   * Find the first 2xx response code.
   */
  private findSuccessCode(responses: Record<string, OpenAPIResponse>): string {
    const codes = Object.keys(responses);
    const successCode = codes.find((c) => c.startsWith("2"));
    return successCode ?? codes[0] ?? "200";
  }

  /**
   * Generate example data from an OpenAPI schema.
   */
  private generateFromSchema(schema: OpenAPISchema): unknown {
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum && schema.enum.length > 0) return schema.enum[0];

    switch (schema.type) {
      case "string":
        return this.generateString(schema);
      case "number":
      case "integer":
        return this.generateNumber(schema);
      case "boolean":
        return true;
      case "array":
        return this.generateArray(schema);
      case "object":
        return this.generateObject(schema);
      case "null":
        return null;
      default:
        if (schema.properties) return this.generateObject(schema);
        return null;
    }
  }

  private generateString(schema: OpenAPISchema): string {
    switch (schema.format) {
      case "date-time":
        return "2025-01-15T12:00:00Z";
      case "date":
        return "2025-01-15";
      case "time":
        return "12:00:00Z";
      case "email":
        return "user@example.com";
      case "uri":
      case "url":
        return "https://example.com";
      case "uuid":
        return "550e8400-e29b-41d4-a716-446655440000";
      case "hostname":
        return "example.com";
      case "ipv4":
        return "192.168.1.1";
      case "ipv6":
        return "::1";
      case "binary":
        return "data:application/octet-stream;base64,";
      case "byte":
        return "dGVzdA==";
      default: {
        const desc = schema.description?.toLowerCase() ?? "";
        if (desc.includes("name")) return "John Doe";
        if (desc.includes("email")) return "user@example.com";
        if (desc.includes("phone")) return "+1234567890";
        if (desc.includes("url")) return "https://example.com";
        if (desc.includes("id")) return "abc123";
        return "string";
      }
    }
  }

  private generateNumber(schema: OpenAPISchema): number {
    if (schema.minimum !== undefined && schema.maximum !== undefined) {
      return Math.floor((schema.minimum + schema.maximum) / 2);
    }
    if (schema.minimum !== undefined) return schema.minimum;
    if (schema.maximum !== undefined) return schema.maximum;
    return schema.type === "integer" ? 1 : 1.5;
  }

  private generateArray(schema: OpenAPISchema): unknown[] {
    if (!schema.items) return [];
    const count = schema.minItems ?? 1;
    return Array.from({ length: count }, () => this.generateFromSchema(schema.items!));
  }

  private generateObject(schema: OpenAPISchema): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    if (!schema.properties) return obj;

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      obj[key] = this.generateFromSchema(propSchema);
    }

    return obj;
  }
}

/**
 * Resolves $ref references within an OpenAPI spec.
 */
class SchemaResolver {
  private spec: OpenAPISpec;

  constructor(spec: OpenAPISpec) {
    this.spec = spec;
  }

  resolve(schema: OpenAPISchema): OpenAPISchema {
    if (schema.$ref) {
      return this.resolveRef(schema.$ref);
    }

    if (schema.allOf) {
      return this.mergeSchemas(schema.allOf.map((s) => this.resolve(s)));
    }

    if (schema.oneOf || schema.anyOf) {
      const choices = schema.oneOf ?? schema.anyOf ?? [];
      return choices.length > 0 ? this.resolve(choices[0]) : schema;
    }

    // Recursively resolve nested schemas
    const resolved = { ...schema };

    if (resolved.items) {
      resolved.items = this.resolve(resolved.items);
    }

    if (resolved.properties) {
      const resolvedProps: Record<string, OpenAPISchema> = {};
      for (const [key, prop] of Object.entries(resolved.properties)) {
        resolvedProps[key] = this.resolve(prop);
      }
      resolved.properties = resolvedProps;
    }

    return resolved;
  }

  private resolveRef(ref: string): OpenAPISchema {
    // Handle JSON Pointer references like "#/components/schemas/User"
    const parts = ref.replace("#/", "").split("/");
    let current: unknown = this.spec;

    for (const part of parts) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return {};
      }
    }

    if (current && typeof current === "object") {
      return this.resolve(current as OpenAPISchema);
    }

    return {};
  }

  private mergeSchemas(schemas: OpenAPISchema[]): OpenAPISchema {
    const merged: OpenAPISchema = { type: "object", properties: {} };

    for (const schema of schemas) {
      if (schema.properties) {
        Object.assign(merged.properties!, schema.properties);
      }
      if (schema.required) {
        merged.required = [...(merged.required ?? []), ...schema.required];
      }
    }

    return merged;
  }
}
