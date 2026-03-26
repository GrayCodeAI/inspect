#!/usr/bin/env node

import { Command } from "commander";
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
import { MainMenu } from "./tui/screens/MainMenu.js";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("inspect")
  .description("AI-Powered Browser Testing Platform")
  .version(VERSION, "-v, --version", "Display the current version");

// Register all commands
registerTestCommand(program);
registerPRCommand(program);
registerVisualCommand(program);
registerInitCommand(program);
registerDoctorCommand(program);
registerWorkflowCommand(program);
registerServeCommand(program);
registerMCPCommand(program);
registerExtractCommand(program);
registerCredentialsCommand(program);
registerA11yCommand(program);
registerLighthouseCommand(program);
registerChaosCommand(program);
registerSecurityCommand(program);
registerReplayCommand(program);
registerCompareCommand(program);
registerTunnelCommand(program);
registerRunCommand(program);
registerGenerateCommand(program);
registerSessionsCommand(program);
registerAuditCommand(program);

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
    console.log("\nAvailable Device Presets:\n");
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
      console.log(`  ${key.padEnd(25)} ${String(device.width).padStart(4)}x${String(device.height).padEnd(4)}  @${device.dpr}x  ${type}`);
    }
    console.log(`\n  ${filtered.length} device${filtered.length !== 1 ? "s" : ""} available\n`);
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
    console.log("\nAvailable AI Providers & Models:\n");
    const byProvider = new Map<string, string[]>();
    for (const [id, model] of Object.entries(SUPPORTED_MODELS)) {
      const m = model as any;
      const provider = m.provider ?? id.split("/")[0] ?? "unknown";
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(`  ${id.padEnd(35)} ${m.vision ? "vision" : "      "} ${m.thinking ? "thinking" : "        "}`);
    }
    for (const [provider, models] of byProvider) {
      console.log(`  ${provider.toUpperCase()}`);
      for (const line of models) console.log(line);
      console.log();
    }
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
    console.log("\nSupported LLM Models:\n");
    console.log("  " + "Model".padEnd(35) + "Provider".padEnd(12) + "Vision  Thinking");
    console.log("  " + "-".repeat(70));
    for (const [id, model] of Object.entries(SUPPORTED_MODELS)) {
      const m = model as any;
      const provider = m.provider ?? id.split("/")[0] ?? "?";
      console.log(`  ${id.padEnd(35)} ${provider.padEnd(12)} ${m.vision ? "yes" : " - "}     ${m.thinking ? "yes" : " - "}`);
    }
    console.log();
  });

// Default action: open TUI if no command provided
program.action(async () => {
  const { waitUntilExit } = render(React.createElement(MainMenu));
  await waitUntilExit();
});

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
