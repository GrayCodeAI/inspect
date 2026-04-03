import type { VisualTestCase, VisualTestStep, VisualTestSuite } from "./visual-types.ts";

const escapeString = (input: string): string => input.replace(/"/g, '\\"').replace(/\n/g, "\\n");

const generateStepCode = (step: VisualTestStep, index: number): string => {
  const comment = step.description ? `  // ${step.description}\n` : "";
  const screenshotsBefore = step.screenshotBefore
    ? `  await page.screenshot({ path: \`screenshots/${step.type}-step-${index}-before.png\` });\n`
    : "";
  const screenshotsAfter = step.screenshotAfter
    ? `  await page.screenshot({ path: \`screenshots/${step.type}-step-${index}-after.png\` });\n`
    : "";

  let stepCode = "";

  switch (step.type) {
    case "navigate":
      stepCode = `  await page.goto(${step.value ? `"${escapeString(step.value)}"` : '""'});\n`;
      break;

    case "click":
      stepCode = step.target
        ? `  await page.locator("${escapeString(step.target)}").click();\n`
        : "";
      break;

    case "type":
      stepCode = step.target
        ? `  await page.locator("${escapeString(step.target)}").fill(${step.value ? `"${escapeString(step.value)}"` : '""'});\n`
        : "";
      break;

    case "select":
      stepCode = step.target
        ? `  await page.locator("${escapeString(step.target)}").selectOption(${step.value ? `"${escapeString(step.value)}"` : '""'});\n`
        : "";
      break;

    case "scroll":
      stepCode = step.target
        ? `  await page.locator("${escapeString(step.target)}").scrollIntoViewIfNeeded();\n`
        : `  await page.evaluate(() => window.scrollBy(0, ${step.value ?? "500"}));\n`;
      break;

    case "hover":
      stepCode = step.target
        ? `  await page.locator("${escapeString(step.target)}").hover();\n`
        : "";
      break;

    case "wait":
      stepCode = step.target
        ? `  await page.waitForSelector("${escapeString(step.target)}");\n`
        : `  await page.waitForTimeout(${step.timeout ?? 1000});\n`;
      break;

    case "assert":
      stepCode = generateAssertCode(step);
      break;

    case "screenshot":
      stepCode = `  await page.screenshot({ path: ${step.value ? `"${escapeString(step.value)}"` : `"screenshots/step-${index}.png"`} });\n`;
      break;

    case "extract":
      stepCode = step.target
        ? `  const extractedText${index} = await page.locator("${escapeString(step.target)}").textContent();\n`
        : "";
      break;
  }

  return comment + screenshotsBefore + stepCode + screenshotsAfter;
};

const generateAssertCode = (step: VisualTestStep): string => {
  if (!step.target) return "";

  const assertion = step.assertion ?? "";

  if (assertion.toLowerCase().includes("visible")) {
    return `  await expect(page.locator("${escapeString(step.target)}")).toBeVisible();\n`;
  }

  if (
    assertion.toLowerCase().includes("hidden") ||
    assertion.toLowerCase().includes("not visible")
  ) {
    return `  await expect(page.locator("${escapeString(step.target)}")).toBeHidden();\n`;
  }

  if (assertion.toLowerCase().includes("text") || assertion.toLowerCase().includes("contains")) {
    const textMatch = assertion.match(/["'](.+?)["']/);
    const expectedText = textMatch ? textMatch[1] : assertion;
    return `  await expect(page.locator("${escapeString(step.target)}")).toContainText("${escapeString(expectedText)}");\n`;
  }

  if (assertion.toLowerCase().includes("enabled")) {
    return `  await expect(page.locator("${escapeString(step.target)}")).toBeEnabled();\n`;
  }

  if (assertion.toLowerCase().includes("disabled")) {
    return `  await expect(page.locator("${escapeString(step.target)}")).toBeDisabled();\n`;
  }

  if (assertion.toLowerCase().includes("checked")) {
    return `  await expect(page.locator("${escapeString(step.target)}")).toBeChecked();\n`;
  }

  if (assertion.toLowerCase().includes("count") || assertion.toLowerCase().includes("length")) {
    const countMatch = assertion.match(/(\d+)/);
    const expectedCount = countMatch ? countMatch[1] : "1";
    return `  await expect(page.locator("${escapeString(step.target)}")).toHaveCount(${expectedCount});\n`;
  }

  return `  await expect(page.locator("${escapeString(step.target)}")).toBeVisible();\n`;
};

export const generatePlaywrightTest = (testCase: VisualTestCase): string => {
  const lines: string[] = [];

  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");

  const testName = escapeString(testCase.name);
  const testTags =
    testCase.tags && testCase.tags.length > 0
      ? `, { tag: [${testCase.tags.map((tag) => `@${tag}`).join(", ")}] }`
      : "";

  lines.push(`test("${testName}"${testTags}, async ({ page }) => {`);

  if (testCase.description) {
    lines.push(`  // ${escapeString(testCase.description)}`);
    lines.push("");
  }

  lines.push(`  await page.goto("${escapeString(testCase.url)}");`);
  lines.push("");

  testCase.steps.forEach((step, index) => {
    const stepCode = generateStepCode(step, index);
    if (stepCode) {
      lines.push(stepCode);
    }
  });

  lines.push("});");
  lines.push("");

  return lines.join("\n");
};

export const generatePlaywrightSuite = (testSuite: VisualTestSuite): string => {
  const lines: string[] = [];

  lines.push('import { test, expect } from "@playwright/test";');
  lines.push("");

  if (testSuite.description) {
    lines.push(`// ${escapeString(testSuite.description)}`);
    lines.push("");
  }

  lines.push(`test.describe("${escapeString(testSuite.name)}", () => {`);
  lines.push("");
  lines.push(`  test.use({ baseURL: "${escapeString(testSuite.baseUrl)}" });`);
  lines.push("");

  if (!testSuite.cases || testSuite.cases.length === 0) {
    lines.push("  // No test cases in this suite");
    lines.push("});");
    lines.push("");
    return lines.join("\n");
  }

  testSuite.cases.forEach((caseId, index) => {
    lines.push(`  test("case-${caseId}", async ({ page }) => {`);
    lines.push(`    await page.goto("/");`);
    lines.push(`    // TODO: implement test case ${caseId}`);
    lines.push(`  });`);
    lines.push("");
  });

  lines.push("});");
  lines.push("");

  return lines.join("\n");
};
