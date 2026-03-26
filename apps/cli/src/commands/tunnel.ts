import type { Command } from "commander";
import chalk from "chalk";

export interface TunnelOptions {
  port?: string;
  protocol?: string;
}

async function runTunnel(options: TunnelOptions): Promise<void> {
  const port = parseInt(options.port ?? "3000", 10);
  const protocol = (options.protocol ?? "http") as "http" | "https";

  console.log(chalk.blue("\nCloudflare Tunnel\n"));
  console.log(chalk.dim(`Local port: ${port}`));
  console.log(chalk.dim(`Protocol: ${protocol}`));

  try {
    const { TunnelManager } = await import("@inspect/network");
    const tunnel = new TunnelManager();

    console.log(chalk.dim("\nCreating tunnel..."));

    const publicUrl = await tunnel.createTunnel(port, { protocol });

    console.log(chalk.green(`\n  Tunnel is live!\n`));
    console.log(`  ${chalk.bold("Public URL:")} ${publicUrl}`);
    console.log(`  ${chalk.dim("Local:")}      ${protocol}://localhost:${port}`);
    console.log(chalk.dim("\n  Press Ctrl+C to stop the tunnel\n"));

    // Keep alive until interrupted
    const shutdown = async () => {
      console.log(chalk.dim("\nClosing tunnel..."));
      await tunnel.cleanup();
      console.log(chalk.dim("Tunnel closed."));
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep the process alive
    await new Promise(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("cloudflared") || msg.includes("ENOENT")) {
      console.error(chalk.red("\nError: cloudflared binary not found."));
      console.log(chalk.dim("Install it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"));
      console.log(chalk.dim("Or: brew install cloudflare/cloudflare/cloudflared"));
    } else {
      console.error(chalk.red(`\nError: ${msg}`));
    }
    process.exit(1);
  }
}

export function registerTunnelCommand(program: Command): void {
  program
    .command("tunnel")
    .description("Create a Cloudflare tunnel for localhost testing")
    .option("--port <port>", "Local port to tunnel", "3000")
    .option("--protocol <protocol>", "Protocol: http, https", "http")
    .action(async (opts: TunnelOptions) => {
      await runTunnel(opts);
    });
}
