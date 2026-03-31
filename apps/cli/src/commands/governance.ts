/**
 * @inspect governance - Governance command group
 *
 * Subcommands:
 *   inspect governance audit      - Compliance auditing
 *   inspect governance trail      - Audit trail management
 *   inspect governance permissions - Permission management
 *   inspect governance autonomy   - Autonomous agent governance
 */
import type { Command } from "commander";

export function registerGovernanceCommand(program: Command): void {
  const governanceCmd = program
    .command("governance")
    .description("Governance commands (audit, trail, permissions, autonomy)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect governance audit --format pdf    Generate compliance audit
  $ inspect governance trail list            List audit trail
  $ inspect governance permissions list      List permissions
  $ inspect governance autonomy status       Check autonomy status
`,
    );

  // audit subcommand
  governanceCmd
    .command("audit [scope]")
    .description("Compliance auditing")
    .option("--format <format>", "Output format (json, pdf, csv)", "json")
    .option("--start <date>", "Start date")
    .option("--end <date>", "End date")
    .option("--output <path>", "Output file path")
    .action(async (_scope: string | undefined, _options) => {
      const { registerAuditCommand } = await import("./audit.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerAuditCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "audit"], { from: "user" });
    });

  // trail subcommand
  governanceCmd
    .command("trail <action>")
    .description("Audit trail management")
    .option("--run-id <id>", "Run ID")
    .option("--limit <n>", "Limit results", "50")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerTrailCommand } = await import("./trail.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerTrailCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "trail", action], { from: "user" });
    });

  // permissions subcommand
  governanceCmd
    .command("permissions <action>")
    .description("Permission management")
    .option("--role <role>", "Role name")
    .option("--resource <resource>", "Resource name")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerPermissionsCommand } = await import("./permissions.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerPermissionsCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "permissions", action], { from: "user" });
    });

  // autonomy subcommand
  governanceCmd
    .command("autonomy <action>")
    .description("Autonomous agent governance")
    .option("--level <level>", "Autonomy level (supervised, semi, full)")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerAutonomyCommand } = await import("./autonomy.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerAutonomyCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "autonomy", action], { from: "user" });
    });
}
