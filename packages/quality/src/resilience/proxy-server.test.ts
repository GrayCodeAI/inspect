import { describe, it, expect } from "vitest";
import { ProxyServer, TOXICITY_PRESETS } from "./proxy-server.js";

describe("ProxyServer", () => {
  describe("constructor", () => {
    it("should create server with config", () => {
      const server = new ProxyServer({
        port: 8080,
        upstream: "example.com:443",
      });
      expect(server).toBeDefined();
    });

    it("should accept initial toxics", () => {
      const server = new ProxyServer({
        port: 8080,
        upstream: "example.com:443",
        toxics: [{ type: "latency", name: "slow", attributes: { latency: 1000 } }],
      });
      const status = server.getStatus();
      expect(status.toxics.length).toBe(1);
      expect(status.toxics[0].name).toBe("slow");
    });
  });

  describe("addToxic / removeToxic", () => {
    it("should add a toxic", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      server.addToxic({ type: "latency", name: "test-latency", attributes: { latency: 500 } });
      const status = server.getStatus();
      expect(status.toxics.some((t) => t.name === "test-latency")).toBe(true);
    });

    it("should remove a toxic by name", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      server.addToxic({ type: "latency", name: "test", attributes: { latency: 100 } });
      const removed = server.removeToxic("test");
      expect(removed).toBe(true);
      expect(server.getStatus().toxics.length).toBe(0);
    });

    it("should return false for non-existent toxic", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      expect(server.removeToxic("nonexistent")).toBe(false);
    });
  });

  describe("clearToxics", () => {
    it("should clear all toxics", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      server.addToxic({ type: "latency", name: "a", attributes: { latency: 100 } });
      server.addToxic({ type: "bandwidth", name: "b", attributes: { rate: 1000 } });
      server.clearToxics();
      expect(server.getStatus().toxics.length).toBe(0);
    });
  });

  describe("applyPreset", () => {
    it("should apply a known preset", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      const success = server.applyPreset("slow-3g");
      expect(success).toBe(true);
      expect(server.getStatus().toxics.length).toBeGreaterThan(0);
    });

    it("should return false for unknown preset", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      const success = server.applyPreset("nonexistent");
      expect(success).toBe(false);
    });
  });

  describe("getStatus", () => {
    it("should return server status", () => {
      const server = new ProxyServer({
        port: 8080,
        upstream: "example.com:443",
        name: "test-proxy",
      });
      const status = server.getStatus();
      expect(status.name).toBe("test-proxy");
      expect(status.listen).toBe("0.0.0.0:8080");
      expect(status.upstream).toBe("example.com:443");
      expect(status.enabled).toBe(false); // Not started
    });
  });

  describe("getMetrics", () => {
    it("should return initial metrics", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      const metrics = server.getMetrics();
      expect(metrics.totalConnections).toBe(0);
      expect(metrics.activeConnections).toBe(0);
      expect(metrics.bytesUp).toBe(0);
      expect(metrics.bytesDown).toBe(0);
    });
  });

  describe("createGroup / applyToxicToGroup", () => {
    it("should create a proxy group", () => {
      const server = new ProxyServer({ port: 8080, upstream: "example.com:443" });
      server.createGroup("test-group", ["proxy1", "proxy2"]);
      // Group created internally - no error
    });
  });
});

describe("TOXICITY_PRESETS", () => {
  it("should have slow-3g preset", () => {
    expect(TOXICITY_PRESETS["slow-3g"]).toBeDefined();
    expect(TOXICITY_PRESETS["slow-3g"].toxics.length).toBeGreaterThan(0);
  });

  it("should have flaky-wifi preset", () => {
    expect(TOXICITY_PRESETS["flaky-wifi"]).toBeDefined();
    expect(TOXICITY_PRESETS["flaky-wifi"].toxics.length).toBeGreaterThan(0);
  });

  it("should have offline preset", () => {
    expect(TOXICITY_PRESETS["offline"]).toBeDefined();
  });

  it("should have high-latency preset", () => {
    expect(TOXICITY_PRESETS["high-latency"]).toBeDefined();
  });

  it("should have packet-loss preset", () => {
    expect(TOXICITY_PRESETS["packet-loss"]).toBeDefined();
  });

  it("should have valid toxics in all presets", () => {
    for (const [name, preset] of Object.entries(TOXICITY_PRESETS)) {
      expect(preset.name).toBeDefined();
      expect(preset.description).toBeDefined();
      expect(preset.toxics.length).toBeGreaterThan(0);
      for (const toxic of preset.toxics) {
        expect(toxic.type).toBeDefined();
        expect(toxic.name).toBeDefined();
        expect(toxic.attributes).toBeDefined();
      }
    }
  });
});
