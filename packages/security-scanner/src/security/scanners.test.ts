import { describe, it, expect } from "vitest";
import { NucleiScanner } from "./nuclei.js";
import { ZAPScanner } from "./zap.js";

describe("NucleiScanner", () => {
  describe("constructor", () => {
    it("should use default binary path", () => {
      const scanner = new NucleiScanner();
      expect(scanner).toBeDefined();
    });

    it("should accept custom binary path", () => {
      const scanner = new NucleiScanner("/usr/local/bin/nuclei");
      expect(scanner).toBeDefined();
    });
  });

  describe("buildArgs (via scan method structure)", () => {
    it("should require nuclei binary to be installed", async () => {
      const scanner = new NucleiScanner();
      await expect(scanner.scan("https://example.com")).rejects.toThrow("nuclei binary not found");
    });
  });
});

describe("ZAPScanner", () => {
  describe("constructor", () => {
    it("should use default API URL", () => {
      const scanner = new ZAPScanner();
      expect(scanner).toBeDefined();
    });

    it("should accept custom API URL and key", () => {
      const scanner = new ZAPScanner({
        apiUrl: "http://zap:8090",
        apiKey: "test-key",
      });
      expect(scanner).toBeDefined();
    });
  });

  describe("scan", () => {
    it("should fail when ZAP is not accessible", async () => {
      const scanner = new ZAPScanner();
      await expect(scanner.scan("https://example.com")).rejects.toThrow("Cannot connect to ZAP");
    });
  });
});
