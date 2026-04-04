// ============================================================================
// @inspect/data - CSV Parser
// ============================================================================

/** CSV parsing options */
export interface CSVParseOptions {
  /** Column delimiter (default: ",") */
  delimiter?: string;
  /** Quote character (default: '"') */
  quote?: string;
  /** Whether the first row is headers (default: true) */
  headers?: boolean;
  /** Skip empty rows (default: true) */
  skipEmpty?: boolean;
  /** Custom header names (overrides first row) */
  headerNames?: string[];
  /** Number of rows to skip from the top */
  skipRows?: number;
  /** Maximum number of rows to parse (0 = unlimited) */
  maxRows?: number;
  /** Trim whitespace from values (default: true) */
  trim?: boolean;
  /** Encoding for buffer input (default: utf-8) */
  encoding?: BufferEncoding;
  /** Row terminator (auto-detected if not specified) */
  rowTerminator?: string;
  /** Comment character (lines starting with this are skipped) */
  commentChar?: string;
}

/** CSV parse result */
export interface CSVParseResult {
  /** Parsed rows as objects (if headers) or arrays (if no headers) */
  data: Record<string, string>[] | string[][];
  /** Detected or provided header names */
  headers: string[];
  /** Total number of rows parsed */
  rowCount: number;
  /** Total number of columns */
  columnCount: number;
  /** Errors encountered during parsing */
  errors: Array<{ row: number; message: string }>;
}

/**
 * CSVParser handles parsing of CSV (and TSV, etc.) files with full support
 * for quoted fields, custom delimiters, encoding detection, and error recovery.
 */
export class CSVParser {
  /**
   * Parse CSV data from a Buffer or string.
   */
  parse(input: Buffer | string, options?: CSVParseOptions): CSVParseResult {
    const opts: Required<CSVParseOptions> = {
      delimiter: options?.delimiter ?? ",",
      quote: options?.quote ?? '"',
      headers: options?.headers ?? true,
      skipEmpty: options?.skipEmpty ?? true,
      headerNames: options?.headerNames ?? [],
      skipRows: options?.skipRows ?? 0,
      maxRows: options?.maxRows ?? 0,
      trim: options?.trim ?? true,
      encoding: options?.encoding ?? "utf-8",
      rowTerminator: options?.rowTerminator ?? "",
      commentChar: options?.commentChar ?? "",
    };

    // Convert buffer to string
    let text: string;
    if (Buffer.isBuffer(input)) {
      text = this.decodeBuffer(input, opts.encoding);
    } else {
      text = input;
    }

    // Parse into rows
    const rows = this.parseRows(text, opts);

    // Apply skip rows
    let dataRows = rows.slice(opts.skipRows);

    // Determine headers
    let headers: string[];
    if (opts.headerNames.length > 0) {
      headers = opts.headerNames;
    } else if (opts.headers && dataRows.length > 0) {
      headers = dataRows[0].map((h) => (opts.trim ? h.trim() : h));
      dataRows = dataRows.slice(1);
    } else {
      const maxCols = Math.max(...dataRows.map((r) => r.length), 0);
      headers = Array.from({ length: maxCols }, (_, i) => `column_${i + 1}`);
    }

    // Apply max rows
    if (opts.maxRows > 0) {
      dataRows = dataRows.slice(0, opts.maxRows);
    }

    // Build result
    const errors: Array<{ row: number; message: string }> = [];

    if (opts.headers || opts.headerNames.length > 0) {
      // Return as objects
      const data: Record<string, string>[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (row.length !== headers.length) {
          errors.push({
            row: i + 1,
            message: `Expected ${headers.length} columns but got ${row.length}`,
          });
        }
        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          const value = row[j] ?? "";
          obj[headers[j]] = opts.trim ? value.trim() : value;
        }
        data.push(obj);
      }

      return {
        data,
        headers,
        rowCount: data.length,
        columnCount: headers.length,
        errors,
      };
    }

    // Return as arrays
    const data = dataRows.map((row) => (opts.trim ? row.map((v) => v.trim()) : row));

    return {
      data,
      headers,
      rowCount: data.length,
      columnCount: headers.length,
      errors,
    };
  }

  /**
   * Parse text into rows of fields, handling quoted fields properly.
   */
  private parseRows(text: string, opts: Required<CSVParseOptions>): string[][] {
    const rows: string[][] = [];
    const delimiter = opts.delimiter;
    const quote = opts.quote;

    let i = 0;
    const len = text.length;

    while (i < len) {
      const { row, nextIndex } = this.parseRow(text, i, delimiter, quote);

      // Skip comment lines
      if (opts.commentChar && row.length > 0 && row[0].startsWith(opts.commentChar)) {
        i = nextIndex;
        continue;
      }

      // Skip empty lines
      if (opts.skipEmpty && row.length === 1 && row[0].trim() === "") {
        i = nextIndex;
        continue;
      }

      rows.push(row);
      i = nextIndex;
    }

    return rows;
  }

  /**
   * Parse a single row from the text.
   */
  private parseRow(
    text: string,
    start: number,
    delimiter: string,
    quote: string,
  ): { row: string[]; nextIndex: number } {
    const fields: string[] = [];
    let i = start;
    const len = text.length;

    while (i < len) {
      if (text[i] === quote) {
        // Quoted field
        const { value, nextIndex } = this.parseQuotedField(text, i, quote);
        fields.push(value);
        i = nextIndex;

        // Skip delimiter after quoted field
        if (i < len && text[i] === delimiter) {
          i++;
        } else if (i < len && (text[i] === "\n" || text[i] === "\r")) {
          // End of row
          if (text[i] === "\r" && i + 1 < len && text[i + 1] === "\n") {
            i += 2;
          } else {
            i++;
          }
          return { row: fields, nextIndex: i };
        }
      } else {
        // Unquoted field
        let field = "";
        while (i < len) {
          if (text[i] === delimiter) {
            fields.push(field);
            field = "";
            i++;
            break;
          }
          if (text[i] === "\n" || text[i] === "\r") {
            fields.push(field);
            if (text[i] === "\r" && i + 1 < len && text[i + 1] === "\n") {
              i += 2;
            } else {
              i++;
            }
            return { row: fields, nextIndex: i };
          }
          field += text[i];
          i++;
        }

        // End of text
        if (i >= len) {
          fields.push(field);
        }
      }
    }

    return { row: fields, nextIndex: i };
  }

  /**
   * Parse a quoted field.
   */
  private parseQuotedField(
    text: string,
    start: number,
    quote: string,
  ): { value: string; nextIndex: number } {
    let i = start + 1; // Skip opening quote
    let value = "";
    const len = text.length;

    while (i < len) {
      if (text[i] === quote) {
        // Check for escaped quote (double quote)
        if (i + 1 < len && text[i + 1] === quote) {
          value += quote;
          i += 2;
        } else {
          // End of quoted field
          return { value, nextIndex: i + 1 };
        }
      } else {
        value += text[i];
        i++;
      }
    }

    // Unterminated quote - return what we have
    return { value, nextIndex: i };
  }

  /**
   * Decode buffer with BOM detection.
   */
  private decodeBuffer(buffer: Buffer, fallback: BufferEncoding): string {
    // UTF-8 BOM
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.subarray(3).toString("utf-8");
    }
    // UTF-16 LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return buffer.subarray(2).toString("utf16le");
    }
    // UTF-16 BE BOM
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
