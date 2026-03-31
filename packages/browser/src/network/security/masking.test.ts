import { describe, it, expect, beforeEach } from "vitest";
import { SensitiveDataMasker } from "./masking.js";

describe("SensitiveDataMasker", () => {
  let masker: SensitiveDataMasker;

  beforeEach(() => {
    masker = new SensitiveDataMasker();
  });

  describe("maskText - credit cards", () => {
    it("masks a credit card number with spaces", () => {
      const result = masker.maskText("My card is 4111 1111 1111 1111 thanks");
      expect(result).toContain("[MASKED:credit_card]");
      expect(result).not.toContain("4111 1111 1111 1111");
    });

    it("masks a credit card number with dashes", () => {
      const result = masker.maskText("Card: 4111-1111-1111-1111");
      expect(result).toContain("[MASKED:credit_card]");
    });

    it("masks a credit card number without separators", () => {
      const result = masker.maskText("CC: 4111111111111111");
      expect(result).toContain("[MASKED:credit_card]");
    });
  });

  describe("maskText - SSN", () => {
    it("masks a Social Security Number", () => {
      const result = masker.maskText("SSN: 123-45-6789");
      expect(result).toContain("[MASKED:ssn]");
      expect(result).not.toContain("123-45-6789");
    });
  });

  describe("maskText - email", () => {
    it("masks an email address", () => {
      const result = masker.maskText("Contact: user@example.com for info");
      expect(result).toContain("[MASKED:email]");
      expect(result).not.toContain("user@example.com");
    });

    it("masks emails with + and dots", () => {
      const result = masker.maskText("Email: test.user+tag@domain.co.uk");
      expect(result).toContain("[MASKED:email]");
    });
  });

  describe("maskText - phone", () => {
    it("masks a US phone number", () => {
      const result = masker.maskText("Call (555) 123-4567 now");
      expect(result).toContain("[MASKED:phone]");
      expect(result).not.toContain("(555) 123-4567");
    });

    it("masks phone with +1 prefix", () => {
      const result = masker.maskText("Phone: +1 555-123-4567");
      expect(result).toContain("[MASKED:phone]");
    });
  });

  describe("maskText - API keys", () => {
    it("masks common API key patterns", () => {
      // The regex expects (sk|pk|api|key|token|secret|password)[_-]?[A-Za-z0-9]{20,}
      // No underscores allowed in the alphanumeric suffix portion
      const result = masker.maskText("key: sk_abcdefghijklmnopqrstuvwxyz");
      expect(result).toContain("[MASKED:api_key]");
      expect(result).not.toContain("sk_abcdefghijklmnopqrstuvwxyz");
    });

    it("masks token patterns", () => {
      const result = masker.maskText("use token_abcdefghijklmnopqrstuvwxyz");
      expect(result).toContain("[MASKED:api_key]");
    });
  });

  describe("maskText - JWT tokens", () => {
    it("masks JWT-like strings", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = masker.maskText(`Bearer ${jwt}`);
      expect(result).toContain("[MASKED:jwt]");
      expect(result).not.toContain(jwt);
    });
  });

  describe("maskInHeaders", () => {
    it("masks Authorization header value", () => {
      const headers = {
        Authorization: "Bearer secret-token-123",
        "Content-Type": "application/json",
      };
      const masked = masker.maskInHeaders(headers);
      expect(masked.Authorization).toBe("[MASKED]");
      expect(masked["Content-Type"]).toBe("application/json");
    });

    it("masks Cookie header value", () => {
      const headers = { Cookie: "session=abc123" };
      const masked = masker.maskInHeaders(headers);
      expect(masked.Cookie).toBe("[MASKED]");
    });

    it("masks x-api-key header (case-insensitive)", () => {
      const headers = { "X-Api-Key": "my-secret-key" };
      const masked = masker.maskInHeaders(headers);
      expect(masked["X-Api-Key"]).toBe("[MASKED]");
    });

    it("masks array header values", () => {
      const headers = {
        "set-cookie": ["session=abc", "token=xyz"],
      };
      const masked = masker.maskInHeaders(headers);
      expect(masked["set-cookie"]).toEqual(["[MASKED]", "[MASKED]"]);
    });

    it("applies text masking to non-sensitive headers containing PII", () => {
      const headers = {
        "X-Debug-Info": "User email: test@example.com",
      };
      const masked = masker.maskInHeaders(headers);
      expect(masked["X-Debug-Info"]).toContain("[MASKED:email]");
      expect(masked["X-Debug-Info"]).not.toContain("test@example.com");
    });
  });

  describe("detect", () => {
    it("returns matching pattern names", () => {
      const matches = masker.detect("SSN is 123-45-6789 and email is user@test.com");
      expect(matches).toContain("ssn");
      expect(matches).toContain("email");
    });

    it("returns empty array for clean text", () => {
      const matches = masker.detect("This is a perfectly clean sentence.");
      expect(matches).toEqual([]);
    });
  });

  describe("custom patterns", () => {
    it("adds and uses a custom masking pattern", () => {
      masker.addPattern("custom_id", /ID-\d{6}/g);
      const result = masker.maskText("Your ID is ID-123456");
      expect(result).toContain("[MASKED:custom_id]");
    });

    it("removes a pattern", () => {
      const removed = masker.removePattern("ssn");
      expect(removed).toBe(true);
      const result = masker.maskText("SSN: 123-45-6789");
      expect(result).not.toContain("[MASKED:ssn]");
      expect(result).toContain("123-45-6789");
    });
  });

  describe("getPatternNames", () => {
    it("returns all registered pattern names", () => {
      const names = masker.getPatternNames();
      expect(names).toContain("ssn");
      expect(names).toContain("credit_card");
      expect(names).toContain("email");
      expect(names).toContain("phone");
      expect(names).toContain("api_key");
      expect(names).toContain("jwt");
    });
  });

  describe("repeated masking calls", () => {
    it("handles multiple maskText calls without state issues", () => {
      const r1 = masker.maskText("SSN: 111-22-3333");
      const r2 = masker.maskText("SSN: 444-55-6666");
      expect(r1).toContain("[MASKED:ssn]");
      expect(r2).toContain("[MASKED:ssn]");
    });
  });
});
