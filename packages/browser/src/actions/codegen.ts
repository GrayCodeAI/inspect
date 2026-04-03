// ──────────────────────────────────────────────────────────────────────────────
// Playwright Test Codegen - Generate Playwright test code from recorded actions
// ──────────────────────────────────────────────────────────────────────────────

interface GenSelector {
  type: string;
  value: string;
}

interface GenAction {
  type: string;
  selector?: string;
  selectors?: GenSelector[];
  value?: string;
  checked?: boolean;
  key?: string;
  url?: string;
  timestamp: number;
}

/**
 * Generate a Playwright test file from recorded actions.
 * Uses modern Playwright locator patterns with role-based selectors as primary
 * and CSS selectors as fallback.
 */
export function generateTestCode(
  actions: GenAction[],
  options?: {
    testUrl?: string;
    testName?: string;
    includeComments?: boolean;
  },
): string {
  const testUrl =
    options?.testUrl ?? actions.find((a) => a.type === "navigate")?.url ?? "https://example.com";
  const testName = options?.testName ?? "AI-generated test";

  const lines: string[] = [
    "import { test, expect } from '@playwright/test';",
    "",
    `test('${testName}', async ({ page }) => {`,
  ];

  if (options?.includeComments) {
    lines.push(`  // Navigate to ${testUrl}`);
  }
  lines.push(`  await page.goto('${testUrl}');`);
  lines.push("");

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const comment = options?.includeComments ? `  // Action ${i + 1}: ${action.type}` : "";

    switch (action.type) {
      case "navigate":
        if (comment) lines.push(comment);
        lines.push(`  await page.goto('${action.url}');`);
        break;

      case "click":
        if (comment) lines.push(comment);
        if (action.selector) {
          lines.push(`  await page.locator('${action.selector}').click();`);
        } else if (action.selectors && action.selectors.length > 0) {
          const primary = action.selectors[0];
          lines.push(
            `  await page.getBy${capitalize(primary.type)}('${escapeStr(primary.value)}').click();`,
          );
        }
        break;

      case "fill":
        if (comment) lines.push(comment);
        if (action.selector) {
          lines.push(
            `  await page.locator('${action.selector}').fill('${escapeStr(action.value ?? "")}');`,
          );
        } else if (action.selectors && action.selectors.length > 0) {
          const primary = action.selectors[0];
          lines.push(
            `  await page.getBy${capitalize(primary.type)}('${escapeStr(primary.value)}').fill('${escapeStr(action.value ?? "")}');`,
          );
        }
        break;

      case "select":
        if (comment) lines.push(comment);
        if (action.selector) {
          lines.push(
            `  await page.locator('${action.selector}').selectOption('${escapeStr(action.value ?? "")}');`,
          );
        }
        break;

      case "check":
        if (comment) lines.push(comment);
        if (action.selector) {
          lines.push(
            `  await page.locator('${action.selector}').setChecked(${action.checked ?? true});`,
          );
        }
        break;

      case "press":
        if (comment) lines.push(comment);
        lines.push(`  await page.keyboard.press('${action.key ?? "Enter"}');`);
        break;

      case "hover":
        if (comment) lines.push(comment);
        if (action.selector) {
          lines.push(`  await page.locator('${action.selector}').hover();`);
        }
        break;

      case "assert_text":
        if (comment) lines.push(comment);
        if (action.value) {
          lines.push(`  await expect(page.getByText('${escapeStr(action.value)}')).toBeVisible();`);
        }
        break;

      case "assert_url":
        if (comment) lines.push(comment);
        if (action.url) {
          lines.push(
            `  await expect(page).toHaveURL(/${action.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/);`,
          );
        }
        break;
    }
    lines.push("");
  }

  lines.push("});\n");
  return lines.join("\n");
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
