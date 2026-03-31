/**
 * @inspect chaos - Chaos engineering command group
 *
 * Subcommands:
 *   inspect chaos run    - Run chaos experiments
 *   inspect chaos inject - Inject faults
 */
import type { Command } from "commander";

export function registerChaosGroupCommand(program: Command): void {
  const chaosCmd = program
    .command("chaos")
    .description("Chaos engineering (run, inject)")
    .addHelpText(
      "after",
      `
Examples:
  $ inspect chaos run --scenario network-latency
  $ inspect chaos inject --fault cpu-stress --duration 60s
`,
    );

  // run subcommand
  chaosCmd
    .command("run [scenario]")
    .description("Run chaos experiment")
    .option("--duration <duration>", "Experiment duration")
    .option("--intensity <level>", "Intensity level (1-10)")
    .option("--target <target>", "Target service")
    .option("--dry-run", "Plan without executing")
    .action(async (scenario: string | undefined, _options) => {
      const { registerChaosCommand } = await import("./chaos.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerChaosCommand(tempProgram);
      const args = scenario ? [scenario] : [];
      await tempProgram.parseAsync(["node", "inspect", "chaos", ...args], { from: "user" });
    });

  // inject subcommand
  chaosCmd
    .command("inject")
    .description("Inject specific fault")
    .option("--fault <type>", "Fault type (cpu, memory, network, disk)")
    .option("--duration <duration>", "Fault duration")
    .option("--magnitude <value>", "Fault magnitude")
    .action(async (_options) => {
      const { registerChaosCommand } = await import("./chaos.js");
      const { Command } = await import("commander");
      const tempProgram = new Command();
      registerChaosCommand(tempProgram);
      await tempProgram.parseAsync(["node", "inspect", "chaos", "inject"], { from: "user" });
    });
}
