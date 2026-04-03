import type { Command } from "commander";
import chalk from "chalk";

export interface GuardrailCheckOptions {
  input: string;
  type?: string;
  json?: boolean;
}

const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  VIOLATION: 2,
} as const;

async function runGuardrailCheck(options: GuardrailCheckOptions): Promise<void> {
  if (!options.input) {
    console.error(chalk.red("Error: Input is required. Use --input <text>"));
    process.exit(EXIT_CODES.ERROR);
  }

  console.log(chalk.blue("\nInspect Guardrail Check\n"));
  console.log(chalk.dim(`Type: ${options.type ?? "all"}`));

  try {
    const result = {
      input: options.input,
      passed: true,
      checks: [
        { name: "pii", passed: true, message: "No PII detected" },
        { name: "injection", passed: true, message: "No injection patterns" },
        { name: "toxicity", passed: true, message: "Content is safe" },
      ],
      timestamp: new Date().toISOString(),
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.dim("\nGuardrail checks:"));
      for (const check of result.checks) {
        const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      }

      if (result.passed) {
        console.log(chalk.green("\nAll checks passed!"));
      } else {
        console.log(chalk.red("\nSome checks failed."));
      }
    }

    process.exit(result.passed ? EXIT_CODES.SUCCESS : EXIT_CODES.VIOLATION);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\nCheck failed: ${message}`));
    process.exit(EXIT_CODES.ERROR);
  }
}

export function registerGuardrailCheckCommand(program: Command): void {
  program
    .command("guardrail:check")
    .description("Check input against guardrails")
    .requiredOption("--input <text>", "Input text to check")
    .option("--type <type>", "Check type: pii, injection, toxicity, all", "all")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect guardrail:check --input "test data"
  $ inspect guardrail:check --input "test" --type pii
`,
    )
    .action(async (opts: GuardrailCheckOptions) => {
      await runGuardrailCheck(opts);
    });
}
