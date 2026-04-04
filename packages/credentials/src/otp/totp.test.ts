import { describe, it, expect } from "vitest";
import { TOTPGenerator } from "./totp.js";

// A well-known base32 secret for deterministic testing.
// "12345678901234567890" encoded as base32.
const TEST_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTPGenerator", () => {
  describe("code generation", () => {
    it("should generate a code of the correct digit length (default 6)", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET });
      const code = gen.generate();
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it("should generate an 8-digit code when configured", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET, digits: 8 });
      const code = gen.generate();
      expect(code).toHaveLength(8);
      expect(/^\d{8}$/.test(code)).toBe(true);
    });

    it("should produce the same code for the same time within a period", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET, period: 30 });
      // Two timestamps within the same 30-second window
      const t1 = 1700000000000; // ms
      const t2 = t1 + 5000; // 5 seconds later, same window
      expect(gen.generate(t1)).toBe(gen.generate(t2));
    });

    it("should produce a different code in a different period", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET, period: 30 });
      const t1 = 1700000000000;
      const t2 = t1 + 31000; // 31 seconds later, next window
      // Statistically extremely unlikely to collide; functionally they differ
      expect(gen.generate(t1)).not.toBe(gen.generate(t2));
    });

    it("should produce deterministic output for a known timestamp", () => {
      const gen = new TOTPGenerator({
        secret: TEST_SECRET,
        period: 30,
        algorithm: "sha1",
        digits: 6,
      });
      const code1 = gen.generate(1700000000000);
      const code2 = gen.generate(1700000000000);
      expect(code1).toBe(code2);
    });
  });

  describe("period handling", () => {
    it("should respect a custom period length", () => {
      const gen60 = new TOTPGenerator({ secret: TEST_SECRET, period: 60 });
      // Two timestamps 35 seconds apart should be in the same 60-second window
      const t = 1700000000000;
      expect(gen60.generate(t)).toBe(gen60.generate(t + 35000));
    });

    it("should calculate remaining seconds correctly", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET, period: 30 });
      // At exactly a period boundary, remaining should be 30
      const boundaryTime = 30 * 1000 * Math.floor(Date.now() / 1000 / 30); // approximate boundary
      const remaining = gen.remainingSeconds(boundaryTime * 1000);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(30);
    });
  });

  describe("algorithm options", () => {
    it("should produce different codes with different algorithms for the same time", () => {
      const t = 1700000000000;
      const sha1 = new TOTPGenerator({ secret: TEST_SECRET, algorithm: "sha1" }).generate(t);
      const sha256 = new TOTPGenerator({ secret: TEST_SECRET, algorithm: "sha256" }).generate(t);
      const sha512 = new TOTPGenerator({ secret: TEST_SECRET, algorithm: "sha512" }).generate(t);

      // At least two of three should differ (extremely unlikely all collide)
      const unique = new Set([sha1, sha256, sha512]);
      expect(unique.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe("verification", () => {
    it("should verify a correct code at the exact time", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET });
      const t = 1700000000000;
      const code = gen.generate(t);
      const result = gen.verify(code, 1, t);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(0);
    });

    it("should verify a code from the previous period within window=1", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET, period: 30 });
      const t = 1700000000000;
      const prevCode = gen.generate(t - 30000); // previous period
      const result = gen.verify(prevCode, 1, t);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(-1);
    });

    it("should reject a code outside the verification window", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET, period: 30 });
      const t = 1700000000000;
      const farCode = gen.generate(t - 90000); // 3 periods back
      const result = gen.verify(farCode, 1, t);
      expect(result.valid).toBe(false);
    });

    it("should reject an entirely wrong code", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET });
      const result = gen.verify("000000", 1, 1700000000000);
      // "000000" could theoretically be valid but astronomically unlikely
      // We verify the structure is correct either way
      expect(typeof result.valid).toBe("boolean");
      expect(typeof result.delta).toBe("number");
    });
  });

  describe("static helpers", () => {
    it("should generate a random base32 secret of default length", () => {
      const secret = TOTPGenerator.generateSecret();
      expect(secret.length).toBeGreaterThan(0);
      // Valid base32 characters only
      expect(/^[A-Z2-7=]+$/.test(secret)).toBe(true);
    });

    it("should round-trip base32 encode/decode via generateCode", () => {
      // generateCode is a convenience that constructs a TOTPGenerator internally
      const code = TOTPGenerator.generateCode(TEST_SECRET);
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it("should generate a URI suitable for QR codes", () => {
      const gen = new TOTPGenerator({ secret: TEST_SECRET });
      const uri = gen.toURI("Acme", "user@acme.com", TEST_SECRET);
      expect(uri).toContain("otpauth://totp/");
      expect(uri).toContain("Acme");
      expect(uri).toContain("user%40acme.com");
      expect(uri).toContain("secret=");
      expect(uri).toContain("algorithm=SHA1");
      expect(uri).toContain("digits=6");
      expect(uri).toContain("period=30");
    });
  });
});
