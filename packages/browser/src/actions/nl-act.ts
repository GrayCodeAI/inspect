// ──────────────────────────────────────────────────────────────────────────────
// NLAct - Natural language page interactions (Stagehand-style)
// ──────────────────────────────────────────────────────────────────────────────

import type { Page } from "playwright";

/** Schema for structured extraction */
export interface NLSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/** Result of a natural language action */
export interface NLActionResult {
  success: boolean;
  error?: string;
  /** Extracted data (when using extract) */
  data?: unknown;
}

/**
 * Wraps a Playwright Page with natural language interaction methods.
 *
 * Usage:
 *   const nl = createNLAct(page, { llm: myLLM });
 *   await nl.act("Click the login button");
 *   const data = await nl.extract("Get the product name and price", schema);
 *   const ok = await nl.validate("Check if user is logged in");
 */
export function createNLAct(
  page: Page,
  deps: {
    llm: (messages: Array<{ role: string; content: string }>) => Promise<string>;
    snapshot: () => Promise<{ text: string; url: string; title: string }>;
  },
) {
  const { llm, snapshot } = deps;

  /**
   * Perform an action on the page using natural language.
   * Examples: "Click the login button", "Type 'hello' in the search box"
   */
  async function act(prompt: string): Promise<NLActionResult> {
    const pageSnapshot = await snapshot();
    const systemPrompt = [
      "You are a browser automation assistant. Given a page snapshot and a user instruction,",
      "determine what Playwright action to take. Respond with ONLY a JSON object in this format:",
      '{ "action": "click" | "fill" | "press" | "goto" | "select" | "hover" | "scroll", "selector": "<css selector or null>", "value": "<text or null>" }',
      'If the action cannot be performed, respond with: { "error": "reason" }',
    ].join(" ");

    const response = await llm([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Instruction: ${prompt}\n\nPage URL: ${pageSnapshot.url}\nPage Title: ${pageSnapshot.title}\n\nPage Content:\n${pageSnapshot.text.slice(0, 8000)}`,
      },
    ]);

    try {
      const jsonStr = response
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(jsonStr);

      if (parsed.error) {
        return { success: false, error: parsed.error };
      }

      switch (parsed.action) {
        case "click":
          if (parsed.selector) {
            await page.click(parsed.selector, { timeout: 10000 });
          }
          break;
        case "fill":
          if (parsed.selector && parsed.value !== undefined) {
            await page.fill(parsed.selector, parsed.value, { timeout: 10000 });
          }
          break;
        case "press":
          await page.keyboard.press(parsed.value ?? "Enter");
          break;
        case "goto":
          await page.goto(parsed.value ?? parsed.selector ?? "", { waitUntil: "domcontentloaded" });
          break;
        case "select":
          if (parsed.selector && parsed.value !== undefined) {
            await page.selectOption(parsed.selector, parsed.value, { timeout: 10000 });
          }
          break;
        case "scroll":
          await page.evaluate("window.scrollBy(0, 500)");
          break;
        case "hover":
          if (parsed.selector) {
            await page.hover(parsed.selector, { timeout: 10000 });
          }
          break;
        default:
          return { success: false, error: `Unknown action: ${parsed.action}` };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse LLM response: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Extract structured data from the current page.
   * Examples: "Get the product name and price", "List all articles with their authors"
   */
  async function extract(prompt: string, schema?: NLSchema): Promise<NLActionResult> {
    const pageSnapshot = await snapshot();
    const systemPrompt = schema
      ? `Extract structured data from the page content according to this JSON schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY valid JSON matching the schema.`
      : `Extract structured data based on the user's instruction. Return ONLY valid JSON.`;

    const response = await llm([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Instruction: ${prompt}\n\nPage URL: ${pageSnapshot.url}\nPage Title: ${pageSnapshot.title}\n\nContent:\n${pageSnapshot.text.slice(0, 12000)}`,
      },
    ]);

    try {
      const jsonStr = response
        .replace(/```json?\n?/g, "")
        .replace(/```/g, "")
        .trim();
      const data = JSON.parse(jsonStr);
      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: `Failed to parse extracted data: ${err instanceof Error ? err.message : String(err)}`,
        data: response,
      };
    }
  }

  /**
   * Validate a condition on the current page. Returns true/false.
   * Examples: "Check if user is logged in", "Verify the cart has 3 items"
   */
  async function validate(prompt: string): Promise<boolean> {
    const pageSnapshot = await snapshot();
    const response = await llm([
      {
        role: "system",
        content:
          "Answer whether the following condition is true on the page. Respond with ONLY 'true' or 'false'.",
      },
      {
        role: "user",
        content: `Condition: ${prompt}\n\nPage URL: ${pageSnapshot.url}\nPage Title: ${pageSnapshot.title}\n\nContent:\n${pageSnapshot.text.slice(0, 12000)}`,
      },
    ]);

    return response.trim().toLowerCase() === "true";
  }

  return { act, extract, validate } as const;
}
