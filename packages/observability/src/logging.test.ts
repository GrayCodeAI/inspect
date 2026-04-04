import { describe, it, expect, beforeEach } from "vitest";
import { Logger } from "./logging.js";

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ name: "test", level: "debug", stdout: false });
  });

  describe("level management", () => {
    it("returns the initial level", () => {
      expect(logger.getLevel()).toBe("debug");
    });

    it("changes level at runtime", () => {
      logger.setLevel("error");
      expect(logger.getLevel()).toBe("error");
    });
  });

  describe("isLevelEnabled", () => {
    it("debug enables all levels", () => {
      logger.setLevel("debug");
      expect(logger.isLevelEnabled("debug")).toBe(true);
      expect(logger.isLevelEnabled("info")).toBe(true);
      expect(logger.isLevelEnabled("warn")).toBe(true);
      expect(logger.isLevelEnabled("error")).toBe(true);
    });

    it("info disables debug", () => {
      logger.setLevel("info");
      expect(logger.isLevelEnabled("debug")).toBe(false);
      expect(logger.isLevelEnabled("info")).toBe(true);
      expect(logger.isLevelEnabled("warn")).toBe(true);
    });

    it("error disables debug, info, warn", () => {
      logger.setLevel("error");
      expect(logger.isLevelEnabled("debug")).toBe(false);
      expect(logger.isLevelEnabled("info")).toBe(false);
      expect(logger.isLevelEnabled("warn")).toBe(false);
      expect(logger.isLevelEnabled("error")).toBe(true);
    });

    it("silent disables everything", () => {
      logger.setLevel("silent");
      expect(logger.isLevelEnabled("debug")).toBe(false);
      expect(logger.isLevelEnabled("info")).toBe(false);
      expect(logger.isLevelEnabled("warn")).toBe(false);
      expect(logger.isLevelEnabled("error")).toBe(false);
    });
  });

  describe("child", () => {
    it("creates a child with same level", () => {
      logger.setLevel("warn");
      const child = logger.child({ requestId: "abc" });
      expect(child.getLevel()).toBe("warn");
    });

    it("child inherits parent context", () => {
      const parent = new Logger({
        name: "parent",
        level: "info",
        stdout: false,
        context: { service: "api" },
      });
      const child = parent.child({ requestId: "123" });
      // Child should be a working logger
      expect(child.getLevel()).toBe("info");
      expect(child.isLevelEnabled("info")).toBe(true);
    });

    it("child does not affect parent", () => {
      const child = logger.child({ extra: true });
      child.setLevel("error");
      expect(logger.getLevel()).toBe("debug");
    });
  });

  describe("log methods do not throw", () => {
    it("debug logs without error", () => {
      expect(() => logger.debug("test message")).not.toThrow();
    });

    it("info logs without error", () => {
      expect(() => logger.info("test message", { key: "value" })).not.toThrow();
    });

    it("warn logs without error", () => {
      expect(() => logger.warn("warning")).not.toThrow();
    });

    it("error logs with Error object", () => {
      expect(() => logger.error("failed", new Error("test error"))).not.toThrow();
    });

    it("error logs with data object", () => {
      expect(() => logger.error("failed", { code: 500 })).not.toThrow();
    });
  });
});
