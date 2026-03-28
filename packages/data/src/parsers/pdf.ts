// ============================================================================
// @inspect/data - PDF Parser (Basic Text Extraction)
// ============================================================================

import * as zlib from "node:zlib";
import { createLogger } from "@inspect/observability";

const logger = createLogger("data/pdf");

/** PDF parse result */
export interface PDFParseResult {
  text: string;
  pages: PDFPage[];
  pageCount: number;
  metadata: PDFMetadata;
}

/** Single PDF page */
export interface PDFPage {
  pageNumber: number;
  text: string;
}

/** PDF document metadata */
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
}

/**
 * PDFParser performs basic text extraction from PDF content streams.
 * Handles both raw text operators (Tj, TJ, ') and deflate-compressed
 * streams. This is a lightweight implementation using only Node.js
 * built-in modules.
 */
export class PDFParser {
  /**
   * Parse a PDF buffer and extract text.
   */
  parse(buffer: Buffer): PDFParseResult {
    const content = buffer;

    // Verify PDF signature
    if (
      content[0] !== 0x25 ||
      content[1] !== 0x50 ||
      content[2] !== 0x44 ||
      content[3] !== 0x46
    ) {
      throw new Error("Not a valid PDF file");
    }

    // Extract metadata
    const metadata = this.extractMetadata(content);

    // Find and extract all content streams
    const streams = this.extractStreams(content);

    // Parse text from each stream
    const pages: PDFPage[] = [];
    let pageNumber = 1;

    for (const stream of streams) {
      const text = this.extractTextFromStream(stream);
      if (text.trim()) {
        pages.push({ pageNumber, text: text.trim() });
        pageNumber++;
      }
    }

    // If no pages were extracted from streams, try raw text extraction
    if (pages.length === 0) {
      const rawText = this.extractRawText(content);
      if (rawText.trim()) {
        pages.push({ pageNumber: 1, text: rawText.trim() });
      }
    }

    const fullText = pages.map((p) => p.text).join("\n\n");

    return {
      text: fullText,
      pages,
      pageCount: pages.length,
      metadata,
    };
  }

  /**
   * Extract metadata from PDF info dictionary.
   */
  private extractMetadata(buffer: Buffer): PDFMetadata {
    const text = buffer.toString("latin1");
    const metadata: PDFMetadata = {};

    const extractField = (
      name: string,
    ): string | undefined => {
      // Look for /Name (value) or /Name <hex>
      const parenRegex = new RegExp(
        `/${name}\\s*\\(([^)]*?)\\)`,
        "i",
      );
      const match = text.match(parenRegex);
      if (match) return match[1];

      // Try hex string
      const hexRegex = new RegExp(
        `/${name}\\s*<([0-9a-fA-F]+)>`,
        "i",
      );
      const hexMatch = text.match(hexRegex);
      if (hexMatch) {
        return this.hexToString(hexMatch[1]);
      }
      return undefined;
    };

    metadata.title = extractField("Title");
    metadata.author = extractField("Author");
    metadata.subject = extractField("Subject");
    metadata.creator = extractField("Creator");
    metadata.producer = extractField("Producer");
    metadata.creationDate = extractField("CreationDate");
    metadata.modificationDate = extractField("ModDate");

    return metadata;
  }

  /**
   * Extract content streams from the PDF.
   */
  private extractStreams(buffer: Buffer): string[] {
    const streams: string[] = [];
    const content = buffer;

    // Find all stream...endstream blocks
    let pos = 0;
    while (pos < content.length) {
      // Search for "stream" marker
      const streamStart = this.findBytes(
        content,
        Buffer.from("stream"),
        pos,
      );
      if (streamStart === -1) break;

      // Skip past "stream\r\n" or "stream\n"
      let dataStart = streamStart + 6;
      if (content[dataStart] === 0x0d) dataStart++; // \r
      if (content[dataStart] === 0x0a) dataStart++; // \n

      // Find "endstream"
      const endStream = this.findBytes(
        content,
        Buffer.from("endstream"),
        dataStart,
      );
      if (endStream === -1) break;

      // Extract stream data
      let dataEnd = endStream;
      if (content[dataEnd - 1] === 0x0a) dataEnd--; // \n
      if (content[dataEnd - 1] === 0x0d) dataEnd--; // \r

      const streamData = content.subarray(dataStart, dataEnd);

      // Try to decompress (most PDF streams are Deflate compressed)
      try {
        const decompressed = zlib.inflateSync(streamData);
        streams.push(decompressed.toString("latin1"));
      } catch (error) {
        logger.debug("Failed to decompress PDF stream, using raw data", { error });
        streams.push(streamData.toString("latin1"));
      }

      pos = endStream + 9;
    }

    return streams;
  }

  /**
   * Extract text from a PDF content stream using text operators.
   */
  private extractTextFromStream(stream: string): string {
    const textParts: string[] = [];

    // Find BT...ET blocks (Begin Text...End Text)
    const btRegex = /BT\s([\s\S]*?)ET/g;
    let btMatch: RegExpExecArray | null;

    while ((btMatch = btRegex.exec(stream)) !== null) {
      const textBlock = btMatch[1];
      const extracted = this.parseTextOperators(textBlock);
      if (extracted) {
        textParts.push(extracted);
      }
    }

    return textParts.join("\n");
  }

  /**
   * Parse PDF text operators within a BT...ET block.
   */
  private parseTextOperators(block: string): string {
    const parts: string[] = [];

    // Tj operator: (text) Tj
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      parts.push(this.decodePDFString(tjMatch[1]));
    }

    // TJ operator: [(text) num (text) num ...] TJ
    const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
    let tjArrMatch: RegExpExecArray | null;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const arrayContent = tjArrMatch[1];
      const stringRegex = /\(([^)]*)\)/g;
      let strMatch: RegExpExecArray | null;
      const arrParts: string[] = [];

      while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
        arrParts.push(this.decodePDFString(strMatch[1]));
      }

      // Check for large negative numbers indicating word spacing
      const numberRegex = /-(\d+)/g;
      let numMatch: RegExpExecArray | null;
      let hasLargeNeg = false;
      while ((numMatch = numberRegex.exec(arrayContent)) !== null) {
        if (parseInt(numMatch[1], 10) > 100) {
          hasLargeNeg = true;
          break;
        }
      }

      parts.push(
        hasLargeNeg ? arrParts.join(" ") : arrParts.join(""),
      );
    }

    // ' operator (move to next line and show text)
    const quoteRegex = /\(([^)]*)\)\s*'/g;
    let quoteMatch: RegExpExecArray | null;
    while ((quoteMatch = quoteRegex.exec(block)) !== null) {
      parts.push(this.decodePDFString(quoteMatch[1]));
    }

    // Td/TD operators indicate text positioning (newlines)
    if (/T[dD]\s/.test(block) && parts.length > 0) {
      return parts.join(" ");
    }

    return parts.join("");
  }

  /**
   * Raw text extraction fallback - scan for text patterns in the buffer.
   */
  private extractRawText(buffer: Buffer): string {
    const text = buffer.toString("latin1");
    const parts: string[] = [];

    // Look for text within parentheses near Tj/TJ operators
    const textRegex = /\(([^)]{2,})\)\s*(?:Tj|')/g;
    let match: RegExpExecArray | null;

    while ((match = textRegex.exec(text)) !== null) {
      const decoded = this.decodePDFString(match[1]);
      if (decoded.trim() && /[\w\s]/.test(decoded)) {
        parts.push(decoded);
      }
    }

    return parts.join(" ");
  }

  /**
   * Decode PDF string escapes.
   */
  private decodePDFString(str: string): string {
    return str
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\b/g, "\b")
      .replace(/\\f/g, "\f")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/\\(\d{1,3})/g, (_match, octal: string) =>
        String.fromCharCode(parseInt(octal, 8)),
      );
  }

  /**
   * Convert a hex string to a regular string.
   */
  private hexToString(hex: string): string {
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
    }
    return result;
  }

  /**
   * Find a byte sequence in a buffer.
   */
  private findBytes(
    buffer: Buffer,
    search: Buffer,
    start: number,
  ): number {
    for (let i = start; i <= buffer.length - search.length; i++) {
      let found = true;
      for (let j = 0; j < search.length; j++) {
        if (buffer[i + j] !== search[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }
}
