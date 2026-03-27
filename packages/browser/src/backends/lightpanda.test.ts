import { describe, it, expect } from "vitest";
import { LightpandaBackend, ChromiumBackend, BackendFactory } from "./lightpanda.js";

describe("LightpandaBackend", () => {
  describe("constructor", () => {
    it("should create with default config", () => {
      const backend = new LightpandaBackend();
      expect(backend.name).toBe("lightpanda");
    });

    it("should create with custom config", () => {
      const backend = new LightpandaBackend({
        endpoint: "http://localhost:9333",
        port: 9333,
      });
      expect(backend.name).toBe("lightpanda");
    });
  });

  describe("isAvailable", () => {
    it("should return false when server not running", async () => {
      const backend = new LightpandaBackend({
        endpoint: "http://localhost:19999",
      });
      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe("launch", () => {
    it("should return CDP endpoint in CDP mode", async () => {
      const backend = new LightpandaBackend({ mode: "cdp", port: 9222 });
      const result = await backend.launch({});
      expect(result).toHaveProperty("type", "lightpanda");
      expect(result).toHaveProperty("cdpEndpoint");
    });

    it("should return API endpoint in API mode", async () => {
      const backend = new LightpandaBackend({ mode: "api" });
      const result = await backend.launch({});
      expect(result).toHaveProperty("type", "lightpanda");
      expect(result).toHaveProperty("endpoint");
    });
  });

  describe("close", () => {
    it("should close without error", async () => {
      const backend = new LightpandaBackend();
      await backend.close(); // Should not throw
    });
  });

  describe("getCdpEndpoint", () => {
    it("should return CDP URL", () => {
      const backend = new LightpandaBackend({ endpoint: "http://localhost:9222" });
      const url = backend.getCdpEndpoint();
      expect(url).toContain("/devtools/browser");
    });
  });

  describe("getVersion", () => {
    it("should return null when not available", async () => {
      const backend = new LightpandaBackend({
        endpoint: "http://localhost:19999",
      });
      const version = await backend.getVersion();
      expect(version).toBeNull();
    });
  });
});

describe("ChromiumBackend", () => {
  describe("constructor", () => {
    it("should create backend", () => {
      const backend = new ChromiumBackend();
      expect(backend.name).toBe("chromium");
    });
  });

  describe("launch", () => {
    it("should return chromium type", async () => {
      const backend = new ChromiumBackend();
      const result = await backend.launch({});
      expect(result).toHaveProperty("type", "chromium");
    });
  });

  describe("close", () => {
    it("should close without error", async () => {
      const backend = new ChromiumBackend();
      await backend.close();
    });
  });
});

describe("BackendFactory", () => {
  describe("create", () => {
    it("should create lightpanda backend", () => {
      const backend = BackendFactory.create("lightpanda");
      expect(backend.name).toBe("lightpanda");
    });

    it("should create chromium backend", () => {
      const backend = BackendFactory.create("chromium");
      expect(backend.name).toBe("chromium");
    });
  });

  describe("detect", () => {
    it("should return a backend", async () => {
      const backend = await BackendFactory.detect();
      expect(backend.name).toBeDefined();
      // Will typically return chromium since lightpanda isn't running
      expect(["chromium", "lightpanda"]).toContain(backend.name);
    });
  });
});
