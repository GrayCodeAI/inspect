import { describe, it, expect, beforeEach } from "vitest";
import { DomainSecurity, DEFAULT_BLOCKED } from "./domains.js";

describe("DomainSecurity", () => {
  let security: DomainSecurity;

  beforeEach(() => {
    security = new DomainSecurity();
  });

  describe("default blocked hosts", () => {
    it("blocks localhost", () => {
      expect(security.isAllowed("http://localhost")).toBe(false);
      expect(security.isAllowed("http://localhost:3000")).toBe(false);
    });

    it("blocks 127.0.0.1", () => {
      expect(security.isAllowed("http://127.0.0.1")).toBe(false);
      expect(security.isAllowed("http://127.0.0.1:8080")).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      expect(security.isAllowed("http://0.0.0.0")).toBe(false);
    });

    it("blocks IPv6 loopback", () => {
      expect(security.isAllowed("http://[::1]")).toBe(false);
    });

    it("blocks AWS metadata endpoint", () => {
      expect(security.isAllowed("http://169.254.169.254")).toBe(false);
    });

    it("blocks private network ranges (10.*)", () => {
      expect(security.isAllowed("http://10.0.0.1")).toBe(false);
    });

    it("blocks private network ranges (192.168.*)", () => {
      expect(security.isAllowed("http://192.168.1.1")).toBe(false);
    });

    it("blocks private network ranges (172.16-31.*)", () => {
      expect(security.isAllowed("http://172.16.0.1")).toBe(false);
      expect(security.isAllowed("http://172.31.255.255")).toBe(false);
    });
  });

  describe("allows normal domains", () => {
    it("allows https://example.com", () => {
      expect(security.isAllowed("https://example.com")).toBe(true);
    });

    it("allows https://www.google.com", () => {
      expect(security.isAllowed("https://www.google.com")).toBe(true);
    });

    it("allows http URLs", () => {
      expect(security.isAllowed("http://example.com")).toBe(true);
    });
  });

  describe("protocol validation", () => {
    it("blocks ftp protocol", () => {
      expect(security.isAllowed("ftp://example.com")).toBe(false);
    });

    it("blocks file protocol", () => {
      expect(security.isAllowed("file:///etc/passwd")).toBe(false);
    });

    it("blocks javascript protocol", () => {
      expect(security.isAllowed("javascript:alert(1)")).toBe(false);
    });
  });

  describe("invalid URLs", () => {
    it("rejects invalid URL format", () => {
      const result = security.validateUrl("not a url");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Invalid URL format");
    });
  });

  describe("allowlist mode", () => {
    it("only allows hosts matching the allowlist", () => {
      security.setAllowedHosts(["example.com", "*.example.org"]);

      expect(security.isAllowed("https://example.com")).toBe(true);
      expect(security.isAllowed("https://sub.example.org")).toBe(true);
      expect(security.isAllowed("https://other.com")).toBe(false);
    });

    it("still blocks default blocked hosts even if in allowlist", () => {
      security.setAllowedHosts(["*"]);
      expect(security.isAllowed("http://localhost")).toBe(false);
      expect(security.isAllowed("http://127.0.0.1")).toBe(false);
    });
  });

  describe("wildcard patterns", () => {
    it("matches *.example.com for subdomains", () => {
      security.setAllowedHosts(["*.example.com"]);
      expect(security.isAllowed("https://sub.example.com")).toBe(true);
      expect(security.isAllowed("https://example.com")).toBe(true);
      expect(security.isAllowed("https://other.com")).toBe(false);
    });

    it("blocks with wildcard patterns in blocklist", () => {
      security.setBlockedHosts(["*.evil.com"]);
      expect(security.isAllowed("https://sub.evil.com")).toBe(false);
      expect(security.isAllowed("https://evil.com")).toBe(false);
    });
  });

  describe("validateUrl detailed result", () => {
    it("returns parsed URL on success", () => {
      const result = security.validateUrl("https://example.com/path");
      expect(result.valid).toBe(true);
      expect(result.parsed).toBeDefined();
      expect(result.parsed!.hostname).toBe("example.com");
    });

    it("returns reason on block", () => {
      const result = security.validateUrl("http://localhost:3000");
      expect(result.valid).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe("custom blocked hosts", () => {
    it("merges with default blocked list", () => {
      security.setBlockedHosts(["dangerous.com"]);
      expect(security.isAllowed("https://dangerous.com")).toBe(false);
      // Default blocks still apply
      expect(security.isAllowed("http://localhost")).toBe(false);
    });
  });

  describe("reset", () => {
    it("restores default state", () => {
      security.setAllowedHosts(["only.this.com"]);
      security.setBlockedHosts(["extra.com"]);
      security.reset();

      expect(security.getAllowedPatterns()).toEqual([]);
      expect(security.getBlockedPatterns()).toEqual(DEFAULT_BLOCKED);
      expect(security.isAllowed("https://example.com")).toBe(true);
    });
  });

  describe("DEFAULT_BLOCKED", () => {
    it("contains localhost and common private ranges", () => {
      expect(DEFAULT_BLOCKED).toContain("localhost");
      expect(DEFAULT_BLOCKED).toContain("127.0.0.1");
      expect(DEFAULT_BLOCKED).toContain("0.0.0.0");
      expect(DEFAULT_BLOCKED).toContain("10.*");
      expect(DEFAULT_BLOCKED).toContain("192.168.*");
    });
  });
});
