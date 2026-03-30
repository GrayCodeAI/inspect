import type { Command } from "commander";
import chalk from "chalk";

export interface AutonomyOptions {
  level?: string;
  maxCost?: string;
  maxSteps?: string;
  json?: boolean;
}

async function manageAutonomy(options: AutonomyOptions): Promise<void> {
  const { AutonomyManager, AutonomyLevel } = await import("@inspect/agent");

  const levelMap: Record<string, number> = {
    augmentation: AutonomyLevel.AUGMENTATION,
    supervision: AutonomyLevel.SUPERVISION,
    delegation: AutonomyLevel.DELEGATION,
    autonomy: AutonomyLevel.AUTONOMY,
  };

  const levelNames: Record<number, string> = {
    [AutonomyLevel.AUGMENTATION]: "AUGMENTATION",
    [AutonomyLevel.SUPERVISION]: "SUPERVISION",
    [AutonomyLevel.DELEGATION]: "DELEGATION",
    [AutonomyLevel.AUTONOMY]: "AUTONOMY",
  };

  if (options.level) {
    const levelValue = levelMap[options.level.toLowerCase()];
    if (levelValue === undefined) {
      console.error(chalk.red(`Invalid level: ${options.level}`));
      console.error(chalk.dim("Valid levels: augmentation, supervision, delegation, autonomy"));
      process.exit(1);
    }

    const manager = new AutonomyManager({
      level: levelValue,
      ...(options.maxCost ? { maxCostPerSession: parseFloat(options.maxCost) } : {}),
      ...(options.maxSteps ? { maxStepsPerSession: parseInt(options.maxSteps, 10) } : {}),
    });

    const config = manager.getConfig();
    console.log(
      chalk.green(
        `\nAutonomy level set to: ${chalk.bold(levelNames[config.level].toUpperCase())}\n`,
      ),
    );
    console.log(`  Max cost/session:  $${config.maxCostPerSession.toFixed(2)}`);
    console.log(`  Max steps/session: ${config.maxStepsPerSession}`);
    return;
  }

  // Show current config
  const manager = new AutonomyManager();
  const config = manager.getConfig();

  if (options.json) {
    console.log(JSON.stringify({ ...config, levelName: levelNames[config.level] }, null, 2));
    return;
  }

  console.log(chalk.blue("\nAgent Autonomy Configuration\n"));
  console.log(
    `  Level:              ${chalk.bold(levelNames[config.level] ?? `Level ${config.level}`)}`,
  );
  console.log(`  Max cost/session:   $${config.maxCostPerSession.toFixed(2)}`);
  console.log(`  Max steps/session:  ${config.maxStepsPerSession}`);
  console.log(
    `  Approval required:  ${config.requireApprovalFor.length > 0 ? config.requireApprovalFor.join(", ") : "none"}`,
  );
  console.log(chalk.dim("\n  Auto-escalation:"));
  console.log(chalk.dim(`    On failure count:  ${config.autoEscalate.onFailureCount}`));
  console.log(
    chalk.dim(`    On cost threshold: $${config.autoEscalate.onCostThreshold.toFixed(2)}`),
  );
  console.log(
    chalk.dim(`    On sensitive:      ${config.autoEscalate.onSensitiveAction ? "yes" : "no"}`),
  );
  console.log();
  console.log(chalk.dim("  Levels:"));
  console.log(chalk.dim("    augmentation  — Agent suggests, human approves every action"));
  console.log(chalk.dim("    supervision   — Agent acts, human monitors, can intervene"));
  console.log(chalk.dim("    delegation    — Agent acts independently, reports results"));
  console.log(chalk.dim("    autonomy      — Agent acts independently, only reports failures"));
  console.log();
}

export function registerAutonomyCommand(program: Command): void {
  program
    .command("autonomy")
    .description("Manage agent autonomy level")
    .option(
      "-l, --level <level>",
      "Set autonomy level (augmentation, supervision, delegation, autonomy)",
    )
    .option("--max-cost <amount>", "Max USD cost per session")
    .option("--max-steps <n>", "Max steps per session")
    .option("--json", "Output as JSON")
    .action(async (opts: AutonomyOptions) => {
      try {
        await manageAutonomy(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
