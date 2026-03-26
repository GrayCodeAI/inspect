// ============================================================================
// @inspect/credentials - TOTP Generator (RFC 6238)
// ============================================================================

import * as crypto from "node:crypto";

/** TOTP configuration options */
export interface TOTPOptions {
  /** TOTP secret (base32 encoded) */
  secret: string;
  /** Time step in seconds (default: 30) */
  period?: number;
  /** Number of digits in the code (default: 6) */
  digits?: number;
  /** Hash algorithm (default: sha1) */
  algorithm?: "sha1" | "sha256" | "sha512";
  /** Time offset in seconds for clock skew correction */
  timeOffset?: number;
}

/** TOTP verification result */
export interface TOTPVerifyResult {
  valid: boolean;
  /** Time step delta where match was found (-1, 0, or 1) */
  delta: number;
}

/**
 * TOTPGenerator implements RFC 6238 Time-Based One-Time Password algorithm.
 * Uses HMAC-SHA1 (default) with base32-encoded secrets.
 * Compatible with Google Authenticator, Authy, and other TOTP apps.
 */
export class TOTPGenerator {
  private readonly secret: Buffer;
  private readonly period: number;
  private readonly digits: number;
  private readonly algorithm: string;
  private readonly timeOffset: number;

  constructor(options: TOTPOptions) {
    this.secret = this.base32Decode(options.secret);
    this.period = options.period ?? 30;
    this.digits = options.digits ?? 6;
    this.algorithm = options.algorithm ?? "sha1";
    this.timeOffset = options.timeOffset ?? 0;
  }

  /**
   * Generate a TOTP code for the current time.
   */
  generate(time?: number): string {
    const counter = this.getCounter(time);
    return this.generateHOTP(counter);
  }

  /**
   * Generate a TOTP code from a base32 secret (static convenience method).
   */
  static generateCode(
    secret: string,
    options?: Partial<TOTPOptions>,
  ): string {
    const generator = new TOTPGenerator({ secret, ...options });
    return generator.generate();
  }

  /**
   * Verify a TOTP code, allowing for clock skew (checks previous and next period).
   *
   * @param code - The code to verify
   * @param window - Number of periods to check in each direction (default: 1)
   * @param time - Optional timestamp in ms (defaults to now)
   */
  verify(
    code: string,
    window: number = 1,
    time?: number,
  ): TOTPVerifyResult {
    const counter = this.getCounter(time);

    for (let delta = -window; delta <= window; delta++) {
      const expected = this.generateHOTP(counter + delta);
      if (this.timingSafeEqual(code, expected)) {
        return { valid: true, delta };
      }
    }

    return { valid: false, delta: 0 };
  }

  /**
   * Get the remaining seconds until the current code expires.
   */
  remainingSeconds(time?: number): number {
    const now = time ?? Date.now();
    const seconds = Math.floor(now / 1000) + this.timeOffset;
    return this.period - (seconds % this.period);
  }

  /**
   * Generate the otpauth:// URI for QR code generation.
   */
  toURI(
    issuer: string,
    account: string,
    secretBase32: string,
  ): string {
    const params = new URLSearchParams({
      secret: secretBase32.replace(/=/g, ""),
      issuer,
      algorithm: this.algorithm.toUpperCase(),
      digits: String(this.digits),
      period: String(this.period),
    });

    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`;
  }

  /**
   * Generate a random base32 secret.
   */
  static generateSecret(length: number = 20): string {
    const buffer = crypto.randomBytes(length);
    return TOTPGenerator.base32Encode(buffer);
  }

  /**
   * Base32 encode a buffer.
   */
  static base32Encode(buffer: Buffer): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let result = "";

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 0x1f];
        bits -= 5;
      }
    }

    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 0x1f];
    }

    // Pad to multiple of 8
    while (result.length % 8 !== 0) {
      result += "=";
    }

    return result;
  }

  /**
   * Get the TOTP counter value for a given time.
   */
  private getCounter(time?: number): number {
    const now = time ?? Date.now();
    const seconds = Math.floor(now / 1000) + this.timeOffset;
    return Math.floor(seconds / this.period);
  }

  /**
   * Generate an HOTP code for a given counter (RFC 4226).
   */
  private generateHOTP(counter: number): string {
    // Convert counter to 8-byte big-endian buffer
    const counterBuffer = Buffer.alloc(8);
    let temp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBuffer[i] = temp & 0xff;
      temp = Math.floor(temp / 256);
    }

    // Generate HMAC
    const hmac = crypto.createHmac(this.algorithm, this.secret);
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation (RFC 4226 section 5.4)
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    // Generate digits
    const otp = binary % Math.pow(10, this.digits);
    return otp.toString().padStart(this.digits, "0");
  }

  /**
   * Decode a base32 string to a Buffer.
   */
  private base32Decode(encoded: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    // Remove padding and whitespace
    const cleaned = encoded
      .replace(/[\s=]/g, "")
      .toUpperCase();

    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (let i = 0; i < cleaned.length; i++) {
      const idx = alphabet.indexOf(cleaned[i]);
      if (idx === -1) {
        throw new Error(
          `Invalid base32 character: '${cleaned[i]}' at position ${i}`,
        );
      }

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }

    return Buffer.from(output);
  }

  /**
   * Timing-safe string comparison to prevent timing attacks.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
