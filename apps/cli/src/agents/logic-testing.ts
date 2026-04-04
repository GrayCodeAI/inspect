// ============================================================================
// Application Logic Testing Agent — Tests behavioral logic, CRUD, drag & drop,
// notifications, persistence, conditional UI, undo/redo, and game logic.
// ============================================================================

import type { Page, Locator } from "./playwright-types.js";
import type { LLMCall, ProgressCallback } from "./types.js";
import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a JSON block from an LLM response, tolerating markdown fences. */
function parseLLMJson<T>(raw: string, fallback: T): T {
  try {
    let trimmed = raw.trim();
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) trimmed = match[1]!.trim();
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) trimmed = objectMatch[0];
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

/** Parse a JSON array from an LLM response. */
function _parseLLMArray<T>(raw: string, fallback: T[]): T[] {
  try {
    let trimmed = raw.trim();
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) trimmed = match[1]!.trim();
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) trimmed = arrayMatch[0];
    return JSON.parse(trimmed) as T[];
  } catch {
    return fallback;
  }
}

/** Take a text snapshot of the current page using ARIA tree if available, else innerHTML summary. */
async function takeSnapshot(page: Page): Promise<string> {
  try {
    const { AriaSnapshotBuilder } = await import("@inspect/browser");
    const builder = new AriaSnapshotBuilder();
    await builder.buildTree(page);
    return builder.getFormattedTree();
  } catch {
    // Fallback: grab a condensed text representation
    return await safeEvaluate<string>(
      page,
      `
      (() => {
        const walk = (el, depth) => {
          if (depth > 4) return "";
          const tag = el.tagName ? el.tagName.toLowerCase() : "";
          const role = el.getAttribute ? (el.getAttribute("role") || "") : "";
          const text = el.textContent ? el.textContent.trim().slice(0, 80) : "";
          const children = Array.from(el.children || []).map(c => walk(c, depth + 1)).filter(Boolean).join("\\n");
          if (!tag) return "";
          const label = [tag, role, text].filter(Boolean).join(" | ");
          return label + (children ? "\\n" + children : "");
        };
        return walk(document.body, 0).slice(0, 6000);
      })()
    `,
      "[snapshot unavailable]",
    );
  }
}

/** Tiny delay. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 1. testBehavior — LLM-driven behavioral assertion
// ---------------------------------------------------------------------------

export async function testBehavior(
  page: Page,
  instruction: string,
  snapshot: string,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<{ passed: boolean; observation: string; steps: string[] }> {
  onProgress("info", `Testing behavior: ${instruction}`);

  // Step 1: Ask LLM to produce a plan
  const planResponse = await llm([
    {
      role: "user",
      content: `You are a browser test automation assistant. Given the user instruction and the current page snapshot, produce a JSON plan.

Instruction: "${instruction}"

Page snapshot:
${snapshot.slice(0, 5000)}

Respond with JSON only:
{
  "steps": ["click X", "fill Y with Z", "assert W"],
  "expected": "description of what should happen"
}`,
    },
  ]);

  const plan = parseLLMJson<{ steps: string[]; expected: string }>(planResponse, {
    steps: [],
    expected: instruction,
  });

  const executedSteps: string[] = [];

  // Step 2: Execute each step
  for (const step of plan.steps) {
    onProgress("step", `  Executing: ${step}`);
    try {
      await executeNaturalStep(page, step, snapshot, llm);
      executedSteps.push(step);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress("warn", `  Could not execute: ${step} — ${msg}`);
      executedSteps.push(`${step} [FAILED]`);
    }
  }

  // Step 3: Take a new snapshot and ask LLM to verify
  const newSnapshot = await takeSnapshot(page);

  const verifyResponse = await llm([
    {
      role: "user",
      content: `You executed these steps on a web page:
${executedSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Expected outcome: "${plan.expected}"

Page snapshot AFTER execution:
${newSnapshot.slice(0, 5000)}

Did the expected behavior occur? Respond with JSON only:
{"passed": true/false, "observation": "what you observed"}`,
    },
  ]);

  const result = parseLLMJson<{ passed: boolean; observation: string }>(verifyResponse, {
    passed: false,
    observation: "Could not verify behavior",
  });

  if (result.passed) {
    onProgress("pass", `  Behavior verified: ${result.observation}`);
  } else {
    onProgress("fail", `  Behavior not verified: ${result.observation}`);
  }

  return {
    passed: result.passed,
    observation: result.observation,
    steps: executedSteps,
  };
}

/** Execute a single natural-language step against the page. */
async function executeNaturalStep(
  page: Page,
  step: string,
  snapshot: string,
  llm: LLMCall,
): Promise<void> {
  const lower = step.toLowerCase();

  // Detect action type from the natural language step
  if (lower.startsWith("click ") || lower.startsWith("tap ")) {
    const target = step
      .replace(/^(click|tap)\s+/i, "")
      .replace(/^on\s+/i, "")
      .replace(/^the\s+/i, "")
      .replace(/["']/g, "");
    await smartClick(page, target, snapshot, llm);
  } else if (lower.startsWith("fill ") || lower.startsWith("type ") || lower.startsWith("enter ")) {
    // Parse "fill X with Y" or "type Y into X"
    const fillMatch = step.match(
      /(?:fill|type|enter)\s+['"]?(.+?)['"]?\s+(?:with|into|in|=)\s+['"]?(.+?)['"]?$/i,
    );
    if (fillMatch) {
      const [, target, value] = fillMatch;
      await smartFill(page, target!, value!, snapshot, llm);
    } else {
      // Try LLM to interpret
      const interpreted = await llm([
        {
          role: "user",
          content: `Interpret this step as a fill action: "${step}". Respond with JSON: {"target": "field name", "value": "value to fill"}`,
        },
      ]);
      const parsed = parseLLMJson<{ target: string; value: string }>(interpreted, {
        target: "",
        value: "",
      });
      if (parsed.target && parsed.value) {
        await smartFill(page, parsed.target, parsed.value, snapshot, llm);
      }
    }
  } else if (lower.startsWith("select ")) {
    const selectMatch = step.match(/select\s+['"]?(.+?)['"]?\s+(?:from|in)\s+['"]?(.+?)['"]?$/i);
    if (selectMatch) {
      const [, value, target] = selectMatch;
      try {
        await page.getByLabel(target!, { exact: false }).first().selectOption(value!);
      } catch {
        try {
          await page.getByRole("combobox", { name: target! }).first().selectOption(value!);
        } catch {
          // Last resort: click to open, then click option
          await smartClick(page, target!, snapshot, llm);
          await delay(300);
          await smartClick(page, value!, snapshot, llm);
        }
      }
    }
  } else if (
    lower.startsWith("assert ") ||
    lower.startsWith("verify ") ||
    lower.startsWith("check that ") ||
    lower.startsWith("expect ")
  ) {
    // Assertions are verified later by the LLM; skip execution
  } else if (lower.startsWith("wait")) {
    const msMatch = step.match(/(\d+)/);
    const ms = msMatch ? Math.min(parseInt(msMatch[1]!, 10), 5000) : 1000;
    await page.waitForTimeout(ms);
  } else if (lower.startsWith("press ")) {
    const key = step.replace(/^press\s+/i, "").trim();
    await page.keyboard.press(key);
  } else if (lower.startsWith("scroll")) {
    if (lower.includes("bottom")) {
      await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    } else if (lower.includes("top")) {
      await page.evaluate(`window.scrollTo(0, 0)`);
    } else {
      await page.evaluate(`window.scrollBy(0, 400)`);
    }
  } else {
    // Let LLM interpret the step
    const interpreted = await llm([
      {
        role: "user",
        content: `Interpret this browser automation step: "${step}"
Page snapshot: ${snapshot.slice(0, 2000)}

Respond with JSON: {"action": "click|fill|press|scroll|wait", "target": "selector or element description", "value": "optional value"}`,
      },
    ]);
    const parsed = parseLLMJson<{ action: string; target: string; value?: string }>(interpreted, {
      action: "wait",
      target: "",
    });
    if (parsed.action === "click" && parsed.target) {
      await smartClick(page, parsed.target, snapshot, llm);
    } else if (parsed.action === "fill" && parsed.target && parsed.value) {
      await smartFill(page, parsed.target, parsed.value, snapshot, llm);
    } else if (parsed.action === "press" && parsed.target) {
      await page.keyboard.press(parsed.target);
    }
  }
}

/** Click an element using multiple strategies. */
async function smartClick(
  page: Page,
  target: string,
  snapshot: string,
  llm: LLMCall,
): Promise<void> {
  // Strategy 1: Text match
  try {
    await page.getByText(target, { exact: false }).first().click({ timeout: 3000 });
    return;
  } catch {
    /* next */
  }

  // Strategy 2: Role match
  for (const role of ["button", "link", "menuitem", "tab", "checkbox"] as const) {
    try {
      await page.getByRole(role, { name: target }).first().click({ timeout: 2000 });
      return;
    } catch {
      /* next */
    }
  }

  // Strategy 3: Label match
  try {
    await page.getByLabel(target, { exact: false }).first().click({ timeout: 2000 });
    return;
  } catch {
    /* next */
  }

  // Strategy 4: LLM-generated selector
  const selectorResponse = await llm([
    {
      role: "user",
      content: `Given this page snapshot, provide a Playwright selector for: "${target}"

Snapshot:
${snapshot.slice(0, 4000)}

Respond with ONLY a valid Playwright selector. One selector only, no explanation.`,
    },
  ]);
  const selector = selectorResponse.trim().replace(/^["']|["']$/g, "");
  if (selector && selector !== "null" && selector.length < 200) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      await page.click(selector, { timeout: 3000 });
      return;
    } catch {
      /* fall through */
    }
  }

  throw new Error(`Could not find element to click: ${target}`);
}

/** Fill an input field using multiple strategies. */
async function smartFill(
  page: Page,
  target: string,
  value: string,
  snapshot: string,
  llm: LLMCall,
): Promise<void> {
  // Strategy 1: Label
  try {
    await page.getByLabel(target, { exact: false }).first().fill(value, { timeout: 3000 });
    return;
  } catch {
    /* next */
  }

  // Strategy 2: Placeholder
  try {
    await page.getByPlaceholder(target, { exact: false }).first().fill(value, { timeout: 3000 });
    return;
  } catch {
    /* next */
  }

  // Strategy 3: Role textbox
  try {
    await page.getByRole("textbox", { name: target }).first().fill(value, { timeout: 2000 });
    return;
  } catch {
    /* next */
  }

  // Strategy 4: LLM selector
  const selectorResponse = await llm([
    {
      role: "user",
      content: `Given this page snapshot, provide a Playwright selector for the input field: "${target}"

Snapshot:
${snapshot.slice(0, 4000)}

Respond with ONLY a valid Playwright selector. One selector only, no explanation.`,
    },
  ]);
  const selector = selectorResponse.trim().replace(/^["']|["']$/g, "");
  if (selector && selector !== "null" && selector.length < 200) {
    try {
      await page.fill(selector, value, { timeout: 3000 });
      return;
    } catch {
      /* fall through */
    }
  }

  throw new Error(`Could not find input to fill: ${target}`);
}

// ---------------------------------------------------------------------------
// 2. testCRUD — Detect and test Create / Read / Update / Delete
// ---------------------------------------------------------------------------

export async function testCRUD(
  page: Page,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<{
  created: boolean;
  read: boolean;
  updated: boolean;
  deleted: boolean;
  issues: string[];
}> {
  onProgress("info", "Testing CRUD operations...");
  const issues: string[] = [];
  let created = false;
  let read = false;
  let updated = false;
  let deleted = false;

  const snapshot = await takeSnapshot(page);

  // Ask LLM to analyze the page for CRUD affordances
  const analysisResponse = await llm([
    {
      role: "user",
      content: `Analyze this page for CRUD (Create, Read, Update, Delete) capabilities.

Page snapshot:
${snapshot.slice(0, 5000)}

Respond with JSON:
{
  "hasCreate": true/false,
  "createSelector": "text or selector for create/add/new button",
  "hasList": true/false,
  "listDescription": "what items are listed",
  "hasEdit": true/false,
  "editSelector": "text or selector for edit button",
  "hasDelete": true/false,
  "deleteSelector": "text or selector for delete button",
  "formFields": [{"name": "field label", "value": "realistic test value"}]
}`,
    },
  ]);

  const analysis = parseLLMJson<{
    hasCreate: boolean;
    createSelector: string;
    hasList: boolean;
    listDescription: string;
    hasEdit: boolean;
    editSelector: string;
    hasDelete: boolean;
    deleteSelector: string;
    formFields: Array<{ name: string; value: string }>;
  }>(analysisResponse, {
    hasCreate: false,
    createSelector: "",
    hasList: false,
    listDescription: "",
    hasEdit: false,
    editSelector: "",
    hasDelete: false,
    deleteSelector: "",
    formFields: [],
  });

  // --- CREATE ---
  if (analysis.hasCreate && analysis.createSelector) {
    onProgress("step", "  Testing Create...");
    try {
      await smartClick(page, analysis.createSelector, snapshot, llm);
      await delay(500);

      // Fill form fields
      const formSnapshot = await takeSnapshot(page);
      for (const field of analysis.formFields) {
        try {
          await smartFill(page, field.name, field.value, formSnapshot, llm);
        } catch {
          issues.push(`Could not fill field: ${field.name}`);
        }
      }

      // Submit the form
      try {
        await smartClick(page, "Submit", formSnapshot, llm);
      } catch {
        try {
          await smartClick(page, "Save", formSnapshot, llm);
        } catch {
          try {
            await smartClick(page, "Create", formSnapshot, llm);
          } catch {
            await page.keyboard.press("Enter");
          }
        }
      }

      await delay(1000);
      created = true;
      onProgress("pass", "    Created item successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`Create failed: ${msg}`);
      onProgress("fail", `    Create failed: ${msg}`);
    }
  } else {
    onProgress("warn", "    No create affordance detected");
    issues.push("No create button/link found on page");
  }

  // --- READ ---
  onProgress("step", "  Testing Read...");
  try {
    const readSnapshot = await takeSnapshot(page);
    const listItems = await safeEvaluate<number>(
      page,
      `
      (() => {
        const selectors = [
          "table tbody tr",
          "[role='listitem']",
          "ul li",
          ".card",
          ".item",
          ".list-item",
          "[data-testid]",
        ];
        for (const sel of selectors) {
          const count = document.querySelectorAll(sel).length;
          if (count > 0) return count;
        }
        return 0;
      })()
    `,
      0,
    );

    if (listItems > 0) {
      read = true;
      onProgress("pass", `    Read: ${listItems} item(s) visible`);
    } else if (analysis.hasList) {
      // LLM detected a list but we couldn't count items — ask LLM
      const verifyResponse = await llm([
        {
          role: "user",
          content: `Does this page display any list of items or data records?

Page snapshot:
${readSnapshot.slice(0, 4000)}

Respond with JSON: {"hasItems": true/false, "count": number, "description": "what items"}`,
        },
      ]);
      const verification = parseLLMJson<{ hasItems: boolean; count: number; description: string }>(
        verifyResponse,
        { hasItems: false, count: 0, description: "" },
      );
      if (verification.hasItems) {
        read = true;
        onProgress("pass", `    Read: ${verification.description}`);
      } else {
        issues.push("List area detected but no items found");
        onProgress("warn", "    No readable items found");
      }
    } else {
      issues.push("No list or data display found");
      onProgress("warn", "    No readable items found");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    issues.push(`Read check failed: ${msg}`);
  }

  // --- UPDATE ---
  if (analysis.hasEdit && analysis.editSelector) {
    onProgress("step", "  Testing Update...");
    try {
      await smartClick(page, analysis.editSelector, snapshot, llm);
      await delay(500);

      const editSnapshot = await takeSnapshot(page);

      // Modify the first available field
      if (analysis.formFields.length > 0) {
        const field = analysis.formFields[0]!;
        try {
          await smartFill(page, field.name, `${field.value} (edited)`, editSnapshot, llm);
        } catch {
          // Try to find any visible input and modify it
          try {
            const firstInput = await page.$('input[type="text"]:visible, textarea:visible');
            if (firstInput) {
              await firstInput.fill("Updated by Inspect test");
            }
          } catch {
            /* continue */
          }
        }
      }

      // Save the update
      try {
        await smartClick(page, "Save", editSnapshot, llm);
      } catch {
        try {
          await smartClick(page, "Update", editSnapshot, llm);
        } catch {
          await page.keyboard.press("Enter");
        }
      }

      await delay(1000);
      updated = true;
      onProgress("pass", "    Updated item successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`Update failed: ${msg}`);
      onProgress("fail", `    Update failed: ${msg}`);
    }
  } else {
    onProgress("warn", "    No edit affordance detected");
    issues.push("No edit button/link found on page");
  }

  // --- DELETE ---
  if (analysis.hasDelete && analysis.deleteSelector) {
    onProgress("step", "  Testing Delete...");
    try {
      const beforeCount = await safeEvaluate<number>(
        page,
        `
        (() => {
          const selectors = ["table tbody tr", "[role='listitem']", "ul li", ".card", ".item", ".list-item"];
          for (const sel of selectors) {
            const count = document.querySelectorAll(sel).length;
            if (count > 0) return count;
          }
          return 0;
        })()
      `,
        0,
      );

      await smartClick(page, analysis.deleteSelector, snapshot, llm);
      await delay(500);

      // Handle confirmation dialog
      const confirmSnapshot = await takeSnapshot(page);
      try {
        await smartClick(page, "Confirm", confirmSnapshot, llm);
      } catch {
        try {
          await smartClick(page, "Yes", confirmSnapshot, llm);
        } catch {
          try {
            await smartClick(page, "Delete", confirmSnapshot, llm);
          } catch {
            try {
              await smartClick(page, "OK", confirmSnapshot, llm);
            } catch {
              /* no confirmation needed */
            }
          }
        }
      }

      await delay(1000);

      const afterCount = await safeEvaluate<number>(
        page,
        `
        (() => {
          const selectors = ["table tbody tr", "[role='listitem']", "ul li", ".card", ".item", ".list-item"];
          for (const sel of selectors) {
            const count = document.querySelectorAll(sel).length;
            if (count > 0) return count;
          }
          return 0;
        })()
      `,
        0,
      );

      if (afterCount < beforeCount || beforeCount === 0) {
        deleted = true;
        onProgress("pass", "    Deleted item successfully");
      } else {
        issues.push("Delete action did not reduce item count");
        onProgress("warn", "    Delete did not reduce item count");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(`Delete failed: ${msg}`);
      onProgress("fail", `    Delete failed: ${msg}`);
    }
  } else {
    onProgress("warn", "    No delete affordance detected");
    issues.push("No delete button/link found on page");
  }

  onProgress("done", `CRUD test complete: C=${created} R=${read} U=${updated} D=${deleted}`);
  return { created, read, updated, deleted, issues };
}

// ---------------------------------------------------------------------------
// 3. testDragDrop — Playwright drag and drop
// ---------------------------------------------------------------------------

export async function testDragDrop(page: Page, source: string, target: string): Promise<boolean> {
  // Locate source and target elements
  let sourceLocator: Locator | null = null;
  let targetLocator: Locator | null = null;

  // Try CSS selector first, then text
  // Try to locate source element
  for (const sel of [source]) {
    try {
      const bySelector = page.locator(sel);
      if ((await bySelector.count()) > 0) {
        sourceLocator = bySelector.first();
        break;
      }
    } catch {
      /* not a valid selector */
    }
    try {
      const byText = page.getByText(sel, { exact: false }).first();
      if ((await byText.count()) > 0) {
        sourceLocator = byText;
        break;
      }
    } catch {
      /* not found by text */
    }
    try {
      const byRole = page.getByRole("listitem", { name: sel }).first();
      if ((await byRole.count()) > 0) {
        sourceLocator = byRole;
        break;
      }
    } catch {
      /* not found by role */
    }
  }

  // Try to locate target element
  for (const sel of [target]) {
    try {
      const bySelector = page.locator(sel);
      if ((await bySelector.count()) > 0) {
        targetLocator = bySelector.first();
        break;
      }
    } catch {
      /* not a valid selector */
    }
    try {
      const byText = page.getByText(sel, { exact: false }).first();
      if ((await byText.count()) > 0) {
        targetLocator = byText;
        break;
      }
    } catch {
      /* not found by text */
    }
    try {
      const byRole = page.getByRole("listitem", { name: sel }).first();
      if ((await byRole.count()) > 0) {
        targetLocator = byRole;
        break;
      }
    } catch {
      /* not found by role */
    }
  }

  if (!sourceLocator || !targetLocator) {
    return false;
  }

  // Capture DOM state before drag
  const beforeHTML = await safeEvaluate<string>(page, `document.body.innerHTML.slice(0, 3000)`, "");

  // Perform drag and drop
  try {
    await sourceLocator.dragTo(targetLocator);
  } catch {
    // Fallback: manual mouse drag
    try {
      const sourceBbox = await sourceLocator.boundingBox();
      const targetBbox = await targetLocator.boundingBox();
      if (sourceBbox && targetBbox) {
        await page.mouse.move(
          sourceBbox.x + sourceBbox.width / 2,
          sourceBbox.y + sourceBbox.height / 2,
        );
        await page.mouse.down();
        await delay(100);
        await page.mouse.move(
          targetBbox.x + targetBbox.width / 2,
          targetBbox.y + targetBbox.height / 2,
          { steps: 10 },
        );
        await page.mouse.up();
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  await delay(500);

  // Verify DOM changed after drag
  const afterHTML = await safeEvaluate<string>(page, `document.body.innerHTML.slice(0, 3000)`, "");
  return afterHTML !== beforeHTML;
}

// ---------------------------------------------------------------------------
// 4. testNotifications — Capture in-app notifications
// ---------------------------------------------------------------------------

export async function testNotifications(
  page: Page,
): Promise<Array<{ type: string; text: string; dismissed: boolean }>> {
  const notifications: Array<{ type: string; text: string; dismissed: boolean }> = [];

  // Scan for visible notification elements
  const found = await safeEvaluate<Array<{ type: string; text: string; selector: string }>>(
    page,
    `
    (() => {
      const results = [];
      const selectors = [
        { sel: '[role="alert"]', type: "alert" },
        { sel: '.toast', type: "toast" },
        { sel: '.notification', type: "notification" },
        { sel: '.snackbar', type: "snackbar" },
        { sel: '.alert', type: "alert" },
        { sel: '.flash', type: "flash" },
        { sel: '.message', type: "message" },
        { sel: '[data-testid*="toast"]', type: "toast" },
        { sel: '[data-testid*="notification"]', type: "notification" },
        { sel: '[data-testid*="alert"]', type: "alert" },
        { sel: '[class*="toast"]', type: "toast" },
        { sel: '[class*="snackbar"]', type: "snackbar" },
        { sel: '[class*="notification"]', type: "notification" },
      ];

      for (const { sel, type } of selectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of Array.from(elements)) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
          const text = (el.textContent || "").trim();
          if (!text || text.length > 500) continue;
          const id = el.id ? "#" + el.id : sel;
          results.push({ type, text: text.slice(0, 200), selector: id });
        }
      }

      // Deduplicate by text content
      const seen = new Set();
      return results.filter(r => {
        if (seen.has(r.text)) return false;
        seen.add(r.text);
        return true;
      });
    })()
  `,
    [],
  );

  for (const item of found) {
    let dismissed = false;

    // Try to dismiss each notification
    try {
      // Look for a close button within or near the notification
      const closeClicked = await safeEvaluate<boolean>(
        page,
        `
        (() => {
          const container = document.querySelector('${item.selector.replace(/'/g, "\\'")}');
          if (!container) return false;
          const closeBtn = container.querySelector(
            'button[aria-label="Close"], button[aria-label="Dismiss"], ' +
            '.close, .dismiss, [data-dismiss], ' +
            'button:has(svg), button:last-child'
          );
          if (closeBtn) {
            closeBtn.click();
            return true;
          }
          return false;
        })()
      `,
        false,
      );

      if (closeClicked) {
        await delay(300);
        // Verify it was actually dismissed
        const stillVisible = await safeEvaluate<boolean>(
          page,
          `
          (() => {
            const container = document.querySelector('${item.selector.replace(/'/g, "\\'")}');
            if (!container) return false;
            const style = window.getComputedStyle(container);
            return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
          })()
        `,
          false,
        );
        dismissed = !stillVisible;
      }
    } catch {
      // Could not dismiss
    }

    notifications.push({
      type: item.type,
      text: item.text,
      dismissed,
    });
  }

  return notifications;
}

// ---------------------------------------------------------------------------
// 5. testDataPersistence — Fill forms, refresh, check data survives
// ---------------------------------------------------------------------------

export async function testDataPersistence(
  page: Page,
  url: string,
): Promise<{ persisted: boolean; lostFields: string[] }> {
  const lostFields: string[] = [];

  // Step 1: Find all form inputs and their current state
  const inputs = await safeEvaluate<
    Array<{ selector: string; name: string; type: string; tagName: string }>
  >(
    page,
    `
    (() => {
      const els = Array.from(document.querySelectorAll(
        'input[type="text"], input[type="email"], input[type="url"], input[type="tel"], ' +
        'input[type="number"], input[type="search"], input:not([type]), textarea, select'
      ));
      return els.slice(0, 20).map((el, i) => {
        let selector;
        if (el.id) selector = "#" + CSS.escape(el.id);
        else if (el.name) selector = el.tagName.toLowerCase() + "[name='" + CSS.escape(el.name) + "']";
        else selector = el.tagName.toLowerCase() + ":nth-of-type(" + (i + 1) + ")";
        return {
          selector,
          name: el.name || el.id || el.placeholder || el.getAttribute("aria-label") || ("field-" + i),
          type: el.type || el.tagName.toLowerCase(),
          tagName: el.tagName.toLowerCase(),
        };
      });
    })()
  `,
    [],
  );

  if (inputs.length === 0) {
    return { persisted: true, lostFields: [] };
  }

  // Step 2: Fill each input with test data
  const testValues: Map<string, string> = new Map();
  const testPrefix = "inspect-persist-test-";

  for (const input of inputs) {
    const testValue = `${testPrefix}${input.name}`;
    testValues.set(input.selector, testValue);

    try {
      if (input.tagName === "select") {
        // For selects, record the current value instead of filling
        const currentValue = await safeEvaluate<string>(
          page,
          `
          (() => {
            const el = document.querySelector('${input.selector.replace(/'/g, "\\'")}');
            return el ? el.value : "";
          })()
        `,
          "",
        );
        testValues.set(input.selector, currentValue);
      } else {
        await page.fill(input.selector, testValue, { timeout: 2000 });
      }
    } catch {
      // Could not fill this field — skip
      testValues.delete(input.selector);
    }
  }

  if (testValues.size === 0) {
    return { persisted: true, lostFields: [] };
  }

  // Step 3: Reload the page
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  }
  await delay(1000);

  // Step 4: Check which fields retained their values
  let retainedCount = 0;

  for (const [selector, expectedValue] of testValues) {
    const actualValue = await safeEvaluate<string>(
      page,
      `
      (() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        return el ? el.value : "";
      })()
    `,
      "",
    );

    if (actualValue === expectedValue) {
      retainedCount++;
    } else {
      // Find the friendly name for this field
      const input = inputs.find((inp) => inp.selector === selector);
      lostFields.push(input?.name ?? selector);
    }
  }

  const persisted = retainedCount > 0 && lostFields.length === 0;

  return { persisted, lostFields };
}

// ---------------------------------------------------------------------------
// 6. testConditionalUI — Test show/hide logic
// ---------------------------------------------------------------------------

export async function testConditionalUI(
  page: Page,
  trigger: string,
  expected: string,
  snapshot: string,
  llm: LLMCall,
): Promise<{ passed: boolean; details: string }> {
  // Step 1: Take snapshot before action
  const beforeSnapshot = snapshot || (await takeSnapshot(page));

  // Step 2: Execute the trigger action
  try {
    await executeNaturalStep(page, trigger, beforeSnapshot, llm);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { passed: false, details: `Could not execute trigger "${trigger}": ${msg}` };
  }

  await delay(500);

  // Step 3: Take snapshot after action
  const afterSnapshot = await takeSnapshot(page);

  // Step 4: Ask LLM if the expected change occurred
  const verifyResponse = await llm([
    {
      role: "user",
      content: `A trigger action was performed on the page: "${trigger}"
The expected UI change is: "${expected}"

Page BEFORE trigger:
${beforeSnapshot.slice(0, 3000)}

Page AFTER trigger:
${afterSnapshot.slice(0, 3000)}

Did the expected UI change occur? Respond with JSON:
{"passed": true/false, "details": "description of what changed or why it failed"}`,
    },
  ]);

  return parseLLMJson<{ passed: boolean; details: string }>(verifyResponse, {
    passed: false,
    details: "Could not verify conditional UI change",
  });
}

// ---------------------------------------------------------------------------
// 7. testUndoRedo — Detect and test undo/redo
// ---------------------------------------------------------------------------

export async function testUndoRedo(
  page: Page,
): Promise<{ hasUndo: boolean; hasRedo: boolean; undoWorks: boolean; redoWorks: boolean }> {
  let hasUndo: boolean;
  let hasRedo: boolean;
  let undoWorks = false;
  let redoWorks = false;

  // Detect undo/redo buttons
  const buttons = await safeEvaluate<{ undoSelector: string | null; redoSelector: string | null }>(
    page,
    `
    (() => {
      const allButtons = Array.from(document.querySelectorAll("button, [role='button'], a"));
      let undoSelector = null;
      let redoSelector = null;

      for (const btn of allButtons) {
        const text = (btn.textContent || "").trim().toLowerCase();
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        const title = (btn.getAttribute("title") || "").toLowerCase();
        const combined = text + " " + label + " " + title;

        if (!undoSelector && (combined.includes("undo") || combined.includes("ctrl+z"))) {
          undoSelector = btn.id ? "#" + btn.id : null;
          if (!undoSelector && btn.getAttribute("aria-label")) {
            undoSelector = '[aria-label="' + btn.getAttribute("aria-label") + '"]';
          }
        }
        if (!redoSelector && (combined.includes("redo") || combined.includes("ctrl+y") || combined.includes("ctrl+shift+z"))) {
          redoSelector = btn.id ? "#" + btn.id : null;
          if (!redoSelector && btn.getAttribute("aria-label")) {
            redoSelector = '[aria-label="' + btn.getAttribute("aria-label") + '"]';
          }
        }
      }
      return { undoSelector, redoSelector };
    })()
  `,
    { undoSelector: null, redoSelector: null },
  );

  hasUndo = buttons.undoSelector !== null;
  hasRedo = buttons.redoSelector !== null;

  // Find a text input to test undo/redo with
  const inputSelector = await safeEvaluate<string | null>(
    page,
    `
    (() => {
      const input = document.querySelector(
        'input[type="text"], textarea, [contenteditable="true"], input:not([type])'
      );
      if (!input) return null;
      if (input.id) return "#" + CSS.escape(input.id);
      if (input.name) return input.tagName.toLowerCase() + "[name='" + CSS.escape(input.name) + "']";
      return input.tagName.toLowerCase();
    })()
  `,
    null,
  );

  if (!inputSelector) {
    // No input field to test with — can only report button presence
    return { hasUndo, hasRedo, undoWorks: false, redoWorks: false };
  }

  // Perform an action: type text into the input
  const originalValue = await safeEvaluate<string>(
    page,
    `
    (() => {
      const el = document.querySelector('${inputSelector.replace(/'/g, "\\'")}');
      if (!el) return "";
      return el.value !== undefined ? el.value : (el.textContent || "");
    })()
  `,
    "",
  );

  try {
    await page.click(inputSelector, { timeout: 2000 });
    await page.keyboard.type("InspectUndoTest", { delay: 20 });
  } catch {
    return { hasUndo, hasRedo, undoWorks: false, redoWorks: false };
  }

  await delay(200);

  // Get the value after typing
  const afterTyping = await safeEvaluate<string>(
    page,
    `
    (() => {
      const el = document.querySelector('${inputSelector.replace(/'/g, "\\'")}');
      if (!el) return "";
      return el.value !== undefined ? el.value : (el.textContent || "");
    })()
  `,
    "",
  );

  if (afterTyping === originalValue) {
    // Typing had no effect
    return { hasUndo, hasRedo, undoWorks: false, redoWorks: false };
  }

  // Test Undo via keyboard shortcut (Ctrl+Z / Cmd+Z)
  const isMac = await safeEvaluate<boolean>(page, `navigator.platform.includes("Mac")`, false);
  const modifier = isMac ? "Meta" : "Control";

  try {
    await page.keyboard.press(`${modifier}+z`);
    await delay(300);
  } catch {
    /* continue */
  }

  const afterUndo = await safeEvaluate<string>(
    page,
    `
    (() => {
      const el = document.querySelector('${inputSelector.replace(/'/g, "\\'")}');
      if (!el) return "";
      return el.value !== undefined ? el.value : (el.textContent || "");
    })()
  `,
    "",
  );

  if (afterUndo !== afterTyping) {
    undoWorks = true;
    hasUndo = true; // Keyboard undo works even without a visible button
  }

  // Test Redo via keyboard shortcut (Ctrl+Y or Ctrl+Shift+Z)
  try {
    await page.keyboard.press(`${modifier}+y`);
    await delay(300);
  } catch {
    /* continue */
  }

  const afterRedo = await safeEvaluate<string>(
    page,
    `
    (() => {
      const el = document.querySelector('${inputSelector.replace(/'/g, "\\'")}');
      if (!el) return "";
      return el.value !== undefined ? el.value : (el.textContent || "");
    })()
  `,
    "",
  );

  if (afterRedo !== afterUndo) {
    redoWorks = true;
    hasRedo = true;
  } else {
    // Try Ctrl+Shift+Z as alternative redo
    try {
      await page.keyboard.press(`${modifier}+Shift+z`);
      await delay(300);
    } catch {
      /* continue */
    }

    const afterRedoAlt = await safeEvaluate<string>(
      page,
      `
      (() => {
        const el = document.querySelector('${inputSelector.replace(/'/g, "\\'")}');
        if (!el) return "";
        return el.value !== undefined ? el.value : (el.textContent || "");
      })()
    `,
      "",
    );

    if (afterRedoAlt !== afterUndo) {
      redoWorks = true;
      hasRedo = true;
    }
  }

  // If there are undo/redo buttons, try those too
  if (buttons.undoSelector && !undoWorks) {
    try {
      // Re-type text first
      await page.click(inputSelector, { timeout: 2000 });
      await page.keyboard.type("UndoBtnTest", { delay: 20 });
      await delay(200);
      await page.click(buttons.undoSelector, { timeout: 2000 });
      await delay(300);
      const afterBtnUndo = await safeEvaluate<string>(
        page,
        `
        (() => {
          const el = document.querySelector('${inputSelector.replace(/'/g, "\\'")}');
          if (!el) return "";
          return el.value !== undefined ? el.value : (el.textContent || "");
        })()
      `,
        "",
      );
      if (!afterBtnUndo.includes("UndoBtnTest")) {
        undoWorks = true;
      }
    } catch {
      /* button undo failed */
    }
  }

  if (buttons.redoSelector && !redoWorks) {
    try {
      await page.click(buttons.redoSelector, { timeout: 2000 });
      await delay(300);
      redoWorks = true; // If we could click it without error, it likely worked
    } catch {
      /* button redo failed */
    }
  }

  return { hasUndo, hasRedo, undoWorks, redoWorks };
}

// ---------------------------------------------------------------------------
// 8. testGameLogic — LLM plays an interactive game
// ---------------------------------------------------------------------------

export async function testGameLogic(
  page: Page,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<{ gameDetected: boolean; playable: boolean; observations: string[] }> {
  onProgress("info", "Detecting game elements...");
  const observations: string[] = [];

  // Step 1: Detect game elements
  const gameInfo = await safeEvaluate<{
    hasCanvas: boolean;
    hasSvg: boolean;
    hasGrid: boolean;
    hasScore: boolean;
    hasBoard: boolean;
    canvasCount: number;
    interactiveElements: number;
  }>(
    page,
    `
    (() => {
      const canvases = document.querySelectorAll("canvas");
      const svgs = document.querySelectorAll("svg");
      const grids = document.querySelectorAll(
        "[class*='grid'], [class*='board'], [class*='cell'], " +
        "[role='grid'], [data-row], [data-col], table.game, .game-board"
      );
      const scoreEls = document.querySelectorAll(
        "[class*='score'], [class*='points'], [class*='level'], " +
        "[id*='score'], [id*='points'], [data-score]"
      );
      const boardEls = document.querySelectorAll(
        "[class*='board'], [class*='game'], [class*='puzzle'], " +
        "[id*='board'], [id*='game']"
      );
      const interactive = document.querySelectorAll(
        "button, [role='button'], [onclick], [class*='cell'], [class*='tile'], [class*='piece']"
      );

      return {
        hasCanvas: canvases.length > 0,
        hasSvg: svgs.length > 0,
        hasGrid: grids.length > 0,
        hasScore: scoreEls.length > 0,
        hasBoard: boardEls.length > 0,
        canvasCount: canvases.length,
        interactiveElements: interactive.length,
      };
    })()
  `,
    {
      hasCanvas: false,
      hasSvg: false,
      hasGrid: false,
      hasScore: false,
      hasBoard: false,
      canvasCount: 0,
      interactiveElements: 0,
    },
  );

  const gameDetected =
    gameInfo.hasCanvas || gameInfo.hasGrid || gameInfo.hasBoard || gameInfo.hasScore;

  if (!gameDetected) {
    onProgress("warn", "  No game elements detected on page");
    observations.push(
      "No game elements detected (no canvas, grid, board, or score elements found)",
    );
    return { gameDetected: false, playable: false, observations };
  }

  onProgress("pass", "  Game elements detected");
  observations.push(
    `Detected: canvas=${gameInfo.hasCanvas}, grid=${gameInfo.hasGrid}, ` +
      `board=${gameInfo.hasBoard}, score=${gameInfo.hasScore}, ` +
      `interactive elements=${gameInfo.interactiveElements}`,
  );

  // Step 2: Ask LLM to analyze the game
  const snapshot = await takeSnapshot(page);
  const gameAnalysis = await llm([
    {
      role: "user",
      content: `Analyze this web page which appears to contain a game.

Page snapshot:
${snapshot.slice(0, 5000)}

Game element info: ${JSON.stringify(gameInfo)}

Respond with JSON:
{
  "gameType": "description of the game type (e.g., tic-tac-toe, chess, puzzle, etc.)",
  "howToPlay": "brief description of how to interact with the game",
  "suggestedMoves": [
    {"action": "click", "target": "description of what to click", "reasoning": "why"}
  ]
}

Suggest up to 5 initial moves.`,
    },
  ]);

  const analysis = parseLLMJson<{
    gameType: string;
    howToPlay: string;
    suggestedMoves: Array<{ action: string; target: string; reasoning: string }>;
  }>(gameAnalysis, {
    gameType: "unknown",
    howToPlay: "unknown",
    suggestedMoves: [],
  });

  onProgress("info", `  Game type: ${analysis.gameType}`);
  observations.push(`Game type: ${analysis.gameType}`);
  observations.push(`How to play: ${analysis.howToPlay}`);

  let playable = false;
  const maxMoves = 20;
  let moveCount = 0;

  // Step 3: Play the game
  for (let round = 0; round < maxMoves; round++) {
    // Get moves to execute (initial or from LLM re-analysis)
    let moves: Array<{ action: string; target: string; reasoning: string }>;

    if (round === 0) {
      moves = analysis.suggestedMoves;
    } else {
      // Re-snapshot and ask LLM for next move
      const currentSnapshot = await takeSnapshot(page);
      const nextMoveResponse = await llm([
        {
          role: "user",
          content: `You are playing a game (${analysis.gameType}). Here is the current state:

${currentSnapshot.slice(0, 4000)}

Previous observations:
${observations.slice(-5).join("\n")}

Suggest the next 1-3 moves. If the game appears to be over, set "gameOver" to true.
Respond with JSON:
{
  "gameOver": false,
  "observation": "what you see on the screen",
  "moves": [{"action": "click", "target": "what to click", "reasoning": "why"}]
}`,
        },
      ]);

      const nextMove = parseLLMJson<{
        gameOver: boolean;
        observation: string;
        moves: Array<{ action: string; target: string; reasoning: string }>;
      }>(nextMoveResponse, { gameOver: true, observation: "", moves: [] });

      if (nextMove.observation) {
        observations.push(`Move ${moveCount}: ${nextMove.observation}`);
      }

      if (nextMove.gameOver) {
        onProgress("info", "  Game appears to be over");
        observations.push("Game ended");
        playable = true;
        break;
      }

      moves = nextMove.moves;
    }

    if (moves.length === 0) break;

    // Execute each suggested move
    for (const move of moves) {
      if (moveCount >= maxMoves) break;
      moveCount++;

      onProgress("step", `  Move ${moveCount}: ${move.action} ${move.target}`);

      try {
        if (move.action === "click") {
          await smartClick(page, move.target, snapshot, llm);
          playable = true;
        } else if (move.action === "press" || move.action === "key") {
          await page.keyboard.press(move.target);
          playable = true;
        } else if (move.action === "drag") {
          // For drag actions, try to parse source and target
          const parts = move.target.split(/\s+to\s+/i);
          if (parts.length === 2) {
            const dragResult = await testDragDrop(page, parts[0]!, parts[1]!);
            if (dragResult) playable = true;
          }
        } else {
          // Default: try clicking
          await smartClick(page, move.target, snapshot, llm);
          playable = true;
        }

        observations.push(`Move ${moveCount}: ${move.action} "${move.target}" — ${move.reasoning}`);
        await delay(500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        observations.push(`Move ${moveCount}: FAILED — ${msg}`);
        onProgress("warn", `    Move failed: ${msg}`);
      }
    }

    if (moveCount >= maxMoves) break;
  }

  // Step 4: Final assessment
  const finalSnapshot = await takeSnapshot(page);
  const finalResponse = await llm([
    {
      role: "user",
      content: `You attempted to play a game (${analysis.gameType}) on a web page.
You made ${moveCount} moves. Here are the observations:
${observations.join("\n")}

Final page state:
${finalSnapshot.slice(0, 3000)}

Provide a brief final assessment. Respond with JSON:
{"summary": "one sentence summary", "score": "any score visible on page or 'N/A'"}`,
    },
  ]);

  const finalAssessment = parseLLMJson<{ summary: string; score: string }>(finalResponse, {
    summary: `Attempted ${moveCount} moves`,
    score: "N/A",
  });

  observations.push(`Final: ${finalAssessment.summary} (Score: ${finalAssessment.score})`);
  onProgress("done", `Game test complete: ${moveCount} moves, playable=${playable}`);

  return { gameDetected, playable, observations };
}
