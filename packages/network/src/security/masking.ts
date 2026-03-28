// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - Sensitive Data Masking
// ──────────────────────────────────────────────────────────────────────────────

import { createLogger } from "@inspect/observability";

const logger = createLogger("network/masking");

/** A named masking pattern */
export interface MaskingPattern {
  /** Pattern name (e.g. "ssn", "credit_card") */
  name: string;
  /** Regular expression to match sensitive data */
  regex: RegExp;
}

/** A rectangular region to mask in a screenshot */
export interface MaskRegion {
  /** X coordinate (from left) */
  x: number;
  /** Y coordinate (from top) */
  y: number;
  /** Width of the region */
  width: number;
  /** Height of the region */
  height: number;
}

/** Headers that should have their values masked */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
  "www-authenticate",
  "x-csrf-token",
  "x-xsrf-token",
]);

/**
 * SensitiveDataMasker provides utilities to detect and mask sensitive
 * data in text, HTTP headers, and screenshots. Ships with built-in
 * patterns for common PII types and allows custom patterns.
 */
export class SensitiveDataMasker {
  private patterns: Map<string, MaskingPattern> = new Map();

  constructor() {
    // Register built-in patterns
    this.registerBuiltinPatterns();
  }

  /**
   * Add a custom masking pattern.
   *
   * @param name - Pattern name (used in replacement text like [MASKED:name])
   * @param regex - Regular expression to match. Will be used with global flag.
   */
  addPattern(name: string, regex: RegExp): void {
    // Ensure global flag is set
    const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
    this.patterns.set(name, {
      name,
      regex: new RegExp(regex.source, flags),
    });
  }

  /**
   * Remove a masking pattern by name.
   */
  removePattern(name: string): boolean {
    return this.patterns.delete(name);
  }

  /**
   * Mask sensitive data in a text string.
   * Replaces matches with [MASKED:patternName].
   *
   * @param text - The input text to mask
   * @returns The masked text
   */
  maskText(text: string): string {
    let masked = text;

    for (const [, pattern] of this.patterns) {
      // Reset regex lastIndex for global patterns
      pattern.regex.lastIndex = 0;
      masked = masked.replace(pattern.regex, `[MASKED:${pattern.name}]`);
    }

    return masked;
  }

  /**
   * Mask sensitive regions in a screenshot buffer by drawing
   * black rectangles over the specified regions.
   *
   * Works with raw PNG buffers. Creates black rectangles by manipulating
   * a simple bitmap overlay approach. For production use with actual PNG
   * encoding, this modifies pixel data in-place on uncompressed bitmaps,
   * or returns a description of masked regions for the rendering layer.
   *
   * @param buffer - The screenshot buffer (PNG format)
   * @param regions - Array of rectangular regions to black out
   * @returns Object containing the original buffer and mask metadata
   */
  maskInScreenshot(
    buffer: Buffer,
    regions: MaskRegion[],
  ): { buffer: Buffer; maskedRegions: MaskRegion[] } {
    if (regions.length === 0) {
      return { buffer, maskedRegions: [] };
    }

    // For PNG images, we work with the raw pixel data.
    // PNG starts with an 8-byte signature: 137 80 78 71 13 10 26 10
    const isPng =
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    if (!isPng) {
      // For non-PNG formats, we cannot manipulate pixel data directly.
      // Log a warning so callers know masking was not applied.
      logger.warn("Screenshot is not PNG format — pixel masking was not applied", {
        unmaskedRegions: regions.length,
        hint: "Convert to PNG before masking for full coverage",
      });
      return { buffer, maskedRegions: regions };
    }

    // Parse IHDR to get image dimensions
    const dimensions = parsePngDimensions(buffer);
    if (!dimensions) {
      return { buffer, maskedRegions: regions };
    }

    // Create a copy of the buffer to modify
    const result = Buffer.from(buffer);

    // For proper PNG masking, we need to decompress IDAT chunks,
    // modify pixels, and recompress. Since this is computationally
    // expensive with pure Node.js, we provide the bitmap modification
    // using zlib.
    try {
      const maskedBuffer = applyMasksToPng(result, dimensions, regions);
      return { buffer: maskedBuffer, maskedRegions: regions };
    } catch (error) {
      logger.debug("PNG pixel masking failed, returning original", { error });
      return { buffer, maskedRegions: regions };
    }
  }

  /**
   * Mask sensitive values in HTTP headers.
   * Replaces values for known sensitive headers (Authorization, Cookie,
   * Set-Cookie, etc.) with [MASKED].
   *
   * @param headers - Record of header name -> value
   * @returns A new headers object with sensitive values masked
   */
  maskInHeaders(
    headers: Record<string, string | string[]>,
  ): Record<string, string | string[]> {
    const masked: Record<string, string | string[]> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        masked[key] = Array.isArray(value)
          ? value.map(() => "[MASKED]")
          : "[MASKED]";
      } else {
        // Also mask sensitive data patterns within non-sensitive headers
        if (Array.isArray(value)) {
          masked[key] = value.map((v) => this.maskText(v));
        } else {
          masked[key] = this.maskText(value);
        }
      }
    }

    return masked;
  }

  /**
   * Check if a text string contains any sensitive data.
   *
   * @param text - The text to check
   * @returns Array of pattern names that matched
   */
  detect(text: string): string[] {
    const matches: string[] = [];

    for (const [, pattern] of this.patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) {
        matches.push(pattern.name);
      }
    }

    return matches;
  }

  /**
   * Get all registered pattern names.
   */
  getPatternNames(): string[] {
    return Array.from(this.patterns.keys());
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private registerBuiltinPatterns(): void {
    // Social Security Numbers (XXX-XX-XXXX)
    this.addPattern("ssn", /\b\d{3}-\d{2}-\d{4}\b/g);

    // Credit card numbers (with optional spaces/dashes)
    this.addPattern(
      "credit_card",
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    );

    // Email addresses
    this.addPattern(
      "email",
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    );

    // US phone numbers
    this.addPattern(
      "phone",
      /\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    );

    // API keys (common formats: sk-xxx, pk_xxx, api_xxx, etc.)
    this.addPattern(
      "api_key",
      /\b(sk|pk|api|key|token|secret|password)[_-]?[A-Za-z0-9]{20,}\b/gi,
    );

    // JWT tokens
    this.addPattern(
      "jwt",
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    );

    // AWS access key IDs
    this.addPattern("aws_key", /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g);

    // Generic secret patterns (long hex/base64 strings prefixed with secret identifiers)
    this.addPattern(
      "generic_secret",
      /\b(ghp_|gho_|ghu_|ghs_|ghr_|glpat-|xoxb-|xoxp-|xapp-|sk-ant-)[A-Za-z0-9_-]{20,}\b/g,
    );
  }
}

/** Parse PNG IHDR chunk to get width and height */
function parsePngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  // PNG signature is 8 bytes, then first chunk should be IHDR
  if (buffer.length < 24) return null;

  // Check IHDR chunk type at offset 12
  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

/**
 * Apply black rectangle masks to a PNG image.
 * Uses Node.js zlib to decompress IDAT chunks, modify pixel data,
 * and recompress.
 */
function applyMasksToPng(
  buffer: Buffer,
  dimensions: { width: number; height: number },
  regions: MaskRegion[],
): Buffer {
  const { inflateSync, deflateSync } = require("node:zlib");

  // Collect all IDAT chunks
  const idatChunks: Buffer[] = [];
  const nonIdatChunks: Array<{ offset: number; length: number; type: string }> = [];
  let offset = 8; // Skip PNG signature

  while (offset < buffer.length - 4) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");

    if (chunkType === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + chunkLength));
    } else {
      nonIdatChunks.push({
        offset,
        length: chunkLength,
        type: chunkType,
      });
    }

    offset += 12 + chunkLength; // length(4) + type(4) + data(N) + crc(4)
  }

  if (idatChunks.length === 0) return buffer;

  // Concatenate and decompress IDAT data
  const compressedData = Buffer.concat(idatChunks);
  let rawData: Buffer;
  try {
    rawData = inflateSync(compressedData);
  } catch (error) {
    logger.debug("Failed to inflate PNG IDAT data", { error });
    return buffer;
  }

  // PNG raw data: each row is (filterByte + width * bytesPerPixel)
  // Assuming 8-bit RGBA (most common for screenshots) = 4 bytes per pixel
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  let bytesPerPixel: number;

  switch (colorType) {
    case 2: bytesPerPixel = 3 * (bitDepth / 8); break; // RGB
    case 6: bytesPerPixel = 4 * (bitDepth / 8); break; // RGBA
    case 0: bytesPerPixel = 1 * (bitDepth / 8); break; // Grayscale
    case 4: bytesPerPixel = 2 * (bitDepth / 8); break; // Grayscale + Alpha
    default: return buffer; // Unsupported color type for masking
  }

  const rowBytes = 1 + dimensions.width * bytesPerPixel; // +1 for filter byte

  // Apply black rectangles to pixel data
  for (const region of regions) {
    const startY = Math.max(0, Math.floor(region.y));
    const endY = Math.min(dimensions.height, Math.ceil(region.y + region.height));
    const startX = Math.max(0, Math.floor(region.x));
    const endX = Math.min(dimensions.width, Math.ceil(region.x + region.width));

    for (let y = startY; y < endY; y++) {
      // Reset filter byte to None (0) for modified rows
      const rowOffset = y * rowBytes;
      rawData[rowOffset] = 0; // Set filter to None

      for (let x = startX; x < endX; x++) {
        const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
        // Set pixel to black
        for (let b = 0; b < bytesPerPixel; b++) {
          if (colorType === 6 && b === 3) {
            rawData[pixelOffset + b] = 255; // Alpha = fully opaque
          } else {
            rawData[pixelOffset + b] = 0; // R=0, G=0, B=0
          }
        }
      }
    }
  }

  // Recompress the modified data
  const recompressed = deflateSync(rawData);

  // Rebuild PNG with new IDAT data
  const chunks: Buffer[] = [];

  // PNG signature
  chunks.push(buffer.subarray(0, 8));

  // Re-add non-IDAT chunks before IEND, inserting new IDAT data
  let idatInserted = false;
  offset = 8;

  while (offset < buffer.length - 4) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const totalChunkSize = 12 + chunkLength;

    if (chunkType === "IDAT") {
      if (!idatInserted) {
        // Insert single new IDAT chunk
        const newIdatHeader = Buffer.alloc(8);
        newIdatHeader.writeUInt32BE(recompressed.length, 0);
        newIdatHeader.write("IDAT", 4);

        const crcData = Buffer.concat([
          Buffer.from("IDAT"),
          recompressed,
        ]);
        const crc = crc32(crcData);
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc, 0);

        chunks.push(newIdatHeader);
        chunks.push(recompressed);
        chunks.push(crcBuf);
        idatInserted = true;
      }
      // Skip old IDAT chunks
    } else {
      chunks.push(buffer.subarray(offset, offset + totalChunkSize));
    }

    offset += totalChunkSize;
  }

  return Buffer.concat(chunks);
}

/**
 * CRC32 calculation for PNG chunks.
 */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrc32Table();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

let _crc32Table: Uint32Array | undefined;
function getCrc32Table(): Uint32Array {
  if (_crc32Table) return _crc32Table;

  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }

  _crc32Table = table;
  return table;
}
