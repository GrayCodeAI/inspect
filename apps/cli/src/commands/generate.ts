import type { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface GenerateOptions {
  output?: string;
  format?: string;
  observe?: boolean;
  agent?: string;
  description?: string;
}

async function runGenerate(url: string | undefined, options: GenerateOptions): Promise<void> {
  if (!url && !options.description) {
    console.error(chalk.red("Error: URL or --description is required."));
    console.log(
      chalk.dim("Usage: inspect generate <url> or inspect generate --description <text>"),
    );
    process.exit(1);
  }

  const format = options.format ?? "yaml";
  const description = options.description ?? `Test the page at ${url}`;

  console.log(chalk.blue("\nTest Generator\n"));
  if (url) console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Format: ${format}`));
  console.log(chalk.dim(`Description: ${description}`));

  try {
    let pageContent = "";
    let pageTitle = "";
    let pageUrl = url ?? "";

    // If URL provided, launch browser and capture page structure
    if (url) {
      console.log(chalk.dim("\nAnalyzing page..."));
      const { BrowserManager, AriaSnapshotBuilder } = await import("@inspect/browser");
      const browserMgr = new BrowserManager();
      await browserMgr.launchBrowser({
        headless: true,
        viewport: { width: 1920, height: 1080 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const page = await browserMgr.newPage();

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      pageTitle = await page.title();
      pageUrl = page.url();

      const snapshot = new AriaSnapshotBuilder();
      await snapshot.buildTree(page);
      const stats = snapshot.getStats();
      pageContent = snapshot.getFormattedTree().slice(0, 6000);

      console.log(chalk.dim(`  Page: ${pageTitle}`));
      console.log(chalk.dim(`  Elements: ${stats.refCount}, ~${stats.tokenEstimate} tokens`));

      await browserMgr.closeBrowser();
    }

    // Use AI to generate test steps
    console.log(chalk.dim("Generating tests with AI..."));
    const { AgentRouter } = await import("@inspect/agent");

    const providerName = options.agent ?? "anthropic";
    const keyMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GOOGLE_AI_KEY",
    };
    const apiKey = process.env[keyMap[providerName] ?? "ANTHROPIC_API_KEY"];
    if (!apiKey) {
      console.error(
        chalk.red(`No API key found. Set ${keyMap[providerName] ?? "ANTHROPIC_API_KEY"}`),
      );
      process.exit(1);
    }

    type PN = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";
    const router = new AgentRouter({
      keys: { [providerName]: apiKey } as Partial<Record<PN, string>>,
      defaultProvider: providerName as PN,
    });
    const provider = router.getProvider(providerName as PN);

    const formatInstruction =
      format === "yaml"
        ? "Generate a YAML test definition with: name, description, url, steps (each with: name, action, selector, value, assertion). Use standard actions: navigate, click, fill, select, hover, wait, waitFor, assert, screenshot."
        : format === "typescript"
          ? "Generate a TypeScript test file using Vitest and the Inspect SDK. Import { Inspect } from '@inspect/sdk'. Use inspect.act(), inspect.extract(), inspect.observe()."
          : "Generate a JSON test definition with: name, description, url, steps array.";

    const systemPrompt = `You are a test generation expert. ${formatInstruction}

Generate thorough but practical tests covering:
- Happy path user flows
- Form validation and edge cases
- Navigation and routing
- Error states
- Accessibility basics

Return ONLY the test file content, no explanation.`;

    const userPrompt = pageContent
      ? `Generate tests for this page:\nURL: ${pageUrl}\nTitle: ${pageTitle}\nDescription: ${description}\n\nPage structure:\n${pageContent}`
      : `Generate tests for: ${description}`;

    const startTime = Date.now();
    const response = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    const elapsed = Date.now() - startTime;

    // Clean up the response
    const generated = response.content
      .replace(/^```(?:yaml|typescript|json|ts|yml)?\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    // Determine output path
    const ext = format === "typescript" ? "ts" : format;
    const defaultOutput = `.inspect/generated-test.${ext}`;
    const outputPath = options.output ? resolve(options.output) : resolve(defaultOutput);

    // Write output
    writeFileSync(outputPath, generated, "utf-8");

    console.log(chalk.green(`\nGenerated test written to: ${outputPath}`));
    console.log(chalk.dim(`Completed in ${(elapsed / 1000).toFixed(1)}s`));

    // Preview
    const lines = generated.split("\n");
    console.log(chalk.dim("\n--- Preview ---"));
    for (const line of lines.slice(0, 20)) {
      console.log(chalk.dim(line));
    }
    if (lines.length > 20) {
      console.log(chalk.dim(`... ${lines.length - 20} more lines`));
    }
    console.log();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate tests from a URL or description using AI")
    .argument("[url]", "URL to generate tests for")
    .option("-o, --output <file>", "Output file for generated tests")
    .option("--format <format>", "Output format: yaml, typescript, json", "yaml")
    .option("--description <text>", "Description of what to test")
    .option("-a, --agent <agent>", "AI provider: anthropic, openai, gemini", "anthropic")
    .option("--observe", "Watch user interactions and record a flow")
    .action(async (url: string | undefined, opts: GenerateOptions) => {
      await runGenerate(url, opts);
    });
}
