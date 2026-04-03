import type { Command } from "commander";
import chalk from "chalk";

export interface AgentListOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runAgentList(options: AgentListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Agent List\n"));

  try {
    const agents = [
      {
        id: "agent-001",
        name: "ui-agent",
        role: "ui-tester",
        model: "claude",
        status: "active",
        tasksCompleted: 47,
      },
      {
        id: "agent-002",
        name: "api-agent",
        role: "api-tester",
        model: "gpt-4",
        status: "active",
        tasksCompleted: 23,
      },
      {
        id: "agent-003",
        name: "security-agent",
        role: "security-tester",
        model: "claude",
        status: "idle",
        tasksCompleted: 12,
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ agents }, null, 2));
    } else {
      console.log(chalk.dim(`${agents.length} agent(s) found:\n`));
      for (const agent of agents) {
        const statusColor = agent.status === "active" ? chalk.green : chalk.yellow;
        console.log(`  ${chalk.cyan(agent.id)} ${statusColor(`[${agent.status}]`)}`);
        console.log(`  Name: ${agent.name}`);
        console.log(`  Role: ${chalk.dim(agent.role)}`);
        console.log(`  Model: ${chalk.dim(agent.model)}`);
        console.log(`  Tasks completed: ${chalk.dim(agent.tasksCompleted)}\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list agents: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerAgentListCommand(program: Command): void {
  program
    .command("agent:list")
    .description("List all agents")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect agent:list
  $ inspect agent:list --json
`,
    )
    .action(async (opts: AgentListOptions) => {
      await runAgentList(opts);
    });
}
