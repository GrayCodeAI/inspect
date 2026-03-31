/**
 * @inspect enterprise - Enterprise command group
 *
 * Subcommands:
 *   inspect enterprise rbac       - Role-based access control
 *   inspect enterprise tenant     - Multi-tenant management
 *   inspect enterprise sso        - Single sign-on configuration
 *   inspect enterprise credentials - Manage credentials
 */
import type { Command } from "commander";

export function registerEnterpriseGroupCommand(program: Command): void {
  const enterpriseCmd = program
    .command("enterprise")
    .description("Enterprise commands (rbac, tenant, sso, credentials)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect enterprise rbac --role admin     View RBAC policy
  $ inspect enterprise tenant list           List all tenants
  $ inspect enterprise sso configure okta    Configure SSO
  $ inspect enterprise credentials add       Add credentials
`,
    );

  // rbac subcommand
  enterpriseCmd
    .command("rbac [action]")
    .description("Role-based access control management")
    .option("--role <role>", "Role to query")
    .option("--json", "Output as JSON")
    .action(async (_action: string | undefined, _options) => {
      const { registerRBACCommand } = await import("./rbac.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerRBACCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "rbac"], { from: "user" });
    });

  // tenant subcommand
  enterpriseCmd
    .command("tenant <action>")
    .description("Multi-tenant management")
    .option("--id <tenantId>", "Tenant ID")
    .option("--name <name>", "Tenant name")
    .option("--plan <plan>", "Plan type")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerTenantCommand } = await import("./tenant.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerTenantCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "tenant", action], { from: "user" });
    });

  // sso subcommand
  enterpriseCmd
    .command("sso <action>")
    .description("Single sign-on configuration")
    .option("--provider <provider>", "SSO provider (okta, auth0, azure)")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerSSOCommand } = await import("./sso.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerSSOCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "sso", action], { from: "user" });
    });

  // credentials subcommand
  enterpriseCmd
    .command("credentials <action>")
    .description("Manage credentials securely")
    .option("--service <service>", "Service name")
    .option("--env <environment>", "Environment")
    .option("--json", "Output as JSON")
    .action(async (action: string, _options) => {
      const { registerCredentialsCommand } = await import("./credentials.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerCredentialsCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "credentials", action], { from: "user" });
    });
}
