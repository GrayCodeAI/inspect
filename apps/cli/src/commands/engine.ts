import type { Command } from "commander";
import chalk from "chalk";

export function registerEngineCommand(program: Command): void {
  const engine = program
    .command("engine")
    .description("Manage the Inspect Docker engine");

  engine
    .command("start")
    .description("Start the Inspect Docker engine")
    .option("-p, --port <port>", "Host port for the API", "4100")
    .action(async (opts: { port: string }) => {
      const { ensureContainer } = await import("../utils/docker.js");
      try {
        await ensureContainer({
          port: parseInt(opts.port, 10),
          onProgress: (msg) => console.log(chalk.dim(msg)),
        });
        console.log(chalk.green("\nInspect engine is running."));
      } catch (err) {
        console.error(chalk.red(`Failed to start engine: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  engine
    .command("stop")
    .description("Stop the Inspect Docker engine")
    .action(async () => {
      const { stopContainer } = await import("../utils/docker.js");
      console.log(chalk.dim("Stopping Inspect engine..."));
      await stopContainer();
      console.log(chalk.green("Engine stopped."));
    });

  engine
    .command("status")
    .description("Show engine status")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const { getContainerStatus, isDockerAvailable } = await import("../utils/docker.js");

      const dockerOk = await isDockerAvailable();
      const status = await getContainerStatus();

      if (opts.json) {
        process.stdout.write(JSON.stringify({ docker: dockerOk, ...status }, null, 2) + "\n");
        return;
      }

      console.log(chalk.blue("\nInspect Engine Status\n"));
      console.log(`  Docker:     ${dockerOk ? chalk.green("available") : chalk.red("not found")}`);
      console.log(`  Engine:     ${status.running ? chalk.green("running") : chalk.dim("stopped")}`);
      if (status.running) {
        console.log(`  Container:  ${status.containerId}`);
        console.log(`  Port:       ${status.port}`);
        console.log(`  Since:      ${status.uptime}`);
      }
      console.log();
    });

  engine
    .command("rebuild")
    .description("Rebuild the Docker image")
    .action(async () => {
      const { buildImage, stopContainer } = await import("../utils/docker.js");
      const { join } = await import("node:path");

      console.log(chalk.dim("Stopping existing engine..."));
      await stopContainer();

      const root = process.cwd();
      console.log(chalk.dim("Rebuilding Docker image..."));
      await buildImage(root, (line) => console.log(chalk.dim(`  ${line.slice(0, 100)}`)));
      console.log(chalk.green("\nImage rebuilt. Run 'inspect engine start' to start."));
    });
}
