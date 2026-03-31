import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
import { ConfigScreen } from "./ConfigScreen.js";
import { ModelScreen } from "./ModelScreen.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { TestBuilderScreen } from "./screens/TestBuilderScreen.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Strip <environment_details> from any output stream
function stripEnv(text: string): string {
  const idx = text.search(/<environment/i);
  return idx !== -1 ? text.slice(0, idx).trimEnd() : text;
}

// Intercept all output streams
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.stdout as any).write = function (chunk: any, encoding?: any, cb?: any) {
  if (typeof chunk === "string") {
    const cleaned = stripEnv(chunk);
    if (!cleaned.trim()) return typeof encoding === "function" ? encoding() : true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_origStdoutWrite as any)(cleaned, encoding, cb);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_origStdoutWrite as any)(chunk, encoding, cb);
};

const _origStderrWrite = process.stderr.write.bind(process.stderr);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process.stderr as any).write = function (chunk: any, encoding?: any, cb?: any) {
  if (typeof chunk === "string") {
    const cleaned = stripEnv(chunk);
    if (!cleaned.trim()) return typeof encoding === "function" ? encoding() : true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_origStderrWrite as any)(cleaned, encoding, cb);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_origStderrWrite as any)(chunk, encoding, cb);
};

const _origConsoleLog = console.log;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
console.log = (...args: any[]) => {
  const cleaned = args.map((a) => (typeof a === "string" ? stripEnv(a) : a));
  _origConsoleLog(...cleaned);
};

// ── Slash command definitions ────────────────────────────────────────────

const SLASH_COMMANDS = [
  { name: "help", desc: "Show available commands" },
  { name: "config", desc: "Configure providers, keys, and model" },
  { name: "model", desc: "Switch AI model or list all models" },
  { name: "doctor", desc: "Check environment and dependencies" },
  { name: "devices", desc: "List available device presets" },
  { name: "history", desc: "Show past test instructions" },
  { name: "init", desc: "Initialize project configuration" },
  { name: "cost", desc: "Show session cost breakdown" },
  { name: "audit", desc: "Show agent audit trail" },
  { name: "heal", desc: "Show healing strategies" },
  { name: "generate", desc: "Generate tests from page" },
  { name: "dashboard", desc: "Live multi-agent test dashboard" },
  { name: "install", desc: "Install browser dependencies" },
  { name: "clear", desc: "Clear conversation history" },
  { name: "quit", desc: "Exit inspect" },
];

const _CONFIG_PROVIDERS = [
  {
    key: "ANTHROPIC_API_KEY",
    short: "claude",
    name: "Claude",
    models: "Sonnet 4, Opus 4, Haiku 3.5",
    defaultModel: "claude-sonnet-4-20250514",
    url: "console.anthropic.com/settings/keys",
  },
  {
    key: "OPENAI_API_KEY",
    short: "gpt",
    name: "OpenAI",
    models: "GPT-4o, GPT-4.1, o3",
    defaultModel: "gpt-4o",
    url: "platform.openai.com/api-keys",
  },
  {
    key: "GOOGLE_AI_KEY",
    short: "gemini",
    name: "Gemini",
    models: "Gemini 2.5 Pro, Flash",
    defaultModel: "gemini-2.5-pro",
    url: "aistudio.google.com/apikey",
  },
  {
    key: "DEEPSEEK_API_KEY",
    short: "deepseek",
    name: "DeepSeek",
    models: "DeepSeek R1, V3",
    defaultModel: "deepseek-r1",
    url: "platform.deepseek.com/api_keys",
  },
] as const;

// ── Types ───────────────────────────────────────────────────────────────

type MsgKind = "user" | "result" | "info" | "error" | "cmd" | "welcome";

interface Msg {
  id: number;
  kind: MsgKind;
  text: string;
}

// ── Key storage ─────────────────────────────────────────────────────────

const KEYS_FILE = join(process.cwd(), ".inspect", "keys.json");

function loadKeys(): Record<string, string> {
  try {
    if (existsSync(KEYS_FILE)) return JSON.parse(readFileSync(KEYS_FILE, "utf-8"));
  } catch {
    /* intentionally empty */
  }
  return {};
}

function _saveKey(envVar: string, value: string): void {
  const keys = loadKeys();
  keys[envVar] = value;
  const dir = join(process.cwd(), ".inspect");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  // Also set in current process
  process.env[envVar] = value;
}

function loadSavedKeys(): void {
  const keys = loadKeys();
  for (const [k, v] of Object.entries(keys)) {
    if (!process.env[k] && v) process.env[k] = v;
  }
}

// Load saved keys on startup
loadSavedKeys();

// ── History ─────────────────────────────────────────────────────────────

function loadHist(): string[] {
  try {
    const p = join(process.cwd(), ".inspect", "history.json");
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    /* intentionally empty */
  }
  return [];
}

function saveHist(h: string[]): void {
  try {
    const d = join(process.cwd(), ".inspect");
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "history.json"), JSON.stringify(h.slice(0, 20)));
  } catch {
    /* intentionally empty */
  }
}

// ── Spinner ─────────────────────────────────────────────────────────────

const SPINNER_STATES = [
  { verb: "Thinking", color: "#a855f7", frames: ["\u25dc", "\u25dd", "\u25de", "\u25df"] },
  { verb: "Analyzing", color: "#3b82f6", frames: ["\u25e0", "\u25e1", "\u25e2", "\u25e3"] },
  { verb: "Planning", color: "#06b6d4", frames: ["\u25cb", "\u25d4", "\u25cf", "\u25d5"] },
  { verb: "Scanning", color: "#14b8a6", frames: ["\u2591", "\u2592", "\u2593", "\u2588"] },
  { verb: "Testing", color: "#22c55e", frames: ["\u25f8", "\u25f9", "\u25fa", "\u25fb"] },
  { verb: "Inspecting", color: "#84cc16", frames: ["\u25e4", "\u25e5", "\u25e6", "\u25e7"] },
  { verb: "Evaluating", color: "#eab308", frames: ["\u25d0", "\u25d1", "\u25d2", "\u25d3"] },
  { verb: "Checking", color: "#f97316", frames: ["\u2581", "\u2583", "\u2585", "\u2587"] },
  { verb: "Processing", color: "#ef4444", frames: ["\u2571", "\u2572", "\u2573", "\u2571"] },
  { verb: "Executing", color: "#ec4899", frames: ["\u2596", "\u2597", "\u2598", "\u259d"] },
  { verb: "Crawling", color: "#8b5cf6", frames: ["\u2590", "\u2588", "\u258c", "\u2580"] },
  { verb: "Navigating", color: "#6366f1", frames: ["\u25b6", "\u25b7", "\u25b6", "\u25b7"] },
  { verb: "Clicking", color: "#22d3ee", frames: ["\u25ce", "\u25cd", "\u25cc", "\u25cb"] },
  { verb: "Typing", color: "#10b981", frames: ["\u258f", "\u258e", "\u258d", "\u258c"] },
  { verb: "Waiting", color: "#64748b", frames: ["\u2500", "\u2574", "\u2500", "\u2578"] },
  { verb: "Validating", color: "#f59e0b", frames: ["\u25c6", "\u25c7", "\u25c6", "\u25c7"] },
  { verb: "Rendering", color: "#d946ef", frames: ["\u25e2", "\u25e3", "\u25e4", "\u25e5"] },
  { verb: "Verifying", color: "#0ea5e9", frames: ["\u25a0", "\u25a1", "\u25a0", "\u25a1"] },
  { verb: "Debugging", color: "#f43f5e", frames: ["\u25c0", "\u25c1", "\u25c0", "\u25c1"] },
  { verb: "Exploring", color: "#a3e635", frames: ["\u25d6", "\u25d7", "\u25d6", "\u25d7"] },
];

function useSpinner(active: boolean): { char: string; color: string; verb: string } {
  const [stateIdx, setStateIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    // Pick one verb per request — no cycling
    setStateIdx(Math.floor(Math.random() * SPINNER_STATES.length));
    setFrame(0);
    const frameTimer = setInterval(() => setFrame((f) => (f + 1) % 4), 100);
    return () => clearInterval(frameTimer);
  }, [active]);
  if (!active) return { char: "", color: "#f97316", verb: "" };
  const state = SPINNER_STATES[stateIdx];
  return { char: state.frames[frame % state.frames.length], color: state.color, verb: state.verb };
}

// ── Git info ────────────────────────────────────────────────────────────

function useGitInfo(): { branch: string; files: number; loaded: boolean } {
  const [info, setInfo] = useState({ branch: "", files: 0, loaded: false });
  useEffect(() => {
    (async () => {
      try {
        const { GitManager } = await import("@inspect/core");
        const git = new GitManager();
        const branch = await git.getCurrentBranch();
        const files = await git.getChangedFiles("unstaged");
        setInfo({ branch, files: files.length, loaded: true });
      } catch {
        setInfo({ branch: "", files: 0, loaded: true });
      }
    })();
  }, []);
  return info;
}

// ── Slash commands ──────────────────────────────────────────────────────

async function handleSlash(
  cmd: string,
): Promise<{ kind: MsgKind; text: string } | "QUIT" | "CLEAR"> {
  const parts = cmd.slice(1).trim().split(/\s+/);
  const name = parts[0]?.toLowerCase() ?? "";

  switch (name) {
    case "quit":
    case "q":
    case "exit":
      return "QUIT";
    case "clear":
    case "cls":
      return "CLEAR";

    case "help":
    case "h":
      return {
        kind: "cmd",
        text: [
          "",
          "  \x1b[1;35mCommands\x1b[0m",
          "",
          "  \x1b[36m/help\x1b[0m              Show this help",
          "  \x1b[36m/config\x1b[0m            Configure API keys and providers",
          "  \x1b[36m/model\x1b[0m             Switch AI model (e.g. /model sonnet)",
          "  \x1b[36m/doctor\x1b[0m            Check environment and dependencies",
          "  \x1b[36m/devices\x1b[0m           List available device presets",
          "  \x1b[36m/models\x1b[0m            List all available AI models",
          "  \x1b[36m/history\x1b[0m           Show past test instructions",
          "  \x1b[36m/cost\x1b[0m              Show session cost breakdown",
          "  \x1b[36m/audit\x1b[0m             Show agent audit trail",
          "  \x1b[36m/heal\x1b[0m              Show healing strategies",
          "  \x1b[36m/generate\x1b[0m          Generate tests from current page",
          "  \x1b[36m/init\x1b[0m              Initialize project configuration",
          "  \x1b[36m/install\x1b[0m           Install browser dependencies",
          "  \x1b[36m/clear\x1b[0m             Clear conversation history",
          "  \x1b[36m/quit\x1b[0m              Exit",
          "",
          "  \x1b[1;35mOr just type what to test:\x1b[0m",
          "",
          "  \x1b[33m  test the login flow\x1b[0m",
          "  \x1b[33m  check a11y on https://myapp.com\x1b[0m",
          "  \x1b[33m  test checkout on iphone-15\x1b[0m",
          "",
        ].join("\n"),
      };

    case "doctor":
    case "devices":
    case "init":
    case "install":
    case "cost":
    case "audit":
    case "trail":
    case "autonomy":
    case "permissions":
    case "rbac":
    case "tenant":
    case "sso": {
      try {
        const cliPath = join(__dirname, "..", "index.js");
        const { stdout } = await execFile(process.execPath, [cliPath, name], { timeout: 15000 });
        return { kind: "cmd", text: stdout.trim() };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        return { kind: "cmd", text: e.stdout?.trim() ?? e.message };
      }
    }

    case "heal":
      return {
        kind: "cmd",
        text: [
          "",
          "  \x1b[1;35mSelf-Healing Strategies\x1b[0m",
          "",
          "  The self-healing engine uses a cascade of 8 strategies:",
          "",
          "  \x1b[36m1. TEXT_MATCH\x1b[0m       Find element by visible text content",
          "  \x1b[36m2. ARIA_ROLE\x1b[0m        Find by ARIA role + label",
          "  \x1b[36m3. VISUAL_LOCATE\x1b[0m    Vision-based element location via LLM",
          "  \x1b[36m4. XPATH_RELATIVE\x1b[0m   Relative XPath from stable ancestor",
          "  \x1b[36m5. CSS_SIMILAR\x1b[0m      Similar CSS selector",
          "  \x1b[36m6. NEIGHBOR_ANCHOR\x1b[0m  Locate via nearby stable element",
          "  \x1b[36m7. SEMANTIC_MATCH\x1b[0m   Match by purpose/semantics",
          "  \x1b[36m8. FULL_RESCAN\x1b[0m      Complete page re-analysis",
          "",
          "  Strategies are tried in order (cheapest first) until one succeeds.",
          "  Healing results are cached for faster recovery next time.",
          "",
        ].join("\n"),
      };

    case "generate":
      return {
        kind: "cmd",
        text: [
          "",
          "  \x1b[1;35mTest Generation\x1b[0m",
          "",
          "  Generates tests from page structure analysis.",
          "",
          "  \x1b[36mUsage:\x1b[0m",
          "    Provide a URL to generate tests:",
          "    \x1b[33m  test https://example.com/login\x1b[0m",
          "",
          "  \x1b[36mSupported page types:\x1b[0m",
          "    login, signup, checkout, search, settings,",
          "    listing, dashboard, article, form, landing",
          "",
          "  \x1b[36mTest categories:\x1b[0m",
          "    functional, navigation, form-validation,",
          "    error-handling, accessibility, edge-case",
          "",
        ].join("\n"),
      };

    case "config":
      return { kind: "cmd", text: "__OPEN_CONFIG__" };

    case "model": {
      const modelArg = parts[1]?.toLowerCase();
      const MODELS: Record<string, { full: string; provider: string }> = {
        sonnet: { full: "claude-sonnet-4-20250514", provider: "claude" },
        opus: { full: "claude-opus-4-20250514", provider: "claude" },
        haiku: { full: "claude-haiku-3-5-20241022", provider: "claude" },
        "gpt-4o": { full: "gpt-4o", provider: "gpt" },
        "gpt-4.1": { full: "gpt-4.1", provider: "gpt" },
        o3: { full: "o3-mini", provider: "gpt" },
        "gemini-pro": { full: "gemini-2.5-pro", provider: "gemini" },
        "gemini-flash": { full: "gemini-2.5-flash", provider: "gemini" },
        "deepseek-r1": { full: "deepseek-r1", provider: "deepseek" },
        "deepseek-v3": { full: "deepseek-v3", provider: "deepseek" },
        kimi: { full: "opencode/kimi-k2.5", provider: "opencode" },
        "kimi-k2.5": { full: "opencode/kimi-k2.5", provider: "opencode" },
        glm: { full: "opencode/glm-5", provider: "opencode" },
        "glm-5": { full: "opencode/glm-5", provider: "opencode" },
        minimax: { full: "opencode/minimax-m2.7", provider: "opencode" },
        "minimax-m2.7": { full: "opencode/minimax-m2.7", provider: "opencode" },
      };

      if (!modelArg) {
        const current = loadKeys()._activeModel ?? "not set";
        const lines: string[] = [];
        lines.push("");
        lines.push(`  \x1b[1;37m  Current model:\x1b[0m \x1b[36m${current}\x1b[0m`);
        lines.push("");
        lines.push("  \x1b[1;33m  Available models:\x1b[0m");
        lines.push("");
        lines.push("  \x1b[32m  Claude\x1b[0m    sonnet \x1b[90m(default)\x1b[0m  opus  haiku");
        lines.push("  \x1b[34m  OpenAI\x1b[0m    gpt-4o \x1b[90m(default)\x1b[0m  gpt-4.1  o3");
        lines.push(
          "  \x1b[33m  Gemini\x1b[0m    gemini-pro \x1b[90m(default)\x1b[0m  gemini-flash",
        );
        lines.push(
          "  \x1b[35m  DeepSeek\x1b[0m  deepseek-r1 \x1b[90m(default)\x1b[0m  deepseek-v3",
        );
        lines.push(
          "  \x1b[36m  OpenCode\x1b[0m  kimi \x1b[90m(default)\x1b[0m  glm-5  minimax-m2.7",
        );
        lines.push("");
        lines.push(
          "  \x1b[1;36m  Usage:\x1b[0m  \x1b[36m/model sonnet\x1b[0m  or  \x1b[36m/model gpt-4o\x1b[0m",
        );
        lines.push("");
        return { kind: "cmd", text: lines.join("\n") };
      }

      const match = MODELS[modelArg];
      if (match) {
        const cfg = loadKeys();
        cfg._activeModel = match.full;
        cfg._activeProvider = match.provider;
        writeFileSync(KEYS_FILE, JSON.stringify(cfg, null, 2));
        return {
          kind: "cmd",
          text: `\n  \x1b[32m\u2713 Model switched to \x1b[1;36m${match.full}\x1b[0m\n`,
        };
      }

      return {
        kind: "error",
        text: `Unknown model: ${modelArg}. Type /model to see available models.`,
      };
    }

    case "history": {
      const h: string[] = loadHist();
      if (h.length === 0) return { kind: "cmd", text: "\n  \x1b[2mNo history yet.\x1b[0m\n" };
      return {
        kind: "cmd",
        text: [
          "",
          "  \x1b[1;35mRecent\x1b[0m",
          "",
          ...h.map((x, i) => `  \x1b[2m${String(i + 1).padStart(2)}.\x1b[0m \x1b[33m${x}\x1b[0m`),
          "",
        ].join("\n"),
      };
    }

    default:
      return { kind: "error", text: `Unknown command: /${name}. Type /help` };
  }
}

async function callLLM(instruction: string): Promise<string> {
  const keys = loadKeys();
  const model = keys._activeModel ?? "";
  const apiKey =
    keys.OPENCODE_API_KEY ??
    keys.ANTHROPIC_API_KEY ??
    keys.OPENAI_API_KEY ??
    keys.GOOGLE_AI_KEY ??
    keys.DEEPSEEK_API_KEY ??
    "";

  if (!apiKey) {
    return "No API key configured. Run /config to set one up.";
  }

  // Determine endpoint based on model/provider
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  if (model.startsWith("opencode/") || keys.OPENCODE_API_KEY) {
    // OpenCode Go — OpenAI-compatible
    const modelId = model.replace("opencode/", "");
    url = "https://opencode.ai/zen/go/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keys.OPENCODE_API_KEY ?? apiKey}`,
    };
    body = {
      model: modelId || "kimi-k2.5",
      messages: [
        {
          role: "system",
          content:
            "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. When given a test instruction, describe what steps you would take to test it. Be concise.",
        },
        { role: "user", content: instruction },
      ],
      max_tokens: 1024,
    };
  } else if (keys.ANTHROPIC_API_KEY) {
    // Anthropic
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": keys.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    };
    body = {
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system:
        "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. When given a test instruction, describe what steps you would take to test it. Be concise.",
      messages: [{ role: "user", content: instruction }],
    };
  } else if (keys.OPENAI_API_KEY) {
    // OpenAI
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${keys.OPENAI_API_KEY}`,
    };
    body = {
      model: model || "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. When given a test instruction, describe what steps you would take to test it. Be concise.",
        },
        { role: "user", content: instruction },
      ],
      max_tokens: 1024,
    };
  } else if (keys.GOOGLE_AI_KEY) {
    // Gemini
    const m = model || "gemini-2.5-pro";
    url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
    headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": keys.GOOGLE_AI_KEY,
    };
    body = {
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      systemInstruction: {
        parts: [
          {
            text: "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. Be concise.",
          },
        ],
      },
      generationConfig: { maxOutputTokens: 1024 },
    };
  } else {
    return "No supported API key found. Run /config to set one up.";
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return `API error ${res.status}: ${errText.slice(0, 200)}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as Record<string, any>;

    // Parse response based on format
    let result = "";
    if (data.choices?.[0]?.message?.content) {
      // OpenAI / OpenCode format
      result = data.choices[0].message.content;
    } else if (data.choices?.[0]?.message?.reasoning) {
      // OpenCode reasoning-only response (content was null)
      result = data.choices[0].message.reasoning;
    } else if (data.content?.[0]?.text) {
      // Anthropic format
      result = data.content[0].text;
    } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      // Gemini format
      result = data.candidates[0].content.parts[0].text;
    } else {
      result = JSON.stringify(data, null, 2).slice(0, 500);
    }

    // Strip <environmentDetails>/<environment_details> from LLM response
    // Aggressive: truncate everything after the opening tag
    result = result
      .replace(/[\s\S]*<environment[_\s]*[Dd]etails>/i, "")
      .replace(/<\/environment[_\s]*[Dd]etails>/gi, "")
      .trim();
    // If tag is still there (different format), remove everything from <environment onward
    const envIdx = result.search(/<environment/i);
    if (envIdx !== -1) {
      result = result.slice(0, envIdx).trim();
    }
    return result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.name === "AbortError") return "Request timed out (30s). Try again.";
    return `Error: ${e.message}`;
  }
}

// ── Browser test runner ──────────────────────────────────────────────────

async function _runBrowserTest(
  url: string,
  pushMsg: (kind: MsgKind, text: string) => void,
): Promise<void> {
  pushMsg("info", `Opening browser → ${url}`);

  try {
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();

    pushMsg("info", "Launching Chromium...");
    await browserMgr.launchBrowser({
      headless: true,
      viewport: { width: 1920, height: 1080 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const page = await browserMgr.newPage();

    // 1. Navigate
    pushMsg("info", "Navigating...");
    const startTime = Date.now();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const loadTime = Date.now() - startTime;
    const status = response?.status?.() ?? 0;

    pushMsg("result", `  ✓ Page loaded — ${status} — ${loadTime}ms`);

    // 2. Get page title
    const title = await page.title();
    pushMsg("result", `  ✓ Title: ${title}`);

    // 3. Check console errors
    const consoleErrors: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on("console", (msg: any) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // 4. Screenshot
    const screenshotPath = join(process.cwd(), ".inspect", "screenshot.png");
    const screenshotDir = join(process.cwd(), ".inspect");
    if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    pushMsg("result", `  ✓ Screenshot saved → .inspect/screenshot.png`);

    // 5. Check links
    const links = (await page.evaluate(`
      Array.from(document.querySelectorAll("a[href]"))
        .map(a => a.href)
        .filter(h => h.startsWith("http"))
        .slice(0, 20)
    `)) as string[];
    pushMsg("result", `  ✓ Found ${links.length} links`);

    // 6. Check images
    const images = (await page.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        const broken = imgs.filter(i => !i.complete || i.naturalWidth === 0);
        return { total: imgs.length, broken: broken.length };
      })()
    `)) as { total: number; broken: number };
    if (images.broken > 0) {
      pushMsg("result", `  ✗ Images: ${images.total} total, ${images.broken} broken`);
    } else {
      pushMsg("result", `  ✓ Images: ${images.total} total, all loaded`);
    }

    // 7. Check meta tags
    const meta = (await page.evaluate(`
      (() => {
        const desc = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
        const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null;
        const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null;
        return { desc, viewport, og };
      })()
    `)) as { desc: string | null; viewport: string | null; og: string | null };
    pushMsg(
      "result",
      `  ${meta.viewport ? "✓" : "✗"} Viewport meta: ${meta.viewport ? "set" : "missing"}`,
    );
    pushMsg(
      "result",
      `  ${meta.desc ? "✓" : "✗"} Description: ${meta.desc ? meta.desc.slice(0, 60) : "missing"}`,
    );

    // 8. Check HTTPS
    const isHttps = url.startsWith("https://");
    pushMsg("result", `  ${isHttps ? "✓" : "✗"} HTTPS: ${isHttps ? "yes" : "no — insecure"}`);

    // 9. Page size
    const pageContent = await page.content();
    const sizeKb = Math.round(pageContent.length / 1024);
    pushMsg("result", `  ✓ Page size: ${sizeKb}KB HTML`);

    // 10. Console errors summary
    if (consoleErrors.length > 0) {
      pushMsg("result", `  ✗ Console errors: ${consoleErrors.length}`);
      for (const err of consoleErrors.slice(0, 3)) {
        pushMsg("result", `    → ${err.slice(0, 100)}`);
      }
    } else {
      pushMsg("result", `  ✓ No console errors`);
    }

    // Summary
    const issues = [
      images.broken > 0 ? `${images.broken} broken images` : null,
      !meta.viewport ? "missing viewport" : null,
      !meta.desc ? "missing description" : null,
      !isHttps ? "not HTTPS" : null,
      consoleErrors.length > 0 ? `${consoleErrors.length} console errors` : null,
    ].filter(Boolean);

    pushMsg("result", "");
    if (issues.length === 0) {
      pushMsg("result", `  ✓ All checks passed — ${loadTime}ms load time`);
    } else {
      pushMsg("result", `  ${issues.length} issue(s): ${issues.join(", ")}`);
    }

    await browserMgr.closeBrowser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    pushMsg("error", `Browser test failed: ${err.message}`);
    pushMsg("info", "Make sure Playwright browsers are installed: /install");
  }
}

// ── Markdown line renderer ───────────────────────────────────────────────

function MarkdownLine({ text }: { text: string }): React.ReactElement {
  // Split line into segments: **bold**, `code`, and plain text
  const parts: React.ReactElement[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1])
        parts.push(
          <Text key={key++} color="#cbd5e1">
            {boldMatch[1]}
          </Text>,
        );
      parts.push(
        <Text key={key++} color="#e2e8f0" bold>
          {boldMatch[2]}
        </Text>,
      );
      remaining = boldMatch[3];
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1])
        parts.push(
          <Text key={key++} color="#cbd5e1">
            {codeMatch[1]}
          </Text>,
        );
      parts.push(
        <Text key={key++} color="#22d3ee">
          {codeMatch[2]}
        </Text>,
      );
      remaining = codeMatch[3];
      continue;
    }

    // Plain text (no more matches)
    parts.push(
      <Text key={key} color="#cbd5e1">
        {remaining}
      </Text>,
    );
    break;
  }

  // Handle list items: - text
  if (text.trimStart().startsWith("- ")) {
    const indent = text.length - text.trimStart().length;
    const content = text.trimStart().slice(2);
    // Re-parse the content after "- " for bold/code
    return (
      <Box>
        <Text color="#475569">{" ".repeat(indent)}</Text>
        <Text color="#f97316">• </Text>
        <MarkdownLine text={content} />
      </Box>
    );
  }

  // Handle headers: # text, ## text
  if (text.startsWith("### "))
    return (
      <Text color="#f97316" bold>
        {text.slice(4)}
      </Text>
    );
  if (text.startsWith("## "))
    return (
      <Text color="#f97316" bold>
        {text.slice(3)}
      </Text>
    );
  if (text.startsWith("# "))
    return (
      <Text color="#f97316" bold>
        {text.slice(2)}
      </Text>
    );

  return <Box>{parts}</Box>;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatSession(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── REPL ────────────────────────────────────────────────────────────────

export function Repl(): React.ReactElement {
  const { exit } = useApp();
  const git = useGitInfo();
  const savedKeys = loadKeys();
  const activeModel = savedKeys._activeModel ?? "";
  const agent =
    activeModel ||
    (process.env.ANTHROPIC_API_KEY
      ? "claude"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : process.env.GOOGLE_AI_KEY
          ? "gemini"
          : process.env.DEEPSEEK_API_KEY
            ? "deepseek"
            : process.env.OPENCODE_API_KEY
              ? "opencode"
              : "ollama");

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const startTimeRef = React.useRef<number>(0);
  const sessionStartRef = React.useRef<number>(Date.now());

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionTime(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Full-screen modes
  const [showConfig, setShowConfig] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);

  const spinner = useSpinner(busy);

  // Track elapsed time while busy
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsed((Date.now() - startTimeRef.current) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, [busy]);

  const [hist] = useState(loadHist);
  const [hIdx, setHIdx] = useState(-1);
  const [draft, setDraft] = useState("");

  const idRef = React.useRef(1);
  const tokenRef = React.useRef(0);
  const testStartRef = React.useRef<number>(0);

  const CRUNCHES = [
    { sym: "\u25c7", verb: "Crunched", color: "#9b5a7a" },
    { sym: "\u25cb", verb: "Computed", color: "#4a7ab0" },
    { sym: "\u25a1", verb: "Synthesized", color: "#7a6a9e" },
    { sym: "\u25b3", verb: "Processed", color: "#2a8a6a" },
    { sym: "\u25bd", verb: "Analyzed", color: "#a08820" },
    { sym: "\u25b7", verb: "Resolved", color: "#24907a" },
    { sym: "\u25c1", verb: "Delivered", color: "#a86a2a" },
    { sym: "\u2299", verb: "Generated", color: "#8a60b0" },
    { sym: "\u2295", verb: "Rendered", color: "#1a90a0" },
    { sym: "\u2296", verb: "Completed", color: "#3a8a50" },
    { sym: "\u25ce", verb: "Assembled", color: "#9a5aaa" },
    { sym: "\u25a1", verb: "Evaluated", color: "#2a7aaa" },
    { sym: "\u25c8", verb: "Finalized", color: "#a85a5a" },
    { sym: "\u2219", verb: "Decoded", color: "#6a8a28" },
    { sym: "\u25ab", verb: "Formatted", color: "#606aa0" },
    { sym: "\u25cc", verb: "Polished", color: "#a08a20" },
    { sym: "\u2218", verb: "Crafted", color: "#a85a6a" },
    { sym: "\u229b", verb: "Built", color: "#a88050" },
    { sym: "\u2298", verb: "Parsed", color: "#4a90a0" },
    { sym: "\u229c", verb: "Handled", color: "#5a9a6a" },
  ];

  const formatDuration = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const push = useCallback((kind: MsgKind, rawText: string) => {
    const msgId = idRef.current++;
    // Strip <environment_details>/<environmentDetails> aggressively
    let text = rawText;
    const envIdx = text.search(/<environment/i);
    if (envIdx !== -1) {
      text = text.slice(0, envIdx).trim();
    }
    text = text.replace(/Current time:\s*[^\n]*/gi, "").trim();
    // Also strip any standalone environment tags
    text = text.replace(/<\/?environment[_\s]*[Dd]etails>/gi, "").trim();
    setMsgs((p) => [...p, { id: msgId, kind, text }]);

    // Detect structured TOKENS message from orchestrator
    if (text.startsWith("TOKENS:")) {
      const [, tokensStr, costStr] = text.split(":");
      const actualTokens = parseInt(tokensStr, 10);
      const actualCost = parseFloat(costStr);
      if (!isNaN(actualTokens)) {
        tokenRef.current = actualTokens;
        setTotalTokens(actualTokens);
      }
      if (!isNaN(actualCost)) setTotalCost(actualCost);
      return;
    }

    // Only update token count for actual LLM responses (result kind), not every message
    if (kind === "result" && text.length > 0 && !text.startsWith("CRUNCH:")) {
      const tokens = Math.ceil(text.length / 4);
      tokenRef.current += tokens;
      setTotalTokens(tokenRef.current);
      setTotalCost((prev) => prev + tokens * 0.000005);
    }
  }, []);

  const submit = useCallback(async () => {
    const t = input.trim();
    if (!t) return;
    setInput("");
    setCursor(0);
    setHIdx(-1);

    // Save to history
    const dup = hist.filter((x) => x !== t);
    dup.unshift(t);
    hist.length = 0;
    hist.push(...dup.slice(0, 20));
    saveHist(hist);

    if (t.startsWith("/")) {
      // Full-screen commands — don't add to messages or history
      if (t.toLowerCase().startsWith("/config")) {
        setTimeout(() => setShowConfig(true), 50);
        return;
      }
      if (t.toLowerCase() === "/model") {
        setTimeout(() => setShowModel(true), 50);
        return;
      }
      if (t.toLowerCase() === "/dashboard") {
        setTimeout(() => setShowDashboard(true), 50);
        return;
      }
      if (t.toLowerCase() === "/history" || t.toLowerCase() === "/reports") {
        setTimeout(() => setShowHistory(true), 50);
        return;
      }
      if (t.toLowerCase() === "/build" || t.toLowerCase() === "/builder") {
        setTimeout(() => setShowBuilder(true), 50);
        return;
      }
      push("user", t);
      setBusy(true);
      const r = await handleSlash(t);
      setBusy(false);
      if (r === "QUIT") {
        exit();
        return;
      }
      if (r === "CLEAR") {
        setMsgs([]);
        return;
      }
      push(r.kind, r.text);
      return;
    }

    push("user", t);

    // Detect URL → run full agent test
    const urlMatch = t.match(/^(https?:\/\/\S+)$/i);
    const testUrlMatch = t.match(/^test\s+(https?:\/\/\S+)/i);
    const testUrl = urlMatch?.[1] ?? testUrlMatch?.[1];

    if (testUrl) {
      setBusy(true);
      testStartRef.current = Date.now();
      try {
        const { runFullTest } = await import("../agents/orchestrator.js");
        // Use headed if display available, headless otherwise
        const hasDisplay = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
        await runFullTest({
          url: testUrl,
          headed: hasDisplay,
          maxSteps: 15,
          llm: async (messages) => {
            // Use the last message content as the prompt
            const lastMsg = messages[messages.length - 1]?.content ?? "";
            return callLLM(lastMsg);
          },
          onProgress: (() => {
            // Clean output filter — suppress noise, deduplicate, format
            const seen = new Set<string>();
            const suppress = [
              /^\s*$/, // empty lines
              /^Running .* audit\.\.\.$/, // duplicate "Running X audit..."
              /^Running .* audit\.\.\.\s*$/, // with trailing space
              /^Crawl(ing)? complete:/, // raw crawler callback
              /^Analysis complete:/, // raw analyzer callback
              /^Found \d+ auth/, // duplicate of analyzer summary
              /^Security audit complete/, // duplicate of score line
              /^Performance audit complete/, // duplicate of score line
              /^Responsive audit complete/, // duplicate of score line
              /^No notable features/, // noise
              /^\[[\d/]+\] (Visiting|Analyzing):/, // per-page crawl/analyze lines
              /^Analyzing \d+ pages? from/, // "Analyzing 1 pages from..."
              /^Crawling .* \(max \d+/, // "Crawling URL (max 20 pages, depth 3)"
              /^Found robots\.txt/, // robots.txt detection noise
              /^Agent starting autonomous/, // "Agent starting autonomous exploration..."
              /^Agent returned unparseable/, // LLM parse error — handle silently
              /^SEO audit skipped/, // SEO crash noise
              /^Accessibility audit skipped/, // audit skip noise
              /^Security audit skipped/,
              /^Performance audit skipped/,
              /^Responsive audit skipped/,
              /^Checking (security|HTTPS|ARIA)/i, // sub-audit internal steps
              /^Checking security headers/,
              /^Auditing cookies/, // sub-audit internal steps
              /^Testing for reflected XSS/, // sub-audit internal steps
              /^Scanning for exposed sensitive/, // sub-audit internal steps
              /^Testing keyboard navigation/, // sub-audit internal steps
              /^Running axe-core/, // sub-audit internal steps
              /^Measuring Core Web Vitals/, // sub-audit internal steps
              /^Navigating to page\.\.\./, // perf audit internal
              /^Page loaded in \d+ms/, // perf audit internal
              /^Taking page snapshot/, // internal
              /^\d+ (serious|moderate|minor)$/, // "3 serious" count lines
              /^Crawled \d+ pages?,/, // duplicate of pass line
              /^Framework hydration complete/, // merge with SPA detected
              /^Console errors?:\s*\d+/i, // console error counts — shown in report
              /^\u26A0\s*Console errors/i, // ⚠ Console errors variant
            ];
            let lastLine = "";
            const seenViewportIssues = new Map<string, number>(); // collapse same issues

            return (kind: string, message: string) => {
              const trimmed = message.trim();

              // Skip empty
              if (!trimmed) return;

              // Skip exact duplicates of last line
              if (trimmed === lastLine) return;
              lastLine = trimmed;

              // Skip suppressed patterns
              if (suppress.some((p) => p.test(trimmed))) return;

              // Truncate long error messages (stack traces, call logs)
              let cleaned = message;
              if (trimmed.includes("Call log:")) {
                cleaned = message.split("Call log:")[0].trim();
                if (!cleaned) return;
              }

              // Collapse duplicate viewport issues (same issue across devices)
              if (/^\s*(moderate|serious|minor|low|high|critical):/.test(trimmed)) {
                const issueKey = trimmed.replace(/^.*?:\s*/, "").slice(0, 60);
                const count = seenViewportIssues.get(issueKey) ?? 0;
                seenViewportIssues.set(issueKey, count + 1);
                if (count > 0) return; // skip duplicate issue text
              }

              // Deduplicate by content
              const key = trimmed.slice(0, 80);
              if (
                seen.has(key) &&
                !trimmed.startsWith("TIER_BANNER") &&
                !trimmed.startsWith("PROGRESS_BAR") &&
                !trimmed.startsWith("Step ")
              )
                return;
              seen.add(key);

              switch (kind) {
                case "pass":
                  push("result", cleaned);
                  break;
                case "fail":
                  push("error", cleaned);
                  break;
                case "warn":
                  push("info", cleaned);
                  break;
                case "step":
                  push("info", cleaned);
                  break;
                case "done":
                  push("result", cleaned);
                  break;
                default:
                  push("info", cleaned);
              }
            };
          })(),
        });
        // Total time with random verb — shown once at completion
        const totalSecs = (Date.now() - testStartRef.current) / 1000;
        const c = CRUNCHES[Math.floor(Math.random() * CRUNCHES.length)];
        push("result", `CRUNCH:${c.color}:${c.sym} ${c.verb} in ${formatDuration(totalSecs)}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        push("error", `Agent test failed: ${err.message}`);
        push("info", "Make sure browsers are installed: /install");
      }
      setBusy(false);
      return;
    }

    // Otherwise chat with AI
    setBusy(true);
    const chatStart = Date.now();
    const out = await callLLM(t);
    setBusy(false);
    const chatSecs = (Date.now() - chatStart) / 1000;
    const c = CRUNCHES[Math.floor(Math.random() * CRUNCHES.length)];
    push(
      "result",
      out + `\n\n\nCRUNCH:${c.color}:${c.sym} ${c.verb} in ${formatDuration(chatSecs)}`,
    );
  }, [input, push, exit, hist]);

  const ctrlCRef = React.useRef(0);
  const ctrlCTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ctrlCHint, setCtrlCHint] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);

  // Filtered slash commands based on current input
  const slashSuggestions = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const query = input.slice(1).toLowerCase();
    // Hide suggestions if exact command is typed
    if (SLASH_COMMANDS.some((c) => c.name === query)) return [];
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(query));
  }, [input]);

  useInput((ch, key) => {
    if (busy || showConfig || showModel) return;
    if (key.ctrl && ch === "c") {
      if (busy) {
        setBusy(false);
        push("info", "Test cancelled");
        return;
      }
      if (input) {
        setInput("");
        setCursor(0);
        ctrlCRef.current = 0;
        setCtrlCHint(false);
      } else {
        ctrlCRef.current++;
        if (ctrlCRef.current >= 2) {
          exit();
          return;
        }
        setCtrlCHint(true);
        if (ctrlCTimerRef.current) clearTimeout(ctrlCTimerRef.current);
        ctrlCTimerRef.current = setTimeout(() => {
          ctrlCRef.current = 0;
          setCtrlCHint(false);
        }, 2000);
      }
      return;
    }
    // Any other key resets ctrl+c state
    if (ctrlCHint) {
      ctrlCRef.current = 0;
      setCtrlCHint(false);
    }
    if (key.escape) {
      if (busy) {
        setBusy(false);
        push("info", "Test cancelled");
        return;
      }
      if (input) {
        setInput("");
        setCursor(0);
      }
      return;
    }
    if (key.return) {
      // If slash suggestions showing and one is highlighted, accept it
      if (slashSuggestions.length > 0 && input.startsWith("/") && input.indexOf(" ") === -1) {
        const selected = slashSuggestions[slashIdx % slashSuggestions.length];
        if (selected) {
          setInput("/" + selected.name);
          setCursor(selected.name.length + 1);
          setSlashIdx(0);
          // Don't submit yet — let user press Enter again to run
          return;
        }
      }
      submit();
      return;
    }
    // Tab to accept slash suggestion
    if (key.tab && slashSuggestions.length > 0) {
      const selected = slashSuggestions[slashIdx % slashSuggestions.length];
      if (selected) {
        setInput("/" + selected.name);
        setCursor(selected.name.length + 1);
        setSlashIdx(0);
      }
      return;
    }
    // Up/Down navigate slash suggestions when showing
    if (slashSuggestions.length > 0 && input.startsWith("/")) {
      if (key.upArrow) {
        setSlashIdx((i) => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (key.downArrow) {
        setSlashIdx((i) => (i + 1) % slashSuggestions.length);
        return;
      }
    }
    if (key.upArrow && hist.length > 0) {
      if (hIdx === -1) setDraft(input);
      const n = Math.min(hIdx + 1, hist.length - 1);
      setHIdx(n);
      setInput(hist[n]);
      setCursor(hist[n].length);
      return;
    }
    if (key.downArrow) {
      if (hIdx <= 0) {
        setHIdx(-1);
        setInput(draft);
        setCursor(draft.length);
      } else {
        const n = hIdx - 1;
        setHIdx(n);
        setInput(hist[n]);
        setCursor(hist[n].length);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((p) => Math.max(0, p - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((p) => Math.min(input.length, p + 1));
      return;
    }
    if (key.ctrl) {
      if (ch === "a") {
        setCursor(0);
        return;
      }
      if (ch === "e") {
        setCursor(input.length);
        return;
      }
      if (ch === "u") {
        setInput(input.slice(cursor));
        setCursor(0);
        return;
      }
      if (ch === "k") {
        setInput(input.slice(0, cursor));
        return;
      }
      if (ch === "w") {
        let i = cursor - 1;
        while (i >= 0 && input[i] === " ") i--;
        while (i >= 0 && input[i] !== " ") i--;
        setInput(input.slice(0, i + 1) + input.slice(cursor));
        setCursor(i + 1);
        return;
      }
      if (ch === "l") {
        setMsgs([]);
        return;
      }
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setInput(input.slice(0, cursor - 1) + input.slice(cursor));
        setCursor(cursor - 1);
      }
      return;
    }
    if (ch && !key.meta && ch.length >= 1) {
      // Handle both single chars and paste (multi-char)
      const cleaned = ch.replace(/[\r\n]/g, " ");
      setInput(input.slice(0, cursor) + cleaned + input.slice(cursor));
      setCursor(cursor + cleaned.length);
      setHIdx(-1);
    }
  });

  const welcomeItem = useMemo(
    () => ({ key: "__welcome__", m: { id: -1, kind: "welcome" as const, text: "" } }),
    [],
  );
  const items = useMemo(
    () =>
      (git.loaded ? [welcomeItem] : []) as Array<{
        key: string;
        m: { id: number; kind: MsgKind; text: string };
      }>,
    [git.loaded, welcomeItem],
  );
  const allItems = useMemo(
    () => [...items, ...msgs.map((m) => ({ key: String(m.id), m }))],
    [items, msgs],
  );

  // ── Color-aware info line renderer ────────────────────────────────────
  const tierColors: Record<string, string> = { "1": "#22d3ee", "2": "#f97316", "3": "#a855f7" };
  const tierIcons: Record<string, string> = { "1": "\u25CE", "2": "\u25B6", "3": "\u2605" };

  const renderInfoLine = (text: string): React.ReactElement => {
    const t = text.trim();

    // ── Structured messages (TIER_BANNER, PROGRESS_BAR, TOKENS) ──────────
    // Suppress TOKENS messages — they're used for footer tracking only
    if (t.startsWith("TOKENS:")) {
      return <></>;
    }
    if (t.startsWith("TIER_BANNER:")) {
      const [, num, name, desc] = t.split(":");
      const c = tierColors[num] ?? "#a855f7";
      const icon = tierIcons[num] ?? "\u25C6";
      return (
        <Box flexDirection="column">
          <Text color={c} bold>
            {" \u2500".repeat(28)}
          </Text>
          <Text color={c} bold>
            {" "}
            {icon} TIER {num} {"\u2502"} {name}
          </Text>
          <Text color={c} dimColor>
            {" "}
            {desc}
          </Text>
          <Text color={c} bold>
            {" \u2500".repeat(28)}
          </Text>
        </Box>
      );
    }

    if (t.startsWith("PROGRESS_BAR:")) {
      const [, bar, counts, pct, label] = t.split(":");
      return (
        <>
          <Text color="#a855f7">{"\u25CF"} </Text>
          <Text color="#a855f7">{bar}</Text>
          <Text color="#e2e8f0"> {counts} </Text>
          <Text color="#94a3b8">({pct})</Text>
          {label && <Text color="#64748b"> {label}</Text>}
        </>
      );
    }

    // ── Step indicators ────────────────────────────────────────────────
    if (/^Step \d+/.test(t)) {
      const match = t.match(/^Step (\d+)/);
      const num = match?.[1] ?? "?";
      const rest = t.replace(/^Step \d+\s*[—-]\s*/, "");
      return (
        <>
          <Text color="#f59e0b" bold>
            {"\u25B6"}{" "}
          </Text>
          <Text color="#f59e0b" bold>
            Step {num}
          </Text>
          <Text color="#94a3b8"> {"\u2500"} </Text>
          <Text color="#fbbf24">{rest}</Text>
        </>
      );
    }

    // ── Pass/fail ──────────────────────────────────────────────────────
    if (t.includes("\u2713") || t.includes("\u2714")) {
      return <Text color="#22c55e">{text}</Text>;
    }
    if (t.includes("\u2717") || t.includes("\u2716") || t.includes("\u2718")) {
      return <Text color="#ef4444">{text}</Text>;
    }

    // ── Severity-tagged issues ─────────────────────────────────────────
    if (t.includes("[critical]") || t.includes("[serious]")) {
      return (
        <>
          <Text color="#ef4444">{"\u25AA"} </Text>
          <Text color="#fca5a5">{text}</Text>
        </>
      );
    }
    if (t.includes("[high]")) {
      return (
        <>
          <Text color="#f97316">{"\u25AA"} </Text>
          <Text color="#fdba74">{text}</Text>
        </>
      );
    }
    if (t.includes("[medium]") || t.includes("[moderate]")) {
      return (
        <>
          <Text color="#eab308">{"\u25AA"} </Text>
          <Text color="#fde68a">{text}</Text>
        </>
      );
    }
    if (t.includes("[low]") || t.includes("[minor]") || t.includes("[info]")) {
      return (
        <>
          <Text color="#475569">{"\u25AA"} </Text>
          <Text color="#94a3b8">{text}</Text>
        </>
      );
    }

    // ── Warnings (⚠) ──────────────────────────────────────────────────
    if (t.includes("\u26A0") || t.includes("\u26a0")) {
      return (
        <>
          <Text color="#eab308">{"\u26A0"} </Text>
          <Text color="#fde68a">{text.replace(/⚠\s*/, "")}</Text>
        </>
      );
    }

    // ── Score lines (XX/100) ───────────────────────────────────────────
    if (/\d+\/100/.test(t)) {
      const match = t.match(/(\d+)\/100/);
      const score = match ? parseInt(match[1]) : 0;
      const c = score >= 90 ? "#22c55e" : score >= 70 ? "#eab308" : "#ef4444";
      return (
        <>
          <Text color={c}>{"\u25C9"} </Text>
          <Text color={c} bold>
            {text}
          </Text>
        </>
      );
    }

    // ── Discovery actions ──────────────────────────────────────────────
    if (/^(Navigating|Crawling|Found|Crawl|Page loaded)/i.test(t)) {
      return (
        <>
          <Text color="#0ea5e9">{"\u276F"} </Text>
          <Text color="#7dd3fc">{text}</Text>
        </>
      );
    }
    if (/^(Tech stack|Framework|SPA detected|Discovered)/i.test(t)) {
      return (
        <>
          <Text color="#14b8a6">{"\u276F"} </Text>
          <Text color="#5eead4">{text}</Text>
        </>
      );
    }
    if (/^(Snapshot|Analyzing|Analysis)/i.test(t)) {
      return (
        <>
          <Text color="#14b8a6">{"\u25C7"} </Text>
          <Text color="#5eead4">{text}</Text>
        </>
      );
    }

    // ── Agent reasoning ────────────────────────────────────────────────
    if (t.startsWith("Agent:")) {
      return (
        <>
          <Text color="#c084fc">{"\u2727"} </Text>
          <Text color="#c084fc">{text.replace("Agent: ", "")}</Text>
        </>
      );
    }
    if (t.startsWith("Agent returned")) {
      return (
        <>
          <Text color="#8b5cf6">{"\u25CB"} </Text>
          <Text color="#94a3b8">{text}</Text>
        </>
      );
    }

    // ── Audit-specific ─────────────────────────────────────────────────
    const auditMap: Record<string, [string, string]> = {
      Security: ["#f43f5e", "\u2740"],
      Accessibility: ["#ec4899", "\u2740"],
      Performance: ["#0ea5e9", "\u26A1"],
      Responsive: ["#8b5cf6", "\u25A3"],
      SEO: ["#6366f1", "\u25CE"],
      Running: ["#64748b", "\u25CB"],
    };
    for (const [key, [color, icon]] of Object.entries(auditMap)) {
      if (t.startsWith(key) || (t.startsWith("Running") && t.includes(key.toLowerCase()))) {
        return (
          <>
            <Text color={color}>{icon} </Text>
            <Text color={color}>{text}</Text>
          </>
        );
      }
    }
    if (t.startsWith("Running")) {
      return (
        <>
          <Text color="#64748b">{"\u25CB"} </Text>
          <Text color="#94a3b8">{text}</Text>
        </>
      );
    }

    // ── Form testing ───────────────────────────────────────────────────
    if (/^(Test \d|Empty submission|Invalid data|Boundary|Filling)/i.test(t)) {
      return (
        <>
          <Text color="#f59e0b">{"\u25B7"} </Text>
          <Text color="#fbbf24">{text}</Text>
        </>
      );
    }

    // ── Indented sub-items (start with spaces) ─────────────────────────
    if (text.startsWith("    ") && /^\s+[a-zA-Z[]/.test(text)) {
      return (
        <>
          <Text color="#475569"> {"\u2502"} </Text>
          <Text color="#94a3b8">{text.trim()}</Text>
        </>
      );
    }

    // ── Default ────────────────────────────────────────────────────────
    return (
      <>
        <Text color="#22d3ee">{"\u25CF"} </Text>
        <Text color="#7dd3fc">{text}</Text>
      </>
    );
  };

  // Full-screen modes
  if (showConfig) {
    return <ConfigScreen onDone={() => setShowConfig(false)} />;
  }
  if (showModel) {
    return <ModelScreen onDone={() => setShowModel(false)} />;
  }
  if (showDashboard) {
    return <DashboardScreen onDone={() => setShowDashboard(false)} />;
  }
  if (showHistory) {
    return <HistoryScreen onDone={() => setShowHistory(false)} />;
  }
  if (showBuilder) {
    return (
      <TestBuilderScreen
        onDone={(test) => {
          setShowBuilder(false);
          if (test) {
            push(
              "info",
              `Test "${test.name}" built with ${test.steps.length} steps. Run with: inspect test -m "${test.name}" --url ${test.url}`,
            );
          }
        }}
      />
    );
  }

  return (
    <Box flexDirection="column">
      {/* Messages — welcome is the first static item */}
      <Static items={allItems}>
        {({ m }) => {
          switch (m.kind) {
            case "welcome":
              return (
                <Box key="__welcome__" flexDirection="column" paddingX={2} paddingY={1}>
                  <Box>
                    <Text color="#f97316" bold>
                      Welcome to{" "}
                    </Text>
                    <Text color="#22d3ee" bold>
                      Inspect{" "}
                    </Text>
                    <Text color="#64748b">v0.1.0</Text>
                  </Box>
                  <Box marginTop={1} flexDirection="column">
                    <Box>
                      <Text color="#f59e0b"> {"\u25c7"} </Text>
                      <Text color="#94a3b8">cwd: </Text>
                      <Text color="#e2e8f0">
                        {process.cwd().replace(process.env.HOME ?? "", "~")}
                      </Text>
                    </Box>
                    {git.branch ? (
                      <Box>
                        <Text color="#22c55e"> {"\u25c7"} </Text>
                        <Text color="#94a3b8">branch: </Text>
                        <Text color="#22c55e" bold>
                          {git.branch}
                        </Text>
                        {git.files > 0 && <Text color="#eab308"> ({git.files} changed)</Text>}
                      </Box>
                    ) : null}
                    <Box>
                      <Text color="#f97316"> {"\u25c7"} </Text>
                      <Text color="#94a3b8">model: </Text>
                      <Text color="#f97316" bold>
                        {agent}
                      </Text>
                      {agent === "ollama" && <Text color="#64748b"> (local)</Text>}
                    </Box>
                  </Box>
                  <Box marginTop={1}>
                    <Text color="#38bdf8"> {"\u25c7"} </Text>
                    <Text color="#94a3b8">Type a test instruction or URL and press </Text>
                    <Text color="#22c55e" bold>
                      Enter
                    </Text>
                  </Box>
                </Box>
              );
            case "user":
              return (
                <Box key={m.id} flexDirection="column">
                  <Box paddingX={2}>
                    <Text color="#334155">
                      {"\u2500".repeat(Math.min(60, process.stdout.columns - 4 || 76))}
                    </Text>
                  </Box>
                  <Box paddingX={2} marginTop={1}>
                    <Text color="#f97316" bold>
                      {"\u25c6"}{" "}
                    </Text>
                    <Text color="#e2e8f0">{m.text}</Text>
                  </Box>
                </Box>
              );
            case "result":
            case "cmd":
              return (
                <Box key={m.id} paddingX={2} flexDirection="column" marginTop={1} marginBottom={1}>
                  {m.text
                    .trim()
                    .split("\n")
                    .filter((line) => !/<\/?environment/i.test(line) && !/Current time:/.test(line))
                    .map((line, i) => {
                      // Preserve blank lines as spacing
                      if (line.trim() === "") {
                        return <Text key={i}> </Text>;
                      }
                      // Color result lines based on content
                      if (line.includes("\u2713") || line.includes("✓")) {
                        return (
                          <Text key={i} color="#22c55e">
                            {line}
                          </Text>
                        );
                      }
                      if (
                        line.includes("\u2717") ||
                        line.includes("✗") ||
                        line.includes("\u2716")
                      ) {
                        return (
                          <Text key={i} color="#ef4444">
                            {line}
                          </Text>
                        );
                      }
                      // Colored crunch timing line (CRUNCH:color:text)
                      const crunchMatch = line.match(/^\s*CRUNCH:(#[0-9a-fA-F]+):(.+)$/);
                      if (crunchMatch) {
                        return (
                          <Text key={i} color={crunchMatch[1]}>
                            {crunchMatch[2]}
                          </Text>
                        );
                      }
                      // Dim envDetails leftovers
                      if (/<environment/i.test(line) || /Current time:/.test(line)) {
                        return (
                          <Text key={i} color="#475569">
                            {line}
                          </Text>
                        );
                      }
                      return <MarkdownLine key={i} text={line} />;
                    })}
                </Box>
              );
            case "error":
              return (
                <Box key={m.id} paddingX={2} marginTop={1}>
                  <Text color="#ef4444" bold>
                    {"\u2716"}{" "}
                  </Text>
                  <Text color="#fca5a5">{m.text}</Text>
                </Box>
              );
            case "info":
              return (
                <Box key={m.id} paddingX={2} marginTop={1}>
                  {renderInfoLine(m.text)}
                </Box>
              );
            default:
              return <Text key={m.id}>{m.text}</Text>;
          }
        }}
      </Static>

      {/* Spinner */}
      {busy && (
        <Box paddingX={2} marginTop={1}>
          <Text color={spinner.color}>{spinner.char} </Text>
          <Text color={spinner.color}>{spinner.verb}... </Text>
          <Text color="#64748b">{elapsed.toFixed(2)}s</Text>
        </Box>
      )}

      {/* Ctrl+C hint */}
      {ctrlCHint && (
        <Box paddingX={2}>
          <Text color="#eab308">Press Ctrl+C again to exit, or type /quit</Text>
        </Box>
      )}

      {/* Input — full width borders, open left/right */}
      <Box flexDirection="column">
        <Text color="gray">{"\u2500".repeat(process.stdout.columns || 80)}</Text>
        <Box paddingX={0} paddingY={0}>
          <Text color="white" bold>
            {"\u276f"}{" "}
          </Text>
          {input ? (
            <Box>
              <Text color="#e2e8f0">{input.slice(0, cursor)}</Text>
              <Text backgroundColor="white" color="black">
                {input[cursor] ?? " "}
              </Text>
              <Text color="#e2e8f0">{input.slice(cursor + 1)}</Text>
            </Box>
          ) : (
            <Text backgroundColor="white" color="black">
              {" "}
            </Text>
          )}
        </Box>
        <Text color="gray">{"\u2500".repeat(process.stdout.columns || 80)}</Text>
      </Box>

      {/* Slash command suggestions — below input, full width like Claude Code */}
      {slashSuggestions.length > 0 && !busy && (
        <Box flexDirection="column" paddingX={1}>
          {slashSuggestions.map((cmd, i) => {
            const active = i === slashIdx % slashSuggestions.length;
            return (
              <Box key={cmd.name} width="100%">
                <Text
                  backgroundColor={active ? "#1e293b" : undefined}
                  color={active ? "white" : "#64748b"}
                >
                  {"  /{0}".replace("{0}", cmd.name.padEnd(18))}
                  {cmd.desc.padEnd(60)}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer hints — hide when slash suggestions are showing */}
      {slashSuggestions.length === 0 && (
        <Box paddingX={2} justifyContent="space-between">
          <Box>
            <Text color="#22c55e">enter</Text>
            <Text color="#64748b"> send </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#38bdf8">{"\u2191\u2193"}</Text>
            <Text color="#64748b"> history </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#eab308">/help</Text>
            <Text color="#64748b"> </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#ef4444">/quit</Text>
          </Box>
          <Box>
            {totalTokens > 0 && (
              <>
                <Text color="#a855f7">{totalTokens.toLocaleString()} tokens</Text>
                <Text color="#475569"> {"\u00b7"} </Text>
                <Text color="#38bdf8">{(totalTokens / 10000).toFixed(2)}% used</Text>
                <Text color="#475569"> {"\u00b7"} </Text>
                <Text color="#eab308">
                  ${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}
                </Text>
                <Text color="#475569"> {"\u00b7"} </Text>
              </>
            )}
            <Text color="#64748b">{formatSession(sessionTime)}</Text>
            <Text color="#475569"> {"\u00b7"} </Text>
            <Text color="#475569">{process.cwd().replace(process.env.HOME ?? "", "~")}</Text>
            {git.branch && <Text color="#64748b">: </Text>}
            {git.branch && <Text color="#22c55e">{git.branch}</Text>}
          </Box>
        </Box>
      )}
      {slashSuggestions.length > 0 && (
        <Box paddingX={2} justifyContent="space-between">
          <Box>
            <Text color="#38bdf8">{"\u2191\u2193"}</Text>
            <Text color="#64748b"> navigate </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#22c55e">tab</Text>
            <Text color="#64748b"> accept </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#22c55e">enter</Text>
            <Text color="#64748b"> run</Text>
          </Box>
          <Box>
            {totalTokens > 0 && (
              <>
                <Text color="#a855f7">{totalTokens.toLocaleString()} tokens</Text>
                <Text color="#475569"> {"\u00b7"} </Text>
                <Text color="#38bdf8">{(totalTokens / 10000).toFixed(2)}% used</Text>
                <Text color="#475569"> {"\u00b7"} </Text>
                <Text color="#eab308">
                  ${totalCost < 0.01 ? totalCost.toFixed(4) : totalCost.toFixed(2)}
                </Text>
                <Text color="#475569"> {"\u00b7"} </Text>
              </>
            )}
            <Text color="#64748b">{formatSession(sessionTime)}</Text>
            <Text color="#475569"> {"\u00b7"} </Text>
            <Text color="#475569">{process.cwd().replace(process.env.HOME ?? "", "~")}</Text>
            {git.branch && <Text color="#64748b">: </Text>}
            {git.branch && <Text color="#22c55e">{git.branch}</Text>}
          </Box>
        </Box>
      )}
      {slashSuggestions.length > 0 && (
        <Box paddingX={2} justifyContent="space-between">
          <Box>
            <Text color="#38bdf8">{"\u2191\u2193"}</Text>
            <Text color="#64748b"> navigate </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#22c55e">tab</Text>
            <Text color="#64748b"> accept </Text>
            <Text color="#475569">{"\u00b7"} </Text>
            <Text color="#22c55e">enter</Text>
            <Text color="#64748b"> run</Text>
          </Box>
          <Box>
            <Text color="#475569">{process.cwd().replace(process.env.HOME ?? "", "~")}</Text>
            {git.branch && <Text color="#64748b">: </Text>}
            {git.branch && <Text color="#22c55e">{git.branch}</Text>}
          </Box>
        </Box>
      )}
    </Box>
  );
}
