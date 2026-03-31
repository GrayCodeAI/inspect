/**
 * @inspect quality - Quality assurance command group
 *
 * Subcommands:
 *   inspect quality a11y <url>      - Accessibility audit
 *   inspect quality lighthouse <url> - Lighthouse performance audit
 *   inspect quality visual <cmd>    - Visual regression testing
 *   inspect quality security <url>  - Security scanning
 */
import type { Command } from "commander";

export function registerQualityCommand(program: Command): void {
  const qualityCmd = program
    .command("quality")
    .description("Quality assurance commands (a11y, lighthouse, visual, security)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect quality a11y https://example.com          Run accessibility audit
  $ inspect quality lighthouse https://example.com    Run Lighthouse audit
  $ inspect quality visual compare before.png after.png  Visual regression
  $ inspect quality security https://example.com      Security scan
`,
    );

  // a11y subcommand
  qualityCmd
    .command("a11y <url>")
    .description("Run accessibility audit")
    .option(
      "--standard <standard>",
      "WCAG standard (2.0-A, 2.0-AA, 2.1-A, 2.1-AA, 2.2-AA)",
      "wcag21aa",
    )
    .option("--include <tags>", "Include rules by tags (comma-separated)")
    .option("--exclude <tags>", "Exclude rules by tags (comma-separated)")
    .option("--reporter <reporter>", "Reporter format (cli, json, html)", "cli")
    .option("--output <path>", "Output file path")
    .option("--headed", "Run in headed mode")
    .option("--json", "Output as JSON")
    .action(async (url: string, _options) => {
      const { registerA11yCommand } = await import("./a11y.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerA11yCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "a11y", url], { from: "user" });
    });

  // lighthouse subcommand
  qualityCmd
    .command("lighthouse <url>")
    .description("Run Lighthouse performance audit")
    .option(
      "--categories <cats>",
      "Categories to audit (comma-separated: perf,a11y,best-practices,seo)",
    )
    .option("--device <device>", "Device type (mobile, desktop)", "mobile")
    .option("--output <format>", "Output format (json, html, cli)", "cli")
    .option("--output-path <path>", "Output file path")
    .option("--headed", "Run in headed mode")
    .option("--json", "Output as JSON")
    .action(async (url: string, _options) => {
      const { registerLighthouseCommand } = await import("./lighthouse.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerLighthouseCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "lighthouse", url], { from: "user" });
    });

  // visual subcommand
  qualityCmd
    .command("visual <action> [args...]")
    .description("Visual regression testing")
    .option("--threshold <number>", "Diff threshold (0-1)", "0.1")
    .option("--output <path>", "Output directory")
    .option("--json", "Output as JSON")
    .action(async (action: string, args: string[], _options) => {
      // Delegate to visual command with reconstructed args
      const visualArgs = [action, ...args];
      const { registerVisualCommand } = await import("./visual.js");
      // Create a temporary program to handle visual command
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerVisualCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "visual", ...visualArgs], { from: "user" });
    });

  // security subcommand
  qualityCmd
    .command("security [url]")
    .description("Run security scan")
    .option("--scanner <scanner>", "Scanner to use (nuclei, zap, both)", "nuclei")
    .option("--templates <path>", "Custom templates path")
    .option("--severity <level>", "Minimum severity (info, low, medium, high, critical)", "medium")
    .option("--output <path>", "Output file path")
    .option("--rate-limit <rate>", "Rate limit (requests/sec)", "100")
    .option("--reporter <reporter>", "Reporter format (cli, json, sarif)", "cli")
    .option("--json", "Output as JSON")
    .action(async (url: string | undefined, _options) => {
      const { registerSecurityCommand } = await import("./security.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerSecurityCommand(tempProgram);
      const args = url ? [url] : [];
      await tempProgram.parseAsync(["node", "inspect", "security", ...args], { from: "user" });
    });
}
