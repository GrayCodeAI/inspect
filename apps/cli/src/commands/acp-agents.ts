import { Command } from "commander";
import chalk from "chalk";

export function registerAcpAgentsCommand(program: Command): void {
  program
    .command("agents")
    .description("List detected coding agents (ACP integration)")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const { detectAvailableAgents, toSkillsCliName } = await import("@inspect/acp");
      const detected = detectAvailableAgents();

      if (opts.json) {
        console.log(
          JSON.stringify(
            detected.map((a) => ({ name: a, skillsCliName: toSkillsCliName(a) })),
            null,
            2,
          ),
        );
        return;
      }

      const lines: string[] = [];
      lines.push("");
      lines.push(chalk.hex("#a855f7").bold("  \u25c6 Detected Coding Agents (ACP)"));
      lines.push("");

      if (detected.length === 0) {
        lines.push("  No coding agents detected. Install one of:");
        lines.push("    claude    - Claude Code (npm install -g @anthropic-ai/claude-code)");
        lines.push("    codex     - OpenAI Codex CLI (npm install -g @openai/codex)");
        lines.push("    copilot   - GitHub Copilot CLI (npm install -g @github/copilot)");
        lines.push("    gemini    - Google Gemini CLI (npm install -g @google/gemini-cli)");
        lines.push("    cursor    - Cursor Agent CLI");
        lines.push("    opencode  - OpenCode (npm install -g opencode-ai)");
        lines.push("    droid     - Factory Droid (npm install -g droid)");
      } else {
        const agentColors: Record<string, string> = {
          claude: "#f97316",
          codex: "#22c55e",
          copilot: "#3b82f6",
          gemini: "#f59e0b",
          cursor: "#a855f7",
          opencode: "#6366f1",
          droid: "#ec4899",
        };

        for (const agent of detected) {
          const color = agentColors[agent] ?? "#e2e8f0";
          const skillsName = toSkillsCliName(agent);
          lines.push(
            `  ${chalk.hex(color).bold(agent.padEnd(12))} ${chalk.hex("#94a3b8")(`skills: ${skillsName}`)}`,
          );
        }
      }

      lines.push("");
      lines.push(
        chalk.hex("#64748b")(
          `  ${detected.length} agent${detected.length !== 1 ? "s" : ""} available`,
        ),
      );
      lines.push("");
      console.log(lines.join("\n"));
    });
}
