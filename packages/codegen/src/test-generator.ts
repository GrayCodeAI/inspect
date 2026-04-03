import { Effect, Layer, Schema, ServiceMap } from "effect";
import type { Workflow, WorkflowEvent } from "@inspect/workflow-recording";

export interface TestSpec {
  readonly description: string;
  readonly url: string;
  readonly steps: Array<{
    readonly action: string;
    readonly target?: string;
    readonly value?: string;
    readonly assertion?: string;
  }>;
  readonly expectedResult: string;
}

export interface GeneratedTest {
  readonly code: string;
  readonly language: "typescript";
  readonly framework: "playwright";
  readonly fileName: string;
  readonly description: string;
}

export interface GenerationConfig {
  readonly includeComments: boolean;
  readonly usePageObjectPattern: boolean;
  readonly addScreenshots: boolean;
  readonly addNetworkMocking: boolean;
  readonly style: "bdd" | "tdd";
}

export class GenerationError extends Schema.ErrorClass<GenerationError>("GenerationError")({
  _tag: Schema.tag("GenerationError"),
  spec: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Test generation failed for spec: ${this.spec}`;
}

export class ValidationError extends Schema.ErrorClass<ValidationError>("ValidationError")({
  _tag: Schema.tag("ValidationError"),
  code: Schema.String,
  cause: Schema.Unknown,
}) {
  message = "Generated test validation failed";
}

const defaultConfig: GenerationConfig = {
  includeComments: true,
  usePageObjectPattern: false,
  addScreenshots: false,
  addNetworkMocking: false,
  style: "bdd",
};

export class TestScriptGenerator extends ServiceMap.Service<TestScriptGenerator>()(
  "@inspect/TestScriptGenerator",
  {
    make: Effect.gen(function* () {
      const generate = Effect.fn("TestScriptGenerator.generate")(function* (
        spec: TestSpec,
        config?: Partial<GenerationConfig>,
      ) {
        const mergedConfig = { ...defaultConfig, ...config };
        const fileName = generateFileName(spec.description);

        yield* Effect.logInfo("Generating test from spec", {
          description: spec.description,
          style: mergedConfig.style,
        });

        const code = yield* generateTestCode(spec, mergedConfig);

        return {
          code,
          language: "typescript" as const,
          framework: "playwright" as const,
          fileName,
          description: spec.description,
        } as const satisfies GeneratedTest;
      });

      const generateFromRecording = Effect.fn("TestScriptGenerator.generateFromRecording")(
        function* (recording: Workflow, config?: Partial<GenerationConfig>) {
          const mergedConfig = { ...defaultConfig, ...config };
          const fileName = generateFileName(recording.name);

          yield* Effect.logInfo("Generating test from recording", {
            name: recording.name,
            eventCount: recording.events.length,
          });

          const spec = workflowToSpec(recording);
          const code = yield* generateTestCode(
            spec,
            mergedConfig,
            recording.events as WorkflowEvent[],
          );

          return {
            code,
            language: "typescript" as const,
            framework: "playwright" as const,
            fileName,
            description: recording.name,
          } as const satisfies GeneratedTest;
        },
      );

      const generatePageObject = Effect.fn("TestScriptGenerator.generatePageObject")(function* (
        url: string,
        selectors: Array<{ readonly name: string; readonly selector: string }>,
      ) {
        yield* Effect.logInfo("Generating Page Object Model", {
          url,
          selectorCount: selectors.length,
        });

        const className = generateClassName(url);
        const lines: string[] = [
          "import { Page, Locator } from '@playwright/test';",
          "",
          `export class ${className} {`,
          "  readonly page: Page;",
        ];

        for (const { name } of selectors) {
          lines.push(`  readonly ${name}: Locator;`);
        }

        lines.push("", `  constructor(page: Page) {`, `    this.page = page;`);

        for (const { name, selector } of selectors) {
          lines.push(`    this.${name} = page.locator('${selector}');`);
        }

        lines.push(
          "  }",
          "",
          `  async goto(): Promise<void> {`,
          `    await this.page.goto('${url}');`,
          `  }`,
        );

        lines.push(
          "",
          `  async waitForLoad(): Promise<void> {`,
          `    await this.page.waitForLoadState('networkidle');`,
          `  }`,
          "}",
        );

        return lines.join("\n");
      });

      const generateSuite = Effect.fn("TestScriptGenerator.generateSuite")(function* (
        tests: TestSpec[],
        config?: Partial<GenerationConfig>,
      ) {
        const mergedConfig = { ...defaultConfig, ...config };

        yield* Effect.logInfo("Generating test suite", { testCount: tests.length });

        const lines: string[] = ["import { test, expect } from '@playwright/test';", ""];

        if (mergedConfig.usePageObjectPattern) {
          lines.push("import { PageObjects } from './page-objects';", "");
        }

        if (mergedConfig.addNetworkMocking) {
          lines.push(
            "test.beforeEach(async ({ page }) => {",
            "  // Setup network mocking",
            "  await page.route('**/*', (route) => route.continue());",
            "});",
            "",
          );
        }

        for (const spec of tests) {
          const testCode = yield* generateTestCode(spec, mergedConfig);
          lines.push(testCode, "");
        }

        return lines.join("\n");
      });

      const refine = Effect.fn("TestScriptGenerator.refine")(function* (
        test: GeneratedTest,
        feedback: string,
      ) {
        yield* Effect.logInfo("Refining generated test", { fileName: test.fileName, feedback });

        const lowerFeedback = feedback.toLowerCase();
        let refinedCode = test.code;

        if (lowerFeedback.includes("wait") || lowerFeedback.includes("slow")) {
          refinedCode = refinedCode.replace(
            /await page\.(click|fill|type)\(/g,
            "await page.waitForLoadState('networkidle');\n  await page.$1(",
          );
        }

        if (lowerFeedback.includes("selector") || lowerFeedback.includes("locator")) {
          refinedCode = refinedCode.replace(
            /page\.locator\('([^']+)'\)/g,
            "page.getByTestId('$1')",
          );
        }

        if (lowerFeedback.includes("assert") || lowerFeedback.includes("check")) {
          const assertionLines = [
            "  // Additional assertions based on feedback",
            "  await expect(page).toHaveURL(/expected-path/);",
            "  await expect(page.locator('body')).toContainText('Expected text');",
          ];
          refinedCode = refinedCode.replace(/\}\);$/, assertionLines.join("\n") + "\n});");
        }

        return {
          ...test,
          code: refinedCode,
        } as const satisfies GeneratedTest;
      });

      const validate = Effect.fn("TestScriptGenerator.validate")(function* (testCode: string) {
        yield* Effect.logDebug("Validating generated test code");

        const errors: string[] = [];

        if (!testCode.includes("import")) {
          errors.push("Missing import statements");
        }

        if (!testCode.includes("test(") && !testCode.includes("it(")) {
          errors.push("No test cases found");
        }

        const openBraces = (testCode.match(/\{/g) ?? []).length;
        const closeBraces = (testCode.match(/\}/g) ?? []).length;
        if (openBraces !== closeBraces) {
          errors.push("Mismatched braces");
        }

        const openParens = (testCode.match(/\(/g) ?? []).length;
        const closeParens = (testCode.match(/\)/g) ?? []).length;
        if (openParens !== closeParens) {
          errors.push("Mismatched parentheses");
        }

        if (!testCode.includes("await") && testCode.includes("async")) {
          errors.push("Async function without await statements");
        }

        if (testCode.includes("page.") && !testCode.includes("{ page }")) {
          errors.push("Using page without destructuring from test context");
        }

        return {
          valid: errors.length === 0,
          errors,
        };
      });

      return {
        generate,
        generateFromRecording,
        generatePageObject,
        generateSuite,
        refine,
        validate,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

const generateFileName = (description: string): string => {
  const normalized = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized}.spec.ts`;
};

const generateClassName = (url: string): string => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    return parts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")
      .concat("Page");
  } catch {
    return "TestPage";
  }
};

const generateTestCode = (
  spec: TestSpec,
  config: GenerationConfig,
  events?: WorkflowEvent[],
): Effect.Effect<string> => {
  return Effect.gen(function* () {
    const lines: string[] = ["import { test, expect } from '@playwright/test';", ""];

    if (config.addNetworkMocking) {
      lines.push("import { Request } from '@playwright/test';", "");
    }

    const testName = spec.description.replace(/'/g, "\\'");

    if (config.style === "bdd") {
      lines.push(`test.describe('${testName}', () => {`);

      if (config.addNetworkMocking) {
        lines.push(
          "  test.beforeEach(async ({ page }) => {",
          "    await page.route('**/api/**', async (route) => {",
          "      await route.fulfill({ json: { mocked: true } });",
          "    });",
          "  });",
          "",
        );
      }

      lines.push(`  test('should complete successfully', async ({ page }) => {`);
    } else {
      lines.push(`test('${testName}', async ({ page }) => {`);
    }

    if (config.includeComments) {
      lines.push(`    // Navigate to ${spec.url}`);
    }
    lines.push(`    await page.goto('${spec.url}');`);
    lines.push(`    await page.waitForLoadState('networkidle');`);
    lines.push("");

    const stepsToProcess = events ? events.map((event) => workflowEventToStep(event)) : spec.steps;

    for (const step of stepsToProcess) {
      if (config.includeComments && step.action) {
        lines.push(`    // ${step.action}`);
      }

      const code = stepToPlaywrightCode(step, config);
      lines.push(`    ${code}`);

      if (step.assertion) {
        lines.push(`    await expect(page.locator('body')).toContainText('${step.assertion}');`);
      }

      lines.push("");
    }

    if (config.addScreenshots) {
      if (config.includeComments) {
        lines.push("    // Capture final state");
      }
      lines.push("    await page.screenshot({ path: 'test-result.png', fullPage: true });");
      lines.push("");
    }

    if (config.includeComments) {
      lines.push(`    // Verify: ${spec.expectedResult}`);
    }
    lines.push(`    await expect(page.locator('body')).toContainText('${spec.expectedResult}');`);

    if (config.style === "bdd") {
      lines.push("  });", "});");
    } else {
      lines.push("});");
    }

    return lines.join("\n");
  });
};

const workflowEventToStep = (event: WorkflowEvent): TestSpec["steps"][number] => {
  switch (event.type) {
    case "navigate":
      return { action: `Navigate to ${event.targetUrl}` };
    case "click":
      return { action: "Click element", target: event.selector };
    case "type":
      return { action: "Type text", target: event.selector, value: event.value };
    case "select":
      return { action: "Select option", target: event.selector, value: event.value };
    case "scroll":
      return { action: `Scroll to ${event.x}, ${event.y}` };
    case "hover":
      return { action: "Hover over element", target: event.selector };
    case "keypress":
      return { action: `Press key ${event.key}` };
    case "wait":
      return { action: `Wait for ${event.durationMs}ms` };
    case "assertion":
      return { action: "Assert", assertion: event.expectedValue };
    default:
      return { action: "Unknown action" };
  }
};

const stepToPlaywrightCode = (
  step: TestSpec["steps"][number],
  config: GenerationConfig,
): string => {
  const action = step.action.toLowerCase();

  if (action.includes("navigate") && step.target) {
    return `await page.goto('${step.target}');`;
  }

  if (action.includes("click") && step.target) {
    if (config.usePageObjectPattern) {
      return `await pageObjects.${step.target.replace(/[^a-zA-Z0-9]/g, "")}.click();`;
    }
    return `await page.locator('${step.target}').click();`;
  }

  if ((action.includes("type") || action.includes("fill")) && step.target) {
    const value = step.value ?? "";
    if (config.usePageObjectPattern) {
      return `await pageObjects.${step.target.replace(/[^a-zA-Z0-9]/g, "")}.fill('${value.replace(/'/g, "\\'")}');`;
    }
    return `await page.locator('${step.target}').fill('${value.replace(/'/g, "\\'")}');`;
  }

  if (action.includes("select") && step.target) {
    const value = step.value ?? "";
    return `await page.locator('${step.target}').selectOption('${value}');`;
  }

  if (action.includes("scroll")) {
    return `await page.evaluate(() => window.scrollTo(${step.value ?? "0, 500"}));`;
  }

  if (action.includes("hover") && step.target) {
    return `await page.locator('${step.target}').hover();`;
  }

  if (action.includes("wait")) {
    const ms = parseInt(step.value ?? "1000", 10);
    return `await page.waitForTimeout(${ms});`;
  }

  if (action.includes("key") && step.value) {
    return `await page.keyboard.press('${step.value}');`;
  }

  return `// TODO: Implement action: ${step.action}`;
};

const workflowToSpec = (workflow: Workflow): TestSpec => {
  return {
    description: workflow.name,
    url: workflow.startUrl,
    steps: (workflow.events as WorkflowEvent[]).map((event) => workflowEventToStep(event)),
    expectedResult: "Workflow completed successfully",
  };
};
