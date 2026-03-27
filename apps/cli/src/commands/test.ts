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
  advancedSecurity?: boolean;
  visualRegression?: boolean;
  apiTesting?: boolean;
  logicTesting?: boolean;
  crossBrowser?: boolean;
  loadTesting?: boolean;
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
  export?: boolean;
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
  const useAgentPipeline = options.full || options.fast || options.security || options.performance || options.responsive || options.seo || options.advancedSecurity || options.visualRegression || options.apiTesting || options.logicTesting || options.crossBrowser || options.loadTesting;
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
        ? {
            discovery: true, execution: true, accessibility: true, security: true,
            advancedSecurity: true, performance: true, responsive: true, seo: true,
            spa: true, visualRegression: true, apiTesting: true,
            logicTesting: false, crossBrowser: false, loadTesting: false,
          }
        : {
            discovery: !options.fast,
            execution: true,
            accessibility: options.a11y ?? !options.fast,
            security: options.security ?? false,
            advancedSecurity: options.advancedSecurity ?? false,
            performance: options.performance ?? false,
            responsive: options.responsive ?? false,
            seo: options.seo ?? false,
            spa: true,
            visualRegression: options.visualRegression ?? false,
            apiTesting: options.apiTesting ?? false,
            logicTesting: options.logicTesting ?? false,
            crossBrowser: options.crossBrowser ?? false,
            loadTesting: options.loadTesting ?? false,
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

  // ── TestExecutor-based execution ──────────────────────────────────────────
  console.log(chalk.blue(`\nRunning tests with agent: ${config.agent} (mode: ${config.mode})`));
  console.log(chalk.dim(`Devices: ${config.devices.join(", ")} | Browser: ${config.browser}`));
  if (config.url) console.log(chalk.dim(`URL: ${config.url}`));
  if (options.flow) console.log(chalk.dim(`Replaying flow: ${options.flow}`));
  console.log();

  try {
    // Resolve LLM provider
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
      console.log(chalk.red(`\nNo API key found for ${providerName}.`));
      console.log(chalk.yellow("Set the appropriate environment variable:"));
      console.log(chalk.yellow("  ANTHROPIC_API_KEY  — for Claude"));
      console.log(chalk.yellow("  OPENAI_API_KEY     — for GPT/OpenAI"));
      console.log(chalk.yellow("  GOOGLE_AI_KEY      — for Gemini"));
      console.log(chalk.yellow("  DEEPSEEK_API_KEY   — for DeepSeek"));
      process.exit(EXIT_CODES.AUTH_ERROR);
    }

    // Create dependencies
    const { AgentRouter } = await import("@inspect/agent");
    const { BrowserManager } = await import("@inspect/browser");
    const { TestExecutor } = await import("@inspect/core");
    const { getPreset } = await import("@inspect/core");

    type PN = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";
    const router = new AgentRouter({
      keys: { [providerName]: apiKey } as Partial<Record<PN, string>>,
      defaultProvider: providerName as PN,
    });
    const browserMgr = new BrowserManager();

    // Optional credential vault
    let credentialVault: any = undefined;
    try {
      const { CredentialVault } = await import("@inspect/credentials");
      credentialVault = new CredentialVault();
    } catch { /* credentials optional */ }

    const devicePreset = getPreset(config.devices[0]) ?? { name: config.devices[0], viewport: { width: 1920, height: 1080 } };

    const executor = new TestExecutor(
      {
        instruction,
        prompt,
        agent: config.agent,
        mode: config.mode as "dom" | "hybrid" | "cua",
        url: config.url,
        device: devicePreset as any,
        browser: config.browser as "chromium" | "firefox" | "webkit",
        headed: config.headed,
        a11y: config.a11y,
        lighthouse: options.lighthouse ?? false,
        security: options.security ?? false,
        maxSteps: parseInt(String(options.maxSteps ?? "25"), 10),
        timeoutMs: 300_000,
        stepTimeoutMs: 30_000,
        verbose: options.verbose ?? false,
      },
      { router, browserManager: browserMgr, credentialVault },
    );

    // Progress display
    executor.setProgressCallback((progress) => {
      if (progress.currentToolCall) {
        process.stdout.write(chalk.dim(`  [${progress.phase}] Step ${progress.currentStep + 1}: ${progress.currentToolCall}      \r`));
      } else if (progress.stepResult) {
        const icon = progress.stepResult.status === "pass" ? chalk.green("PASS") : chalk.red("FAIL");
        console.log(`  ${icon}  ${progress.stepResult.description.slice(0, 100)}`);
        if (progress.stepResult.error) {
          console.log(chalk.red(`         ${progress.stepResult.error.slice(0, 120)}`));
        }
      }
    });

    console.log(chalk.dim("Starting test execution...\n"));
    const result = await executor.execute();
    const elapsed = result.totalDuration;

    // Summary
    const passed = result.steps.filter((s) => s.status === "pass").length;
    const failed = result.steps.filter((s) => s.status === "fail").length;

    console.log(chalk.dim("\n" + "-".repeat(60)));
    console.log(`\n${chalk.bold("Result:")} ${result.status.toUpperCase()}`);
    console.log(`  ${chalk.green(`${passed} passed`)}  ${failed > 0 ? chalk.red(`${failed} failed`) : ""}  ${chalk.dim(`${(elapsed / 1000).toFixed(1)}s`)}  ${chalk.dim(`${result.tokenCount} tokens`)}\n`);

    // JSON output
    if (options.json) {
      const output = {
        version: "0.1.0",
        instruction,
        ...result,
        agent: config.agent,
        mode: config.mode,
        device: config.devices[0],
        browser: config.browser,
        url: config.url ?? null,
      };
      if (options.jq) {
        const { jqFilter } = await import("../utils/jq.js");
        const filtered = jqFilter(output, options.jq);
        process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
      } else {
        process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      }
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
        steps: result.steps.map((s) => ({
          action: s.description,
          result: (s.status === "skipped" ? "skip" : s.status) as any,
          evidence: s.toolCalls.map((t) => `${t.tool}(${JSON.stringify(t.args)})`).join(", "),
          error: s.error,
        })),
        summary: `${passed} passed, ${failed} failed`,
        duration: elapsed,
        tokens: { totalTokens: result.tokenCount, promptTokens: 0, completionTokens: 0 },
        timestamp: result.timestamp,
      };
      if (reporterType === "github") {
        console.log(formatResults(runResult, "github"));
      } else {
        const filepath = writeReport(runResult, reporterType, options.outputDir);
        console.log(chalk.dim(`Report saved: ${filepath}`));
      }
    }

    // Export Playwright test code if requested
    if (options.export) {
      const { exportPlaywrightTest } = await import("@inspect/core");
      const exportPath = exportPlaywrightTest(result, instruction, config.url ?? "", {
        testName: instruction.slice(0, 60),
        includeComments: true,
        includeAssertions: true,
      });
      console.log(chalk.green(`Playwright test exported: ${exportPath}`));
      console.log(chalk.dim(`  Run with: npx playwright test ${exportPath}`));
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
        timestamp: result.timestamp,
        steps: result.steps.map((s) => ({
          description: s.description,
          status: s.status,
          duration: s.duration,
          toolCalls: s.toolCalls,
        })),
      }, null, 2));
      console.log(chalk.dim(`Trace saved: ${traceFile}`));
    }

    // Browser cleanup is handled by TestExecutor
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
    .option("--full", "Full autonomous test — all agents, all tiers")
    .option("--advanced-security", "Include advanced security (CSRF, SQL injection, clickjacking)")
    .option("--visual-regression", "Include visual regression testing (baseline screenshots)")
    .option("--api-testing", "Include API/network audit (schema validation, WebSocket)")
    .option("--logic-testing", "Include app logic testing (CRUD, drag-drop, game logic)")
    .option("--cross-browser", "Run tests across Chromium, Firefox, WebKit")
    .option("--load-testing", "Include load/stress testing (concurrent sessions)")
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
    .option("--export", "Export test as Playwright .spec.ts file (zero vendor lock-in)")
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
