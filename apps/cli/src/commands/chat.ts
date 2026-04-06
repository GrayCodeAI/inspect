import type { Command } from "commander";
import chalk from "chalk";
import { chromium, type Page } from "playwright";
import readline from "readline";

export interface ChatOptions {
  model?: string;
  interactive?: boolean;
  headless?: boolean;
  verbose?: boolean;
}

interface ParsedAction {
  action: string;
  target?: string;
  value?: string;
}

const ACTION_PATTERNS = [
  { pattern: /^open (.+)/i, action: "open", extract: 1 },
  { pattern: /^go to (.+)/i, action: "open", extract: 1 },
  { pattern: /^navigate to (.+)/i, action: "open", extract: 1 },
  { pattern: /^click (.+)/i, action: "click", extract: 1 },
  { pattern: /^type (.+) in (.+)/i, action: "fill", extract: [1, 2] },
  { pattern: /^fill (.+) with (.+)/i, action: "fill", extract: [1, 2] },
  { pattern: /^search for (.+)/i, action: "search", extract: 1 },
  { pattern: /^screenshot/i, action: "screenshot", extract: 0 },
  { pattern: /^scroll down/i, action: "scroll", extract: "down" },
  { pattern: /^scroll up/i, action: "scroll", extract: "up" },
  { pattern: /^wait (\d+)/i, action: "wait", extract: 1 },
  { pattern: /^close/i, action: "close", extract: 0 },
  { pattern: /^quit/i, action: "close", extract: 0 },
];

function parseNaturalLanguage(input: string): ParsedAction | null {
  const trimmed = input.trim();

  for (const { pattern, action, extract } of ACTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      if (extract === 0) {
        return { action };
      }
      if (Array.isArray(extract)) {
        return {
          action,
          target: match[extract[0]],
          value: match[extract[1]],
        };
      }
      return {
        action,
        target: match[extract as number],
      };
    }
  }
  return null;
}

async function executeAction(page: Page, action: ParsedAction, verbose: boolean): Promise<void> {
  switch (action.action) {
    case "open":
      if (verbose) console.log(chalk.dim(`→ Opening ${action.target}...`));
      await page.goto(action.target!);
      if (verbose) console.log(chalk.green("✓ Opened"));
      break;

    case "click":
      if (verbose) console.log(chalk.dim(`→ Clicking ${action.target}...`));
      await page.click(action.target!);
      if (verbose) console.log(chalk.green("✓ Clicked"));
      break;

    case "fill":
      if (verbose) console.log(chalk.dim(`→ Filling ${action.target} with "${action.value}"...`));
      await page.fill(action.target!, action.value!);
      if (verbose) console.log(chalk.green("✓ Filled"));
      break;

    case "search":
      if (verbose) console.log(chalk.dim(`→ Searching for "${action.target}"...`));
      await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(action.target!)}`);
      if (verbose) console.log(chalk.green("✓ Searched"));
      break;

    case "screenshot":
      if (verbose) console.log(chalk.dim("→ Taking screenshot..."));
      await page.screenshot({ path: `screenshot-${Date.now()}.png` });
      console.log(chalk.green("✓ Screenshot saved"));
      break;

    case "scroll":
      if (verbose) console.log(chalk.dim(`→ Scrolling ${action.target}...`));
      await page.evaluate((direction: string) => {
        window.scrollBy(0, direction === "down" ? 500 : -500);
      }, action.target ?? "down");
      if (verbose) console.log(chalk.green("✓ Scrolled"));
      break;

    case "wait": {
      const waitMs = parseInt(action.target!) * 1000;
      if (verbose) console.log(chalk.dim(`→ Waiting ${waitMs}ms...`));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (verbose) console.log(chalk.green("✓ Waited"));
      break;
    }
  }
}

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat [prompt]")
    .description("Natural language browser control (like agent-browser)")
    .option("-i, --interactive", "Interactive REPL mode", false)
    .option("--headed", "Show browser window", false)
    .option("-v, --verbose", "Show tool commands and output", false)
    .action(async (prompt: string | undefined, options: ChatOptions & { headed?: boolean }) => {
      const browser = await chromium.launch({
        headless: !options.headed,
      });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        if (options.interactive || !prompt) {
          console.log(chalk.blue("Inspect Chat Mode"));
          console.log(chalk.dim("Type commands or 'quit' to exit\n"));

          const rl = createInterface();

          const ask = () => {
            rl.question(chalk.green("inspect > "), async (input) => {
              if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") {
                rl.close();
                await browser.close();
                console.log(chalk.blue("Goodbye!"));
                return;
              }

              const parsed = parseNaturalLanguage(input);
              if (parsed) {
                if (parsed.action === "close") {
                  rl.close();
                  await browser.close();
                  console.log(chalk.green("✓ Browser closed"));
                  return;
                }
                await executeAction(page, parsed, options.verbose ?? false);
              } else {
                console.log(
                  chalk.yellow("Try: 'open google.com', 'click #submit', 'screenshot', etc."),
                );
              }
              ask();
            });
          };

          ask();
        } else {
          if (options.verbose) {
            console.log(chalk.dim(`→ Processing: "${prompt}"`));
          }

          const parsed = parseNaturalLanguage(prompt);
          if (parsed) {
            await executeAction(page, parsed, options.verbose ?? false);
          } else {
            console.log(
              chalk.yellow("Try: 'open google.com', 'click #submit', 'screenshot', etc."),
            );
          }
        }
      } finally {
        await browser.close();
      }
    });
}
