import type { Command } from "commander";
import chalk from "chalk";

export interface GuardrailListOptions {
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
} as const;

async function runGuardrailList(options: GuardrailListOptions): Promise<void> {
  console.log(chalk.blue("\nInspect Guardrail List\n"));

  try {
    const guardrails = [
      {
        id: "pii",
        name: "PII Detection",
        description: "Detects personally identifiable information",
        enabled: true,
      },
      {
        id: "injection",
        name: "Injection Prevention",
        description: "Prevents code injection attempts",
        enabled: true,
      },
      {
        id: "toxicity",
        name: "Content Safety",
        description: "Detects toxic or harmful content",
        enabled: true,
      },
      {
        id: "rate-limit",
        name: "Rate Limiting",
        description: "Limits request frequency",
        enabled: false,
      },
    ];

    if (options.json) {
      console.log(JSON.stringify({ guardrails }, null, 2));
    } else {
      console.log(chalk.dim(`${guardrails.length} guardrail(s):\n`));
      for (const guardrail of guardrails) {
        const statusColor = guardrail.enabled ? chalk.green : chalk.gray;
        console.log(
          `  ${chalk.cyan(guardrail.id)} ${statusColor(`[${guardrail.enabled ? "enabled" : "disabled"}]`)}`,
        );
        console.log(`  Name: ${guardrail.name}`);
        console.log(`  Description: ${chalk.dim(guardrail.description)}\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nFailed to list guardrails: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerGuardrailListCommand(program: Command): void {
  program
    .command("guardrail:list")
    .description("List active guardrails")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect guardrail:list
  $ inspect guardrail:list --json
`,
    )
    .action(async (opts: GuardrailListOptions) => {
      await runGuardrailList(opts);
    });
}
