#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { render } from "ink";
import React from "react";
import { registerTestCommand } from "./commands/test.js";
import { registerPRCommand } from "./commands/pr.js";
import { registerVisualCommand } from "./commands/visual.js";
import { registerInitCommand } from "./commands/init.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerWorkflowCommand } from "./commands/workflow.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerMCPCommand } from "./commands/mcp-cmd.js";
import { registerExtractCommand } from "./commands/extract.js";
import { registerCredentialsCommand } from "./commands/credentials.js";
import { registerA11yCommand } from "./commands/a11y.js";
import { registerLighthouseCommand } from "./commands/lighthouse.js";
import { registerChaosCommand } from "./commands/chaos.js";
import { registerSecurityCommand } from "./commands/security.js";
import { registerReplayCommand } from "./commands/replay.js";
import { registerCompareCommand } from "./commands/compare.js";
import { registerTunnelCommand } from "./commands/tunnel.js";
import { registerRunCommand } from "./commands/run.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerSessionsCommand } from "./commands/sessions.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerOpenCommand } from "./commands/open.js";
import { registerScreenshotCommand } from "./commands/screenshot.js";
import { registerPDFCommand } from "./commands/pdf.js";
import { registerCodegenCommand } from "./commands/codegen.js";
import { registerWatchCommand } from "./commands/watch.js";
import { registerShowReportCommand } from "./commands/show-report.js";
import { registerShowTraceCommand } from "./commands/show-trace.js";
import { registerInstallCommand } from "./commands/install.js";
import { registerAliasCommand, expandAliases } from "./commands/alias.js";
import { registerEngineCommand } from "./commands/engine.js";

const VERSION = "0.1.0";

function getVersionString(): string {
  const nodeVersion = process.version;
  const platform = process.platform;
  const arch = process.arch;
  return `inspect v${VERSION} (node ${nodeVersion}, ${platform} ${arch})`;
}

const program = new Command();

program
  .name("inspect")
  .description("AI-Powered Browser Testing Platform")
  .version(getVersionString(), "-v, --version", "Display version with environment info")
  .option("--verbose", "Enable verbose output across all commands")
  .option("--config <path>", "Path to config file (default: auto-detected)")
  .addHelpText("after", `
Examples:
  $ inspect                                      Launch interactive TUI
  $ inspect test -m "test login flow" --url https://myapp.com
  $ inspect test -m "checkout works" --agent gemini --headed
  $ inspect test --target branch --a11y           Test branch changes with a11y audit
  $ inspect run tests/login.yaml                  Run a YAML test definition
  $ inspect pr owner/repo#123                     Test a GitHub PR's preview URL
  $ inspect doctor                                Check environment setup
  $ inspect init --template comprehensive         Generate config file
  $ inspect visual compare before.png after.png   Visual regression comparison
  $ inspect a11y https://example.com              Run accessibility audit
  $ inspect lighthouse https://example.com        Run Lighthouse audit

Environment Variables:
  ANTHROPIC_API_KEY    Claude API key
  OPENAI_API_KEY       OpenAI/GPT API key
  GOOGLE_AI_KEY        Google Gemini API key
  DEEPSEEK_API_KEY     DeepSeek API key
  INSPECT_LOG_LEVEL    Log level (debug/info/warn/error)
  INSPECT_TELEMETRY    Set to "false" to disable telemetry

Documentation:
  https://github.com/nichochar/inspect
`);

// ── Testing Commands ─────────────────────────────────────────────────────
registerTestCommand(program);
registerRunCommand(program);
registerPRCommand(program);
registerReplayCommand(program);
registerCompareCommand(program);
registerWatchCommand(program);

// ── Browser Commands ────────────────────────────────────────────────────
registerOpenCommand(program);
registerScreenshotCommand(program);
registerPDFCommand(program);
registerCodegenCommand(program);

// ── Quality Commands ─────────────────────────────────────────────────────
registerA11yCommand(program);
registerLighthouseCommand(program);
registerSecurityCommand(program);
registerChaosCommand(program);
registerVisualCommand(program);

// ── Infrastructure Commands ──────────────────────────────────────────────
registerServeCommand(program);
registerTunnelCommand(program);
registerSessionsCommand(program);
registerMCPCommand(program);
registerEngineCommand(program);

// ── Data & Workflow Commands ─────────────────────────────────────────────
registerExtractCommand(program);
registerWorkflowCommand(program);
registerCredentialsCommand(program);

// ── Setup & Info Commands ────────────────────────────────────────────────
registerInstallCommand(program);
registerInitCommand(program);
registerDoctorCommand(program);
registerGenerateCommand(program);
registerAuditCommand(program);
registerShowReportCommand(program);
registerShowTraceCommand(program);
registerAliasCommand(program);

// Inline utility commands (no external deps needed)
program
  .command("devices")
  .description("List available device presets")
  .option("--json", "Output as JSON")
  .option("--category <cat>", "Filter by category: mobile, tablet, desktop")
  .action(async (opts) => {
    const { DEVICE_PRESETS } = await import("@inspect/shared");
    if (opts.json) {
      console.log(JSON.stringify(DEVICE_PRESETS, null, 2));
      return;
    }
    const lines: string[] = [];
    lines.push("\nAvailable Device Presets:\n");
    const entries = Object.entries(DEVICE_PRESETS) as [string, any][];
    const filtered = opts.category
      ? entries.filter(([, d]) => {
          if (opts.category === "mobile") return d.mobile && !d.name?.includes("iPad") && !d.name?.includes("Tab");
          if (opts.category === "tablet") return d.name?.includes("iPad") || d.name?.includes("Tab");
          if (opts.category === "desktop") return !d.mobile;
          return true;
        })
      : entries;
    for (const [key, device] of filtered) {
      const type = device.mobile ? (device.width > 500 ? "tablet" : "mobile") : "desktop";
      lines.push(`  ${key.padEnd(25)} ${String(device.width).padStart(4)}x${String(device.height).padEnd(4)}  @${device.dpr}x  ${type}`);
    }
    lines.push(`\n  ${filtered.length} device${filtered.length !== 1 ? "s" : ""} available\n`);
    const output = lines.join("\n");
    const { pipeToPager } = await import("./utils/pager.js");
    pipeToPager(output);
  });

program
  .command("agents")
  .description("List available AI agents and models")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { SUPPORTED_MODELS } = await import("@inspect/shared");
    if (opts.json) {
      console.log(JSON.stringify(SUPPORTED_MODELS, null, 2));
      return;
    }
    const agentLines: string[] = [];
    agentLines.push("\nAvailable AI Providers & Models:\n");
    const byProvider = new Map<string, string[]>();
    for (const [id, model] of Object.entries(SUPPORTED_MODELS)) {
      const m = model as any;
      const provider = m.provider ?? id.split("/")[0] ?? "unknown";
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(`  ${id.padEnd(35)} ${m.vision ? "vision" : "      "} ${m.thinking ? "thinking" : "        "}`);
    }
    for (const [provider, models] of byProvider) {
      agentLines.push(`  ${provider.toUpperCase()}`);
      for (const line of models) agentLines.push(line);
      agentLines.push("");
    }
    const agentOutput = agentLines.join("\n");
    const { pipeToPager: pagerAgents } = await import("./utils/pager.js");
    pagerAgents(agentOutput);
  });

program
  .command("models")
  .description("List available LLM models and their capabilities")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { SUPPORTED_MODELS } = await import("@inspect/shared");
    if (opts.json) {
      console.log(JSON.stringify(SUPPORTED_MODELS, null, 2));
      return;
    }
    const modelLines: string[] = [];
    modelLines.push("\nSupported LLM Models:\n");
    modelLines.push("  " + "Model".padEnd(35) + "Provider".padEnd(12) + "Vision  Thinking");
    modelLines.push("  " + "-".repeat(70));
    for (const [id, model] of Object.entries(SUPPORTED_MODELS)) {
      const m = model as any;
      const provider = m.provider ?? id.split("/")[0] ?? "?";
      modelLines.push(`  ${id.padEnd(35)} ${provider.padEnd(12)} ${m.vision ? "yes" : " - "}     ${m.thinking ? "yes" : " - "}`);
    }
    modelLines.push("");
    const modelOutput = modelLines.join("\n");
    const { pipeToPager: pagerModels } = await import("./utils/pager.js");
    pagerModels(modelOutput);
  });

program
  .command("completions")
  .description("Generate shell completion scripts")
  .argument("<shell>", "Shell type: bash, zsh, or fish")
  .addHelpText("after", `
Examples:
  $ inspect completions bash >> ~/.bashrc
  $ inspect completions zsh >> ~/.zshrc
  $ inspect completions fish | source
  $ eval "$(inspect completions bash)"
`)
  .action((shell: string) => {
    // dynamic import to avoid loading at startup
    import("./utils/completions.js").then(({ generateBashCompletions, generateZshCompletions, generateFishCompletions }) => {
      switch (shell.toLowerCase()) {
        case "bash":
          process.stdout.write(generateBashCompletions());
          break;
        case "zsh":
          process.stdout.write(generateZshCompletions());
          break;
        case "fish":
          process.stdout.write(generateFishCompletions());
          break;
        default:
          console.error(`Unknown shell: "${shell}". Use bash, zsh, or fish.`);
          process.exit(1);
      }
    });
  });

// Default action: detect interactive vs headless mode
program.action(async () => {
  // Detect if running in a non-interactive / CI / agent environment
  const isTTY = process.stdin.isTTY;
  const isCI = !!(
    process.env.CI ||
    process.env.CLAUDECODE ||
    process.env.CURSOR_AGENT ||
    process.env.CODEX_CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.JENKINS_URL ||
    process.env.BUILDKITE ||
    process.env.CIRCLECI ||
    process.env.TF_BUILD
  );

  if (!isTTY || isCI) {
    // Headless mode — print summary and usage hint instead of launching TUI
    console.log(`inspect v${VERSION} — AI-Powered Browser Testing\n`);
    console.log('Run "inspect --help" for usage or "inspect test -m <instruction>" to start testing.\n');
    if (isCI) {
      console.log("Detected CI/agent environment. Use \"inspect test\" with flags for non-interactive mode.");
    }
    return;
  }

  // Start update check in background (non-blocking)
  const updatePromise = import("./utils/update-check.js")
    .then(({ checkForUpdate }) => checkForUpdate())
    .catch(() => null);

  // Interactive REPL (like Claude Code)
  const { Repl } = await import("./tui/Repl.js");
  const { waitUntilExit } = render(React.createElement(Repl), { exitOnCtrlC: false });
  await waitUntilExit();

  // Show update message after TUI exits
  const updateMsg = await updatePromise;
  if (updateMsg) {
    console.log(chalk.yellow(`\n${updateMsg}\n`));
  }
});

const expandedArgv = expandAliases(process.argv);
program.parseAsync(expandedArgv).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
