import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const KEYS_FILE = join(process.cwd(), ".inspect", "keys.json");

export interface ModelEntry {
  id: string;
  label: string;
  isDefault: boolean;
  provider: string;
  color: string;
}

export interface ProviderEntry {
  key: string;
  name: string;
  models: string[];
  defaultModel: string;
  url: string;
}

export interface KeysConfig {
  _activeModel?: string;
  _activeProvider?: string;
  [key: string]: string | undefined;
}

export const MODEL_GROUPS = [
  {
    provider: "Claude",
    color: "#22c55e",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Sonnet 4", isDefault: true },
      { id: "claude-opus-4-20250514", label: "Opus 4", isDefault: false },
      { id: "claude-haiku-3-5-20241022", label: "Haiku 3.5", isDefault: false },
    ],
  },
  {
    provider: "OpenAI",
    color: "#3b82f6",
    models: [
      { id: "gpt-4o", label: "GPT-4o", isDefault: true },
      { id: "gpt-4.1", label: "GPT-4.1", isDefault: false },
      { id: "o3-mini", label: "o3 Mini", isDefault: false },
    ],
  },
  {
    provider: "Gemini",
    color: "#eab308",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", isDefault: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", isDefault: false },
    ],
  },
  {
    provider: "DeepSeek",
    color: "#a855f7",
    models: [
      { id: "deepseek-r1", label: "DeepSeek R1", isDefault: true },
      { id: "deepseek-v3", label: "DeepSeek V3", isDefault: false },
    ],
  },
  {
    provider: "OpenCode",
    color: "#22d3ee",
    models: [
      { id: "opencode/kimi-k2.5", label: "Kimi K2.5", isDefault: true },
      { id: "opencode/glm-5", label: "GLM-5", isDefault: false },
      { id: "opencode/minimax-m2.7", label: "MiniMax M2.7", isDefault: false },
    ],
  },
];

export const ALL_MODELS: ModelEntry[] = MODEL_GROUPS.flatMap((g) =>
  g.models.map((m) => ({ ...m, provider: g.provider, color: g.color })),
);

export const PROVIDERS: ProviderEntry[] = [
  {
    key: "ANTHROPIC_API_KEY",
    name: "Claude (Anthropic)",
    models: ["sonnet", "opus", "haiku"],
    defaultModel: "claude-sonnet-4-20250514",
    url: "console.anthropic.com/settings/keys",
  },
  {
    key: "OPENAI_API_KEY",
    name: "OpenAI",
    models: ["gpt-4o", "gpt-4.1", "o3"],
    defaultModel: "gpt-4o",
    url: "platform.openai.com/api-keys",
  },
  {
    key: "GOOGLE_AI_KEY",
    name: "Google Gemini",
    models: ["pro", "flash"],
    defaultModel: "gemini-2.5-pro",
    url: "aistudio.google.com/apikey",
  },
  {
    key: "DEEPSEEK_API_KEY",
    name: "DeepSeek",
    models: ["r1", "v3"],
    defaultModel: "deepseek-r1",
    url: "platform.deepseek.com/api_keys",
  },
  {
    key: "OPENCODE_API_KEY",
    name: "OpenCode",
    models: ["kimi-k2.5", "glm-5", "minimax-m2.7"],
    defaultModel: "opencode/kimi-k2.5",
    url: "opencode.ai/go",
  },
];

export const API_KEY_VALIDATORS: Record<string, { prefix: string; minLen: number; hint: string }> =
  {
    ANTHROPIC_API_KEY: { prefix: "sk-ant-", minLen: 20, hint: "Should start with sk-ant-" },
    OPENAI_API_KEY: { prefix: "", minLen: 20, hint: "Should be at least 20 characters" },
    GOOGLE_AI_KEY: { prefix: "AI", minLen: 10, hint: "Should start with AI" },
    DEEPSEEK_API_KEY: { prefix: "sk-", minLen: 10, hint: "Should start with sk-" },
    OPENCODE_API_KEY: { prefix: "", minLen: 10, hint: "Get key at opencode.ai/go" },
  };

export function loadKeys(): KeysConfig {
  try {
    if (existsSync(KEYS_FILE)) return JSON.parse(readFileSync(KEYS_FILE, "utf-8"));
  } catch {
    // intentionally empty
  }
  return {};
}

export function saveKeys(data: KeysConfig): void {
  const dir = join(process.cwd(), ".inspect");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

export function setActiveModel(modelId: string, provider: string): void {
  const cfg = loadKeys();
  cfg._activeModel = modelId;
  cfg._activeProvider = provider;
  saveKeys(cfg);
}

export function saveApiKey(
  providerKey: string,
  apiKey: string,
  defaultModel: string,
  providerName: string,
): string {
  const cfg = loadKeys();
  cfg[providerKey] = apiKey;
  cfg._activeModel = defaultModel;
  cfg._activeProvider = providerName;
  saveKeys(cfg);
  process.env[providerKey] = apiKey;
  return `✓ ${providerName} saved · model: ${defaultModel}`;
}

export function validateApiKey(providerKey: string, key: string): string | undefined {
  const v = API_KEY_VALIDATORS[providerKey];
  if (!v) return undefined;
  if (key.length < v.minLen) return `Key too short. ${v.hint}`;
  if (v.prefix && !key.startsWith(v.prefix)) return `Invalid format. ${v.hint}`;
  return undefined;
}

export function getAvailableAgents(): string[] {
  const agents: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) agents.push("claude");
  if (process.env.OPENAI_API_KEY) agents.push("gpt");
  if (process.env.GOOGLE_AI_KEY) agents.push("gemini");
  if (process.env.DEEPSEEK_API_KEY) agents.push("deepseek");
  agents.push("ollama");
  return agents;
}
