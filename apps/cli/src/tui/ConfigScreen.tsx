import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const KEYS_FILE = join(process.cwd(), ".inspect", "keys.json");

function loadKeys(): Record<string, string> {
  try {
    if (existsSync(KEYS_FILE)) return JSON.parse(readFileSync(KEYS_FILE, "utf-8"));
  } catch {}
  return {};
}

function saveKeys(data: Record<string, string>): void {
  const dir = join(process.cwd(), ".inspect");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

const PROVIDERS = [
  { key: "ANTHROPIC_API_KEY", name: "Claude (Anthropic)", models: ["sonnet", "opus", "haiku"], defaultModel: "claude-sonnet-4-20250514", url: "console.anthropic.com/settings/keys" },
  { key: "OPENAI_API_KEY", name: "OpenAI", models: ["gpt-4o", "gpt-4.1", "o3"], defaultModel: "gpt-4o", url: "platform.openai.com/api-keys" },
  { key: "GOOGLE_AI_KEY", name: "Google Gemini", models: ["pro", "flash"], defaultModel: "gemini-2.5-pro", url: "aistudio.google.com/apikey" },
  { key: "DEEPSEEK_API_KEY", name: "DeepSeek", models: ["r1", "v3"], defaultModel: "deepseek-r1", url: "platform.deepseek.com/api_keys" },
  { key: "OPENCODE_API_KEY", name: "OpenCode", models: ["kimi-k2.5", "glm-5", "minimax-m2.7"], defaultModel: "opencode/kimi-k2.5", url: "opencode.ai/go" },
];

interface Props { onDone: () => void; }

export function ConfigScreen({ onDone }: Props): React.ReactElement {
  // Phase: wait → list → typing → done
  const [phase, _setPhase] = useState<"wait" | "list" | "typing">("wait");
  const phaseRef = useRef<"wait" | "list" | "typing">("wait");
  const setPhase = (p: "wait" | "list" | "typing") => { phaseRef.current = p; _setPhase(p); };
  const [idx, setIdx] = useState(0);
  const [keyText, setKeyText] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [msg, setMsg] = useState("");

  // Wait phase: absorb the Enter from /config for 400ms
  useEffect(() => {
    if (phase === "wait") {
      const t = setTimeout(() => setPhase("list"), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useInput((ch, key) => {
    const p = phaseRef.current;
    if (p === "wait") return;

    // ── List phase ──
    if (p === "list") {
      if (key.upArrow) { setIdx(i => (i - 1 + PROVIDERS.length + 1) % (PROVIDERS.length + 1)); return; }
      if (key.downArrow) { setIdx(i => (i + 1) % (PROVIDERS.length + 1)); return; }
      if (key.escape || (key.ctrl && ch === "c")) { onDone(); return; }
      if (key.return) {
        if (idx < PROVIDERS.length) {
          setSelectedProvider(idx);
          setKeyText("");
          setPhase("typing");
        } else {
          onDone();
        }
        return;
      }
      return;
    }

    // ── Typing phase (entering API key) ──
    if (p === "typing") {
      if (key.escape) { setPhase("list"); return; }
      if (key.return) {
        const trimmed = keyText.trim();
        const provider = PROVIDERS[selectedProvider];

        // Validate key format
        const validators: Record<string, { prefix: string; minLen: number; hint: string }> = {
          ANTHROPIC_API_KEY: { prefix: "sk-ant-", minLen: 20, hint: "Should start with sk-ant-" },
          OPENAI_API_KEY: { prefix: "", minLen: 20, hint: "Should be at least 20 characters" },
          GOOGLE_AI_KEY: { prefix: "AI", minLen: 10, hint: "Should start with AI" },
          DEEPSEEK_API_KEY: { prefix: "sk-", minLen: 10, hint: "Should start with sk-" },
          OPENCODE_API_KEY: { prefix: "", minLen: 10, hint: "Get key at opencode.ai/go" },
        };

        const v = validators[provider.key];
        if (!trimmed) return;

        if (trimmed.length < (v?.minLen ?? 10)) {
          setMsg(`✗ Key too short. ${v?.hint ?? ""}`);
          return;
        }

        if (v?.prefix && !trimmed.startsWith(v.prefix)) {
          setMsg(`✗ Invalid format. ${v.hint}`);
          return;
        }

        // Save
        const cfg = loadKeys();
        cfg[provider.key] = trimmed;
        cfg._activeModel = provider.defaultModel;
        cfg._activeProvider = provider.name;
        saveKeys(cfg);
        process.env[provider.key] = trimmed;
        setMsg(`✓ ${provider.name} saved · model: ${provider.defaultModel}`);
        setKeyText("");
        setPhase("list");
        return;
      }
      if (key.backspace || key.delete) { setKeyText(k => k.slice(0, -1)); return; }
      // Accept any printable character
      if (ch && ch.length >= 1 && !key.ctrl && !key.meta) {
        setKeyText(k => k + ch);
        return;
      }
      return;
    }
  });

  // ── Wait screen ──
  if (phase === "wait") {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="#64748b">Opening configuration...</Text>
      </Box>
    );
  }

  // ── Typing screen ──
  if (phase === "typing") {
    const p = PROVIDERS[selectedProvider];
    const hasKey = !!process.env[p.key];
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color="#f97316" bold>  {p.name}</Text>
        </Box>
        <Text> </Text>
        <Text color="#94a3b8">  Get key: <Text color="#22d3ee">{p.url}</Text></Text>
        {hasKey && <Text color="#22c55e">  Current: ***{String(process.env[p.key]).slice(-4)}</Text>}
        <Text> </Text>
        <Text color="#eab308" bold>  Paste your API key and press Enter:</Text>
        <Text> </Text>
        <Box paddingX={2}>
          <Text color="#f97316" bold>{">"} </Text>
          <Text color="white">
            {keyText.length > 4
              ? "\u2022".repeat(keyText.length - 4) + keyText.slice(-4)
              : keyText}
          </Text>
          <Text backgroundColor="white" color="black"> </Text>
        </Box>
        <Text> </Text>
        {msg && msg.startsWith("\u2717") && (
          <>
            <Text> </Text>
            <Text color="#ef4444">  {msg}</Text>
          </>
        )}
        <Text> </Text>
        <Text color="#64748b">  enter save · esc back</Text>
      </Box>
    );
  }

  // ── List screen ──
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box>
        <Text color="#f97316" bold>  Configuration</Text>
      </Box>
      <Text> </Text>

      {PROVIDERS.map((p, i) => {
        const active = i === idx;
        const hasKey = !!process.env[p.key];
        return (
          <Box key={p.key}>
            <Text color={active ? "#f97316" : "#334155"}>  {active ? "❯ " : "  "}</Text>
            <Text color={active ? "white" : "#94a3b8"} bold={active}>{p.name.padEnd(22)}</Text>
            {hasKey ? (
              <Text color="#22c55e">✓ ***{String(process.env[p.key]).slice(-4)}</Text>
            ) : (
              <Text color="#64748b">not set</Text>
            )}
          </Box>
        );
      })}

      <Text> </Text>
      <Box>
        <Text color={idx === PROVIDERS.length ? "#f97316" : "#334155"}>  {idx === PROVIDERS.length ? "❯ " : "  "}</Text>
        <Text color={idx === PROVIDERS.length ? "#22c55e" : "#64748b"} bold={idx === PROVIDERS.length}>← Done</Text>
      </Box>

      {msg && (
        <>
          <Text> </Text>
          <Text color="#22c55e">  {msg}</Text>
        </>
      )}

      <Text> </Text>
      <Text color="#64748b">  ↑↓ select · enter open · esc done</Text>
    </Box>
  );
}
