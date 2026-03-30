import type { Command } from "commander";
import chalk from "chalk";

export interface PermissionsOptions {
  allowDomain?: string[];
  blockDomain?: string[];
  allowAction?: string[];
  blockAction?: string;
  json?: boolean;
}

async function managePermissions(options: PermissionsOptions): Promise<void> {
  const { PermissionManager } = await import("@inspect/agent");

  // Build custom permissions from options
  const perms: Record<string, unknown> = {};

  if (options.allowDomain) {
    perms.allowedDomains = options.allowDomain;
  }

  if (options.blockDomain) {
    perms.blockedDomains = options.blockDomain;
  }

  if (options.allowAction) {
    perms.allowedActions = options.allowAction;
  }

  if (options.blockAction) {
    perms.blockedActions = [options.blockAction];
  }

  const manager = new PermissionManager(perms);

  if (options.json) {
    console.log(JSON.stringify(manager.getPermissions(), null, 2));
    return;
  }

  const permissions = manager.getPermissions();

  console.log(chalk.blue("\nAgent Permissions\n"));
  console.log(chalk.bold("  Allowed Domains:"));
  for (const d of permissions.allowedDomains) {
    console.log(chalk.green(`    ${d}`));
  }
  if (permissions.blockedDomains.length > 0) {
    console.log(chalk.bold("\n  Blocked Domains:"));
    for (const d of permissions.blockedDomains) {
      console.log(chalk.red(`    ${d}`));
    }
  }
  console.log(chalk.bold("\n  Allowed Actions:"));
  for (const a of permissions.allowedActions) {
    console.log(chalk.green(`    ${a}`));
  }
  if (permissions.blockedActions.length > 0) {
    console.log(chalk.bold("\n  Blocked Actions:"));
    for (const a of permissions.blockedActions) {
      console.log(chalk.red(`    ${a}`));
    }
  }
  console.log(
    chalk.dim(`\n  Max file upload: ${(permissions.maxFileUploadSize / 1024 / 1024).toFixed(0)}MB`),
  );
  console.log(
    chalk.dim(`  Form submission: ${permissions.allowFormSubmission ? "allowed" : "blocked"}`),
  );
  console.log(
    chalk.dim(`  Navigation:      ${permissions.allowNavigation ? "allowed" : "blocked"}`),
  );
  console.log(
    chalk.dim(`  JavaScript:      ${permissions.allowJavaScript ? "allowed" : "blocked"}`),
  );
  console.log(
    chalk.dim(`  Downloads:       ${permissions.allowDownloads ? "allowed" : "blocked"}`),
  );
  console.log(chalk.dim(`  Cookies:         ${permissions.allowCookies ? "allowed" : "blocked"}`));
  console.log();
}

export function registerPermissionsCommand(program: Command): void {
  program
    .command("permissions")
    .description("Manage agent permissions (domains, actions)")
    .option("--allow-domain <domain...>", "Allow a domain")
    .option("--block-domain <domain...>", "Block a domain")
    .option("--allow-action <action...>", "Allow an action type")
    .option("--block-action <action>", "Block an action type")
    .option("--json", "Output as JSON")
    .action(async (opts: PermissionsOptions) => {
      try {
        await managePermissions(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
