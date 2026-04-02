import type { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface VisualTestStep {
  type: "navigate" | "click" | "type" | "assert" | "wait";
  selector?: string;
  value?: string;
  assertion?: string;
  timeout?: number;
}

export function registerVisualBuilderCommand(program: Command): void {
  const builderCmd = program.command("builder").description("Visual test builder commands");

  builderCmd
    .command("create")
    .description("Create a new visual test")
    .argument("<name>", "Test name")
    .option("-o, --output <path>", "Output file path")
    .action(async (name, options) => {
      console.log(chalk.blue(`\n🛠️  Creating visual test: ${name}\n`));

      const test = {
        id: `test-${Date.now()}`,
        name,
        steps: [],
        createdAt: Date.now(),
      };

      const outputPath = options.output || `./${name.replace(/\s+/g, "-").toLowerCase()}.test.json`;

      writeFileSync(resolve(outputPath), JSON.stringify(test, null, 2));

      console.log(chalk.green(`✓ Test created: ${outputPath}`));
      console.log(chalk.dim("\nUse 'inspect builder add-step' to add steps"));
    });

  builderCmd
    .command("add-step")
    .description("Add a step to a visual test")
    .argument("<test-file>", "Path to test file")
    .requiredOption("-t, --type <type>", "Step type (navigate, click, type, assert, wait)")
    .option("-s, --selector <selector>", "Element selector")
    .option("-v, --value <value>", "Value to type or URL")
    .option("--timeout <ms>", "Wait timeout in milliseconds", "1000")
    .action(async (testFile, options) => {
      const filePath = resolve(testFile);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`\n✗ Test file not found: ${filePath}`));
        process.exit(1);
      }

      const step: VisualTestStep = {
        type: options.type,
        selector: options.selector,
        value: options.value,
        timeout: parseInt(options.timeout, 10),
      };

      console.log(chalk.blue("\n➕ Adding step to test...\n"));
      console.log(chalk.dim(`Type: ${options.type}`));
      if (options.selector) console.log(chalk.dim(`Selector: ${options.selector}`));
      if (options.value) console.log(chalk.dim(`Value: ${options.value}`));

      // Read and update test file
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      content.steps.push({
        ...step,
        id: `step-${Date.now()}`,
      });
      writeFileSync(filePath, JSON.stringify(content, null, 2));

      console.log(chalk.green("\n✓ Step added successfully"));
    });

  builderCmd
    .command("generate")
    .description("Generate code from visual test")
    .argument("<test-file>", "Path to test file")
    .option("-f, --format <format>", "Output format (typescript, playwright)", "playwright")
    .option("-o, --output <path>", "Output file path")
    .action(async (testFile, options) => {
      const filePath = resolve(testFile);

      if (!existsSync(filePath)) {
        console.error(chalk.red(`\n✗ Test file not found: ${filePath}`));
        process.exit(1);
      }

      const test = JSON.parse(readFileSync(filePath, "utf-8"));

      console.log(chalk.blue(`\n📝 Generating ${options.format} code...\n`));
      console.log(chalk.dim(`Test: ${test.name}`));
      console.log(chalk.dim(`Steps: ${test.steps.length}`));

      // Generate code
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
            lines.push(`  await page.waitForTimeout(${step.timeout || 1000});`);
            break;
        }
      }

      lines.push("});");

      const code = lines.join("\n");

      if (options.output) {
        writeFileSync(resolve(options.output), code);
        console.log(chalk.green(`\n✓ Code saved to: ${options.output}`));
      } else {
        console.log(chalk.dim("\n--- Generated Code ---\n"));
        console.log(code);
      }
    });

  builderCmd
    .command("list")
    .description("List visual tests in directory")
    .option("-d, --dir <directory>", "Tests directory", ".")
    .action(async (_options) => {
      console.log(chalk.blue("\n📁 Visual Tests:\n"));

      // TODO: List test files
      console.log(chalk.dim("Feature implemented in @inspect/visual-builder package"));
    });
}

// readFileSync is imported from node:fs
