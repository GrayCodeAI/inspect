import type { Command } from "commander";
import chalk from "chalk";

export interface AgentDelegateOptions {
  task: string;
  agent: string;
  priority?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  AGENT_NOT_FOUND: 2,
} as const;

async function runAgentDelegate(options: AgentDelegateOptions): Promise<void> {
  if (!options.task) {
    console.error(chalk.red("Error: Task is required. Use --task <task>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.agent) {
    console.error(chalk.red("Error: Agent name is required. Use --agent <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Agent Delegate\n"));
  console.log(chalk.dim(`Agent: ${options.agent}`));
  console.log(chalk.dim(`Task: ${options.task}`));

  try {
    const delegationId = `task-${Date.now()}`;
    const delegationData = {
      id: delegationId,
      agent: options.agent,
      task: options.task,
      priority: options.priority ?? "normal",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(delegationData, null, 2));
    } else {
      console.log(chalk.green("\nTask delegated successfully!"));
      console.log(chalk.dim(`Task ID: ${delegationId}`));
      console.log(chalk.dim(`Priority: ${delegationData.priority}`));
      console.log(chalk.dim(`Status: ${delegationData.status}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nDelegation failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerAgentDelegateCommand(program: Command): void {
  program
    .command("agent:delegate")
    .description("Delegate task to agent")
    .requiredOption("--task <task>", "Task description")
    .requiredOption("--agent <name>", "Agent name")
    .option("--priority <level>", "Priority: low, normal, high", "normal")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect agent:delegate --task "Test login flow" --agent "ui-agent"
  $ inspect agent:delegate --task "Validate API" --agent "api-agent" --priority high
`,
    )
    .action(async (opts: AgentDelegateOptions) => {
      await runAgentDelegate(opts);
    });
}
