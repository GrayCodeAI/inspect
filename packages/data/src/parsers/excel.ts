// ============================================================================
// @inspect/data - Excel (XLSX) Parser
// ============================================================================

import * as zlib from "node:zlib";
import { promisify } from "node:util";
import { createLogger } from "@inspect/observability";

const inflateRaw = promisify(zlib.inflateRaw);
const logger = createLogger("data/excel");

/** Excel parse result */
export interface ExcelParseResult {
  sheets: ExcelSheet[];
  sheetNames: string[];
}

/** Single Excel sheet */
export interface ExcelSheet {
  name: string;
  rows: string[][];
  rowCount: number;
  columnCount: number;
}

/**
 * ExcelParser reads XLSX files by parsing the XML within the ZIP archive.
 * Handles shared strings, sheet data extraction, and basic cell references.
 * Uses only Node.js built-in modules (no external XLSX library).
 */
export class ExcelParser {
  /**
   * Parse an XLSX file buffer.
   *
   * @param buffer - The XLSX file buffer
   * @param sheet - Optional sheet name or index to parse (parses all if not specified)
   */
  async parse(
    buffer: Buffer,
    sheet?: string | number,
  ): Promise<ExcelParseResult> {
    // XLSX is a ZIP file containing XML files
    const files = await this.extractZip(buffer);

    // Parse shared strings (xl/sharedStrings.xml)
    const sharedStrings = this.parseSharedStrings(
      files.get("xl/sharedStrings.xml"),
    );

    // Parse workbook to get sheet names (xl/workbook.xml)
    const sheetNames = this.parseWorkbook(
      files.get("xl/workbook.xml"),
    );

    // Parse sheet relationships to map sheet names to file paths
    const sheetRels = this.parseRelationships(
      files.get("xl/_rels/workbook.xml.rels"),
    );

    const sheets: ExcelSheet[] = [];

    for (let i = 0; i < sheetNames.length; i++) {
      // Filter to specific sheet if requested
      if (sheet !== undefined) {
        if (typeof sheet === "number" && sheet !== i) continue;
        if (typeof sheet === "string" && sheet !== sheetNames[i]) continue;
      }

      // Find the sheet file path
      const relId = `rId${i + 1}`;
      const sheetPath = sheetRels.get(relId) ?? `sheet${i + 1}.xml`;
      const fullPath = `xl/${sheetPath}`;
      const sheetXml = files.get(fullPath) ?? files.get(`xl/worksheets/sheet${i + 1}.xml`);

      if (!sheetXml) continue;

      const rows = this.parseSheet(sheetXml, sharedStrings);
      const maxCols = Math.max(...rows.map((r) => r.length), 0);

      sheets.push({
        name: sheetNames[i],
        rows,
        rowCount: rows.length,
        columnCount: maxCols,
      });
    }

    return { sheets, sheetNames };
  }

  /**
   * Parse shared strings XML.
   */
  private parseSharedStrings(xml: string | undefined): string[] {
    if (!xml) return [];

    const strings: string[] = [];
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let match: RegExpExecArray | null;

    while ((match = siRegex.exec(xml)) !== null) {
      // Extract text from <t> tags within <si>
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      let text = "";

      while ((tMatch = tRegex.exec(match[1])) !== null) {
        text += this.decodeXMLEntities(tMatch[1]);
      }

      strings.push(text);
    }

    return strings;
  }

  /**
   * Parse workbook XML to get sheet names.
   */
  private parseWorkbook(xml: string | undefined): string[] {
    if (!xml) return ["Sheet1"];

    const names: string[] = [];
    const sheetRegex = /<sheet\s+name="([^"]*)"[^>]*\/>/g;
    let match: RegExpExecArray | null;

    while ((match = sheetRegex.exec(xml)) !== null) {
      names.push(this.decodeXMLEntities(match[1]));
    }

    return names.length > 0 ? names : ["Sheet1"];
  }

  /**
   * Parse relationships XML.
   */
  private parseRelationships(
    xml: string | undefined,
  ): Map<string, string> {
    const rels = new Map<string, string>();
    if (!xml) return rels;

    const relRegex = /<Relationship\s+Id="([^"]*)"\s+[^>]*Target="([^"]*)"[^>]*\/>/g;
    let match: RegExpExecArray | null;

    while ((match = relRegex.exec(xml)) !== null) {
      rels.set(match[1], match[2]);
    }

    return rels;
  }

  /**
   * Parse a sheet XML and return rows of string values.
   */
  private parseSheet(
    xml: string,
    sharedStrings: string[],
  ): string[][] {
    const rows: string[][] = [];
    const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(xml)) !== null) {
      const cells: Array<{ col: number; value: string }> = [];
      const cellRegex = /<c\s+r="([^"]*)"[^>]*(?:t="([^"]*)")?[^>]*>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?[\s\S]*?<\/c>/g;
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const ref = cellMatch[1];
        const type = cellMatch[2] ?? "";
        const rawValue = cellMatch[3] ?? "";

        const col = this.colRefToIndex(ref);
        let value: string;

        if (type === "s") {
          // Shared string reference
          const idx = parseInt(rawValue, 10);
          value = sharedStrings[idx] ?? "";
        } else if (type === "b") {
          // Boolean
          value = rawValue === "1" ? "TRUE" : "FALSE";
        } else if (type === "inlineStr") {
          // Inline string
          const isMatch = rawValue.match(/<t[^>]*>([\s\S]*?)<\/t>/);
          value = isMatch
            ? this.decodeXMLEntities(isMatch[1])
            : rawValue;
        } else {
          value = this.decodeXMLEntities(rawValue);
        }

        cells.push({ col, value });
      }

      if (cells.length > 0) {
        // Build row array with proper column placement
        const maxCol = Math.max(...cells.map((c) => c.col));
        const row = new Array<string>(maxCol + 1).fill("");
        for (const cell of cells) {
          row[cell.col] = cell.value;
        }
        rows.push(row);
      }
    }

    return rows;
  }

  /**
   * Convert a column reference (e.g., "A", "B", "AA") to a 0-based index.
   */
  private colRefToIndex(ref: string): number {
    const colStr = ref.replace(/\d+/g, "");
    let index = 0;
    for (let i = 0; i < colStr.length; i++) {
      index =
        index * 26 + (colStr.charCodeAt(i) - "A".charCodeAt(0) + 1);
    }
    return index - 1;
  }

  /**
   * Extract files from a ZIP buffer (minimal ZIP parser).
   */
  private async extractZip(
    buffer: Buffer,
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    // Find end of central directory record
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (
        buffer[i] === 0x50 &&
        buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x05 &&
        buffer[i + 3] === 0x06
      ) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error("Not a valid ZIP file");
    }

    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);

    let offset = centralDirOffset;

    for (let entry = 0; entry < totalEntries; entry++) {
      // Central directory file header signature
      if (
        buffer[offset] !== 0x50 ||
        buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x01 ||
        buffer[offset + 3] !== 0x02
      ) {
        break;
      }

      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraFieldLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);

      const fileName = buffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString("utf-8");

      // Only process XML files
      if (fileName.endsWith(".xml") || fileName.endsWith(".rels")) {
        // Read from local file header
        const localNameLength = buffer.readUInt16LE(
          localHeaderOffset + 26,
        );
        const localExtraLength = buffer.readUInt16LE(
          localHeaderOffset + 28,
        );
        const dataStart =
          localHeaderOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        const rawData = buffer.subarray(dataStart, dataEnd);

        try {
          let content: string;
          if (compressionMethod === 0) {
            // Stored (no compression)
            content = rawData.toString("utf-8");
          } else if (compressionMethod === 8) {
            // Deflated
            const inflated = await inflateRaw(rawData);
            content = inflated.toString("utf-8");
          } else {
            offset +=
              46 + fileNameLength + extraFieldLength + commentLength;
            continue;
          }
          files.set(fileName, content);
        } catch (error) {
          logger.debug("Failed to decompress ZIP entry, skipping", { fileName, error });
        }
      }

      offset +=
        46 + fileNameLength + extraFieldLength + commentLength;
    }

    return files;
  }

  /**
   * Decode XML entities.
   */
  private decodeXMLEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, num: string) =>
        String.fromCharCode(parseInt(num, 10)),
      )
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }
}
