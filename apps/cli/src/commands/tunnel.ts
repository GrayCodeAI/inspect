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
  } catch {
    // Direct cloudflared fallback when @inspect/network is not available
    const { execFile: execFileCb } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFile = promisify(execFileCb);

    // Check if cloudflared is installed
    try {
      await execFile("cloudflared", ["--version"]);
    } catch {
      console.error(chalk.red("\nError: cloudflared is not installed."));
      console.error(chalk.dim("  Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/"));
      console.error(chalk.dim("  Or: brew install cloudflared"));
      process.exit(1);
    }

    console.log(chalk.dim(`Starting tunnel to localhost:${port}...`));

    const { spawn } = await import("node:child_process");
    const child = spawn("cloudflared", ["tunnel", "--url", `${protocol}://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Parse tunnel URL from stderr (cloudflared outputs it there)
    let tunnelUrl = "";
    child.stderr.on("data", (data: Buffer) => {
      const line = data.toString();
      const urlMatch = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0];
        console.log(chalk.green(`\n  Tunnel is live!\n`));
        console.log(`  ${chalk.bold("Public URL:")} ${tunnelUrl}`);
        console.log(`  ${chalk.dim("Local:")}      ${protocol}://localhost:${port}`);
        console.log(chalk.dim("\n  Press Ctrl+C to stop the tunnel\n"));
      }
    });

    child.on("error", (err) => {
      console.error(chalk.red(`Tunnel error: ${err.message}`));
    });

    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        console.log(chalk.dim("\nClosing tunnel..."));
        child.kill("SIGTERM");
        setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 3000);
        resolve();
      });
      process.on("SIGTERM", () => {
        child.kill("SIGTERM");
        resolve();
      });
      child.on("exit", () => resolve());
    });
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
