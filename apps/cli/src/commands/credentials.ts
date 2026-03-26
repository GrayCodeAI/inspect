import type { Command } from "commander";
import chalk from "chalk";

export interface CredentialsOptions {
  provider?: string;
  name?: string;
  domain?: string;
  type?: string;
}

async function runCredentials(action: string, options: CredentialsOptions): Promise<void> {
  const { CredentialVault } = await import("@inspect/credentials");
  const vault = new CredentialVault();

  switch (action) {
    case "list": {
      console.log(chalk.blue("\nStored Credentials\n"));
      const credentials = vault.list();
      if (credentials.length === 0) {
        console.log(chalk.dim("  No credentials stored."));
        console.log(chalk.dim('  Use "inspect credentials add --name <name> --domain <domain>" to add one.'));
      } else {
        console.log(
          "  " +
            "Name".padEnd(25) +
            "Domain".padEnd(30) +
            "Provider".padEnd(15) +
            "Type",
        );
        console.log("  " + "-".repeat(80));
        for (const cred of credentials) {
          console.log(
            `  ${String(cred.label ?? cred.id).padEnd(25)} ${String(cred.domain ?? "-").padEnd(30)} ${String(cred.provider ?? "native").padEnd(15)} ${String(cred.type ?? "password")}`,
          );
        }
      }
      console.log(`\n  ${credentials.length} credential${credentials.length !== 1 ? "s" : ""}\n`);
      break;
    }

    case "add": {
      if (!options.name) {
        console.error(chalk.red("Error: --name is required when adding credentials."));
        process.exit(1);
      }

      const provider = (options.provider ?? "native") as "native" | "bitwarden" | "1password" | "azure-key-vault" | "custom-http";
      const type = (options.type ?? "password") as "password" | "api-key" | "oauth" | "totp" | "certificate";

      console.log(chalk.blue(`\nAdding credential: ${options.name}\n`));

      try {
        const config = vault.create({
          provider,
          type,
          label: options.name,
          domain: options.domain,
          data: {},
        });
        console.log(chalk.green(`Credential "${options.name}" created successfully.`));
        console.log(chalk.dim(`  ID: ${config.id}`));
        console.log(chalk.dim(`  Provider: ${provider}`));
        console.log(chalk.dim(`  Type: ${type}`));
        if (options.domain) console.log(chalk.dim(`  Domain: ${options.domain}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to create credential: ${msg}`));
        process.exit(1);
      }
      break;
    }

    case "remove": {
      if (!options.name) {
        console.error(chalk.red("Error: --name is required when removing credentials."));
        process.exit(1);
      }

      console.log(chalk.dim(`Removing credential: ${options.name}`));
      try {
        // Find credential by label or ID
        const allCreds = vault.list();
        const match = allCreds.find(
          (c) => c.label === options.name || c.id === options.name || c.id.startsWith(options.name!),
        );
        if (match) {
          vault.delete(match.id);
          console.log(chalk.green(`Credential "${options.name}" removed.`));
        } else {
          console.log(chalk.yellow(`Credential "${options.name}" not found.`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Failed to remove credential: ${msg}`));
        process.exit(1);
      }
      break;
    }

    case "test": {
      if (!options.name) {
        console.error(chalk.red("Error: --name is required when testing credentials."));
        process.exit(1);
      }

      console.log(chalk.dim(`Testing credential: ${options.name}`));
      try {
        // Find credential by label or ID
        const allCreds = vault.list();
        const match = allCreds.find(
          (c) => c.label === options.name || c.id === options.name || c.id.startsWith(options.name!),
        );
        if (!match) {
          console.error(chalk.red(`Credential "${options.name}" not found.`));
          process.exit(1);
        }
        const result = await vault.test(match.id);
        if (result.success) {
          console.log(chalk.green(`\nCredential "${options.name}" is valid.`));
          console.log(chalk.dim(`  ${result.message}`));
        } else {
          console.log(chalk.red(`\nCredential "${options.name}" test failed.`));
          console.log(chalk.dim(`  ${result.message}`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Test error: ${msg}`));
        process.exit(1);
      }
      break;
    }

    default:
      console.error(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.dim("Available actions: add, remove, list, test"));
      process.exit(1);
  }
}

export function registerCredentialsCommand(program: Command): void {
  program
    .command("credentials")
    .description("Manage stored credentials for authenticated testing")
    .argument("<action>", "add | remove | list | test")
    .option("--provider <provider>", "Credential provider: native, bitwarden, 1password, azure-key-vault, custom-http", "native")
    .option("--name <name>", "Credential name/label")
    .option("--domain <domain>", "Domain the credential is for")
    .option("--type <type>", "Credential type: password, api-key, oauth, totp, certificate", "password")
    .action(async (action: string, opts: CredentialsOptions) => {
      await runCredentials(action, opts);
    });
}
