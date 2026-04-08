import type { Command } from "commander";
import chalk from "chalk";
import { chromium } from "playwright";
import { createNLAct } from "@inspect/browser";
import { AriaSnapshotBuilder } from "@inspect/browser";

interface NLOptions {
  url: string;
  headed: boolean;
  interactive: boolean;
}

/**
 * Get LLM provider from environment or config
 */
async function getLLM() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.",
    );
  }

  // Use a simple fetch-based LLM client
  return async (messages: Array<{ role: string; content: string }>): Promise<string> => {
    const provider = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai";

    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || "";
    } else {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    }
  };
}

export function registerNLCommand(program: Command): void {
  const nlCmd = program
    .command("nl [instruction]")
    .description("Natural language browser control (Stagehand-style)")
    .option("-u, --url <url>", "Starting URL", "https://google.com")
    .option("--headed", "Show browser window", true)
    .option("-i, --interactive", "Interactive mode (keep session open)", false)
    .action(async (instruction: string | undefined, options: NLOptions) => {
      const browser = await chromium.launch({
        headless: !options.headed,
      });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // Navigate to starting URL
        await page.goto(options.url, { waitUntil: "domcontentloaded" });
        console.log(chalk.blue(`\n🌐 Navigated to ${options.url}\n`));

        // Get LLM
        const llm = await getLLM();

        // Create NL Act interface
        const nl = createNLAct(page, {
          llm,
          snapshot: async () => {
            const builder = new AriaSnapshotBuilder();
            await builder.buildTree(page);
            const text = builder.getFormattedTree();
            return {
              text,
              url: page.url(),
              title: await page.title(),
            };
          },
        });

        if (instruction) {
          // Single instruction mode
          console.log(chalk.yellow(`🎯 Instruction: "${instruction}"\n`));

          const result = await nl.act(instruction);

          if (result.success) {
            console.log(chalk.green("✓ Action completed successfully\n"));
          } else {
            console.log(chalk.red(`✗ Action failed: ${result.error}\n`));
          }
        } else {
          // Interactive mode
          console.log(chalk.blue("🤖 Natural Language Browser Control"));
          console.log(chalk.dim("Type instructions in plain English (or 'quit' to exit)\n"));
          console.log(chalk.dim("Examples:"));
          console.log(chalk.dim('  - "click the login button"'));
          console.log(chalk.dim('  - "type hello in the search box"'));
          console.log(chalk.dim('  - "extract the product name and price"'));
          console.log(chalk.dim('  - "check if the user is logged in"\n'));

          const readline = await import("node:readline");
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const ask = () => {
            rl.question(chalk.green("nl> "), async (input) => {
              const trimmed = input.trim();

              if (trimmed.toLowerCase() === "quit" || trimmed.toLowerCase() === "exit") {
                rl.close();
                await browser.close();
                console.log(chalk.blue("\n👋 Goodbye!"));
                return;
              }

              if (!trimmed) {
                ask();
                return;
              }

              console.log(chalk.dim(`\n  Executing: "${trimmed}"...\n`));

              // Detect if this is an extract or validate action
              const isExtract = /^(get|extract|find|what is|what are)/i.test(trimmed);
              const isValidate = /^(check|verify|is there|does|is the)/i.test(trimmed);

              try {
                if (isExtract) {
                  const result = await nl.extract(trimmed);
                  if (result.success) {
                    console.log(chalk.green("✓ Extracted data:"));
                    console.log(chalk.dim(JSON.stringify(result.data, null, 2)));
                  } else {
                    console.log(chalk.red(`✗ Extraction failed: ${result.error}`));
                  }
                } else if (isValidate) {
                  const valid = await nl.validate(trimmed);
                  console.log(
                    chalk.green(valid ? "✓ Yes (condition is true)" : "✗ No (condition is false)"),
                  );
                } else {
                  const result = await nl.act(trimmed);
                  if (result.success) {
                    console.log(chalk.green("✓ Action completed"));
                  } else {
                    console.log(chalk.red(`✗ Action failed: ${result.error}`));
                  }
                }
              } catch (error) {
                console.log(chalk.red(`\n✗ Error: ${error}`));
              }

              console.log();
              ask();
            });
          };

          ask();
          return; // Don't close browser in interactive mode
        }

        // Keep browser open if interactive mode
        if (options.interactive) {
          console.log(chalk.yellow("\n⏳ Browser will stay open. Press Ctrl+C to exit."));
          await new Promise(() => {}); // Keep alive
        }
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${error}`));
        process.exit(1);
      } finally {
        if (!options.interactive) {
          await browser.close();
        }
      }
    });

  // Add subcommand for direct actions
  nlCmd
    .command("act <instruction>")
    .description("Execute a single natural language action")
    .option("-u, --url <url>", "Starting URL", "https://google.com")
    .option("--headed", "Show browser window", false)
    .action(async (instruction: string, options: NLOptions) => {
      const browser = await chromium.launch({
        headless: !options.headed,
      });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        const url = options.url ?? "https://google.com";
        await page.goto(url, { waitUntil: "domcontentloaded" });

        const llm = await getLLM();
        const nl = createNLAct(page, {
          llm,
          snapshot: async () => {
            const builder = new AriaSnapshotBuilder();
            await builder.buildTree(page);
            const text = builder.getFormattedTree();
            return {
              text,
              url: page.url(),
              title: await page.title(),
            };
          },
        });

        console.log(chalk.yellow(`🎯 ${instruction}\n`));
        const result = await nl.act(instruction);

        if (result.success) {
          console.log(chalk.green("✓ Success"));
        } else {
          console.log(chalk.red(`✗ Failed: ${result.error}`));
          process.exit(1);
        }
      } finally {
        await browser.close();
      }
    });

  // Add subcommand for extraction
  nlCmd
    .command("extract <instruction>")
    .description("Extract data using natural language")
    .option("-u, --url <url>", "Starting URL", "https://google.com")
    .option("--headed", "Show browser window", false)
    .action(async (instruction: string, options: NLOptions) => {
      const browser = await chromium.launch({
        headless: !options.headed,
      });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        const url = options.url ?? "https://google.com";
        await page.goto(url, { waitUntil: "domcontentloaded" });

        const llm = await getLLM();
        const nl = createNLAct(page, {
          llm,
          snapshot: async () => {
            const builder = new AriaSnapshotBuilder();
            await builder.buildTree(page);
            const text = builder.getFormattedTree();
            return {
              text,
              url: page.url(),
              title: await page.title(),
            };
          },
        });

        console.log(chalk.yellow(`🔍 ${instruction}\n`));
        const result = await nl.extract(instruction);

        if (result.success) {
          console.log(chalk.green("✓ Extracted:"));
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(chalk.red(`✗ Failed: ${result.error}`));
          process.exit(1);
        }
      } finally {
        await browser.close();
      }
    });
}
