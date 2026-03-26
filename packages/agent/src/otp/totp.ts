// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - TOTP Generator
// ──────────────────────────────────────────────────────────────────────────────

import { createHmac } from "node:crypto";

/** TOTP configuration */
export interface TOTPConfig {
  /** Base32-encoded secret key */
  secret: string;
  /** Time step in seconds (default: 30) */
  period?: number;
  /** Number of digits in the OTP (default: 6) */
  digits?: number;
  /** Hash algorithm (default: SHA1) */
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  /** Time offset in seconds (for clock skew) */
  timeOffset?: number;
}

/**
 * TOTP (Time-based One-Time Password) generator.
 *
 * Implements RFC 6238 for generating time-based OTPs.
 * Used for handling 2FA/MFA during automated test flows.
 */
export class TOTPGenerator {
  private readonly config: Required<TOTPConfig>;

  constructor(config: TOTPConfig) {
    this.config = {
      secret: config.secret,
      period: config.period ?? 30,
      digits: config.digits ?? 6,
      algorithm: config.algorithm ?? "SHA1",
      timeOffset: config.timeOffset ?? 0,
    };
  }

  /**
   * Generate the current TOTP code.
   */
  generate(secret?: string): string {
    const key = secret ?? this.config.secret;
    const time = this.getCurrentTimeStep();
    return this.generateAtTimeStep(key, time);
  }

  /**
   * Generate TOTP for a specific timestamp.
   */
  generateAt(timestamp: number, secret?: string): string {
    const key = secret ?? this.config.secret;
    const time = Math.floor(timestamp / 1000 / this.config.period);
    return this.generateAtTimeStep(key, time);
  }

  /**
   * Verify a TOTP code with optional window for clock skew.
   * @param code - The OTP code to verify
   * @param window - Number of time steps to check before/after current (default: 1)
   */
  verify(code: string, window: number = 1, secret?: string): boolean {
    const key = secret ?? this.config.secret;
    const currentStep = this.getCurrentTimeStep();

    for (let offset = -window; offset <= window; offset++) {
      const expected = this.generateAtTimeStep(key, currentStep + offset);
      if (timingSafeEqual(code, expected)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the number of seconds remaining before the current code expires.
   */
  getRemainingSeconds(): number {
    const now = Math.floor(Date.now() / 1000) + this.config.timeOffset;
    return this.config.period - (now % this.config.period);
  }

  /**
   * Wait until the next time period begins, then generate a fresh code.
   * Useful when the current code is about to expire.
   */
  async waitForFreshCode(minRemaining: number = 5): Promise<string> {
    const remaining = this.getRemainingSeconds();

    if (remaining < minRemaining) {
      // Wait for the next period
      await new Promise((resolve) => setTimeout(resolve, remaining * 1000 + 500));
    }

    return this.generate();
  }

  // ── Private implementation ─────────────────────────────────────────────

  private getCurrentTimeStep(): number {
    const now = Math.floor(Date.now() / 1000) + this.config.timeOffset;
    return Math.floor(now / this.config.period);
  }

  private generateAtTimeStep(secret: string, timeStep: number): string {
    const key = base32Decode(secret);
    const timeBuffer = Buffer.alloc(8);

    // Write time step as big-endian 64-bit integer
    let t = timeStep;
    for (let i = 7; i >= 0; i--) {
      timeBuffer[i] = t & 0xff;
      t = Math.floor(t / 256);
    }

    // HMAC
    const algorithmMap: Record<string, string> = {
      SHA1: "sha1",
      SHA256: "sha256",
      SHA512: "sha512",
    };
    const hmac = createHmac(algorithmMap[this.config.algorithm], key);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    // Dynamic truncation (RFC 4226 section 5.4)
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    const otp = binary % Math.pow(10, this.config.digits);
    return otp.toString().padStart(this.config.digits, "0");
  }
}

/**
 * Convenience function to generate a TOTP code from a secret.
 */
export function generateTOTP(secret: string, options?: Omit<TOTPConfig, "secret">): string {
  const generator = new TOTPGenerator({ secret, ...options });
  return generator.generate();
}

// ── Base32 decoding ────────────────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(encoded: string): Buffer {
  // Remove spaces and padding, uppercase
  const cleaned = encoded.replace(/[\s=]/g, "").toUpperCase();

  const bits: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    // Each base32 character encodes 5 bits
    for (let i = 4; i >= 0; i--) {
      bits.push((index >> i) & 1);
    }
  }

  // Convert bits to bytes
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    bytes.push(byte);
  }

  return Buffer.from(bytes);
}

// ── Timing-safe comparison ────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
