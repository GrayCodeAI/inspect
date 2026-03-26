import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ExtractOptions {
  schema?: string;
  output?: string;
  format?: string;
  instruction?: string;
  agent?: string;
}

async function runExtract(url: string | undefined, options: ExtractOptions): Promise<void> {
  if (!url) {
    console.error(chalk.red("Error: URL is required for extraction."));
    console.log(chalk.dim("Usage: inspect extract <url> --schema <file>"));
    process.exit(1);
  }

  const instruction = options.instruction ?? "Extract the main content from this page";
  const format = options.format ?? "json";

  console.log(chalk.blue("\nInspect Extract\n"));
  console.log(chalk.dim(`URL: ${url}`));
  console.log(chalk.dim(`Format: ${format}`));
  if (options.schema) console.log(chalk.dim(`Schema: ${options.schema}`));

  try {
    // Launch browser and navigate
    console.log(chalk.dim("\nLaunching browser..."));
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();
    await browserMgr.launchBrowser({ headless: true, viewport: { width: 1920, height: 1080 } } as any);
    const page = await browserMgr.newPage();

    console.log(chalk.dim(`Navigating to ${url}...`));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Get page content
    const title = await page.title();
    const content = await page.evaluate("document.body.innerText") as string;
    const pageUrl = page.url();

    console.log(chalk.dim(`Page: ${title}`));

    // Load schema if provided
    let schema: Record<string, unknown> | undefined;
    if (options.schema) {
      const schemaPath = resolve(options.schema);
      if (!existsSync(schemaPath)) {
        console.error(chalk.red(`Schema file not found: ${schemaPath}`));
        await browserMgr.closeBrowser();
        process.exit(1);
      }
      schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
      console.log(chalk.dim(`Schema loaded: ${Object.keys(schema ?? {}).length} fields`));
    }

    // Use LLM to extract data
    console.log(chalk.dim("Extracting data with AI..."));
    const { AgentRouter } = await import("@inspect/agent");

    const providerName = options.agent ?? "anthropic";
    const keyMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GOOGLE_AI_KEY",
    };
    const apiKey = process.env[keyMap[providerName] ?? "ANTHROPIC_API_KEY"];
    if (!apiKey) {
      console.error(chalk.red(`No API key found. Set ${keyMap[providerName] ?? "ANTHROPIC_API_KEY"}`));
      await browserMgr.closeBrowser();
      process.exit(1);
    }

    type PN = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";
    const router = new AgentRouter({
      keys: { [providerName]: apiKey } as Partial<Record<PN, string>>,
      defaultProvider: providerName as PN,
    });
    const provider = router.getProvider(providerName as PN);

    const systemPrompt = schema
      ? `Extract structured data from the page content according to this JSON schema:\n${JSON.stringify(schema, null, 2)}\n\nReturn ONLY valid JSON matching the schema.`
      : `Extract structured data from the page content. ${instruction}\n\nReturn the result as valid JSON.`;

    const truncatedContent = content.slice(0, 12000);
    const startTime = Date.now();
    const response = await provider.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Page URL: ${pageUrl}\nPage Title: ${title}\n\nContent:\n${truncatedContent}` },
    ]);
    const elapsed = Date.now() - startTime;

    // Parse the response
    let extracted: unknown;
    try {
      const jsonStr = response.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      extracted = { raw: response.content };
    }

    // Format output
    let output: string;
    switch (format) {
      case "csv": {
        const data = Array.isArray(extracted) ? extracted : [extracted];
        if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
          const headers = Object.keys(data[0] as Record<string, unknown>);
          const rows = data.map((row) => {
            const r = row as Record<string, unknown>;
            return headers.map((h) => JSON.stringify(r[h] ?? "")).join(",");
          });
          output = [headers.join(","), ...rows].join("\n");
        } else {
          output = JSON.stringify(extracted, null, 2);
        }
        break;
      }
      case "markdown": {
        const data = Array.isArray(extracted) ? extracted : [extracted];
        if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
          const headers = Object.keys(data[0] as Record<string, unknown>);
          const headerRow = `| ${headers.join(" | ")} |`;
          const separator = `| ${headers.map(() => "---").join(" | ")} |`;
          const rows = data.map((row) => {
            const r = row as Record<string, unknown>;
            return `| ${headers.map((h) => String(r[h] ?? "")).join(" | ")} |`;
          });
          output = [headerRow, separator, ...rows].join("\n");
        } else {
          output = JSON.stringify(extracted, null, 2);
        }
        break;
      }
      default:
        output = JSON.stringify(extracted, null, 2);
    }

    // Write or display output
    if (options.output) {
      const outputPath = resolve(options.output);
      writeFileSync(outputPath, output, "utf-8");
      console.log(chalk.green(`\nExtracted data written to: ${outputPath}`));
    } else {
      console.log(chalk.dim("\n--- Extracted Data ---"));
      console.log(output);
    }

    console.log(chalk.dim(`\nCompleted in ${(elapsed / 1000).toFixed(1)}s`));

    await browserMgr.closeBrowser();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    process.exit(1);
  }
}

export function registerExtractCommand(program: Command): void {
  program
    .command("extract")
    .description("Extract structured data from web pages using AI")
    .argument("[url]", "URL to extract from")
    .option("-s, --schema <file>", "JSON schema file for extraction shape")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("--format <format>", "Output format: json, csv, markdown", "json")
    .option("-i, --instruction <text>", "Extraction instruction")
    .option("-a, --agent <agent>", "AI provider: anthropic, openai, gemini", "anthropic")
    .action(async (url: string | undefined, opts: ExtractOptions) => {
      await runExtract(url, opts);
    });
}
