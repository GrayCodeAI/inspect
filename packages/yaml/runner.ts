// ============================================================================
// YAML Test Runner
// ============================================================================

import type { TestResult, TestStep, TestStepStatus, TestError } from "@inspect/shared";
import { createTimer, generateId, sleep } from "@inspect/shared";
import type { TestDefinition, YAMLStep } from "./parser.js";

/** Page-like interface for test execution */
interface PageHandle {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  hover(selector: string, options?: { timeout?: number }): Promise<void>;
  press(key: string): Promise<void>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
  waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<void>;
  waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<void>;
  url(): string;
  title(): Promise<string>;
  textContent(selector: string): Promise<string | null>;
  inputValue(selector: string): Promise<string>;
  isChecked(selector: string): Promise<boolean>;
  isVisible(selector: string): Promise<boolean>;
  locator(selector: string): { count(): Promise<number> };
  evaluate<R>(fn: string | ((...args: unknown[]) => R), ...args: unknown[]): Promise<R>;
  setInputFiles(selector: string, files: string | string[]): Promise<void>;
  waitForTimeout(timeout: number): Promise<void>;
}

/** YAML runner options */
export interface YAMLRunnerOptions {
  /** Default timeout for steps */
  defaultTimeout?: number;
  /** Whether to take screenshots on failure */
  screenshotOnFailure?: boolean;
  /** Stop on first failure */
  stopOnFailure?: boolean;
  /** Callback for step progress */
  onStep?: (step: TestStep, index: number, total: number) => void;
  /** Callback for lighthouse audit (external implementation) */
  onLighthouse?: (url: string, categories: string[]) => Promise<unknown>;
  /** Callback for a11y audit (external implementation) */
  onA11y?: (standard: string) => Promise<unknown>;
}

/**
 * YAMLRunner executes a TestDefinition by running each step
 * against a Playwright-like page instance.
 */
export class YAMLRunner {
  private options: YAMLRunnerOptions;
  private variables: Record<string, string> = {};

  constructor(options: YAMLRunnerOptions = {}) {
    this.options = {
      defaultTimeout: 30_000,
      screenshotOnFailure: true,
      stopOnFailure: false,
      ...options,
    };
  }

  /**
   * Run a complete test definition.
   */
  async run(definition: TestDefinition, page: PageHandle): Promise<TestResult> {
    const timer = createTimer();
    const startedAt = Date.now();
    const steps: TestStep[] = [];
    const errors: TestError[] = [];
    const screenshots: string[] = [];
    let passed = true;

    // Initialize variables
    this.variables = { ...definition.variables };

    // Apply viewport if specified
    if (definition.viewport) {
      // Viewport is set externally before calling run
    }

    // Execute setup steps
    if (definition.setup) {
      for (const step of definition.setup) {
        const result = await this.executeStep(page, step, definition);
        steps.push(result);
        if (result.status === "failed" || result.status === "error") {
          passed = false;
          if (result.error) errors.push(result.error);
          if (this.options.stopOnFailure) break;
        }
      }
    }

    // Execute main steps
    if (passed || !this.options.stopOnFailure) {
      for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        const result = await this.executeStep(page, step, definition);
        steps.push(result);

        this.options.onStep?.(result, i, definition.steps.length);

        if (result.screenshot) {
          screenshots.push(result.screenshot);
        }

        if (result.status === "failed" || result.status === "error") {
          passed = false;
          if (result.error) errors.push(result.error);

          // Take failure screenshot
          if (this.options.screenshotOnFailure) {
            try {
              const buf = await page.screenshot({ fullPage: false });
              screenshots.push(buf.toString("base64"));
            } catch {
              // Ignore screenshot failures
            }
          }

          if (this.options.stopOnFailure) break;
        }
      }
    }

    // Execute teardown steps (always run)
    if (definition.teardown) {
      for (const step of definition.teardown) {
        try {
          const result = await this.executeStep(page, step, definition);
          steps.push(result);
        } catch {
          // Teardown errors are non-fatal
        }
      }
    }

    return {
      passed,
      steps,
      duration: timer.elapsed(),
      errors,
      screenshots,
      startedAt,
      completedAt: Date.now(),
    };
  }

  /**
   * Execute a single step.
   */
  private async executeStep(
    page: PageHandle,
    step: YAMLStep,
    definition: TestDefinition,
  ): Promise<TestStep> {
    const stepTimer = createTimer();
    const startedAt = Date.now();
    const timeout = step.timeout ?? definition.timeout ?? this.options.defaultTimeout ?? 30_000;

    const testStep: TestStep = {
      id: generateId(),
      instruction:
        step.description ?? `${step.action}: ${step.selector ?? step.value ?? step.url ?? ""}`,
      expectedOutcome: `Step "${step.action}" completes successfully`,
      status: "running" as TestStepStatus,
      duration: 0,
      startedAt,
      action: step.action,
    };

    try {
      await this.performAction(page, step, definition, timeout);
      testStep.status = "passed";
    } catch (error) {
      testStep.status = "failed";
      testStep.error = {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        pageUrl: page.url(),
      };
    }

    testStep.duration = stepTimer.elapsed();
    testStep.completedAt = Date.now();

    return testStep;
  }

  /**
   * Perform a step action.
   */
  private async performAction(
    page: PageHandle,
    step: YAMLStep,
    definition: TestDefinition,
    timeout: number,
  ): Promise<void> {
    const selector = step.selector ? this.interpolate(step.selector) : undefined;
    const value = step.value ? this.interpolate(step.value) : undefined;
    const text = step.text ? this.interpolate(step.text) : undefined;

    switch (step.action) {
      case "navigate": {
        const url = this.resolveUrl(value ?? step.url ?? "", definition.baseUrl);
        await page.goto(url, { waitUntil: "networkidle", timeout });
        break;
      }

      case "click": {
        if (!selector) throw new Error("click requires a selector");
        await page.click(selector, { timeout });
        break;
      }

      case "type": {
        if (!selector) throw new Error("type requires a selector");
        const typeValue = value ?? text ?? "";
        await page.fill(selector, typeValue, { timeout });
        break;
      }

      case "select": {
        if (!selector) throw new Error("select requires a selector");
        if (!value) throw new Error("select requires a value");
        await page.selectOption(selector, value);
        break;
      }

      case "hover": {
        if (!selector) throw new Error("hover requires a selector");
        await page.hover(selector, { timeout });
        break;
      }

      case "press": {
        const key = step.key ?? value;
        if (!key) throw new Error("press requires a key");
        await page.press(key);
        break;
      }

      case "scroll": {
        const direction = step.direction ?? "down";
        const amount = step.amount ?? 500;
        const deltaMap: Record<string, [number, number]> = {
          up: [0, -amount],
          down: [0, amount],
          left: [-amount, 0],
          right: [amount, 0],
        };
        const [dx, dy] = deltaMap[direction] ?? [0, amount];
        await page.evaluate(`window.scrollBy(${dx}, ${dy})`);
        break;
      }

      case "wait": {
        const waitTime = step.timeout ?? 1000;
        await sleep(waitTime);
        break;
      }

      case "screenshot": {
        await page.screenshot({
          path: step.path,
          fullPage: step.fullPage ?? false,
        });
        break;
      }

      case "assertVisible": {
        if (!selector) throw new Error("assertVisible requires a selector");
        const visible = await page.isVisible(selector);
        if (!visible) {
          throw new Error(`Element "${selector}" is not visible`);
        }
        break;
      }

      case "assertHidden": {
        if (!selector) throw new Error("assertHidden requires a selector");
        const hidden = !(await page.isVisible(selector));
        if (!hidden) {
          throw new Error(`Element "${selector}" is visible but expected to be hidden`);
        }
        break;
      }

      case "assertText": {
        if (!selector) throw new Error("assertText requires a selector");
        if (!text && !value) throw new Error("assertText requires text or value");
        const expected = text ?? value ?? "";
        const actual = await page.textContent(selector);
        if (actual === null || !actual.includes(expected)) {
          throw new Error(`Expected text "${expected}" in "${selector}", got "${actual}"`);
        }
        break;
      }

      case "assertUrl": {
        const expectedUrl = step.url ?? value ?? "";
        const currentUrl = page.url();
        if (expectedUrl.includes("*")) {
          const regex = new RegExp("^" + expectedUrl.replace(/\*/g, ".*") + "$");
          if (!regex.test(currentUrl)) {
            throw new Error(`URL "${currentUrl}" does not match pattern "${expectedUrl}"`);
          }
        } else {
          if (!currentUrl.includes(expectedUrl)) {
            throw new Error(`URL "${currentUrl}" does not contain "${expectedUrl}"`);
          }
        }
        break;
      }

      case "assertTitle": {
        const expectedTitle = text ?? value ?? "";
        const actualTitle = await page.title();
        if (!actualTitle.includes(expectedTitle)) {
          throw new Error(`Title "${actualTitle}" does not contain "${expectedTitle}"`);
        }
        break;
      }

      case "assertValue": {
        if (!selector) throw new Error("assertValue requires a selector");
        const expectedVal = value ?? text ?? "";
        const actualVal = await page.inputValue(selector);
        if (actualVal !== expectedVal) {
          throw new Error(`Input value "${actualVal}" does not match expected "${expectedVal}"`);
        }
        break;
      }

      case "assertChecked": {
        if (!selector) throw new Error("assertChecked requires a selector");
        const checked = await page.isChecked(selector);
        if (!checked) {
          throw new Error(`Element "${selector}" is not checked`);
        }
        break;
      }

      case "assertCount": {
        if (!selector) throw new Error("assertCount requires a selector");
        if (step.count === undefined) throw new Error("assertCount requires a count");
        const count = await page.locator(selector).count();
        if (count !== step.count) {
          throw new Error(`Expected ${step.count} elements for "${selector}", found ${count}`);
        }
        break;
      }

      case "lighthouse": {
        if (this.options.onLighthouse) {
          const categories = step.categories ?? ["performance", "accessibility"];
          await this.options.onLighthouse(page.url(), categories);
        }
        break;
      }

      case "a11y": {
        if (this.options.onA11y) {
          await this.options.onA11y(step.standard ?? "wcag2aa");
        }
        break;
      }

      case "extract": {
        if (!selector) throw new Error("extract requires a selector");
        if (!step.variable) throw new Error("extract requires a variable name");
        const extracted = await page.textContent(selector);
        this.variables[step.variable] = extracted ?? "";
        break;
      }

      case "upload": {
        if (!selector) throw new Error("upload requires a selector");
        if (!step.filePath) throw new Error("upload requires a filePath");
        await page.setInputFiles(selector, step.filePath);
        break;
      }

      case "run": {
        // Execute arbitrary JavaScript
        if (value) {
          await page.evaluate(value);
        }
        break;
      }

      default:
        throw new Error(`Unknown step action: ${step.action}`);
    }
  }

  /**
   * Interpolate variables in a string.
   * Replaces {{variableName}} with the variable value.
   */
  private interpolate(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      return this.variables[name] ?? `{{${name}}}`;
    });
  }

  /**
   * Resolve a URL against a base URL.
   */
  private resolveUrl(url: string, baseUrl?: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    if (baseUrl) {
      return new URL(url, baseUrl).toString();
    }
    return url;
  }
}
