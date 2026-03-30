import type { Command } from "commander";
import chalk from "chalk";

export interface SSOOptions {
  provider?: string;
  entityId?: string;
  ssoUrl?: string;
  callbackUrl?: string;
  json?: boolean;
}

async function manageSSO(options: SSOOptions): Promise<void> {
  if (options.provider) {
    const validProviders = ["saml", "oidc", "azure-ad", "okta"];
    if (!validProviders.includes(options.provider)) {
      console.error(chalk.red(`Invalid provider: ${options.provider}`));
      console.error(chalk.dim(`Valid providers: ${validProviders.join(", ")}`));
      process.exit(1);
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            provider: options.provider,
            entityId: options.entityId,
            ssoUrl: options.ssoUrl,
            callbackUrl: options.callbackUrl,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(chalk.blue(`\nSSO Configuration: ${chalk.bold(options.provider.toUpperCase())}\n`));
    console.log(chalk.dim("  Provider:"), options.provider);
    if (options.entityId) console.log(chalk.dim("  Entity ID:"), options.entityId);
    if (options.ssoUrl) console.log(chalk.dim("  SSO URL:"), options.ssoUrl);
    if (options.callbackUrl) console.log(chalk.dim("  Callback URL:"), options.callbackUrl);
    console.log();
    return;
  }

  // Show supported providers
  console.log(chalk.blue("\nSSO Providers\n"));
  console.log(chalk.bold("  SAML 2.0"));
  console.log(chalk.dim("    Standard SAML with X.509 certificate validation"));
  console.log(chalk.dim("    Options: --entity-id, --sso-url, --callback-url"));
  console.log();
  console.log(chalk.bold("  OIDC"));
  console.log(chalk.dim("    OpenID Connect with client credentials"));
  console.log(chalk.dim("    Options: --sso-url, --callback-url"));
  console.log();
  console.log(chalk.bold("  Azure AD"));
  console.log(chalk.dim("    Microsoft Azure Active Directory integration"));
  console.log(chalk.dim("    Options: --sso-url, --callback-url"));
  console.log();
  console.log(chalk.bold("  Okta"));
  console.log(chalk.dim("    Okta identity management"));
  console.log(chalk.dim("    Options: --sso-url, --callback-url"));
  console.log();
  console.log(
    chalk.dim(
      "  Usage: inspect sso --provider saml --sso-url https://idp.example.com/sso --callback-url https://app.example.com/callback",
    ),
  );
  console.log();
}

export function registerSSOCommand(program: Command): void {
  program
    .command("sso")
    .description("Configure Single Sign-On providers")
    .option("-p, --provider <type>", "SSO provider (saml, oidc, azure-ad, okta)")
    .option("--entity-id <id>", "SAML entity ID")
    .option("--sso-url <url>", "SSO URL from identity provider")
    .option("--callback-url <url>", "Callback URL for authentication")
    .option("--json", "Output as JSON")
    .action(async (opts: SSOOptions) => {
      try {
        await manageSSO(opts);
      } catch (err) {
        console.error(chalk.red(`Error: ${err}`));
        process.exit(1);
      }
    });
}
