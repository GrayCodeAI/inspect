import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const KEYS_FILE = join(process.cwd(), ".inspect", "keys.json");

function loadKeys(): Record<string, string> {
  try {
    if (existsSync(KEYS_FILE)) return JSON.parse(readFileSync(KEYS_FILE, "utf-8"));
  } catch {
    /* intentionally empty */
  }
  return {};
}

function saveKeys(data: Record<string, string>): void {
  const dir = join(process.cwd(), ".inspect");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

interface ModelGroup {
  provider: string;
  color: string;
  models: Array<{ id: string; label: string; isDefault: boolean }>;
}

const GROUPS: ModelGroup[] = [
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

// Flatten all models for index navigation
const ALL_MODELS = GROUPS.flatMap((g) =>
  g.models.map((m) => ({ ...m, provider: g.provider, color: g.color })),
);

interface Props {
  onDone: () => void;
}

export function ModelScreen({ onDone }: Props): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const phaseRef = useRef<"wait" | "ready">("wait");

  const currentModel = loadKeys()._activeModel ?? "";

  // Find current model index
  useEffect(() => {
    const currentIdx = ALL_MODELS.findIndex((m) => m.id === currentModel);
    if (currentIdx >= 0) setIdx(currentIdx);
  }, [currentModel]);

  // Absorb Enter from /model submission
  useEffect(() => {
    const t = setTimeout(() => {
      phaseRef.current = "ready";
      setReady(true);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  useInput((ch, key) => {
    if (phaseRef.current === "wait") return;

    if (key.upArrow) {
      setIdx((i) => (i - 1 + ALL_MODELS.length) % ALL_MODELS.length);
      return;
    }
    if (key.downArrow) {
      setIdx((i) => (i + 1) % ALL_MODELS.length);
      return;
    }
    if (key.escape || (key.ctrl && ch === "c")) {
      onDone();
      return;
    }

    if (key.return) {
      const model = ALL_MODELS[idx];
      const cfg = loadKeys();
      cfg._activeModel = model.id;
      cfg._activeProvider = model.provider;
      saveKeys(cfg);
      onDone();
      return;
    }
  });

  if (!ready) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="#64748b">Loading models...</Text>
      </Box>
    );
  }

  // Track which group each model belongs to for headers
  let lastProvider = "";

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box>
        <Text color="#f97316" bold>
          {" "}
          Select Model
        </Text>
        <Text color="#64748b"> (current: </Text>
        <Text color="#22d3ee">{currentModel || "none"}</Text>
        <Text color="#64748b">)</Text>
      </Box>
      <Text> </Text>

      {ALL_MODELS.map((m, i) => {
        const active = i === idx;
        const isCurrent = m.id === currentModel;
        const showHeader = m.provider !== lastProvider;
        lastProvider = m.provider;

        return (
          <React.Fragment key={m.id}>
            {showHeader && (
              <Box paddingX={1} marginTop={i > 0 ? 0 : 0}>
                <Text color={m.color} bold>
                  {" "}
                  {m.provider}
                </Text>
              </Box>
            )}
            <Box paddingX={1}>
              <Text color={active ? "#f97316" : "#334155"}>{active ? "    ❯ " : "      "}</Text>
              <Text color={active ? "white" : "#94a3b8"} bold={active}>
                {m.label}
              </Text>
              {isCurrent && <Text color="#22c55e"> ●</Text>}
              {m.isDefault && !isCurrent && <Text color="#64748b"> (default)</Text>}
            </Box>
          </React.Fragment>
        );
      })}

      <Text> </Text>
      <Text color="#64748b"> ↑↓ select · enter confirm · esc cancel</Text>
    </Box>
  );
}
