import { describe, it, expect } from "vitest";
import {
  BrowserManager,
  ScreenshotCapture,
  SessionRecorder,
  BROWSER_TOOLS,
} from "@inspect/browser";

// Test basic exports from browser package
describe("@inspect/browser", () => {
  it("should export browser-related classes", () => {
    expect(BrowserManager).toBeDefined();
  });

  it("should export vision-related classes", () => {
    expect(ScreenshotCapture).toBeDefined();
  });

  it("should export session recording classes", () => {
    expect(SessionRecorder).toBeDefined();
  });

  it("should export MCP tools", () => {
    expect(BROWSER_TOOLS).toBeDefined();
    expect(Array.isArray(BROWSER_TOOLS)).toBe(true);
  });
});
