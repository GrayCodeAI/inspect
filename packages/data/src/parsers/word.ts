// ============================================================================
// @inspect/data - Word (DOCX) Parser
// ============================================================================

import * as zlib from "node:zlib";
import { promisify } from "node:util";
import { createLogger } from "@inspect/observability";

const inflateRaw = promisify(zlib.inflateRaw);
const logger = createLogger("data/word");

/** DOCX parse result */
export interface WordParseResult {
  text: string;
  paragraphs: string[];
  metadata: WordMetadata;
}

/** DOCX metadata */
export interface WordMetadata {
  title?: string;
  author?: string;
  description?: string;
  subject?: string;
  lastModifiedBy?: string;
  created?: string;
  modified?: string;
}

/**
 * WordParser extracts text from DOCX files (XML in ZIP format).
 * Parses the document.xml inside the DOCX archive to retrieve
 * paragraph text, preserving basic document structure.
 */
export class WordParser {
  /**
   * Parse a DOCX buffer and extract text.
   */
  async parse(buffer: Buffer): Promise<WordParseResult> {
    const files = await this.extractZip(buffer);

    // Extract metadata from docProps/core.xml
    const metadata = this.parseMetadata(files.get("docProps/core.xml"));

    // Extract text from word/document.xml
    const documentXml = files.get("word/document.xml");
    if (!documentXml) {
      throw new Error("Invalid DOCX file: missing word/document.xml");
    }

    const paragraphs = this.parseDocument(documentXml);
    const text = paragraphs.join("\n\n");

    return { text, paragraphs, metadata };
  }

  /**
   * Parse the document.xml to extract paragraph text.
   */
  private parseDocument(xml: string): string[] {
    const paragraphs: string[] = [];

    // Find all <w:p> (paragraph) elements
    const paraRegex = /<w:p[\s>]([\s\S]*?)<\/w:p>/g;
    let paraMatch: RegExpExecArray | null;

    while ((paraMatch = paraRegex.exec(xml)) !== null) {
      const paraContent = paraMatch[1];
      const runs: string[] = [];

      // Find all <w:r> (run) elements within the paragraph
      const runRegex = /<w:r[\s>]([\s\S]*?)<\/w:r>/g;
      let runMatch: RegExpExecArray | null;

      while ((runMatch = runRegex.exec(paraContent)) !== null) {
        const runContent = runMatch[1];

        // Extract text from <w:t> elements
        const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        let textMatch: RegExpExecArray | null;

        while ((textMatch = textRegex.exec(runContent)) !== null) {
          runs.push(this.decodeXMLEntities(textMatch[1]));
        }
      }

      // Also check for tab/break elements
      if (/<w:br[\s/]/.test(paraContent)) {
        runs.push("\n");
      }
      if (/<w:tab[\s/]/.test(paraContent)) {
        runs.push("\t");
      }

      const text = runs.join("");
      if (text.trim() || paragraphs.length > 0) {
        paragraphs.push(text);
      }
    }

    // Remove trailing empty paragraphs
    while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1].trim() === "") {
      paragraphs.pop();
    }

    return paragraphs;
  }

  /**
   * Parse metadata from core.xml.
   */
  private parseMetadata(xml: string | undefined): WordMetadata {
    if (!xml) return {};

    const metadata: WordMetadata = {};

    const extractTag = (tag: string): string | undefined => {
      const regex = new RegExp(
        `<(?:dc:|cp:|dcterms:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:dc:|cp:|dcterms:)?${tag}>`,
        "i",
      );
      const match = xml!.match(regex);
      return match ? this.decodeXMLEntities(match[1]).trim() : undefined;
    };

    metadata.title = extractTag("title");
    metadata.author = extractTag("creator");
    metadata.description = extractTag("description");
    metadata.subject = extractTag("subject");
    metadata.lastModifiedBy = extractTag("lastModifiedBy");
    metadata.created = extractTag("created");
    metadata.modified = extractTag("modified");

    return metadata;
  }

  /**
   * Extract files from a ZIP buffer (minimal ZIP parser).
   */
  private async extractZip(buffer: Buffer): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    // Find End of Central Directory
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
      throw new Error("Not a valid DOCX (ZIP) file");
    }

    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);

    let offset = centralDirOffset;

    for (let entry = 0; entry < totalEntries; entry++) {
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

      const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf-8");

      // Only process XML files
      if (fileName.endsWith(".xml") || fileName.endsWith(".rels")) {
        const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        const rawData = buffer.subarray(dataStart, dataEnd);

        try {
          let content: string;
          if (compressionMethod === 0) {
            content = rawData.toString("utf-8");
          } else if (compressionMethod === 8) {
            const inflated = await inflateRaw(rawData);
            content = inflated.toString("utf-8");
          } else {
            offset += 46 + fileNameLength + extraFieldLength + commentLength;
            continue;
          }
          files.set(fileName, content);
        } catch (error) {
          logger.debug("Failed to decompress DOCX ZIP entry, skipping", { fileName, error });
        }
      }

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
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
      .replace(/&apos;/g, "'");
  }
}
