import { describe, it, expect } from "vitest";
import {
  FPS_MONITOR_SCRIPT,
  FPS_MONITOR_STOP_SCRIPT,
  ERROR_MONITOR_SCRIPT,
  ERROR_MONITOR_RESULTS_SCRIPT,
  ALERT_MONITOR_SCRIPT,
  ALERT_MONITOR_RESULTS_SCRIPT,
} from "./monitors.js";
import type { FPSMonitorResult, ErrorMonitorResult, AlertMonitorResult } from "./monitors.js";

describe("Chaos Monitor Scripts", () => {
  describe("FPS_MONITOR_SCRIPT", () => {
    it("is a non-empty string containing an IIFE", () => {
      expect(typeof FPS_MONITOR_SCRIPT).toBe("string");
      expect(FPS_MONITOR_SCRIPT.length).toBeGreaterThan(0);
      expect(FPS_MONITOR_SCRIPT).toContain("(function()");
    });

    it("guards against double-initialization", () => {
      expect(FPS_MONITOR_SCRIPT).toContain("__inspectFPSMonitor");
      expect(FPS_MONITOR_SCRIPT).toContain("if (window.__inspectFPSMonitor) return");
    });

    it("uses requestAnimationFrame for measurement", () => {
      expect(FPS_MONITOR_SCRIPT).toContain("requestAnimationFrame");
    });

    it("tracks FPS drops below 30", () => {
      expect(FPS_MONITOR_SCRIPT).toContain("fps < 30");
      expect(FPS_MONITOR_SCRIPT).toContain("drops");
    });

    it("limits history to 300 entries", () => {
      expect(FPS_MONITOR_SCRIPT).toContain("300");
      expect(FPS_MONITOR_SCRIPT).toContain("history.shift()");
    });
  });

  describe("FPS_MONITOR_STOP_SCRIPT", () => {
    it("is a non-empty string", () => {
      expect(typeof FPS_MONITOR_STOP_SCRIPT).toBe("string");
      expect(FPS_MONITOR_STOP_SCRIPT.length).toBeGreaterThan(0);
    });

    it("sets running to false to stop measurement", () => {
      expect(FPS_MONITOR_STOP_SCRIPT).toContain("running = false");
    });

    it("returns drops, history, and currentFps", () => {
      expect(FPS_MONITOR_STOP_SCRIPT).toContain("drops");
      expect(FPS_MONITOR_STOP_SCRIPT).toContain("history");
      expect(FPS_MONITOR_STOP_SCRIPT).toContain("currentFps");
    });

    it("handles missing monitor gracefully", () => {
      expect(FPS_MONITOR_STOP_SCRIPT).toContain("if (!window.__inspectFPSMonitor)");
    });
  });

  describe("ERROR_MONITOR_SCRIPT", () => {
    it("is a non-empty IIFE string", () => {
      expect(typeof ERROR_MONITOR_SCRIPT).toBe("string");
      expect(ERROR_MONITOR_SCRIPT).toContain("(function()");
    });

    it("guards against double-initialization", () => {
      expect(ERROR_MONITOR_SCRIPT).toContain("if (window.__inspectErrorMonitor) return");
    });

    it("overrides console.error", () => {
      expect(ERROR_MONITOR_SCRIPT).toContain("console.error");
      expect(ERROR_MONITOR_SCRIPT).toContain("origError");
    });

    it("registers a window error handler", () => {
      expect(ERROR_MONITOR_SCRIPT).toContain("addEventListener('error'");
    });

    it("registers an unhandled rejection handler", () => {
      expect(ERROR_MONITOR_SCRIPT).toContain("unhandledrejection");
      expect(ERROR_MONITOR_SCRIPT).toContain("unhandledRejections");
    });

    it("captures error details including stack and location", () => {
      expect(ERROR_MONITOR_SCRIPT).toContain("event.error");
      expect(ERROR_MONITOR_SCRIPT).toContain("stack");
      expect(ERROR_MONITOR_SCRIPT).toContain("filename");
      expect(ERROR_MONITOR_SCRIPT).toContain("lineno");
      expect(ERROR_MONITOR_SCRIPT).toContain("colno");
    });
  });

  describe("ERROR_MONITOR_RESULTS_SCRIPT", () => {
    it("returns all error categories", () => {
      expect(ERROR_MONITOR_RESULTS_SCRIPT).toContain("errors");
      expect(ERROR_MONITOR_RESULTS_SCRIPT).toContain("consoleErrors");
      expect(ERROR_MONITOR_RESULTS_SCRIPT).toContain("unhandledRejections");
      expect(ERROR_MONITOR_RESULTS_SCRIPT).toContain("pageCrashed");
    });

    it("returns empty defaults when monitor is not present", () => {
      expect(ERROR_MONITOR_RESULTS_SCRIPT).toContain("if (!window.__inspectErrorMonitor)");
    });
  });

  describe("ALERT_MONITOR_SCRIPT", () => {
    it("is a non-empty IIFE string", () => {
      expect(typeof ALERT_MONITOR_SCRIPT).toBe("string");
      expect(ALERT_MONITOR_SCRIPT).toContain("(function()");
    });

    it("guards against double-initialization", () => {
      expect(ALERT_MONITOR_SCRIPT).toContain("if (window.__inspectAlertMonitor) return");
    });

    it("overrides window.alert", () => {
      expect(ALERT_MONITOR_SCRIPT).toContain("window.alert = function");
      expect(ALERT_MONITOR_SCRIPT).toContain("origAlert");
    });

    it("overrides window.confirm with random response", () => {
      expect(ALERT_MONITOR_SCRIPT).toContain("window.confirm = function");
      expect(ALERT_MONITOR_SCRIPT).toContain("Math.random()");
    });

    it("overrides window.prompt", () => {
      expect(ALERT_MONITOR_SCRIPT).toContain("window.prompt = function");
      expect(ALERT_MONITOR_SCRIPT).toContain("gremlin_input");
    });

    it("tracks timestamps for all intercepted dialogs", () => {
      // All three monitor arrays should record timestamps
      expect(ALERT_MONITOR_SCRIPT).toContain("timestamp: Date.now()");
    });
  });

  describe("ALERT_MONITOR_RESULTS_SCRIPT", () => {
    it("returns alerts, confirms, and prompts", () => {
      expect(ALERT_MONITOR_RESULTS_SCRIPT).toContain("alerts");
      expect(ALERT_MONITOR_RESULTS_SCRIPT).toContain("confirms");
      expect(ALERT_MONITOR_RESULTS_SCRIPT).toContain("prompts");
    });

    it("handles missing monitor gracefully", () => {
      expect(ALERT_MONITOR_RESULTS_SCRIPT).toContain("if (!window.__inspectAlertMonitor)");
    });
  });

  describe("type interfaces", () => {
    it("FPSMonitorResult shape is correct", () => {
      const result: FPSMonitorResult = {
        drops: [{ fps: 15, timestamp: 1000, duration: 1100 }],
        history: [{ fps: 60, timestamp: 900 }],
        currentFps: 58,
      };
      expect(result.drops).toHaveLength(1);
      expect(result.drops[0].fps).toBe(15);
      expect(result.history[0].fps).toBe(60);
      expect(result.currentFps).toBe(58);
    });

    it("ErrorMonitorResult shape is correct", () => {
      const result: ErrorMonitorResult = {
        errors: [
          {
            message: "TypeError",
            stack: "at foo:1",
            timestamp: 100,
            filename: "app.js",
            lineno: 5,
            colno: 10,
          },
        ],
        consoleErrors: ["something broke"],
        unhandledRejections: ["promise failed"],
        pageCrashed: false,
      };
      expect(result.errors).toHaveLength(1);
      expect(result.consoleErrors).toHaveLength(1);
      expect(result.pageCrashed).toBe(false);
    });

    it("AlertMonitorResult shape is correct", () => {
      const result: AlertMonitorResult = {
        alerts: [{ message: "Hello!", timestamp: 100 }],
        confirms: [{ message: "Are you sure?", timestamp: 200 }],
        prompts: [{ message: "Enter name:", defaultValue: "John", timestamp: 300 }],
      };
      expect(result.alerts).toHaveLength(1);
      expect(result.confirms).toHaveLength(1);
      expect(result.prompts[0].defaultValue).toBe("John");
    });
  });
});
