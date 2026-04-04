// ──────────────────────────────────────────────────────────────────────────────
// NLPromptParams - AI-augmented Playwright method wrappers (Skyvern-style)
// Adds prompt parameter to existing Playwright methods with AI fallback
// ──────────────────────────────────────────────────────────────────────────────

import type { Locator, Page } from "playwright";

/**
 * Wraps a Playwright Locator with AI-powered prompt-based fallback.
 * If the selector is not found and a prompt is provided, uses ARIA snapshot
 * to find the element by description.
 */
export async function clickWithPrompt(
  locator: Locator,
  options?: { prompt?: string; page?: Page },
): Promise<void> {
  try {
    await locator.click({ timeout: 5000 });
  } catch {
    if (options?.prompt && options?.page) {
      await clickByPrompt(options.page, options.prompt);
    } else {
      throw new Error(`Element not found. Provide a 'prompt' parameter to use AI fallback.`);
    }
  }
}

/**
 * Wraps page.fill() with AI-powered prompt-based fallback.
 */
export async function fillWithPrompt(
  locator: Locator,
  value: string,
  options?: { prompt?: string; page?: Page },
): Promise<void> {
  try {
    await locator.fill(value, { timeout: 5000 });
  } catch {
    if (options?.prompt && options?.page) {
      await fillByPrompt(options.page, options.prompt, value);
    } else {
      throw new Error(`Element not found. Provide a 'prompt' parameter to use AI fallback.`);
    }
  }
}

/**
 * Wraps page.selectOption() with AI-powered prompt-based fallback.
 */
export async function selectOptionWithPrompt(
  locator: Locator,
  value: string | string[],
  options?: { prompt?: string; page?: Page },
): Promise<void> {
  try {
    await locator.selectOption(value, { timeout: 5000 });
  } catch {
    if (options?.prompt && options?.page) {
      await clickByPrompt(options.page, options.prompt);
      if (typeof value === "string") {
        await options.page.keyboard.type(value);
      }
    } else {
      throw new Error(`Element not found. Provide a 'prompt' parameter to use AI fallback.`);
    }
  }
}

/**
 * Click an element found by natural language description using ARIA snapshot.
 */
async function clickByPrompt(page: Page, prompt: string): Promise<void> {
  const { AriaSnapshotBuilder } = await import("@inspect/browser");
  const snapshotBuilder = new AriaSnapshotBuilder();
  await snapshotBuilder.buildTree(page);

  const tree = snapshotBuilder.getFormattedTree();
  const _matchPrompt = [
    `Given this page structure, find the element matching: "${prompt}"`,
    `Return the ref ID (e.g., "e5") of the element. Respond with ONLY the ref.`,
    "",
    tree,
  ].join("\n");

  // Use simple text matching (no LLM required)
  const elementRef = findElementRef(tree, prompt);
  if (elementRef) {
    const locator = snapshotBuilder.getRefLocator(page, elementRef);
    await locator.click();
    return;
  }

  throw new Error(`Could not find element: "${prompt}"`);
}

/**
 * Fill an element found by natural language description using ARIA snapshot.
 */
async function fillByPrompt(page: Page, prompt: string, value: string): Promise<void> {
  const { AriaSnapshotBuilder } = await import("@inspect/browser");
  const snapshotBuilder = new AriaSnapshotBuilder();
  await snapshotBuilder.buildTree(page);

  const tree = snapshotBuilder.getFormattedTree();
  const elementRef = await findElementRef(tree, prompt);
  if (elementRef) {
    const locator = snapshotBuilder.getRefLocator(page, elementRef);
    await locator.fill(value);
    return;
  }

  throw new Error(`Could not find element: "${prompt}"`);
}

/**
 * Find an element ref in the ARIA snapshot by matching the description.
 * Uses simple text matching (no LLM required) as fallback.
 */
function findElementRef(tree: string, description: string): string | null {
  const lines = tree.split("\n");
  const desc = description.toLowerCase();

  for (const line of lines) {
    const refMatch = line.match(/\[ref=([^\]]+)\]/);
    if (!refMatch) continue;
    const ref = refMatch[1];

    // Check if line contains the description keywords
    const lineLower = line.toLowerCase();
    if (lineLower.includes(desc)) {
      return ref;
    }

    // Simple keyword match: check if any word in description appears in the line
    const words = desc.split(/\s+/).filter((w) => w.length > 2);
    if (words.some((word) => lineLower.includes(word))) {
      return ref;
    }
  }

  return null;
}
