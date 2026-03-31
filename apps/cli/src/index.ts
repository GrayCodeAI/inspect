#!/usr/bin/env node

// ── Global Error Handlers ───────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error(`[FATAL] Unhandled promise rejection: ${message}`);
  if (stack) console.error(stack);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(`[FATAL] Uncaught exception: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});

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
import { registerFlowCommand } from "./commands/flow.js";
import { registerShowReportCommand } from "./commands/show-report.js";
import { registerShowTraceCommand } from "./commands/show-trace.js";
import { registerInstallCommand } from "./commands/install.js";
import { registerAliasCommand, expandAliases } from "./commands/alias.js";
import { registerEngineCommand } from "./commands/engine.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerCostCommand } from "./commands/cost.js";
import { registerTrailCommand } from "./commands/trail.js";
import { registerAutonomyCommand } from "./commands/autonomy.js";
import { registerPermissionsCommand } from "./commands/permissions.js";
import { registerRBACCommand } from "./commands/rbac.js";
import { registerTenantCommand } from "./commands/tenant.js";
import { registerSSOCommand } from "./commands/sso.js";
import { registerAcpAgentsCommand } from "./commands/acp-agents.js";
import { registerWatchCmdCommand } from "./commands/watch-cmd.js";
import { registerFlowCmdCommand } from "./commands/flow-cmd.js";

// Command group routers (organize subcommands under parent commands)
import { registerChaosGroupCommand } from "./commands/chaos-group.js";
import { registerEnterpriseGroupCommand } from "./commands/enterprise-group.js";
import { registerWorkflowGroupCommand } from "./commands/workflow-group.js";
import { registerGovernanceCommand } from "./commands/governance.js";
import { registerInfraCommand } from "./commands/infra.js";
import { registerQualityCommand } from "./commands/quality.js";
import { registerDataCommand } from "./commands/data.js";
import { registerDevCommand } from "./commands/dev.js";

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
  .addHelpText(
    "after",
    `
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
`,
  );

// ── Testing Commands ─────────────────────────────────────────────────────
registerTestCommand(program);
registerRunCommand(program);
registerPRCommand(program);
registerReplayCommand(program);
registerCompareCommand(program);
registerWatchCommand(program);
registerFlowCommand(program);

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
registerDashboardCommand(program);
registerCostCommand(program);
registerTunnelCommand(program);
registerSessionsCommand(program);
registerMCPCommand(program);
registerEngineCommand(program);

// ── Governance Commands ───────────────────────────────────────────────────
registerTrailCommand(program);
registerAutonomyCommand(program);
registerPermissionsCommand(program);

// ── Enterprise Commands ───────────────────────────────────────────────────
registerRBACCommand(program);
registerTenantCommand(program);
registerSSOCommand(program);

// ── Data & Workflow Commands ─────────────────────────────────────────────
registerExtractCommand(program);
registerWorkflowCommand(program);
registerCredentialsCommand(program);

// ── World-Class Features ──────────────────────────────────────────────────
import { registerCrawlCommand } from "./commands/crawl.js";
import { registerTrackCommand } from "./commands/track.js";
import { registerProxyCommand } from "./commands/proxy.js";
import { registerBenchmarkCommand } from "./commands/benchmark.js";
registerCrawlCommand(program);
registerTrackCommand(program);
registerProxyCommand(program);
registerBenchmarkCommand(program);

// ── Setup & Info Commands ────────────────────────────────────────────────
registerInstallCommand(program);
registerInitCommand(program);
registerDoctorCommand(program);
registerGenerateCommand(program);
registerAuditCommand(program);
registerShowReportCommand(program);
registerShowTraceCommand(program);
registerAliasCommand(program);

// ── ACP & Coding Agent Commands ─────────────────────────────────────────
registerAcpAgentsCommand(program);
registerWatchCmdCommand(program);
registerFlowCmdCommand(program);

// ── Command Groups (organize subcommands under parents) ──────────────────
registerChaosGroupCommand(program);
registerEnterpriseGroupCommand(program);
registerWorkflowGroupCommand(program);
registerGovernanceCommand(program);
registerInfraCommand(program);
registerQualityCommand(program);
registerDataCommand(program);
registerDevCommand(program);

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
    lines.push("");
    lines.push(`${chalk.hex("#a855f7").bold("  \u25c6 Available Device Presets")}`);
    lines.push("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = Object.entries(DEVICE_PRESETS) as [string, any][];
    const filtered = opts.category
      ? entries.filter(([, d]) => {
          if (opts.category === "mobile")
            return d.mobile && !d.name?.includes("iPad") && !d.name?.includes("Tab");
          if (opts.category === "tablet")
            return d.name?.includes("iPad") || d.name?.includes("Tab");
          if (opts.category === "desktop") return !d.mobile;
          return true;
        })
      : entries;
    for (const [key, device] of filtered) {
      const type = device.mobile ? (device.width > 500 ? "tablet" : "mobile") : "desktop";
      const typeColor = type === "mobile" ? "#22d3ee" : type === "tablet" ? "#f59e0b" : "#22c55e";
      lines.push(
        `  ${chalk.hex("#e2e8f0")(key.padEnd(25))} ${chalk.hex("#94a3b8")(`${String(device.width).padStart(4)}x${String(device.height).padEnd(4)}`)}  ${chalk.hex("#64748b")(`@${device.dpr}x`)}  ${chalk.hex(typeColor)(type)}`,
      );
    }
    lines.push("");
    lines.push(
      chalk.hex("#64748b")(
        `  ${filtered.length} device${filtered.length !== 1 ? "s" : ""} available`,
      ),
    );
    lines.push("");
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
    agentLines.push("");
    agentLines.push(chalk.hex("#a855f7").bold("  \u25c6 Available AI Providers & Models"));
    agentLines.push("");
    const byProvider = new Map<string, string[]>();
    const providerColors: Record<string, string> = {
      anthropic: "#f97316",
      claude: "#f97316",
      openai: "#22c55e",
      gpt: "#22c55e",
      google: "#f59e0b",
      gemini: "#f59e0b",
      deepseek: "#a855f7",
      ollama: "#22d3ee",
      opencode: "#6366f1",
    };
    for (const [id, model] of Object.entries(SUPPORTED_MODELS)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = model as any;
      const provider = m.provider ?? id.split("/")[0] ?? "unknown";
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      const vision = m.vision ? chalk.hex("#22d3ee")("vision") : chalk.hex("#475569")("      ");
      const thinking = m.thinking
        ? chalk.hex("#a855f7")("thinking")
        : chalk.hex("#475569")("        ");
      byProvider
        .get(provider)!
        .push(`  ${chalk.hex("#e2e8f0")(id.padEnd(35))} ${vision} ${thinking}`);
    }
    for (const [provider, models] of byProvider) {
      const color = providerColors[provider] ?? "#e2e8f0";
      agentLines.push(chalk.hex(color).bold(`  ${provider.toUpperCase()}`));
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
    modelLines.push("");
    modelLines.push(chalk.hex("#a855f7").bold("  \u25c6 Supported LLM Models"));
    modelLines.push("");
    modelLines.push(
      "  " +
        chalk.hex("#94a3b8")("Model".padEnd(35)) +
        chalk.hex("#94a3b8")("Provider".padEnd(12)) +
        chalk.hex("#94a3b8")("Vision  Thinking"),
    );
    modelLines.push(chalk.hex("#334155")("  " + "\u2500".repeat(70)));
    for (const [id, model] of Object.entries(SUPPORTED_MODELS)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = model as any;
      const provider = m.provider ?? id.split("/")[0] ?? "?";
      const providerColors: Record<string, string> = {
        anthropic: "#f97316",
        claude: "#f97316",
        openai: "#22c55e",
        gpt: "#22c55e",
        google: "#f59e0b",
        gemini: "#f59e0b",
        deepseek: "#a855f7",
        ollama: "#22d3ee",
        opencode: "#6366f1",
      };
      const pColor = providerColors[provider] ?? "#e2e8f0";
      const vision = m.vision ? chalk.hex("#22c55e")("yes") : chalk.hex("#475569")(" - ");
      const thinking = m.thinking ? chalk.hex("#a855f7")("yes") : chalk.hex("#475569")(" - ");
      modelLines.push(
        `  ${chalk.hex("#e2e8f0")(id.padEnd(35))} ${chalk.hex(pColor)(provider.padEnd(12))} ${vision}     ${thinking}`,
      );
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
  .addHelpText(
    "after",
    `
Examples:
  $ inspect completions bash >> ~/.bashrc
  $ inspect completions zsh >> ~/.zshrc
  $ inspect completions fish | source
  $ eval "$(inspect completions bash)"
`,
  )
  .action((shell: string) => {
    // dynamic import to avoid loading at startup
    import("./utils/completions.js").then(
      ({ generateBashCompletions, generateZshCompletions, generateFishCompletions }) => {
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
      },
    );
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
    console.log(
      'Run "inspect --help" for usage or "inspect test -m <instruction>" to start testing.\n',
    );
    if (isCI) {
      console.log(
        'Detected CI/agent environment. Use "inspect test" with flags for non-interactive mode.',
      );
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
