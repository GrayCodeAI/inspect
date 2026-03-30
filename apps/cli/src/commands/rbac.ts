import type { Command } from "commander";
import chalk from "chalk";

export interface RBACOptions {
  role?: string;
  json?: boolean;
}

async function manageRBAC(options: RBACOptions): Promise<void> {
  const { RBACManager, Role } = await import("@inspect/enterprise");
  const manager = new RBACManager();

  if (options.role) {
    const validRoles = Object.values(Role);
    const roleValue = options.role.toLowerCase() as (typeof validRoles)[number];
    if (!validRoles.includes(roleValue)) {
      console.error(chalk.red(`Invalid role: ${options.role}`));
      console.error(chalk.dim(`Valid roles: ${validRoles.join(", ")}`));
      process.exit(1);
    }

    const policy = manager.getPolicy(roleValue);
    if (!policy) {
      console.error(chalk.red(`No policy found for role: ${options.role}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(policy, null, 2));
      return;
    }

    console.log(chalk.blue(`\nRBAC Policy: ${chalk.bold(roleValue.toUpperCase())}\n`));
    console.log(chalk.bold("  Permissions:"));
    for (const p of policy.permissions) {
      console.log(chalk.green(`    ${p.resource}: ${p.actions.join(", ")}`));
    }
    console.log(chalk.bold("\n  Allowed Commands:"));
    console.log(chalk.dim(`    ${policy.allowedCommands.join(", ")}`));
    console.log(chalk.bold("\n  Allowed Providers:"));
    console.log(chalk.dim(`    ${policy.allowedProviders.join(", ")}`));
    console.log(chalk.dim(`\n  Max concurrent tests: ${policy.maxConcurrentTests}`));
    console.log(chalk.dim(`  Cost budget: $${policy.costBudget}`));
    console.log();
    return;
  }

  // Show all roles
  console.log(chalk.blue("\nRBAC Roles\n"));
  for (const roleValue of Object.values(Role)) {
    const policy = manager.getPolicy(roleValue);
    if (!policy) continue;
    console.log(chalk.bold(`  ${roleValue.toUpperCase()}`));
    console.log(
      chalk.dim(
        `    Commands: ${policy.allowedCommands.slice(0, 5).join(", ")}${policy.allowedCommands.length > 5 ? "..." : ""}`,
      ),
    );
    console.log(
      chalk.dim(`    Max tests: ${policy.maxConcurrentTests}  Budget: $${policy.costBudget}`),
    );
    console.log();
  }
}

export function registerRBACCommand(program: Command): void {
  program
    .command("rbac")
    .description("Manage role-based access control")
    .option(
      "-r, --role <role>",
      "Show policy for specific role (viewer, tester, admin, security, super_admin)",
    )
    .option("--json", "Output as JSON")
    .action(async (opts: RBACOptions) => {
      try {
        await manageRBAC(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
