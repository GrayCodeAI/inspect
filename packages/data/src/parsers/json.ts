// ============================================================================
// @inspect/data - JSON Parser (with Error Recovery)
// ============================================================================

import { createLogger } from "@inspect/observability";

const logger = createLogger("data/json");

/** JSON parse options */
export interface JSONParseOptions {
  /** Strip single-line comments (// ...) */
  stripComments?: boolean;
  /** Strip multi-line comments */
  stripBlockComments?: boolean;
  /** Remove trailing commas */
  removeTrailingCommas?: boolean;
  /** Allow single-quoted strings */
  allowSingleQuotes?: boolean;
  /** Allow unquoted keys */
  allowUnquotedKeys?: boolean;
  /** Reviver function for JSON.parse */
  reviver?: (key: string, value: unknown) => unknown;
  /** Maximum depth for nested objects */
  maxDepth?: number;
}

/** JSON parse result */
export interface JSONParseResult {
  data: unknown;
  success: boolean;
  error?: string;
  warnings: string[];
  recovered: boolean;
}

/**
 * JSONParser provides JSON parsing with error recovery features.
 * Handles common issues like comments, trailing commas, single quotes,
 * and unquoted keys that are found in configuration files.
 */
export class JSONParser {
  /**
   * Parse JSON from a Buffer or string with error recovery.
   */
  parse(
    input: Buffer | string,
    options?: JSONParseOptions,
  ): JSONParseResult {
    const opts: Required<JSONParseOptions> = {
      stripComments: options?.stripComments ?? true,
      stripBlockComments: options?.stripBlockComments ?? true,
      removeTrailingCommas: options?.removeTrailingCommas ?? true,
      allowSingleQuotes: options?.allowSingleQuotes ?? true,
      allowUnquotedKeys: options?.allowUnquotedKeys ?? true,
      reviver: options?.reviver ?? ((_k, v) => v),
      maxDepth: options?.maxDepth ?? 100,
    };

    const text =
      typeof input === "string"
        ? input
        : this.decodeBuffer(input);
    const warnings: string[] = [];

    // First try direct parse
    try {
      const data = JSON.parse(text, opts.reviver);
      this.checkDepth(data, opts.maxDepth);
      return { data, success: true, warnings, recovered: false };
    } catch (error) {
      logger.debug("Direct JSON parse failed, attempting recovery", { error });
    }

    // Apply recovery transformations
    let recovered = text;
    let wasModified = false;

    if (opts.stripComments) {
      const before = recovered;
      recovered = this.stripSingleLineComments(recovered);
      if (recovered !== before) {
        warnings.push("Stripped single-line comments");
        wasModified = true;
      }
    }

    if (opts.stripBlockComments) {
      const before = recovered;
      recovered = this.stripBlockComments(recovered);
      if (recovered !== before) {
        warnings.push("Stripped block comments");
        wasModified = true;
      }
    }

    if (opts.removeTrailingCommas) {
      const before = recovered;
      recovered = this.removeTrailingCommas(recovered);
      if (recovered !== before) {
        warnings.push("Removed trailing commas");
        wasModified = true;
      }
    }

    if (opts.allowSingleQuotes) {
      const before = recovered;
      recovered = this.convertSingleQuotes(recovered);
      if (recovered !== before) {
        warnings.push("Converted single quotes to double quotes");
        wasModified = true;
      }
    }

    if (opts.allowUnquotedKeys) {
      const before = recovered;
      recovered = this.quoteUnquotedKeys(recovered);
      if (recovered !== before) {
        warnings.push("Quoted unquoted object keys");
        wasModified = true;
      }
    }

    // Try parsing again after recovery
    try {
      const data = JSON.parse(recovered, opts.reviver);
      this.checkDepth(data, opts.maxDepth);
      return { data, success: true, warnings, recovered: wasModified };
    } catch (error) {
      // Try more aggressive recovery
      const aggressiveResult = this.aggressiveRecover(recovered);
      if (aggressiveResult !== null) {
        warnings.push("Applied aggressive recovery");
        return {
          data: aggressiveResult,
          success: true,
          warnings,
          recovered: true,
        };
      }

      return {
        data: null,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
        warnings,
        recovered: false,
      };
    }
  }

  /**
   * Strict parse without recovery (just standard JSON.parse).
   */
  parseStrict(input: Buffer | string): unknown {
    const text =
      typeof input === "string"
        ? input
        : this.decodeBuffer(input);
    return JSON.parse(text);
  }

  /**
   * Strip single-line comments (//) from JSON text.
   * Preserves strings containing //.
   */
  private stripSingleLineComments(text: string): string {
    let result = "";
    let inString = false;
    let stringChar = "";
    let i = 0;

    while (i < text.length) {
      if (inString) {
        if (text[i] === "\\" && i + 1 < text.length) {
          result += text[i] + text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === stringChar) {
          inString = false;
        }
        result += text[i];
        i++;
      } else {
        if (text[i] === '"' || text[i] === "'") {
          inString = true;
          stringChar = text[i];
          result += text[i];
          i++;
        } else if (
          text[i] === "/" &&
          i + 1 < text.length &&
          text[i + 1] === "/"
        ) {
          // Skip until end of line
          while (i < text.length && text[i] !== "\n") {
            i++;
          }
        } else {
          result += text[i];
          i++;
        }
      }
    }

    return result;
  }

  /**
   * Strip block comments from JSON text.
   */
  private stripBlockComments(text: string): string {
    let result = "";
    let inString = false;
    let stringChar = "";
    let i = 0;

    while (i < text.length) {
      if (inString) {
        if (text[i] === "\\" && i + 1 < text.length) {
          result += text[i] + text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === stringChar) {
          inString = false;
        }
        result += text[i];
        i++;
      } else {
        if (text[i] === '"' || text[i] === "'") {
          inString = true;
          stringChar = text[i];
          result += text[i];
          i++;
        } else if (
          text[i] === "/" &&
          i + 1 < text.length &&
          text[i + 1] === "*"
        ) {
          // Skip until */
          i += 2;
          while (
            i < text.length - 1 &&
            !(text[i] === "*" && text[i + 1] === "/")
          ) {
            i++;
          }
          i += 2; // Skip past */
        } else {
          result += text[i];
          i++;
        }
      }
    }

    return result;
  }

  /**
   * Remove trailing commas before ] and }.
   */
  private removeTrailingCommas(text: string): string {
    return text.replace(/,\s*([}\]])/g, "$1");
  }

  /**
   * Convert single-quoted strings to double-quoted.
   */
  private convertSingleQuotes(text: string): string {
    let result = "";
    let inDoubleQuote = false;
    let inSingleQuote = false;
    let i = 0;

    while (i < text.length) {
      if (inDoubleQuote) {
        if (text[i] === "\\" && i + 1 < text.length) {
          result += text[i] + text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          inDoubleQuote = false;
        }
        result += text[i];
        i++;
      } else if (inSingleQuote) {
        if (text[i] === "\\" && i + 1 < text.length) {
          result += text[i] + text[i + 1];
          i += 2;
          continue;
        }
        if (text[i] === "'") {
          inSingleQuote = false;
          result += '"';
          i++;
        } else if (text[i] === '"') {
          // Escape double quotes inside single-quoted strings
          result += '\\"';
          i++;
        } else {
          result += text[i];
          i++;
        }
      } else {
        if (text[i] === '"') {
          inDoubleQuote = true;
          result += text[i];
          i++;
        } else if (text[i] === "'") {
          inSingleQuote = true;
          result += '"';
          i++;
        } else {
          result += text[i];
          i++;
        }
      }
    }

    return result;
  }

  /**
   * Add quotes to unquoted object keys.
   */
  private quoteUnquotedKeys(text: string): string {
    // Match unquoted keys: word characters followed by :
    return text.replace(
      /(?<=^|[{,\n])\s*([a-zA-Z_$][\w$]*)\s*:/gm,
      '"$1":',
    );
  }

  /**
   * Aggressive recovery: try to extract valid JSON from malformed input.
   */
  private aggressiveRecover(text: string): unknown | null {
    // Try to find the outermost JSON structure
    const trimmed = text.trim();

    // Find first { or [
    let start = -1;
    let endChar = "";
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "{") {
        start = i;
        endChar = "}";
        break;
      }
      if (trimmed[i] === "[") {
        start = i;
        endChar = "]";
        break;
      }
    }

    if (start === -1) return null;

    // Find matching closing bracket
    let depth = 0;
    let inStr = false;
    for (let i = start; i < trimmed.length; i++) {
      if (inStr) {
        if (trimmed[i] === "\\" && i + 1 < trimmed.length) {
          i++;
          continue;
        }
        if (trimmed[i] === '"') {
          inStr = false;
        }
        continue;
      }

      if (trimmed[i] === '"') {
        inStr = true;
      } else if (
        trimmed[i] === "{" ||
        trimmed[i] === "["
      ) {
        depth++;
      } else if (
        trimmed[i] === "}" ||
        trimmed[i] === "]"
      ) {
        depth--;
        if (depth === 0 && trimmed[i] === endChar) {
          const candidate = trimmed.substring(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (error) {
            logger.debug("Aggressive JSON recovery failed on candidate", { error });
            return null;
          }
        }
      }
    }

    return null;
  }

  /**
   * Check object nesting depth.
   */
  private checkDepth(
    data: unknown,
    maxDepth: number,
    currentDepth: number = 0,
  ): void {
    if (currentDepth > maxDepth) {
      throw new Error(
        `JSON nesting depth exceeds maximum of ${maxDepth}`,
      );
    }
    if (typeof data === "object" && data !== null) {
      const values = Array.isArray(data)
        ? data
        : Object.values(data);
      for (const val of values) {
        this.checkDepth(val, maxDepth, currentDepth + 1);
      }
    }
  }

  /**
   * Decode buffer with BOM detection.
   */
  private decodeBuffer(buffer: Buffer): string {
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.subarray(3).toString("utf-8");
    }
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString("utf16le");
    }
    return buffer.toString("utf-8");
  }
}
