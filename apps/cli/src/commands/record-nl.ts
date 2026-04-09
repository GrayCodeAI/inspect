import type { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface RecordNLOptions {
  url: string;
  name: string;
  device?: string;
  width?: string;
  height?: string;
  model?: string;
  provider?: string;
}

interface RecordedStep {
  description: string;
  action: string;
  target?: string;
  value?: string;
}

interface RecordedTest {
  name: string;
  url: string;
  steps: RecordedStep[];
  createdAt: string;
  recordedAt: number;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  BROWSER_ERROR: 2,
} as const;

/**
 * Extract the action type from page interactions
 */
function getActionType(interaction: Record<string, unknown>): string {
  const data = interaction.data as Record<string, unknown> | undefined;
  if (!data) return "unknown";

  // Type 2 = FullSnapshot, Type 3 = IncrementalSnapshot
  if (interaction.type === 2) return "page-load";
  if (interaction.type === 3) {
    // IncrementalSnapshot - check source
    const source = data.source as number | undefined;
    if (source === 0) return "mutation";
    if (source === 1) return "mouse-move";
    if (source === 2) return "mouse-interaction";
    if (source === 3) return "scroll";
    if (source === 4) return "viewport-resize";
    if (source === 5) return "input";
    if (source === 6) return "touch";
    if (source === 7) return "media-interaction";
    if (source === 8) return "focus";
    if (source === 9) return "blur";
    if (source === 10) return "selection";
    if (source === 11) return "webaudio";
    if (source === 12) return "unknown";
  }
  return "event";
}

/**
 * Format event data for NL generation
 */
function formatEventForLLM(interaction: Record<string, unknown>, screenshot?: Buffer): string {
  const type = getActionType(interaction);
  const data = interaction.data as Record<string, unknown> | undefined;

  let eventDescription = `Event type: ${type}`;

  if (data) {
    if (data.type === "click" || data.type === "dblclick") {
      eventDescription += `, Action: ${data.type}, Target: element at position`;
    } else if (data.type === "input") {
      eventDescription += `, Action: text input`;
    } else if (data.type === "scroll") {
      eventDescription += `, Action: scroll`;
    } else if (data.type === "change") {
      eventDescription += `, Action: element changed`;
    }
  }

  return eventDescription;
}

async function generateNLDescription(
  interaction: Record<string, unknown>,
  currentUrl: string,
  screenshot?: Buffer,
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return formatEventForLLM(interaction, screenshot);
  }

  try {
    const eventDesc = formatEventForLLM(interaction, screenshot);
    const prompt = `Given this browser interaction event: "${eventDesc}".
    Generate a natural language description of what the user did (1 sentence, imperative form).
    Examples: "Click the submit button", "Type hello into the email field"
    Be concise and focus on the action.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });

    const result = (await response.json()) as {
      choices?: Array<{ message: { content: string } }>;
    };
    const content = result.choices?.[0]?.message?.content ?? eventDesc;
    return content.trim();
  } catch {
    return formatEventForLLM(interaction, screenshot);
  }
}

async function runRecordNL(options: RecordNLOptions): Promise<void> {
  if (!options.url) {
    console.error(chalk.red("Error: URL is required. Use --url <url>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.name) {
    console.error(chalk.red("Error: Test name is required. Use --name <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Record with Natural Language\n"));
  console.log(chalk.dim(`URL: ${options.url}`));
  console.log(chalk.dim(`Test: ${options.name}`));

  const recordedSteps: RecordedStep[] = [];
  let lastActionType = "";

  try {
    const { SessionRecorder } = await import("@inspect/browser");
    const { BrowserManager } = await import("@inspect/browser");

    const width = options.width ? parseInt(options.width, 10) : 1920;
    const height = options.height ? parseInt(options.height, 10) : 1080;

    console.log(chalk.dim("\nInitializing browser..."));
    const browserManager = new BrowserManager();
    const _context = await browserManager.launchBrowser({
      name: "record-nl-session",
      headless: false,
      viewport: { width, height },
    });

    const page = await browserManager.newPage();
    await page.goto(options.url, { waitUntil: "networkidle" });

    console.log(chalk.dim("Recording started. Press Ctrl+C to finish.\n"));

    const recorder = new SessionRecorder();
    await recorder.startRecording(page);

    process.on("SIGINT", async () => {
      console.log(chalk.dim("\n\nProcessing recording..."));

      const events = await recorder.stopRecording(page);

      // Extract actionable events and generate NL descriptions
      if (Array.isArray(events)) {
        for (const event of events) {
          const eventTyped = event as unknown as Record<string, unknown>;
          const actionType = getActionType(eventTyped);

          // Filter for meaningful interactions
          if (["click", "input", "scroll", "navigation"].includes(actionType)) {
            // Skip duplicate consecutive actions
            if (actionType === lastActionType) continue;

            const description = await generateNLDescription(eventTyped, options.url);

            recordedSteps.push({
              description,
              action: actionType,
              target: undefined,
              value: undefined,
            });

            lastActionType = actionType;
            console.log(chalk.gray(`  ✓ ${description}`));
          }
        }
      }

      // Create test file
      const testFile: RecordedTest = {
        name: options.name,
        url: options.url,
        steps: recordedSteps,
        createdAt: new Date().toISOString(),
        recordedAt: Date.now(),
      };

      // Save to .inspect/recorded/{name}.json
      const outputDir = resolve(process.cwd(), ".inspect", "recorded");
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = resolve(outputDir, `${options.name}.json`);
      writeFileSync(outputPath, JSON.stringify(testFile, null, 2));

      await browserManager.closeBrowser();

      console.log(chalk.green(`\n✓ Recorded test saved to: ${outputPath}`));
      console.log(chalk.dim(`\nSteps recorded: ${recordedSteps.length}`));
      console.log(chalk.dim(`Run with: inspect test -f ${outputPath}`));

      process.exit(EXIT_CODES.SUCCESS);
    });

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nRecording failed: ${message}`));
    process.exit(EXIT_CODES.BROWSER_ERROR);
  }
}

export function registerRecordNLCommand(program: Command): void {
  program
    .command("record-nl")
    .description("Record a browser session and generate natural language test steps")
    .requiredOption("--url <url>", "URL to record")
    .requiredOption("--name <name>", "Test name (saved as .inspect/recorded/<name>.json)")
    .option("--device <device>", "Device preset to use")
    .option("--width <pixels>", "Viewport width", "1920")
    .option("--height <pixels>", "Viewport height", "1080")
    .option("--model <model>", "LLM model to use for NL generation")
    .option("--provider <provider>", "LLM provider (openai, anthropic)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect record-nl --url https://example.com --name login-flow
  $ inspect record-nl --url https://app.com --name checkout --device iphone-15
  $ inspect record-nl --url https://github.com --name search-repos --name search
`,
    )
    .action(async (opts: RecordNLOptions) => {
      await runRecordNL(opts);
    });
}
