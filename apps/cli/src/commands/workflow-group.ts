/**
 * @inspect workflow - Workflow automation command group
 *
 * Subcommands:
 *   inspect workflow run - Run workflow definitions
 *   inspect workflow mcp - MCP server management
 */
import type { Command } from "commander";

export function registerWorkflowGroupCommand(program: Command): void {
  const workflowCmd = program
    .command("workflow")
    .description("Workflow automation (run, mcp)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect workflow run automation.yaml
  $ inspect workflow mcp start --port 3000
`,
    );

  // run subcommand
  workflowCmd
    .command("run <file>")
    .description("Run workflow definition")
    .option("--env <env>", "Environment variables")
    .option("--dry-run", "Validate without executing")
    .option("--verbose", "Verbose output")
    .action(async (file: string, _options) => {
      const { registerWorkflowCommand } = await import("./workflow.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerWorkflowCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "workflow", file], { from: "user" });
    });

  // mcp subcommand
  workflowCmd
    .command("mcp <action>")
    .description("Model Context Protocol server")
    .option("--port <port>", "Server port", "3000")
    .option("--transport <transport>", "Transport type (stdio, http)", "stdio")
    .action(async (action: string, _options) => {
      const { registerMCPCommand } = await import("./mcp-cmd.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerMCPCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "mcp", action], { from: "user" });
    });
}
