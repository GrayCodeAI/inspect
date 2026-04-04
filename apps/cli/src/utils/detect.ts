import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Detect if running inside an AI agent (Claude Code, Cursor, Codex, etc.)
 */
export function isRunningInAgent(): { inAgent: boolean; agentName?: string } {
  if (process.env.CLAUDECODE) return { inAgent: true, agentName: "Claude Code" };
  if (process.env.CURSOR_AGENT) return { inAgent: true, agentName: "Cursor" };
  if (process.env.CODEX_CI) return { inAgent: true, agentName: "Codex" };
  if (process.env.OPENCODE) return { inAgent: true, agentName: "OpenCode" };
  if (process.env.AMP_HOME) return { inAgent: true, agentName: "Amp" };
  if (process.env.CI) return { inAgent: true, agentName: "CI" };
  return { inAgent: false };
}

/**
 * Detect if running in headless/non-interactive mode
 */
export function isHeadless(): boolean {
  return !process.stdin.isTTY || isRunningInAgent().inAgent;
}

/**
 * Detect package manager from lock files
 */
export function detectPackageManager(): "pnpm" | "yarn" | "npm" | "bun" {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

/**
 * Detect available API keys
 */
export function detectApiKeys(): { provider: string; envVar: string }[] {
  const keys = [
    { provider: "Anthropic (Claude)", envVar: "ANTHROPIC_API_KEY" },
    { provider: "OpenAI (GPT)", envVar: "OPENAI_API_KEY" },
    { provider: "Google (Gemini)", envVar: "GOOGLE_AI_KEY" },
    { provider: "DeepSeek", envVar: "DEEPSEEK_API_KEY" },
  ];
  return keys.filter((k) => !!process.env[k.envVar]);
}

/**
 * Extract URL from instruction text
 */
export function detectUrlInText(text: string): string | null {
  const match = text.match(/(?:https?:\/\/|localhost[:/])[\w\-._~:/?#[\]@!$&'()*+,;=%]+/i);
  return match ? match[0] : null;
}
