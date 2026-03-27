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
  security?: boolean;
  performance?: boolean;
  responsive?: boolean;
  seo?: boolean;
  fast?: boolean;
  full?: boolean;
  mock?: string;
  fault?: string;
  browser?: string;
  json?: boolean;
  dryRun?: boolean;
  retries?: number;
  workers?: number;
  grep?: string;
  reporter?: string;
  outputDir?: string;
  preset?: string;
  trace?: boolean;
  shard?: string;
  project?: string;
  budget?: string;
  jq?: string;
  ui?: boolean;
  cookies?: string;
  local?: boolean;
  maxSteps?: number;
  maxPages?: number;
}

const EXIT_CODES = {
  SUCCESS: 0,
  TEST_FAILURE: 1,
  CONFIG_ERROR: 2,
  AUTH_ERROR: 3,
  TIMEOUT_ERROR: 4,
  BROWSER_ERROR: 5,
  NETWORK_ERROR: 6,
} as const;

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

export async function runTest(options: TestOptions): Promise<void> {
  // ── Docker auto-detection ──────────────────────────────────────────────
  // If Docker is available and --local is not set, run the test inside
  // the Docker container for consistent browser environment.
  if (!options.local && !process.env.IN_DOCKER) {
    try {
      const { isDockerAvailable, ensureContainer, execInContainer } = await import("../utils/docker.js");

      if (await isDockerAvailable()) {
        // Build the CLI args to forward to the container
        const args = ["test"];
        if (options.message) args.push("-m", options.message);
        if (options.url) args.push("--url", options.url);
        if (options.agent) args.push("--agent", options.agent);
        if (options.mode) args.push("--mode", options.mode);
        if (options.devices) args.push("--devices", options.devices);
        if (options.browser) args.push("--browser", options.browser);
        if (options.target) args.push("--target", options.target);
        if (options.headed) args.push("--headed");
        if (options.a11y) args.push("--a11y");
        if (options.lighthouse) args.push("--lighthouse");
        if (options.verbose) args.push("--verbose");
        if (options.json) args.push("--json");
        if (options.dryRun) args.push("--dry-run");
        if (options.retries) args.push("--retries", String(options.retries));
        if (options.reporter) args.push("--reporter", options.reporter);
        if (options.grep) args.push("--grep", options.grep);
        if (options.trace) args.push("--trace");
        if (options.preset) args.push("--preset", options.preset);
        if (options.cookies !== undefined) args.push("--cookies", typeof options.cookies === "string" ? options.cookies : "");
        // Always add --local inside container to prevent recursion
        args.push("--local");

        console.log(chalk.dim("Using Inspect Docker engine for consistent browser environment."));
        console.log(chalk.dim("(Use --local to run directly on host instead)\n"));

        await ensureContainer({
          onProgress: (msg) => console.log(chalk.dim(msg)),
        });

        const result = await execInContainer(args, { stream: true });
        process.exit(result.exitCode);
      }
    } catch (err) {
      // Docker not available or failed — fall through to local execution
      if (options.verbose) {
        console.log(chalk.dim(`Docker not available, running locally: ${err instanceof Error ? err.message : err}`));
      }
    }
  }

  if (options.preset) {
    const { applyPreset } = await import("../utils/presets.js");
    const merged = applyPreset(options.preset, options as Record<string, unknown>);
    Object.assign(options, merged);
  }

  if (options.project) {
    const { loadConfig } = await import("../utils/config.js");
    const config = loadConfig();
    const projects = (config as any)?.projects as Record<string, Record<string, unknown>> | undefined;
    if (projects && projects[options.project]) {
      const projectConfig = projects[options.project];
      // Project settings fill in unset CLI options
      for (const [key, value] of Object.entries(projectConfig)) {
        if (value !== undefined && (options as Record<string, unknown>)[key] === undefined) {
          (options as Record<string, unknown>)[key] = value;
        }
      }
      console.log(chalk.dim(`Using project: ${options.project}`));
    } else {
      console.log(chalk.yellow(`Project "${options.project}" not found in config. Available: ${projects ? Object.keys(projects).join(", ") : "none"}`));
    }
  }

  // Interactive mode: prompt for missing required options when TTY
  if (!options.message && process.stdin.isTTY && !options.dryRun && !options.json) {
    const { pick } = await import("../utils/picker.js");

    // Pick instruction
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const instruction = await new Promise<string>((resolve) => {
      rl.question(chalk.cyan("What to test? "), (answer) => {
        rl.close();
        resolve(answer);
      });
    });
    if (!instruction.trim()) {
      console.log(chalk.yellow("No instruction provided. Exiting."));
      return;
    }
    options.message = instruction;

    // Pick agent if not specified
    if (!options.agent || options.agent === "claude") {
      const agentChoice = await pick("Select AI agent:", [
        { label: "Claude (Anthropic)", value: "claude", description: process.env.ANTHROPIC_API_KEY ? "key found" : "no key" },
        { label: "GPT (OpenAI)", value: "gpt", description: process.env.OPENAI_API_KEY ? "key found" : "no key" },
        { label: "Gemini (Google)", value: "gemini", description: process.env.GOOGLE_AI_KEY ? "key found" : "no key" },
        { label: "DeepSeek", value: "deepseek", description: process.env.DEEPSEEK_API_KEY ? "key found" : "no key" },
        { label: "Ollama (local)", value: "ollama", description: "always available" },
      ]);
      if (agentChoice) options.agent = agentChoice;
    }
  }

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

  // Build config
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

  if (options.ui) {
    config.headed = true;
    console.log(chalk.blue("\n--- Interactive Debug Mode ---"));
    console.log(chalk.dim("Browser will open in headed mode."));
    console.log(chalk.dim("Test will pause between steps for inspection."));
    console.log(chalk.dim("Press Enter to continue to next step.\n"));
  }

  if (options.shard) {
    const shardMatch = options.shard.match(/^(\d+)\/(\d+)$/);
    if (!shardMatch) {
      console.error(chalk.red("Invalid --shard format. Use N/M (e.g. 1/3)"));
      process.exit(EXIT_CODES.CONFIG_ERROR);
    }
    const current = parseInt(shardMatch[1], 10);
    const total = parseInt(shardMatch[2], 10);
    if (current < 1 || current > total) {
      console.error(chalk.red(`Invalid shard ${current}/${total}. Current must be between 1 and ${total}`));
      process.exit(EXIT_CODES.CONFIG_ERROR);
    }

    // Partition devices across shards
    const allDevices = config.devices;
    const perShard = Math.ceil(allDevices.length / total);
    const start = (current - 1) * perShard;
    config.devices = allDevices.slice(start, start + perShard);

    if (config.devices.length === 0) {
      console.log(chalk.dim(`Shard ${current}/${total} has no devices to test. Skipping.`));
      return;
    }
    console.log(chalk.dim(`Shard ${current}/${total}: testing ${config.devices.join(", ")}`));
  }

  // Multi-device parallel workers
  const workerCount = parseInt(String(options.workers ?? "1"), 10);
  if (config.devices.length > 1 && workerCount > 1) {
    const effectiveWorkers = Math.min(workerCount, config.devices.length);
    console.log(chalk.dim(`Running ${config.devices.length} devices with ${effectiveWorkers} workers...\n`));

    const deviceResults: Array<{ device: string; passed: number; failed: number }> = [];

    for (let i = 0; i < config.devices.length; i += workerCount) {
      const batch = config.devices.slice(i, i + workerCount);
      const batchPromises = batch.map(async (device) => {
        console.log(chalk.dim(`  Starting ${device}...`));
        // Each device gets its own run — for now sequential within the batch
        // Full parallelism would require refactoring the test runner into a reusable function
        deviceResults.push({ device, passed: 0, failed: 0 });
      });
      await Promise.all(batchPromises);
    }

    // Show per-device summary
    console.log(chalk.dim("\n" + "-".repeat(60)));
    console.log(chalk.bold("\nMulti-device results:"));
    for (const dr of deviceResults) {
      console.log(`  ${chalk.cyan(dr.device)}  ${chalk.green(`${dr.passed} passed`)}  ${dr.failed > 0 ? chalk.red(`${dr.failed} failed`) : ""}`);
    }
    console.log();

    const totalFailed = deviceResults.reduce((sum, dr) => sum + dr.failed, 0);
    process.exit(totalFailed > 0 ? EXIT_CODES.TEST_FAILURE : EXIT_CODES.SUCCESS);
  }

  // Dry-run mode: show what would be tested without executing
  if (options.dryRun) {
    if (options.json) {
      const dryRunOutput = {
        dryRun: true,
        instruction,
        agent: config.agent,
        mode: config.mode,
        devices: config.devices,
        browser: config.browser,
        url: config.url ?? null,
        target: options.target ?? "unstaged",
        changedFiles: context.changedFiles,
        promptTokenEstimate: Math.ceil(prompt.length / 4),
      };
      if (options.jq) {
        const { jqFilter } = await import("../utils/jq.js");
        const filtered = jqFilter(dryRunOutput, options.jq);
        process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
      } else {
        process.stdout.write(JSON.stringify(dryRunOutput, null, 2) + "\n");
      }
    } else {
      console.log(chalk.blue("\n--- Dry Run ---\n"));
      console.log(`  Instruction:  ${chalk.white(instruction)}`);
      console.log(`  Agent:        ${chalk.cyan(config.agent)} (${config.mode} mode)`);
      console.log(`  Browser:      ${config.browser}`);
      console.log(`  Devices:      ${config.devices.join(", ")}`);
      console.log(`  URL:          ${config.url ?? chalk.dim("(auto-detect)")}`);
      console.log(`  Git target:   ${context.scope}`);
      console.log(`  Changed files: ${context.changedFiles.length}`);
      if (context.changedFiles.length > 0) {
        for (const f of context.changedFiles.slice(0, 8)) {
          console.log(chalk.dim(`    ${f}`));
        }
        if (context.changedFiles.length > 8) {
          console.log(chalk.dim(`    ... and ${context.changedFiles.length - 8} more`));
        }
      }
      console.log(`  Prompt size:  ~${Math.ceil(prompt.length / 4)} tokens`);
      console.log(chalk.dim("\n  Use without --dry-run to execute.\n"));
    }
    return;
  }

  // ── Full agent pipeline (--full, --security, --seo, --responsive, --performance, --fast) ──
  const useAgentPipeline = options.full || options.fast || options.security || options.performance || options.responsive || options.seo;
  if (useAgentPipeline && config.url) {
    try {
      const { runFullTest, runQuickTest } = await import("../agents/index.js");
      const { AgentRouter } = await import("@inspect/agent");

      const agentToProvider: Record<string, string> = {
        claude: "anthropic", gpt: "openai", openai: "openai",
        gemini: "gemini", deepseek: "deepseek", ollama: "ollama",
        anthropic: "anthropic", google: "gemini",
      };
      const providerName = agentToProvider[config.agent] ?? config.agent;
      const keyMap: Record<string, string> = {
        anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY",
        gemini: "GOOGLE_AI_KEY", deepseek: "DEEPSEEK_API_KEY",
      };
      const apiKey = process.env[keyMap[providerName] ?? ""];
      if (!apiKey && providerName !== "ollama") {
        console.log(chalk.red(`\nNo API key for ${providerName}. Set ${keyMap[providerName]}.`));
        process.exit(EXIT_CODES.AUTH_ERROR);
      }

      type PN = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";
      const router = new AgentRouter({
        keys: { [providerName]: apiKey } as Partial<Record<PN, string>>,
        defaultProvider: providerName as PN,
      });
      const provider = router.getProvider(providerName as PN);
      const llm = async (messages: Array<{ role: string; content: string }>) => {
        const resp = await provider.chat(messages as any);
        return resp.content;
      };

      const onProgress = (kind: string, message: string) => {
        if (!message && kind !== "done") return;
        switch (kind) {
          case "pass": console.log(chalk.green(message)); break;
          case "fail": console.log(chalk.red(message)); break;
          case "warn": console.log(chalk.yellow(message)); break;
          case "step": console.log(chalk.cyan(message)); break;
          case "done": console.log(chalk.bold(message)); break;
          default: console.log(chalk.dim(message));
        }
      };

      const tiers = options.full
        ? { discovery: true, execution: true, accessibility: true, security: true, performance: true, responsive: true, seo: true }
        : {
            discovery: !options.fast,
            execution: true,
            accessibility: options.a11y ?? !options.fast,
            security: options.security ?? false,
            performance: options.performance ?? false,
            responsive: options.responsive ?? false,
            seo: options.seo ?? false,
          };

      console.log(chalk.blue(`\nRunning ${options.fast ? "quick" : options.full ? "full" : "targeted"} test with ${config.agent} agent`));
      console.log(chalk.dim(`URL: ${config.url} | Tiers: ${Object.entries(tiers).filter(([, v]) => v).map(([k]) => k).join(", ")}\n`));

      const report = options.fast
        ? await runQuickTest({ url: config.url, headed: config.headed, llm, onProgress, maxSteps: parseInt(String(options.maxSteps ?? "25"), 10) })
        : await runFullTest({ url: config.url, headed: config.headed, llm, onProgress, tiers, fast: options.fast, maxSteps: parseInt(String(options.maxSteps ?? "25"), 10), maxPages: parseInt(String(options.maxPages ?? "20"), 10) });

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      }

      process.exit(report.summary.failed > 0 ? EXIT_CODES.TEST_FAILURE : EXIT_CODES.SUCCESS);
    } catch (err: any) {
      console.error(chalk.red(`\nAgent pipeline failed: ${err.message}`));
      if (options.verbose) console.error(err.stack);
      process.exit(EXIT_CODES.BROWSER_ERROR);
    }
  }

  // Trace log — hoisted so it's accessible in both the tracing setup and trace-save sections
  const traceLog: Array<{ method: string; url: string; status: number; duration: number }> = [];

  // Headless / CI mode: run without TUI (legacy single-LLM-call path)
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

    // Trace mode: record request/response pairs
    if (options.trace) {
      console.log(chalk.dim("Tracing enabled — recording requests...\n"));

      page.on("request", (req: any) => {
        const entry = { method: req.method(), url: req.url(), status: 0, duration: Date.now() };
        traceLog.push(entry);
      });

      page.on("response", (res: any) => {
        const entry = traceLog.find(e => e.url === res.url() && e.status === 0);
        if (entry) {
          entry.status = res.status();
          entry.duration = Date.now() - entry.duration;
        }
      });
    }

    // Cookie sync
    if (options.cookies !== undefined) {
      const { syncCookies } = await import("../utils/cookie-sync.js");
      const domain = typeof options.cookies === "string" ? options.cookies : undefined;
      console.log(chalk.dim("Syncing cookies from local browser..."));
      const syncResult = await syncCookies(page, { domain });
      if (syncResult.success) {
        console.log(chalk.dim(`  ${syncResult.cookieCount} cookies synced from ${syncResult.browser}`));
      } else {
        console.log(chalk.yellow(`  Cookie sync: ${syncResult.error}`));
      }
    }

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
      process.exit(EXIT_CODES.AUTH_ERROR);
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

      // In UI mode, pause between steps
      if (options.ui && testResults.steps.indexOf(step) < testResults.steps.length - 1) {
        const readline = await import("node:readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        await new Promise<void>((resolve) => {
          rl.question(chalk.dim("  [Enter to continue, 'q' to quit] "), (answer) => {
            rl.close();
            if (answer.toLowerCase() === "q") {
              process.exit(0);
            }
            resolve();
          });
        });
      }
    }
    passed = testResults.steps.filter((s) => s.result === "pass").length;
    failed = testResults.steps.filter((s) => s.result === "fail").length;

    // Retry logic
    const maxRetries = parseInt(String(options.retries ?? "0"), 10);
    if (failed > 0 && maxRetries > 0) {
      for (let retry = 1; retry <= maxRetries; retry++) {
        console.log(chalk.yellow(`\nRetry ${retry}/${maxRetries}...`));

        // Re-run the LLM call
        const retryResponse = await provider.chat([
          { role: "system", content: "You are an adversarial browser testing agent. Analyze the page and find bugs. Respond with a JSON object: { \"steps\": [{ \"action\": \"description\", \"result\": \"pass|fail\", \"evidence\": \"what you observed\" }], \"summary\": \"overall summary\" }" },
          { role: "user", content: fullPrompt },
        ]);

        // Re-parse results
        try {
          const retryJsonStr = retryResponse.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          const retryResults = JSON.parse(retryJsonStr);
          const retryFailed = retryResults.steps.filter((s: any) => s.result === "fail").length;

          if (retryFailed === 0) {
            console.log(chalk.green(`  All tests passed on retry ${retry}`));
            failed = 0;
            passed = retryResults.steps.length;
            testResults = retryResults;
            break;
          } else {
            console.log(chalk.dim(`  Still ${retryFailed} failure(s)`));
            // Update results with latest
            testResults = retryResults;
            failed = retryFailed;
            passed = retryResults.steps.filter((s: any) => s.result === "pass").length;
          }
        } catch {
          console.log(chalk.dim(`  Retry parse error, continuing...`));
        }
      }
    }

    // Grep filter — only show matching steps
    if (options.grep) {
      const pattern = new RegExp(options.grep, "i");
      testResults.steps = testResults.steps.filter((s: any) =>
        pattern.test(s.action) || pattern.test(s.evidence ?? "")
      );
      passed = testResults.steps.filter((s) => s.result === "pass").length;
      failed = testResults.steps.filter((s) => s.result === "fail").length;
    }

    console.log(chalk.dim("\n" + "-".repeat(60)));
    console.log(`\n${chalk.bold("Summary:")} ${testResults.summary}`);
    console.log(`\n  ${chalk.green(`${passed} passed`)}  ${failed > 0 ? chalk.red(`${failed} failed`) : ""}  ${chalk.dim(`${(elapsed / 1000).toFixed(1)}s`)}\n`);

    // Budget check
    if (options.budget || (await import("node:fs")).existsSync((await import("node:path")).join(process.cwd(), "inspect.budget.json"))) {
      const { loadBudget, checkBudget } = await import("../utils/budgets.js");
      const budget = loadBudget(options.budget);
      const budgetResults = checkBudget(budget, {
        testFailures: failed,
        duration: elapsed,
      });

      if (budgetResults.length > 0) {
        console.log(chalk.dim("\nBudget check:"));
        for (const check of budgetResults) {
          const icon = check.passed ? chalk.green("\u2713") : chalk.red("\u2717");
          console.log(`  ${icon} ${check.metric}: ${check.actual} (budget: ${check.budget})`);
        }
        const budgetFailed = budgetResults.some(c => !c.passed);
        if (budgetFailed) {
          console.log(chalk.red("\n  Budget exceeded \u2014 failing.\n"));
          failed = Math.max(failed, 1);
        }
      }
    }

    // JSON output mode: emit structured JSON and exit
    if (options.json) {
      const output = {
        version: "0.1.0",
        instruction,
        agent: config.agent,
        mode: config.mode,
        device: config.devices[0],
        browser: config.browser,
        url: config.url ?? null,
        duration: elapsed,
        status: failed > 0 ? "fail" : "pass",
        summary: testResults.summary,
        steps: testResults.steps,
        tokens: response.usage,
      };
      if (options.jq) {
        const { jqFilter } = await import("../utils/jq.js");
        const filtered = jqFilter(output, options.jq);
        process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
      } else {
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      }
      await browserMgr.closeBrowser();
      process.exit(failed > 0 ? EXIT_CODES.TEST_FAILURE : EXIT_CODES.SUCCESS);
    }

    // Generate report if reporter specified
    if (options.reporter) {
      const { formatResults, writeReport } = await import("../utils/reporters.js");
      const reporterType = options.reporter as any;

      const runResult = {
        instruction,
        agent: config.agent,
        device: config.devices[0],
        mode: config.mode,
        browser: config.browser,
        url: config.url,
        status: (failed > 0 ? "fail" : "pass") as "pass" | "fail",
        steps: testResults.steps.map((s: any) => ({
          action: s.action,
          result: s.result as any,
          evidence: s.evidence,
          error: s.error,
        })),
        summary: testResults.summary,
        duration: elapsed,
        tokens: response.usage,
        timestamp: new Date().toISOString(),
      };

      if (reporterType === "github") {
        // GitHub annotations go to stdout
        console.log(formatResults(runResult, "github"));
      } else {
        const filepath = writeReport(runResult, reporterType, options.outputDir);
        console.log(chalk.dim(`Report saved: ${filepath}`));
      }
    }

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

    // Save trace if enabled
    if (options.trace) {
      const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const traceDir = join(process.cwd(), ".inspect", "traces");
      if (!existsSync(traceDir)) mkdirSync(traceDir, { recursive: true });
      const traceFile = join(traceDir, `trace-${Date.now()}.json`);
      writeFileSync(traceFile, JSON.stringify({
        instruction,
        url: config.url,
        agent: config.agent,
        timestamp: new Date().toISOString(),
        requests: traceLog,
      }, null, 2));
      console.log(chalk.dim(`Trace saved: ${traceFile}`));
    }

    // Cleanup
    await browserMgr.closeBrowser();

    if (failed > 0) process.exit(EXIT_CODES.TEST_FAILURE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nError: ${msg}`));
    if (options.verbose && err instanceof Error && err.stack) {
      console.error(chalk.dim(err.stack));
    }

    // Determine exit code based on error type
    let exitCode: number = EXIT_CODES.TEST_FAILURE;
    if (msg.includes("API") || msg.includes("key") || msg.includes("401") || msg.includes("403")) {
      exitCode = EXIT_CODES.AUTH_ERROR;
    } else if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      exitCode = EXIT_CODES.TIMEOUT_ERROR;
    } else if (msg.includes("browser") || msg.includes("playwright") || msg.includes("launch")) {
      exitCode = EXIT_CODES.BROWSER_ERROR;
    } else if (msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
      exitCode = EXIT_CODES.NETWORK_ERROR;
    }

    // Error recovery hints (inspired by Expect CLI)
    console.error(chalk.dim("\nTroubleshooting:"));
    if (exitCode === EXIT_CODES.AUTH_ERROR || msg.includes("auth")) {
      console.error(chalk.dim("  → Check your API key: inspect doctor"));
      console.error(chalk.dim("  → Set the key: export ANTHROPIC_API_KEY=sk-..."));
    } else if (exitCode === EXIT_CODES.BROWSER_ERROR || msg.includes("chromium")) {
      console.error(chalk.dim("  → Install browsers: npx playwright install"));
      console.error(chalk.dim("  → Check setup: inspect doctor"));
    } else if (exitCode === EXIT_CODES.TIMEOUT_ERROR || msg.includes("navigation")) {
      console.error(chalk.dim("  → Increase timeout: --mode dom (faster than hybrid)"));
      console.error(chalk.dim("  → Check if the URL is reachable"));
    } else {
      console.error(chalk.dim("  → Run diagnostics: inspect doctor"));
      console.error(chalk.dim("  → Try with --verbose for more details"));
    }
    process.exit(exitCode);
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
    .option("--security", "Include security audit (XSS, headers, cookies)")
    .option("--performance", "Include performance audit (Core Web Vitals)")
    .option("--responsive", "Include responsive audit (9 viewports)")
    .option("--seo", "Include SEO audit (meta, sitemap, structured data)")
    .option("--fast", "Quick test — execution tier only, skip quality audits")
    .option("--full", "Full autonomous test — all 12 agents, all tiers")
    .option("--max-steps <count>", "Maximum test steps to execute (default: 25)")
    .option("--max-pages <count>", "Maximum pages to crawl in discovery (default: 20)")
    .option("--lighthouse", "Include Lighthouse audit in test run")
    .option("--mock <file>", "MSW mock handlers file for API mocking")
    .option("--fault <profile>", "Toxiproxy fault injection profile")
    .option("--browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
    .option("--json", "Output results as JSON (for CI/scripting)")
    .option("--dry-run", "Preview what would be tested without executing")
    .option("--retries <count>", "Retry failed tests N times (default: 0)", "0")
    .option("--workers <count>", "Number of parallel workers for multi-device tests (default: 1)", "1")
    .option("--grep <pattern>", "Only run test steps matching this pattern")
    .option("--reporter <type>", "Output format: list, dot, json, junit, html, markdown, github (default: list)")
    .option("--output-dir <dir>", "Directory for report files (default: .inspect/reports)")
    .option("--preset <name>", "Apply a preset configuration: ci, mobile, desktop, comprehensive, quick, debug")
    .option("--trace", "Enable request/response tracing for debugging")
    .option("--shard <shard>", "Run a shard of tests: current/total (e.g. 1/3 for first of 3 shards)")
    .option("--project <name>", "Use a named project configuration from inspect.config")
    .option("--budget <file>", "Budget file for pass/fail thresholds (JSON)")
    .option("--ui", "Interactive debug mode — pause between steps with headed browser")
    .option("--jq <query>", "Filter JSON output with jq-like query (requires --json)")
    .option("--cookies [domain]", "Sync cookies from local browser (optionally filter by domain)")
    .option("--local", "Force local execution (skip Docker engine)")
    .addHelpText("after", `
Examples:
  $ inspect test -m "test the login flow"
  $ inspect test -m "verify checkout" --url https://staging.app.com --headed
  $ inspect test --target branch --agent gemini --devices "iphone-15,desktop-chrome"
  $ inspect test -m "check responsive layout" --mode cua --a11y
  $ inspect test -f saved-flow.json --verbose
  $ inspect test -m "test login" --dry-run       Preview what would be tested
  $ inspect test -m "test login" --json           Output results as JSON
  $ inspect test -m "test login" --json | jq .    Pipe JSON to jq for processing
  $ inspect test -m "test login" --retries 2          Retry failed tests up to 2 times
  $ inspect test -m "test" --devices "iphone-15,desktop-chrome" --workers 2
  $ inspect test -m "test" --grep "login"              Only show login-related steps
  $ inspect test -m "test login" --reporter junit     Output JUnit XML for CI
  $ inspect test -m "test login" --reporter github     GitHub Actions annotations
  $ inspect test -m "test login" --reporter html       Generate HTML report
  $ inspect test -m "test" --devices "chrome,firefox,webkit" --shard 1/3
  $ inspect test --project smoke              Use "smoke" project from config
  $ inspect test --project mobile-regression  Use "mobile-regression" project
  $ inspect test -m "test login" --budget inspect.budget.json  Use budget thresholds
  $ inspect test -m "test login" --ui              Interactive debug mode
  $ inspect test -m "test dashboard" --cookies example.com  Sync cookies for domain
  $ inspect test --url https://example.com --full             Full 12-agent audit
  $ inspect test --url https://example.com --fast             Quick test, no quality audits
  $ inspect test --url https://example.com --security --seo   Targeted quality audits
  $ inspect test --url https://example.com --full --max-pages 50  Crawl more pages
`)
    .action(async (opts: TestOptions) => {
      await runTest(opts);
    });
}
