// ============================================================================
// Playwright Code Export — Generate standard .spec.ts from test execution results
// ============================================================================

import type { ExecutionResult, StepResult } from "../orchestrator/executor.js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

/** Options for code generation */
export interface PlaywrightExportOptions {
  /** Test name (used in describe/it blocks) */
  testName?: string;
  /** Output file path */
  outputPath?: string;
  /** Whether to include assertions from assert tool calls */
  includeAssertions?: boolean;
  /** Whether to include comments explaining each step */
  includeComments?: boolean;
  /** Base URL to use in the test config */
  baseURL?: string;
}

/**
 * Generate a standard Playwright test file from an ExecutionResult.
 *
 * The generated file is vendor-lock-free — it uses only Playwright APIs
 * and can be run with `npx playwright test` without Inspect.
 */
export function generatePlaywrightTest(
  result: ExecutionResult,
  instruction: string,
  url: string,
  options: PlaywrightExportOptions = {},
): string {
  const testName = options.testName ?? sanitizeTestName(instruction);
  const includeAssertions = options.includeAssertions ?? true;
  const includeComments = options.includeComments ?? true;

  const lines: string[] = [];

  // Imports
  lines.push(`import { test, expect } from "@playwright/test";`);
  lines.push("");

  // Test block
  lines.push(`test.describe("${escapeString(testName)}", () => {`);
  lines.push(`  test("${escapeString(instruction.slice(0, 80))}", async ({ page }) => {`);

  // Navigate
  if (url) {
    lines.push(`    await page.goto("${escapeString(url)}");`);
    lines.push(`    await page.waitForLoadState("domcontentloaded");`);
    lines.push("");
  }

  // Convert each step's tool calls to Playwright code
  for (const step of result.steps) {
    if (includeComments && step.description) {
      lines.push(`    // ${step.description.slice(0, 100)}`);
    }

    for (const call of step.toolCalls) {
      const code = toolCallToPlaywright(call);
      if (code) {
        lines.push(`    ${code}`);
      }
    }

    // Add assertion if the step had one
    if (includeAssertions && step.assertion) {
      lines.push(`    // Assertion: ${step.assertion}`);
    }

    if (step.toolCalls.length > 0) {
      lines.push("");
    }
  }

  lines.push(`  });`);
  lines.push(`});`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Write the generated Playwright test to a file.
 */
export function exportPlaywrightTest(
  result: ExecutionResult,
  instruction: string,
  url: string,
  options: PlaywrightExportOptions = {},
): string {
  const code = generatePlaywrightTest(result, instruction, url, options);

  const outputPath = options.outputPath
    ?? join(process.cwd(), ".inspect", "exports", `${sanitizeFilename(instruction)}.spec.ts`);

  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, code, "utf-8");
  return outputPath;
}

// ── Tool call → Playwright code ─────────────────────────────────────────

interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  duration: number;
}

function toolCallToPlaywright(call: ToolCall): string | null {
  const args = call.args;

  switch (call.tool) {
    case "navigate": {
      const url = args.url as string;
      return `await page.goto("${escapeString(url)}");`;
    }

    case "click": {
      const ref = args.ref as string;
      // Use getByRole or locator based on available info
      return `await page.locator("[data-ref='${escapeString(ref)}']").or(page.getByRole("button")).first().click();`
        + ` // ref: ${ref}`;
    }

    case "type": {
      const ref = args.ref as string;
      const text = args.text as string;
      const clear = args.clear !== false;
      const pressEnter = args.pressEnter === true;
      const lines: string[] = [];

      if (clear) {
        lines.push(`await page.locator("[data-ref='${escapeString(ref)}']").or(page.locator("input, textarea").nth(0)).fill("");`);
      }
      lines.push(`await page.locator("[data-ref='${escapeString(ref)}']").or(page.locator("input, textarea").nth(0)).fill("${escapeString(text)}"); // ref: ${ref}`);
      if (pressEnter) {
        lines.push(`await page.keyboard.press("Enter");`);
      }
      return lines.join("\n    ");
    }

    case "screenshot": {
      const fullPage = args.fullPage === true;
      const name = (args.name as string) ?? "screenshot";
      return `await page.screenshot({ path: "${escapeString(name)}.png", fullPage: ${fullPage} });`;
    }

    case "scroll": {
      const direction = args.direction as string;
      const amount = (args.amount as number) ?? 500;
      const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0;
      const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0;
      return `await page.mouse.wheel(${deltaX}, ${deltaY});`;
    }

    case "select": {
      const ref = args.ref as string;
      const value = args.value as string;
      return `await page.locator("[data-ref='${escapeString(ref)}']").or(page.locator("select").nth(0)).selectOption("${escapeString(value)}"); // ref: ${ref}`;
    }

    case "hover": {
      const ref = args.ref as string;
      return `await page.locator("[data-ref='${escapeString(ref)}']").first().hover(); // ref: ${ref}`;
    }

    case "keypress": {
      const key = args.key as string;
      return `await page.keyboard.press("${escapeString(key)}");`;
    }

    case "wait": {
      const ms = (args.milliseconds as number) ?? 1000;
      return `await page.waitForTimeout(${ms});`;
    }

    case "assert": {
      const condition = args.condition as string;
      const passed = args.passed as boolean;
      if (passed) {
        return `// PASSED: ${escapeString(condition)}`;
      }
      return `// FAILED: ${escapeString(condition)}`;
    }

    case "done":
      return null; // Skip the done signal

    case "snapshot":
      return null; // Skip snapshot refresh

    default:
      return `// Unknown tool: ${call.tool}`;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function sanitizeTestName(instruction: string): string {
  return instruction.slice(0, 60).replace(/[^a-zA-Z0-9 ]/g, "").trim() || "AI-generated test";
}

function sanitizeFilename(instruction: string): string {
  return instruction
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "test";
}
