import { execSync } from "node:child_process";

export type SupportedAgent =
  | "claude"
  | "codex"
  | "copilot"
  | "gemini"
  | "cursor"
  | "opencode"
  | "droid";

export type AgentBackend = SupportedAgent;

interface AgentMeta {
  readonly binary: string;
  readonly skillsCliName: string;
}

const SUPPORTED_AGENTS: Record<SupportedAgent, AgentMeta> = {
  claude: { binary: "claude", skillsCliName: "claude-code" },
  codex: { binary: "codex", skillsCliName: "codex" },
  copilot: { binary: "copilot", skillsCliName: "github-copilot" },
  gemini: { binary: "gemini", skillsCliName: "gemini-cli" },
  cursor: { binary: "agent", skillsCliName: "cursor" },
  opencode: { binary: "opencode", skillsCliName: "opencode" },
  droid: { binary: "droid", skillsCliName: "droid" },
};

const WHICH_COMMAND = process.platform === "win32" ? "where" : "/usr/bin/which";

const isCommandAvailable = (command: string): boolean => {
  try {
    execSync(`${WHICH_COMMAND} ${command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

export const detectAvailableAgents = (): SupportedAgent[] =>
  (Object.keys(SUPPORTED_AGENTS) as SupportedAgent[]).filter((agent) =>
    isCommandAvailable(SUPPORTED_AGENTS[agent].binary),
  );

export const toSkillsCliName = (agent: SupportedAgent): string =>
  SUPPORTED_AGENTS[agent].skillsCliName;
