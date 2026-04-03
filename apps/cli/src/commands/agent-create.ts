import type { Command } from "commander";
import chalk from "chalk";

export interface AgentCreateOptions {
  name: string;
  role: string;
  model?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runAgentCreate(options: AgentCreateOptions): Promise<void> {
  if (!options.name) {
    console.error(chalk.red("Error: Name is required. Use --name <name>"));
    process.exit(EXIT_CODES.ERROR);
  }

  if (!options.role) {
    console.error(chalk.red("Error: Role is required. Use --role <role>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Agent Create\n"));
  console.log(chalk.dim(`Name: ${options.name}`));
  console.log(chalk.dim(`Role: ${options.role}`));

  try {
    const agentId = `agent-${Date.now()}`;
    const agentData = {
      id: agentId,
      name: options.name,
      role: options.role,
      model: options.model ?? "claude",
      createdAt: new Date().toISOString(),
      status: "active",
    };

    if (options.json) {
      console.log(JSON.stringify(agentData, null, 2));
    } else {
      console.log(chalk.green("\nAgent created successfully!"));
      console.log(chalk.dim(`Agent ID: ${agentId}`));
      console.log(chalk.dim(`Model: ${agentData.model}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to create agent: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerAgentCreateCommand(program: Command): void {
  program
    .command("agent:create")
    .description("Create specialist agent")
    .requiredOption("--name <name>", "Agent name")
    .requiredOption("--role <role>", "Agent role (e.g., ui-tester, api-tester)")
    .option("--model <model>", "LLM model to use", "claude")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect agent:create --name "ui-agent" --role "ui-tester"
  $ inspect agent:create --name "api-agent" --role "api-tester" --model gpt-4
`,
    )
    .action(async (opts: AgentCreateOptions) => {
      await runAgentCreate(opts);
    });
}
