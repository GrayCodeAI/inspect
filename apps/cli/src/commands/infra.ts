/**
 * @inspect infra - Infrastructure command group
 *
 * Subcommands:
 *   inspect infra serve    - Start local development server
 *   inspect infra tunnel   - Create public tunnel
 *   inspect infra proxy    - Network fault injection proxy
 *   inspect infra dashboard - Open web dashboard
 */
import type { Command } from "commander";

export function registerInfraCommand(program: Command): void {
  const infraCmd = program
    .command("infra")
    .description("Infrastructure commands (serve, tunnel, proxy, dashboard)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect infra serve                  Start development server
  $ inspect infra tunnel --port 3000     Create public tunnel
  $ inspect infra proxy start --preset slow-3g   Start fault injection proxy
  $ inspect infra dashboard              Open web dashboard
`,
    );

  // serve subcommand
  infraCmd
    .command("serve [port]")
    .description("Start local development server")
    .option("--host <host>", "Host to bind to", "localhost")
    .option("--https", "Enable HTTPS")
    .option("--cors", "Enable CORS")
    .action(async (port: string | undefined, _options) => {
      const { registerServeCommand } = await import("./serve.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerServeCommand(tempProgram);
      const args = port ? [port] : [];
      await tempProgram.parseAsync(["node", "inspect", "serve", ...args], { from: "user" });
    });

  // tunnel subcommand
  infraCmd
    .command("tunnel [port]")
    .description("Create public tunnel to local server")
    .option("--provider <provider>", "Tunnel provider (ngrok, cloudflare)", "ngrok")
    .option("--subdomain <name>", "Request specific subdomain")
    .option("--auth", "Require authentication")
    .action(async (port: string | undefined, _options) => {
      const { registerTunnelCommand } = await import("./tunnel.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerTunnelCommand(tempProgram);
      const args = port ? [port] : [];
      await tempProgram.parseAsync(["node", "inspect", "tunnel", ...args], { from: "user" });
    });

  // proxy subcommand
  infraCmd
    .command("proxy <action>")
    .description("Network fault injection proxy server")
    .option("--preset <preset>", "Fault preset (slow-3g, flaky, offline)")
    .option("--port <port>", "Proxy port", "8080")
    .option("--target <url>", "Target URL")
    .action(async (action: string, _options) => {
      const { registerProxyCommand } = await import("./proxy.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerProxyCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "proxy", action], { from: "user" });
    });

  // dashboard subcommand
  infraCmd
    .command("dashboard")
    .description("Open web dashboard")
    .option("--port <port>", "Dashboard port", "3001")
    .option("--no-open", "Don't open browser automatically")
    .action(async (_options) => {
      const { registerDashboardCommand } = await import("./dashboard.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerDashboardCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "dashboard"], { from: "user" });
    });
}
