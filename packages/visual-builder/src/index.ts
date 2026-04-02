// Visual Test Builder - MVP
// Simplified API for building tests visually

export interface VisualTestStep {
  readonly id: string;
  readonly type: "navigate" | "click" | "type" | "assert" | "wait";
  readonly selector?: string;
  readonly value?: string;
  readonly assertion?: string;
  readonly timeout?: number;
}

export interface VisualTest {
  readonly id: string;
  readonly name: string;
  readonly steps: VisualTestStep[];
  readonly createdAt: number;
}

export class VisualBuilder {
  private tests: Map<string, VisualTest> = new Map();

  createTest(name: string): VisualTest {
    const test: VisualTest = {
      id: `test-${Date.now()}`,
      name,
      steps: [],
      createdAt: Date.now(),
    };
    this.tests.set(test.id, test);
    return test;
  }

  addStep(testId: string, step: Omit<VisualTestStep, "id">): VisualTestStep {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);

    const newStep: VisualTestStep = {
      ...step,
      id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (test.steps as any[]).push(newStep);
    return newStep;
  }

  getTest(testId: string): VisualTest | undefined {
    return this.tests.get(testId);
  }

  getAllTests(): VisualTest[] {
    return Array.from(this.tests.values());
  }

  generateCode(testId: string, format: "typescript" | "playwright" = "playwright"): string {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`Test ${testId} not found`);

    const lines: string[] = [];
    lines.push(`import { test, expect } from "@playwright/test";`);
    lines.push("");
    lines.push(`test("${test.name}", async ({ page }) => {`);

    for (const step of test.steps) {
      switch (step.type) {
        case "navigate":
          lines.push(`  await page.goto("${step.value}");`);
          break;
        case "click":
          lines.push(`  await page.click("${step.selector}");`);
          break;
        case "type":
          lines.push(`  await page.fill("${step.selector}", "${step.value}");`);
          break;
        case "assert":
          lines.push(`  await expect(page.locator("${step.selector}")).toBeVisible();`);
          break;
        case "wait":
          lines.push(`  await page.waitForTimeout(${step.timeout ?? 1000});`);
          break;
      }
    }

    lines.push("});");
    return lines.join("\n");
  }
}

export const visualBuilder = new VisualBuilder();
