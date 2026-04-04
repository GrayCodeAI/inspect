// Placeholder for TestPlan type - to be defined based on workflow package
interface TestPlan {
  id: string;
  name: string;
  steps: unknown[];
}
import type { UserSessionRecording, RecordedAction } from "./user-session-recorder";

interface PlaywrightTestOptions {
  readonly testName?: string;
  readonly usePageObject?: boolean;
}

export class CodegenFromRecording {
  generatePlaywrightTest = (
    recording: UserSessionRecording,
    options?: PlaywrightTestOptions,
  ): string => {
    const testName = options?.testName ?? "Recorded session";
    const lines: string[] = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('${testName}', async ({ page }) => {`,
    ];

    if (recording.url) {
      lines.push(`  // Navigate to starting URL`);
      lines.push(`  await page.goto('${recording.url}');`);
      lines.push(`  await expect(page).toHaveURL('${recording.url}');`);
    }

    for (const action of recording.actions) {
      const actionCode = this.generateActionCode(action);
      lines.push(actionCode);
    }

    lines.push(`});`);

    return lines.join("\n");
  };

  private generateActionCode = (action: RecordedAction): string => {
    const lines: string[] = [];
    const timestamp = new Date(action.timestamp).toISOString();

    lines.push(`  // ${action.type} at ${timestamp}`);

    switch (action.type) {
      case "navigate": {
        const url = action.value ?? "";
        lines.push(`  await page.goto('${url}');`);
        lines.push(`  await expect(page).toHaveURL('${url}');`);
        break;
      }

      case "click": {
        lines.push(`  await expect(page.locator('${action.selector}')).toBeVisible();`);
        lines.push(`  await page.locator('${action.selector}').click();`);
        break;
      }

      case "fill": {
        const value = action.value ?? "";
        lines.push(`  await expect(page.locator('${action.selector}')).toBeVisible();`);
        lines.push(`  await page.locator('${action.selector}').fill('${value}');`);
        lines.push(`  await expect(page.locator('${action.selector}')).toHaveValue('${value}');`);
        break;
      }

      case "select": {
        const option = action.value ?? "";
        lines.push(`  await expect(page.locator('${action.selector}')).toBeVisible();`);
        lines.push(`  await page.locator('${action.selector}').selectOption('${option}');`);
        break;
      }

      case "check": {
        lines.push(`  await expect(page.locator('${action.selector}')).toBeVisible();`);
        lines.push(`  await page.locator('${action.selector}').check();`);
        lines.push(`  await expect(page.locator('${action.selector}')).toBeChecked();`);
        break;
      }

      case "uncheck": {
        lines.push(`  await expect(page.locator('${action.selector}')).toBeVisible();`);
        lines.push(`  await page.locator('${action.selector}').uncheck();`);
        lines.push(`  await expect(page.locator('${action.selector}')).not.toBeChecked();`);
        break;
      }

      case "hover": {
        lines.push(`  await expect(page.locator('${action.selector}')).toBeVisible();`);
        lines.push(`  await page.locator('${action.selector}').hover();`);
        break;
      }

      case "scroll": {
        lines.push(`  await page.evaluate(() => window.scrollTo(0, ${action.value ?? 0}));`);
        break;
      }

      case "keypress": {
        const key = action.value ?? "";
        lines.push(`  await page.keyboard.press('${key}');`);
        break;
      }
    }

    return lines.join("\n");
  };

  generateInspectTestPlan = (_recording: UserSessionRecording): TestPlan => {
    throw new Error("Not implemented");
  };

  generatePageObject = (recording: UserSessionRecording, name: string): string => {
    const className = `${name.charAt(0).toUpperCase()}${name.slice(1)}Page`;
    const selectors = this.extractSelectors(recording);

    const lines: string[] = [
      `import { Page, Locator } from '@playwright/test';`,
      ``,
      `export class ${className} {`,
      `  readonly page: Page;`,
      ``,
    ];

    for (const selectorName of Object.keys(selectors)) {
      lines.push(`  readonly ${selectorName}: Locator;`);
    }

    lines.push(`
  constructor(page: Page) {
    this.page = page;`);

    for (const [selectorName, selector] of Object.entries(selectors)) {
      lines.push(`    this.${selectorName} = page.locator('${selector}');`);
    }

    lines.push(`  }`);
    lines.push(`}`);

    return lines.join("\n");
  };

  private extractSelectors = (recording: UserSessionRecording): Record<string, string> => {
    const selectors: Record<string, string> = {};
    const seenSelectors = new Set<string>();
    let counter = 1;

    for (const action of recording.actions) {
      if (action.selector && !seenSelectors.has(action.selector)) {
        seenSelectors.add(action.selector);
        const selectorName = this.generateSelectorName(action, counter);
        selectors[selectorName] = action.selector;
        counter++;
      }
    }

    return selectors;
  };

  private generateSelectorName = (action: RecordedAction, counter: number): string => {
    const typePrefix = action.type;

    // eslint-disable-next-line no-useless-escape
    const selectorParts = action.selector.split(/[#.\[\]]/).filter(Boolean);
    const lastPart = selectorParts[selectorParts.length - 1];

    if (lastPart) {
      const cleanName = lastPart.replace(/[^a-zA-Z0-9]/g, "");
      if (cleanName) {
        return `${typePrefix}${cleanName.charAt(0).toUpperCase()}${cleanName.slice(1)}`;
      }
    }

    return `${typePrefix}Element${counter}`;
  };

  refineSelectors = async (_recording: UserSessionRecording): Promise<UserSessionRecording> => {
    throw new Error("Not implemented");
  };
}
