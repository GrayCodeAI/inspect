import type { Command } from "commander";
import { render } from "ink";
import React from "react";
import chalk from "chalk";
import { TestingScreen } from "../tui/screens/TestingScreen.js";
import { ResultsScreen } from "../tui/screens/ResultsScreen.js";

export interface TestOptions {
  message?: string;
  flow?: string;
  yes?: boolean;
  agent?: string;
  target?: string;
  verbose?: boolean;
  headed?: boolean;
  url?: string;
  devices?: string;
  agents?: string;
  specialist?: string;
  mode?: "dom" | "hybrid" | "cua";
  a11y?: boolean;
  lighthouse?: boolean;
  mock?: string;
  fault?: string;
  browser?: string;
}

interface GitContext {
  branch: string;
  changedFiles: string[];
  diff: string;
  recentCommits: string[];
  scope: string;
}

async function gatherGitContext(target?: string): Promise<GitContext> {
  const { GitManager } = await import("@inspect/core");
  const git = new GitManager(process.cwd());

  const scope = target ?? "unstaged";
  const branch = await git.getCurrentBranch();
  const changedFiles = await git.getChangedFiles(scope);
  const diff = await git.getDiff(scope);
  const recentCommits = await git.getRecentCommits(5);

  return { branch, changedFiles, diff, recentCommits, scope };
}

function buildPrompt(instruction: string, context: GitContext): string {
  const lines: string[] = [];

  lines.push("You are an adversarial browser testing agent. Your goal is to FIND BUGS.");
  lines.push("");
  lines.push("## User Instruction");
  lines.push(instruction);
  lines.push("");
  lines.push("## Git Context");
  lines.push(`Branch: ${context.branch}`);
  lines.push(`Scope: ${context.scope}`);
  lines.push(`Changed files (${context.changedFiles.length}):`);
  for (const file of context.changedFiles.slice(0, 12)) {
    lines.push(`  - ${file}`);
  }

  if (context.diff) {
    const trimmedDiff = context.diff.slice(0, 12000);
    lines.push("");
    lines.push("## Diff");
    lines.push("```");
    lines.push(trimmedDiff);
    if (context.diff.length > 12000) {
      lines.push("... (truncated)");
    }
    lines.push("```");
  }

  if (context.recentCommits.length > 0) {
    lines.push("");
    lines.push("## Recent Commits");
    for (const commit of context.recentCommits) {
      lines.push(`  - ${commit}`);
    }
  }

  lines.push("");
  lines.push("## Instructions");
  lines.push("1. Analyze the changes and identify what needs testing.");
  lines.push("2. Open the application in the browser.");
  lines.push("3. Execute test steps — focus on edge cases and breaking scenarios.");
  lines.push("4. Report pass/fail for each assertion with evidence.");

  return lines.join("\n");
}

async function runTest(options: TestOptions): Promise<void> {
  const instruction = options.message ?? "Test the recent changes";

  // Gather git context
  console.log(chalk.dim("Gathering git context..."));
  let context: GitContext;
  try {
    context = await gatherGitContext(options.target);
  } catch {
    // Fallback when git is not available or no repo
    context = {
      branch: "unknown",
      changedFiles: [],
      diff: "",
      recentCommits: [],
      scope: options.target ?? "unstaged",
    };
  }

  if (context.changedFiles.length === 0 && !options.url && !options.flow) {
    console.log(chalk.yellow("No changed files detected. Use --url to specify a target URL."));
    console.log(chalk.yellow("Or use --target branch to include branch changes."));
  }

  // Build the prompt
  const prompt = buildPrompt(instruction, context);

  if (options.verbose) {
    console.log(chalk.dim("\n--- Prompt ---"));
    console.log(chalk.dim(prompt));
    console.log(chalk.dim("--- End Prompt ---\n"));
  }

  // Display testing TUI
  const config = {
    instruction,
    prompt,
    agent: options.agent ?? "claude",
    mode: options.mode ?? "hybrid",
    headed: options.headed ?? false,
    url: options.url,
    devices: options.devices?.split(",").map((d) => d.trim()) ?? ["desktop-chrome"],
    a11y: options.a11y ?? false,
    lighthouse: options.lighthouse ?? false,
    mockFile: options.mock,
    faultProfile: options.fault,
    browser: options.browser ?? "chromium",
    verbose: options.verbose ?? false,
  };

  // Headless / CI mode: run without TUI
  console.log(chalk.blue(`\nRunning tests with agent: ${config.agent} (mode: ${config.mode})`));
  console.log(chalk.dim(`Devices: ${config.devices.join(", ")} | Browser: ${config.browser}`));
  if (config.url) console.log(chalk.dim(`URL: ${config.url}`));
  if (options.flow) console.log(chalk.dim(`Replaying flow: ${options.flow}`));
  console.log();

  try {
    // 1. Launch browser
    console.log(chalk.dim("Launching browser..."));
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();
    await browserMgr.launchBrowser({
      headless: !config.headed,
      viewport: { width: 1920, height: 1080 },
    } as any);
    const page = await browserMgr.newPage();

    // 2. Navigate to URL if provided
    if (config.url) {
      console.log(chalk.dim(`Navigating to ${config.url}...`));
      await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    }

    // 3. Take ARIA snapshot
    console.log(chalk.dim("Taking page snapshot..."));
    const { AriaSnapshotBuilder } = await import("@inspect/browser");
    const snapshotBuilder = new AriaSnapshotBuilder();
    const elements = await snapshotBuilder.buildTree(page);
    const stats = snapshotBuilder.getStats();
    console.log(chalk.dim(`  ${stats.refCount} elements, ~${stats.tokenEstimate} tokens`));

    // 4. Build system message with snapshot
    const snapshotText = snapshotBuilder.getFormattedTree();
    const fullPrompt = prompt + "\n\n## Current Page Snapshot\n```\n" + snapshotText.slice(0, 8000) + "\n```";

    // 5. Resolve LLM provider
    console.log(chalk.dim(`Calling ${config.agent} agent...`));
    const agentToProvider: Record<string, string> = {
      claude: "anthropic", gpt: "openai", openai: "openai",
      gemini: "gemini", deepseek: "deepseek", ollama: "ollama",
      anthropic: "anthropic", google: "gemini",
    };
    const providerName = agentToProvider[config.agent] ?? config.agent;

    // Check for API key
    const keyMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY",
      gemini: "GOOGLE_AI_KEY", deepseek: "DEEPSEEK_API_KEY",
    };
    const apiKey = process.env[keyMap[providerName] ?? ""];
    if (!apiKey && providerName !== "ollama") {
      console.log(chalk.red(`\nNo API key found for ${providerName}.`));
      console.log(chalk.yellow("Set the appropriate environment variable:"));
      console.log(chalk.yellow("  ANTHROPIC_API_KEY  — for Claude"));
      console.log(chalk.yellow("  OPENAI_API_KEY     — for GPT/OpenAI"));
      console.log(chalk.yellow("  GOOGLE_AI_KEY      — for Gemini"));
      console.log(chalk.yellow("  DEEPSEEK_API_KEY   — for DeepSeek"));
      await browserMgr.closeBrowser();
      process.exit(1);
    }

    // Create provider directly to avoid config complexity
    const { AgentRouter } = await import("@inspect/agent");
    type PN = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";
    const router = new AgentRouter({
      keys: { [providerName]: apiKey } as Partial<Record<PN, string>>,
      defaultProvider: providerName as PN,
    });
    const provider = router.getProvider(providerName as PN);

    const startTime = Date.now();
    const response = await provider.chat([
      { role: "system", content: "You are an adversarial browser testing agent. Analyze the page and find bugs. Respond with a JSON object: { \"steps\": [{ \"action\": \"description\", \"result\": \"pass|fail\", \"evidence\": \"what you observed\" }], \"summary\": \"overall summary\" }" },
      { role: "user", content: fullPrompt },
    ]);
    const elapsed = Date.now() - startTime;

    // 6. Parse and display results
    console.log(chalk.dim(`\nAgent responded in ${(elapsed / 1000).toFixed(1)}s\n`));

    let testResults: { steps: { action: string; result: string; evidence: string }[]; summary: string };
    try {
      const jsonStr = response.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      testResults = JSON.parse(jsonStr);
    } catch {
      // If not valid JSON, show raw response
      console.log(chalk.white(response.content));
      testResults = { steps: [{ action: "AI Analysis", result: "info", evidence: response.content.slice(0, 200) }], summary: response.content.slice(0, 300) };
    }

    // Display results
    let passed = 0, failed = 0;
    for (const step of testResults.steps) {
      const icon = step.result === "pass" ? chalk.green("PASS") : step.result === "fail" ? chalk.red("FAIL") : chalk.yellow("INFO");
      console.log(`  ${icon}  ${step.action}`);
      if (step.evidence) console.log(chalk.dim(`         ${step.evidence.slice(0, 120)}`));
    }
    passed = testResults.steps.filter((s) => s.result === "pass").length;
    failed = testResults.steps.filter((s) => s.result === "fail").length;

    console.log(chalk.dim("\n" + "-".repeat(60)));
    console.log(`\n${chalk.bold("Summary:")} ${testResults.summary}`);
    console.log(`\n  ${chalk.green(`${passed} passed`)}  ${failed > 0 ? chalk.red(`${failed} failed`) : ""}  ${chalk.dim(`${(elapsed / 1000).toFixed(1)}s`)}\n`);

    // 7. Run a11y audit if requested
    if (config.a11y) {
      console.log(chalk.dim("Running accessibility audit..."));
      try {
        const quality = await import("@inspect/quality" as string);
        const auditor = new quality.AccessibilityAuditor();
        const a11yReport = await auditor.audit(page);
        console.log(chalk.dim(`  A11y score: ${a11yReport.score}/100, ${a11yReport.violations.length} violations\n`));
      } catch {
        console.log(chalk.yellow("  A11y audit requires @inspect/quality package"));
      }
    }

    // Cleanup
    await browserMgr.closeBrowser();

    if (failed > 0) process.exit(1);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    if (options.verbose && err instanceof Error && err.stack) {
      console.error(chalk.dim(err.stack));
    }
    process.exit(1);
  }
}

export function registerTestCommand(program: Command): void {
  program
    .command("test")
    .description("Run AI-powered browser tests against your changes")
    .option("-m, --message <message>", "Test instruction / what to test")
    .option("-f, --flow <file>", "Replay a saved flow file")
    .option("-y, --yes", "Skip confirmation and run immediately")
    .option("-a, --agent <agent>", "AI agent to use: claude, gpt, gemini, deepseek", "claude")
    .option("-t, --target <target>", "Git scope: unstaged, branch, commit:<sha>, changes", "unstaged")
    .option("--verbose", "Show detailed output including prompts and tool calls")
    .option("--headed", "Run browser in headed (visible) mode")
    .option("--url <url>", "Target URL to test (overrides auto-detection)")
    .option("--devices <devices>", "Comma-separated device presets", "desktop-chrome")
    .option("--agents <agents>", "Comma-separated specialist agents to include")
    .option("--specialist <type>", "Specialist type: ux, security, a11y, performance")
    .option("--mode <mode>", "Agent mode: dom, hybrid, cua", "hybrid")
    .option("--a11y", "Include accessibility audit in test run")
    .option("--lighthouse", "Include Lighthouse audit in test run")
    .option("--mock <file>", "MSW mock handlers file for API mocking")
    .option("--fault <profile>", "Toxiproxy fault injection profile")
    .option("--browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .action(async (opts: TestOptions) => {
      await runTest(opts);
    });
}
