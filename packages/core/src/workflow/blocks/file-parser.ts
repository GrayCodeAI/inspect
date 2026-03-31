// ============================================================================
// @inspect/workflow - File Parser Block
// ============================================================================

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WorkflowBlock } from "@inspect/core";
import { WorkflowContext } from "../engine/context.js";
import { createLogger } from "@inspect/core";

const logger = createLogger("workflow/blocks/file-parser");

/** Parsed file result */
export interface FileParseResult {
  format: string;
  data: unknown;
  metadata: {
    filePath: string;
    fileSize: number;
    encoding: string;
    rows?: number;
    columns?: number;
  };
}

/**
 * FileParserBlock dispatches file parsing to the appropriate parser
 * based on file extension or explicit format parameter.
 * Supports CSV, JSON, and text formats.
 */
export class FileParserBlock {
  /**
   * Execute the file parser block.
   *
   * Parameters:
   * - path: file path to parse
   * - format: explicit format override (csv, json, text, auto)
   * - encoding: file encoding (default: utf-8)
   * - delimiter: CSV delimiter (default: ,)
   * - hasHeaders: whether CSV has header row (default: true)
   * - sheet: sheet name/index for spreadsheet formats
   */
  async execute(
    block: WorkflowBlock,
    context: WorkflowContext,
  ): Promise<FileParseResult> {
    const params = block.parameters;
    const filePath = context.render(String(params.path ?? ""));
    const format = String(params.format ?? "auto").toLowerCase();
    const encoding = String(params.encoding ?? "utf-8") as BufferEncoding;

    if (!filePath) {
      throw new Error("File parser block requires a file path");
    }

    // Read the file
    const buffer = await fs.readFile(filePath);
    const fileSize = buffer.length;

    // Detect format
    const ext =
      format === "auto"
        ? path.extname(filePath).toLowerCase().replace(".", "")
        : format;

    let data: unknown;
    let rows: number | undefined;
    let columns: number | undefined;

    switch (ext) {
      case "csv":
      case "tsv": {
        const delimiter =
          ext === "tsv"
            ? "\t"
            : String(params.delimiter ?? ",");
        const hasHeaders = (params.hasHeaders as boolean) ?? true;
        const text = this.detectAndDecode(buffer, encoding);
        const result = this.parseCSV(text, delimiter, hasHeaders);
        data = result.data;
        rows = result.rows;
        columns = result.columns;
        break;
      }

      case "json": {
        const text = buffer.toString(encoding);
        data = this.parseJSON(text);
        break;
      }

      case "txt":
      case "text":
      case "log":
      case "md":
      case "markdown": {
        data = {
          text: buffer.toString(encoding),
          lines: buffer
            .toString(encoding)
            .split(/\r?\n/),
        };
        const lines = (data as { lines: string[] }).lines;
        rows = lines.length;
        break;
      }

      case "xml":
      case "html": {
        const text = buffer.toString(encoding);
        data = this.parseXMLBasic(text);
        break;
      }

      case "yaml":
      case "yml": {
        const text = buffer.toString(encoding);
        data = this.parseYAMLBasic(text);
        break;
      }

      case "ini":
      case "conf":
      case "cfg": {
        const text = buffer.toString(encoding);
        data = this.parseINI(text);
        break;
      }

      default: {
        // Default: return as text
        data = {
          text: buffer.toString(encoding),
          binary: buffer.toString("base64"),
        };
      }
    }

    return {
      format: ext,
      data,
      metadata: {
        filePath,
        fileSize,
        encoding,
        rows,
        columns,
      },
    };
  }

  /**
   * Parse CSV text into array of objects or arrays.
   */
  private parseCSV(
    text: string,
    delimiter: string,
    hasHeaders: boolean,
  ): { data: unknown; rows: number; columns: number } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { data: [], rows: 0, columns: 0 };
    }

    const parseLine = (line: string): string[] => {
      const fields: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
          if (char === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            current += char;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === delimiter) {
            fields.push(current);
            current = "";
          } else {
            current += char;
          }
        }
      }
      fields.push(current);
      return fields;
    };

    if (hasHeaders) {
      const headers = parseLine(lines[0]);
      const rows: Record<string, string>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j].trim()] = (values[j] ?? "").trim();
        }
        rows.push(row);
      }

      return {
        data: rows,
        rows: rows.length,
        columns: headers.length,
      };
    }

    const rows = lines.map((line) =>
      parseLine(line).map((f) => f.trim()),
    );
    return {
      data: rows,
      rows: rows.length,
      columns: rows[0]?.length ?? 0,
    };
  }

  /**
   * Parse JSON with error recovery (strips comments, trailing commas).
   */
  private parseJSON(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (error) {
      logger.debug("Direct JSON parse failed, trying cleanup", { error });
      // Try stripping comments and trailing commas
      const cleaned = text
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    }
  }

  /**
   * Basic XML/HTML tag extraction.
   */
  private parseXMLBasic(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(text)) !== null) {
      const tagName = match[1];
      const content = match[3].trim();

      // Check if content has nested tags
      if (/<\w+/.test(content)) {
        const nested = this.parseXMLBasic(content);
        if (result[tagName]) {
          if (Array.isArray(result[tagName])) {
            (result[tagName] as unknown[]).push(nested);
          } else {
            result[tagName] = [result[tagName], nested];
          }
        } else {
          result[tagName] = nested;
        }
      } else {
        if (result[tagName]) {
          if (Array.isArray(result[tagName])) {
            (result[tagName] as unknown[]).push(content);
          } else {
            result[tagName] = [result[tagName], content];
          }
        } else {
          result[tagName] = content;
        }
      }
    }

    return result;
  }

  /**
   * Basic YAML parser (handles simple key-value, lists, nested objects).
   */
  private parseYAMLBasic(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = text.split(/\r?\n/);

    let currentKey = "";
    let currentList: string[] | null = null;

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith("#") || line.trim().length === 0) continue;

      // List item
      const listMatch = line.match(/^\s+-\s+(.*)/);
      if (listMatch && currentKey) {
        if (!currentList) {
          currentList = [];
          result[currentKey] = currentList;
        }
        currentList.push(listMatch[1].trim());
        continue;
      }

      // Key-value pair
      const kvMatch = line.match(/^(\w[\w\s-]*):\s*(.*)/);
      if (kvMatch) {
        currentKey = kvMatch[1].trim();
        const value = kvMatch[2].trim();
        currentList = null;

        if (value.length > 0) {
          // Remove quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            result[currentKey] = value.slice(1, -1);
          } else if (value === "true" || value === "false") {
            result[currentKey] = value === "true";
          } else if (!isNaN(Number(value))) {
            result[currentKey] = Number(value);
          } else if (value === "null" || value === "~") {
            result[currentKey] = null;
          } else {
            result[currentKey] = value;
          }
        }
      }
    }

    return result;
  }

  /**
   * Parse INI/config file format.
   */
  private parseINI(text: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    let currentSection = "default";
    result[currentSection] = {};

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
        continue;
      }

      // Section header
      const sectionMatch = trimmed.match(/^\[([^\]]+)\]/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        if (!result[currentSection]) {
          result[currentSection] = {};
        }
        continue;
      }

      // Key-value pair
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex !== -1) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        result[currentSection][key] = value;
      }
    }

    return result;
  }

  /**
   * Detect encoding from BOM and decode buffer.
   */
  private detectAndDecode(buffer: Buffer, fallback: BufferEncoding): string {
    // UTF-8 BOM
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.subarray(3).toString("utf-8");
    }
    // UTF-16 LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString("utf16le");
    }
    // UTF-16 BE BOM (swap bytes)
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i < buffer.length - 1; i += 2) {
        swapped[i - 2] = buffer[i + 1];
        swapped[i - 1] = buffer[i];
      }
      return swapped.toString("utf16le");
    }

    return buffer.toString(fallback);
  }
}
