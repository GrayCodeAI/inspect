import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
import { ConfigScreen } from "./ConfigScreen.js";
import { ModelScreen } from "./ModelScreen.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── Slash command definitions ────────────────────────────────────────────

const SLASH_COMMANDS = [
  { name: "help", desc: "Show available commands" },
  { name: "config", desc: "Configure providers, keys, and model" },
  { name: "model", desc: "Switch AI model or list all models" },
  { name: "doctor", desc: "Check environment and dependencies" },
  { name: "devices", desc: "List available device presets" },
  { name: "history", desc: "Show past test instructions" },
  { name: "init", desc: "Initialize project configuration" },
  { name: "install", desc: "Install browser dependencies" },
  { name: "clear", desc: "Clear conversation history" },
  { name: "quit", desc: "Exit inspect" },
];

const CONFIG_PROVIDERS = [
  { key: "ANTHROPIC_API_KEY", short: "claude", name: "Claude", models: "Sonnet 4, Opus 4, Haiku 3.5", defaultModel: "claude-sonnet-4-20250514", url: "console.anthropic.com/settings/keys" },
  { key: "OPENAI_API_KEY", short: "gpt", name: "OpenAI", models: "GPT-4o, GPT-4.1, o3", defaultModel: "gpt-4o", url: "platform.openai.com/api-keys" },
  { key: "GOOGLE_AI_KEY", short: "gemini", name: "Gemini", models: "Gemini 2.5 Pro, Flash", defaultModel: "gemini-2.5-pro", url: "aistudio.google.com/apikey" },
  { key: "DEEPSEEK_API_KEY", short: "deepseek", name: "DeepSeek", models: "DeepSeek R1, V3", defaultModel: "deepseek-r1", url: "platform.deepseek.com/api_keys" },
] as const;

// ── Types ───────────────────────────────────────────────────────────────

type MsgKind = "user" | "result" | "info" | "error" | "cmd";

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
  } catch {}
  return {};
}

function saveKey(envVar: string, value: string): void {
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
  } catch {}
  return [];
}

function saveHist(h: string[]): void {
  try {
    const d = join(process.cwd(), ".inspect");
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "history.json"), JSON.stringify(h.slice(0, 20)));
  } catch {}
}

// ── Spinner ─────────────────────────────────────────────────────────────

const FRAMES = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588", "\u2587", "\u2586", "\u2585", "\u2584", "\u2583", "\u2582"];
const VERBS = [
  "Thinking", "Analyzing", "Planning", "Scanning", "Testing",
  "Inspecting", "Evaluating", "Checking", "Processing", "Working",
];

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 100);
    return () => clearInterval(id);
  }, [active]);
  return active ? FRAMES[frame] : "";
}

// ── Git info ────────────────────────────────────────────────────────────

function useGitInfo(): { branch: string; files: number } {
  const [info, setInfo] = useState({ branch: "", files: 0 });
  useEffect(() => {
    (async () => {
      try {
        const { GitManager } = await import("@inspect/core");
        const git = new GitManager();
        const branch = await git.getCurrentBranch();
        const files = await git.getChangedFiles("unstaged");
        setInfo({ branch, files: files.length });
      } catch {
        setInfo({ branch: "", files: 0 });
      }
    })();
  }, []);
  return info;
}

// ── Slash commands ──────────────────────────────────────────────────────

async function handleSlash(cmd: string): Promise<{ kind: MsgKind; text: string } | "QUIT" | "CLEAR"> {
  const parts = cmd.slice(1).trim().split(/\s+/);
  const name = parts[0]?.toLowerCase() ?? "";

  switch (name) {
    case "quit": case "q": case "exit":
      return "QUIT";
    case "clear": case "cls":
      return "CLEAR";

    case "help": case "h":
      return { kind: "cmd", text: [
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
      ].join("\n") };

    case "doctor": case "devices": case "init": case "install": {
      try {
        const cliPath = join(__dirname, "..", "index.js");
        const { stdout } = await execFile(process.execPath, [cliPath, name], { timeout: 15000 });
        return { kind: "cmd", text: stdout.trim() };
      } catch (e: any) {
        return { kind: "cmd", text: e.stdout?.trim() ?? e.message };
      }
    }

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
        "o3": { full: "o3-mini", provider: "gpt" },
        "gemini-pro": { full: "gemini-2.5-pro", provider: "gemini" },
        "gemini-flash": { full: "gemini-2.5-flash", provider: "gemini" },
        "deepseek-r1": { full: "deepseek-r1", provider: "deepseek" },
        "deepseek-v3": { full: "deepseek-v3", provider: "deepseek" },
        "kimi": { full: "opencode/kimi-k2.5", provider: "opencode" },
        "kimi-k2.5": { full: "opencode/kimi-k2.5", provider: "opencode" },
        "glm": { full: "opencode/glm-5", provider: "opencode" },
        "glm-5": { full: "opencode/glm-5", provider: "opencode" },
        "minimax": { full: "opencode/minimax-m2.7", provider: "opencode" },
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
        lines.push("  \x1b[33m  Gemini\x1b[0m    gemini-pro \x1b[90m(default)\x1b[0m  gemini-flash");
        lines.push("  \x1b[35m  DeepSeek\x1b[0m  deepseek-r1 \x1b[90m(default)\x1b[0m  deepseek-v3");
        lines.push("  \x1b[36m  OpenCode\x1b[0m  kimi \x1b[90m(default)\x1b[0m  glm-5  minimax-m2.7");
        lines.push("");
        lines.push("  \x1b[1;36m  Usage:\x1b[0m  \x1b[36m/model sonnet\x1b[0m  or  \x1b[36m/model gpt-4o\x1b[0m");
        lines.push("");
        return { kind: "cmd", text: lines.join("\n") };
      }

      const match = MODELS[modelArg];
      if (match) {
        const cfg = loadKeys();
        cfg._activeModel = match.full;
        cfg._activeProvider = match.provider;
        writeFileSync(KEYS_FILE, JSON.stringify(cfg, null, 2));
        return { kind: "cmd", text: `\n  \x1b[32m\u2713 Model switched to \x1b[1;36m${match.full}\x1b[0m\n` };
      }

      return { kind: "error", text: `Unknown model: ${modelArg}. Type /model to see available models.` };
    }

    case "history": {
      const h: string[] = loadHist();
      if (h.length === 0) return { kind: "cmd", text: "\n  \x1b[2mNo history yet.\x1b[0m\n" };
      return { kind: "cmd", text: [
        "", "  \x1b[1;35mRecent\x1b[0m", "",
        ...h.map((x, i) => `  \x1b[2m${String(i + 1).padStart(2)}.\x1b[0m \x1b[33m${x}\x1b[0m`),
        "",
      ].join("\n") };
    }

    default:
      return { kind: "error", text: `Unknown command: /${name}. Type /help` };
  }
}

async function callLLM(instruction: string): Promise<string> {
  const keys = loadKeys();
  const model = keys._activeModel ?? "";
  const apiKey = keys.OPENCODE_API_KEY ?? keys.ANTHROPIC_API_KEY ?? keys.OPENAI_API_KEY ?? keys.GOOGLE_AI_KEY ?? keys.DEEPSEEK_API_KEY ?? "";

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
      "Authorization": `Bearer ${keys.OPENCODE_API_KEY ?? apiKey}`,
    };
    body = {
      model: modelId || "kimi-k2.5",
      messages: [
        { role: "system", content: "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. When given a test instruction, describe what steps you would take to test it. Be concise." },
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
      system: "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. When given a test instruction, describe what steps you would take to test it. Be concise.",
      messages: [{ role: "user", content: instruction }],
    };
  } else if (keys.OPENAI_API_KEY) {
    // OpenAI
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${keys.OPENAI_API_KEY}`,
    };
    body = {
      model: model || "gpt-4o",
      messages: [
        { role: "system", content: "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. When given a test instruction, describe what steps you would take to test it. Be concise." },
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
      systemInstruction: { parts: [{ text: "You are Inspect, an AI-powered browser testing assistant. Help the user test websites. Be concise." }] },
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

    const data = await res.json() as Record<string, any>;

    // Parse response based on format
    if (data.choices?.[0]?.message?.content) {
      // OpenAI / OpenCode format
      return data.choices[0].message.content;
    }
    if (data.choices?.[0]?.message?.reasoning) {
      // OpenCode reasoning-only response (content was null)
      return data.choices[0].message.reasoning;
    }
    if (data.content?.[0]?.text) {
      // Anthropic format
      return data.content[0].text;
    }
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      // Gemini format
      return data.candidates[0].content.parts[0].text;
    }

    return JSON.stringify(data, null, 2).slice(0, 500);
  } catch (e: any) {
    if (e.name === "AbortError") return "Request timed out (30s). Try again.";
    return `Error: ${e.message}`;
  }
}

// ── Browser test runner ──────────────────────────────────────────────────

async function runBrowserTest(
  url: string,
  pushMsg: (kind: MsgKind, text: string) => void,
): Promise<void> {
  pushMsg("info", `Opening browser → ${url}`);

  try {
    const { BrowserManager } = await import("@inspect/browser");
    const browserMgr = new BrowserManager();

    pushMsg("info", "Launching Chromium...");
    await browserMgr.launchBrowser({ headless: true, viewport: { width: 1920, height: 1080 } } as any);
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
    const links = await page.evaluate(`
      Array.from(document.querySelectorAll("a[href]"))
        .map(a => a.href)
        .filter(h => h.startsWith("http"))
        .slice(0, 20)
    `) as string[];
    pushMsg("result", `  ✓ Found ${links.length} links`);

    // 6. Check images
    const images = await page.evaluate(`
      (() => {
        const imgs = Array.from(document.querySelectorAll("img"));
        const broken = imgs.filter(i => !i.complete || i.naturalWidth === 0);
        return { total: imgs.length, broken: broken.length };
      })()
    `) as { total: number; broken: number };
    if (images.broken > 0) {
      pushMsg("result", `  ✗ Images: ${images.total} total, ${images.broken} broken`);
    } else {
      pushMsg("result", `  ✓ Images: ${images.total} total, all loaded`);
    }

    // 7. Check meta tags
    const meta = await page.evaluate(`
      (() => {
        const desc = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
        const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null;
        const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null;
        return { desc, viewport, og };
      })()
    `) as { desc: string | null; viewport: string | null; og: string | null };
    pushMsg("result", `  ${meta.viewport ? "✓" : "✗"} Viewport meta: ${meta.viewport ? "set" : "missing"}`);
    pushMsg("result", `  ${meta.desc ? "✓" : "✗"} Description: ${meta.desc ? meta.desc.slice(0, 60) : "missing"}`);

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
      if (boldMatch[1]) parts.push(<Text key={key++} color="#e2e8f0">{boldMatch[1]}</Text>);
      parts.push(<Text key={key++} color="white" bold>{boldMatch[2]}</Text>);
      remaining = boldMatch[3];
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<Text key={key++} color="#e2e8f0">{codeMatch[1]}</Text>);
      parts.push(<Text key={key++} color="#22d3ee">{codeMatch[2]}</Text>);
      remaining = codeMatch[3];
      continue;
    }

    // Plain text (no more matches)
    parts.push(<Text key={key++} color="#e2e8f0">{remaining}</Text>);
    break;
  }

  // Handle list items: - text
  if (text.trimStart().startsWith("- ")) {
    const indent = text.length - text.trimStart().length;
    const content = text.trimStart().slice(2);
    // Re-parse the content after "- " for bold/code
    return (
      <Box>
        <Text color="#e2e8f0">{" ".repeat(indent)}</Text>
        <Text color="#f97316">• </Text>
        <MarkdownLine text={content} />
      </Box>
    );
  }

  // Handle headers: # text, ## text
  if (text.startsWith("### ")) return <Text color="#f97316" bold>{text.slice(4)}</Text>;
  if (text.startsWith("## ")) return <Text color="#f97316" bold>{text.slice(3)}</Text>;
  if (text.startsWith("# ")) return <Text color="#f97316" bold>{text.slice(2)}</Text>;

  return <Box>{parts}</Box>;
}

// ── REPL ────────────────────────────────────────────────────────────────

export function Repl(): React.ReactElement {
  const { exit } = useApp();
  const git = useGitInfo();
  const savedKeys = loadKeys();
  const activeModel = savedKeys._activeModel ?? "";
  const agent = activeModel || (
    process.env.ANTHROPIC_API_KEY ? "claude"
    : process.env.OPENAI_API_KEY ? "openai"
    : process.env.GOOGLE_AI_KEY ? "gemini"
    : process.env.DEEPSEEK_API_KEY ? "deepseek"
    : process.env.OPENCODE_API_KEY ? "opencode"
    : "ollama"
  );

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [verb, setVerb] = useState(VERBS[0]);

  // Full-screen modes
  const [showConfig, setShowConfig] = useState(false);
  const [showModel, setShowModel] = useState(false);

  const spinner = useSpinner(busy);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setVerb(VERBS[Math.floor(Math.random() * VERBS.length)]), 2000);
    return () => clearInterval(t);
  }, [busy]);

  const [hist] = useState(loadHist);
  const [hIdx, setHIdx] = useState(-1);
  const [draft, setDraft] = useState("");

  const idRef = React.useRef(1);
  const push = useCallback((kind: MsgKind, text: string) => {
    const msgId = idRef.current++;
    setMsgs(p => [...p, { id: msgId, kind, text }]);
  }, []);

  const submit = useCallback(async () => {
    const t = input.trim();
    if (!t) return;
    setInput(""); setCursor(0); setHIdx(-1);

    // Save to history
    const dup = hist.filter(x => x !== t);
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
      push("user", t);
      setBusy(true);
      const r = await handleSlash(t);
      setBusy(false);
      if (r === "QUIT") { exit(); return; }
      if (r === "CLEAR") { setMsgs([]); return; }
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
          onProgress: (kind, message) => {
            switch (kind) {
              case "pass": push("result", message); break;
              case "fail": push("error", message); break;
              case "warn": push("info", message); break;
              case "step": push("info", message); break;
              case "done": push("result", message); break;
              default: push("info", message);
            }
          },
        });
      } catch (err: any) {
        push("error", `Agent test failed: ${err.message}`);
        push("info", "Make sure browsers are installed: /install");
      }
      setBusy(false);
      return;
    }

    // Otherwise chat with AI
    setBusy(true);
    const out = await callLLM(t);
    setBusy(false);
    push("result", out);
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
    if (SLASH_COMMANDS.some(c => c.name === query)) return [];
    return SLASH_COMMANDS.filter(c => c.name.startsWith(query));
  }, [input]);

  useInput((ch, key) => {
    if (busy || showConfig || showModel) return;
    if (key.ctrl && ch === "c") {
      if (input) {
        setInput(""); setCursor(0); ctrlCRef.current = 0; setCtrlCHint(false);
      } else {
        ctrlCRef.current++;
        if (ctrlCRef.current >= 2) {
          exit();
          return;
        }
        setCtrlCHint(true);
        if (ctrlCTimerRef.current) clearTimeout(ctrlCTimerRef.current);
        ctrlCTimerRef.current = setTimeout(() => { ctrlCRef.current = 0; setCtrlCHint(false); }, 2000);
      }
      return;
    }
    // Any other key resets ctrl+c state
    if (ctrlCHint) { ctrlCRef.current = 0; setCtrlCHint(false); }
    if (key.escape) {
      if (input) { setInput(""); setCursor(0); }
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
      submit(); return;
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
        setSlashIdx(i => (i - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (key.downArrow) {
        setSlashIdx(i => (i + 1) % slashSuggestions.length);
        return;
      }
    }
    if (key.upArrow && hist.length > 0) {
      if (hIdx === -1) setDraft(input);
      const n = Math.min(hIdx + 1, hist.length - 1);
      setHIdx(n); setInput(hist[n]); setCursor(hist[n].length);
      return;
    }
    if (key.downArrow) {
      if (hIdx <= 0) { setHIdx(-1); setInput(draft); setCursor(draft.length); }
      else { const n = hIdx - 1; setHIdx(n); setInput(hist[n]); setCursor(hist[n].length); }
      return;
    }
    if (key.leftArrow) { setCursor(p => Math.max(0, p - 1)); return; }
    if (key.rightArrow) { setCursor(p => Math.min(input.length, p + 1)); return; }
    if (key.ctrl) {
      if (ch === "a") { setCursor(0); return; }
      if (ch === "e") { setCursor(input.length); return; }
      if (ch === "u") { setInput(input.slice(cursor)); setCursor(0); return; }
      if (ch === "k") { setInput(input.slice(0, cursor)); return; }
      if (ch === "w") {
        let i = cursor - 1;
        while (i >= 0 && input[i] === " ") i--;
        while (i >= 0 && input[i] !== " ") i--;
        setInput(input.slice(0, i + 1) + input.slice(cursor));
        setCursor(i + 1);
        return;
      }
      if (ch === "l") { setMsgs([]); return; }
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

  const items = useMemo(() => msgs.map(m => ({ key: String(m.id), m })), [msgs]);

  // Full-screen modes
  if (showConfig) {
    return <ConfigScreen onDone={() => setShowConfig(false)} />;
  }
  if (showModel) {
    return <ModelScreen onDone={() => setShowModel(false)} />;
  }

  return (
    <Box flexDirection="column">

      {/* Welcome */}
      {msgs.length === 0 && (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Box>
            <Text color="#f97316" bold>Welcome to </Text>
            <Text color="#22d3ee" bold>Inspect </Text>
            <Text color="#64748b">v0.1.0</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Text color="#f59e0b">  {"\u25c7"} </Text>
              <Text color="#94a3b8">cwd </Text>
              <Text color="#e2e8f0">{process.cwd()}</Text>
            </Box>
            {git.branch ? (
              <Box>
                <Text color="#22c55e">  {"\u25c7"} </Text>
                <Text color="#94a3b8">git </Text>
                <Text color="#22c55e" bold>{git.branch}</Text>
                {git.files > 0 && <Text color="#eab308"> ({git.files} changed)</Text>}
              </Box>
            ) : null}
            <Box>
              <Text color="#f97316">  {"\u25c7"} </Text>
              <Text color="#94a3b8">agent </Text>
              <Text color="#f97316" bold>{agent}</Text>
              {agent === "ollama" && <Text color="#64748b"> (local)</Text>}
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color="#38bdf8">  {"\u25c7"} </Text>
            <Text color="#94a3b8">Type what to test in natural language and press </Text>
            <Text color="#22c55e" bold>Enter</Text>
          </Box>
        </Box>
      )}

      {/* Messages */}
      <Static items={items}>
        {({ m }) => {
          switch (m.kind) {
            case "user":
              return (
                <Box key={m.id} paddingX={2} marginTop={0}>
                  <Text color="#f97316" bold>{">"} </Text>
                  <Text color="#94a3b8">{m.text}</Text>
                </Box>
              );
            case "result":
            case "cmd":
              return (
                <Box key={m.id} paddingX={2} flexDirection="column" marginBottom={1}>
                  {m.text.split("\n").map((line, i) => (
                    <MarkdownLine key={i} text={line} />
                  ))}
                </Box>
              );
            case "error":
              return (
                <Box key={m.id} paddingX={2}>
                  <Text color="#ef4444" bold>{"\u2716"} </Text>
                  <Text color="#fca5a5">{m.text}</Text>
                </Box>
              );
            case "info":
              return (
                <Box key={m.id} paddingX={2}>
                  <Text color="#22d3ee">{"\u25CF"} </Text>
                  <Text color="#7dd3fc">{m.text}</Text>
                </Box>
              );
            default:
              return <Text key={m.id}>{m.text}</Text>;
          }
        }}
      </Static>

      {/* Spinner */}
      {busy && (
        <Box paddingX={2} marginBottom={0}>
          <Text color="#f97316">{spinner} </Text>
          <Text color="#38bdf8">{verb}...</Text>
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
              <Text backgroundColor="white" color="black">{input[cursor] ?? " "}</Text>
              <Text color="#e2e8f0">{input.slice(cursor + 1)}</Text>
            </Box>
          ) : (
            <Text backgroundColor="white" color="black">{" "}</Text>
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
                <Text backgroundColor={active ? "#1e293b" : undefined} color={active ? "white" : "#64748b"}>
                  {"  /{0}".replace("{0}", cmd.name.padEnd(18))}{cmd.desc.padEnd(60)}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer hints — hide when slash suggestions are showing */}
      {slashSuggestions.length === 0 && (
        <Box paddingX={2}>
          <Text color="#22c55e">enter</Text>
          <Text color="#64748b"> send </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#38bdf8">{"\u2191\u2193"}</Text>
          <Text color="#64748b"> history </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#eab308">/help</Text>
          <Text color="#64748b"> </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#f97316">/doctor</Text>
          <Text color="#64748b"> </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#22d3ee">/devices</Text>
          <Text color="#64748b"> </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#ef4444">/quit</Text>
        </Box>
      )}
      {slashSuggestions.length > 0 && (
        <Box paddingX={2}>
          <Text color="#38bdf8">{"\u2191\u2193"}</Text>
          <Text color="#64748b"> navigate </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#22c55e">tab</Text>
          <Text color="#64748b"> accept </Text>
          <Text color="#475569">{"\u00b7"} </Text>
          <Text color="#22c55e">enter</Text>
          <Text color="#64748b"> run</Text>
        </Box>
      )}
    </Box>
  );
}
