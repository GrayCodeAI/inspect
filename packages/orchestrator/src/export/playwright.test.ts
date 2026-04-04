import { describe, it, expect } from "vitest";
import { generatePlaywrightTest } from "./playwright.js";
import type { ExecutionResult } from "../orchestrator/executor.js";

function makeResult(steps: ExecutionResult["steps"]): ExecutionResult {
  return {
    status: "pass",
    steps,
    totalDuration: 5000,
    tokenCount: 1000,
    agent: "claude",
    device: "Desktop Chrome",
    timestamp: new Date().toISOString(),
  };
}

describe("generatePlaywrightTest", () => {
  it("generates valid Playwright test structure", () => {
    const result = makeResult([]);
    const code = generatePlaywrightTest(result, "test login", "https://example.com");

    expect(code).toContain('import { test, expect } from "@playwright/test"');
    expect(code).toContain("test.describe(");
    expect(code).toContain("async ({ page })");
    expect(code).toContain('await page.goto("https://example.com")');
  });

  it("converts navigate tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Navigate",
        status: "pass",
        duration: 100,
        toolCalls: [{ tool: "navigate", args: { url: "https://app.com/login" }, duration: 100 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain('page.goto("https://app.com/login")');
  });

  it("converts click tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Click button",
        status: "pass",
        duration: 100,
        toolCalls: [{ tool: "click", args: { ref: "e5" }, duration: 50 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain("click()");
    expect(code).toContain("e5");
  });

  it("converts type tool calls with clear and enter", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Type email",
        status: "pass",
        duration: 200,
        toolCalls: [
          {
            tool: "type",
            args: { ref: "e3", text: "user@test.com", clear: true, pressEnter: true },
            duration: 150,
          },
        ],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain('fill("")');
    expect(code).toContain('fill("user@test.com")');
    expect(code).toContain('keyboard.press("Enter")');
  });

  it("converts scroll tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Scroll",
        status: "pass",
        duration: 50,
        toolCalls: [{ tool: "scroll", args: { direction: "down", amount: 300 }, duration: 50 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain("mouse.wheel(0, 300)");
  });

  it("converts keypress tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Press Enter",
        status: "pass",
        duration: 50,
        toolCalls: [{ tool: "keypress", args: { key: "Escape" }, duration: 50 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain('keyboard.press("Escape")');
  });

  it("converts screenshot tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Screenshot",
        status: "pass",
        duration: 100,
        toolCalls: [{ tool: "screenshot", args: { fullPage: true, name: "final" }, duration: 100 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain("screenshot");
    expect(code).toContain("fullPage: true");
  });

  it("skips done and snapshot tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Done",
        status: "pass",
        duration: 10,
        toolCalls: [
          { tool: "snapshot", args: {}, duration: 10 },
          { tool: "done", args: { passed: true, summary: "all good" }, duration: 10 },
        ],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).not.toContain("snapshot");
    expect(code).not.toContain("done");
  });

  it("includes comments when enabled", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Fill in the login form",
        status: "pass",
        duration: 100,
        toolCalls: [{ tool: "click", args: { ref: "e1" }, duration: 50 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com", {
      includeComments: true,
    });
    expect(code).toContain("// Fill in the login form");
  });

  it("handles multiple steps with multiple tool calls", () => {
    const result = makeResult([
      {
        index: 0,
        description: "Navigate to login",
        status: "pass",
        duration: 1000,
        toolCalls: [{ tool: "navigate", args: { url: "https://app.com/login" }, duration: 500 }],
      },
      {
        index: 1,
        description: "Fill form",
        status: "pass",
        duration: 500,
        toolCalls: [
          { tool: "type", args: { ref: "e2", text: "admin" }, duration: 100 },
          { tool: "type", args: { ref: "e3", text: "pass123" }, duration: 100 },
          { tool: "click", args: { ref: "e5" }, duration: 200 },
        ],
      },
    ]);

    const code = generatePlaywrightTest(result, "login test", "https://app.com");
    expect(code).toContain('goto("https://app.com/login")');
    expect(code).toContain('fill("admin")');
    expect(code).toContain('fill("pass123")');
    expect(code).toContain("click()");
  });

  it("escapes special characters in strings", () => {
    const result = makeResult([
      {
        index: 0,
        description: 'Type with "quotes" and \\backslash',
        status: "pass",
        duration: 100,
        toolCalls: [{ tool: "type", args: { ref: "e1", text: 'hello "world"' }, duration: 50 }],
      },
    ]);

    const code = generatePlaywrightTest(result, "test", "https://app.com");
    expect(code).toContain('\\"world\\"');
    // Verify the double quotes are properly escaped, not raw
    expect(code).toContain('hello \\"world\\"');
  });
});
