import type { Command } from "commander";
import chalk from "chalk";

export interface ProxyOptions {
  port?: string;
  upstream?: string;
  controlPort?: string;
  preset?: string;
  latency?: string;
  jitter?: string;
  timeout?: string;
  name?: string;
}

async function runProxyStart(options: ProxyOptions): Promise<void> {
  const port = parseInt(options.port ?? "8888", 10);
  const upstream = options.upstream ?? "localhost:80";
  const controlPort = options.controlPort ? parseInt(options.controlPort, 10) : port + 1;

  console.log(chalk.blue("\nInspect Proxy Server\n"));
  console.log(chalk.dim(`Listen: 0.0.0.0:${port}`));
  console.log(chalk.dim(`Upstream: ${upstream}`));
  console.log(chalk.dim(`Control API: http://localhost:${controlPort}`));

  try {
    const { ProxyServer, TOXICITY_PRESETS } = await import("@inspect/resilience");

    const server = new ProxyServer({
      port,
      upstream,
      name: options.name ?? "inspect-proxy",
    });

    // Apply preset or individual toxics
    if (options.preset) {
      const success = server.applyPreset(options.preset);
      if (success) {
        console.log(chalk.green(`\nApplied preset: ${options.preset}`));
      } else {
        console.log(chalk.yellow(`\nUnknown preset: ${options.preset}`));
        console.log(chalk.dim(`Available: ${Object.keys(TOXICITY_PRESETS).join(", ")}`));
      }
    }

    if (options.latency) {
      server.addToxic({
        type: "latency",
        name: "cli-latency",
        attributes: {
          latency: parseInt(options.latency, 10),
          jitter: parseInt(options.jitter ?? "0", 10),
        },
      });
      console.log(
        chalk.green(`Added latency: ${options.latency}ms (jitter: ${options.jitter ?? "0"}ms)`),
      );
    }

    if (options.timeout) {
      server.addToxic({
        type: "timeout",
        name: "cli-timeout",
        attributes: { timeout: parseInt(options.timeout, 10) },
      });
      console.log(chalk.green(`Added timeout: ${options.timeout}ms`));
    }

    await server.start(controlPort);
    console.log(chalk.green(`\nProxy server started on port ${port}`));
    console.log(chalk.dim(`Control API: http://localhost:${controlPort}/status`));
    console.log(chalk.dim("\nPress Ctrl+C to stop.\n"));

    // Keep alive
    process.on("SIGINT", async () => {
      console.log(chalk.dim("\nStopping proxy server..."));
      await server.stop();
      console.log(chalk.green("Proxy server stopped."));
      process.exit(0);
    });

    await new Promise(() => {});
  } catch (error) {
    console.error(
      chalk.red(`\nProxy failed: ${error instanceof Error ? error.message : String(error)}`),
    );
    process.exit(1);
  }
}

function listPresets(): void {
  const presets = {
    "slow-3g": "Slow 3G connection (2s latency, 750 KB/s)",
    "flaky-wifi": "Intermittent WiFi (100ms latency, 30% packet loss)",
    offline: "Complete network outage",
    "high-latency": "High latency (5s delay)",
    "packet-loss": "20% packet loss simulation",
  };

  console.log(chalk.blue("\nAvailable Toxicity Presets:\n"));
  for (const [name, desc] of Object.entries(presets)) {
    console.log(chalk.green(`  ${name.padEnd(15)} `) + chalk.dim(desc));
  }
  console.log();
}

export function registerProxyCommand(program: Command): void {
  const proxyCmd = program.command("proxy").description("Network fault injection proxy server");

  proxyCmd
    .command("start")
    .description("Start the proxy server")
    .option("--port <port>", "Listen port (default: 8888)")
    .option("--upstream <host:port>", "Upstream server (default: localhost:80)")
    .option("--control-port <port>", "Control API port")
    .option("--name <name>", "Proxy name")
    .option("--preset <name>", "Toxicity preset to apply")
    .option("--latency <ms>", "Add latency toxic")
    .option("--jitter <ms>", "Latency jitter")
    .option("--timeout <ms>", "Add timeout toxic")
    .action(runProxyStart);

  proxyCmd.command("presets").description("List available toxicity presets").action(listPresets);
}
