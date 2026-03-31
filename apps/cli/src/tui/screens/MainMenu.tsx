import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";

type GitScope = "unstaged" | "branch" | "commit";
type AgentChoice = "claude" | "gpt" | "gemini" | "deepseek" | "ollama";

interface MenuState {
  instruction: string;
  url: string;
  scope: GitScope;
  agent: AgentChoice;
  device: string;
  mode: "dom" | "hybrid" | "cua";
  headed: boolean;
  a11y: boolean;
  lighthouse: boolean;
  focusedField: number;
  isLoading: boolean;
}

const FIELDS = [
  "instruction",
  "url",
  "scope",
  "agent",
  "device",
  "mode",
  "headed",
  "a11y",
  "lighthouse",
  "start",
] as const;

const SCOPES: GitScope[] = ["unstaged", "branch", "commit"];
const AGENTS: AgentChoice[] = ["claude", "gpt", "gemini", "deepseek", "ollama"];
const MODES = ["dom", "hybrid", "cua"] as const;
const DEVICES = [
  "desktop-chrome",
  "desktop-firefox",
  "iphone-15",
  "iphone-15-pro-max",
  "ipad-pro",
  "pixel-8",
  "galaxy-s24",
  "macbook-pro-16",
];

// ── Colors ─────────────────────────────────────────────────────────────

const C = {
  brand: "#a855f7", // purple
  brandDim: "#7c3aed",
  accent: "#6366f1", // indigo
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
  cyan: "#22d3ee",
  text: "#e2e8f0",
  dim: "#64748b",
  muted: "#475569",
  surface: "#1e293b",
  inputBg: "#0f172a",
  border: "#334155",
};

// ── History ────────────────────────────────────────────────────────────

function loadHistory(): string[] {
  try {
    const histPath = join(process.cwd(), ".inspect", "history.json");
    if (existsSync(histPath)) {
      return JSON.parse(readFileSync(histPath, "utf-8"));
    }
  } catch {
    /* intentionally empty */
  }
  return [];
}

function saveHistory(history: string[]): void {
  try {
    const dir = join(process.cwd(), ".inspect");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "history.json"), JSON.stringify(history.slice(0, 20)));
  } catch {
    /* intentionally empty */
  }
}

// ── Sub-components ─────────────────────────────────────────────────────

function Pill({
  label,
  active,
  focused,
}: {
  label: string;
  active: boolean;
  focused?: boolean;
}): React.ReactElement {
  if (active) {
    return (
      <Text backgroundColor={C.brand} color="white" bold>
        {" "}
        {label}{" "}
      </Text>
    );
  }
  if (focused) {
    return (
      <Text color={C.dim} backgroundColor={C.surface}>
        {" "}
        {label}{" "}
      </Text>
    );
  }
  return <Text color={C.muted}> {label} </Text>;
}

function Toggle({
  label,
  on,
  focused,
}: {
  label: string;
  on: boolean;
  focused?: boolean;
}): React.ReactElement {
  return (
    <Box>
      <Text color={focused ? C.text : C.dim}>{label} </Text>
      {on ? (
        <Text backgroundColor={C.green} color="white" bold>
          {" "}
          ON{" "}
        </Text>
      ) : (
        <Text backgroundColor={C.surface} color={C.muted}>
          {" "}
          OFF{" "}
        </Text>
      )}
    </Box>
  );
}

function FieldLabel({
  label,
  focused,
  rightText,
}: {
  label: string;
  focused: boolean;
  rightText?: string;
}): React.ReactElement {
  return (
    <Box>
      <Text color={focused ? C.brand : C.muted}>{focused ? "\u276f" : " "}</Text>
      <Text color={focused ? C.text : C.dim} bold={focused}>
        {" "}
        {label}
      </Text>
      {rightText && <Text color={C.muted}> {rightText}</Text>}
    </Box>
  );
}

function Divider(): React.ReactElement {
  return (
    <Box marginY={0}>
      <Text color={C.border}>{"  \u2500".repeat(30)}</Text>
    </Box>
  );
}

// ── MainMenu ───────────────────────────────────────────────────────────

export function MainMenu(): React.ReactElement {
  const { exit } = useApp();

  const [state, setState] = useState<MenuState>({
    instruction: "",
    url: "",
    scope: "unstaged",
    agent: "claude",
    device: "desktop-chrome",
    mode: "hybrid",
    headed: false,
    a11y: false,
    lighthouse: false,
    focusedField: 0,
    isLoading: false,
  });

  const [history] = useState<string[]>(loadHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState("");
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);

  useEffect(() => {
    const agents: string[] = [];
    if (process.env.ANTHROPIC_API_KEY) agents.push("claude");
    if (process.env.OPENAI_API_KEY) agents.push("gpt");
    if (process.env.GOOGLE_AI_KEY) agents.push("gemini");
    if (process.env.DEEPSEEK_API_KEY) agents.push("deepseek");
    agents.push("ollama");
    setAvailableAgents(agents);
  }, []);

  const currentField = FIELDS[state.focusedField];
  const canStart = state.instruction.trim().length > 0;

  const cycleOption = useCallback(<T,>(options: readonly T[], current: T, direction: 1 | -1): T => {
    const idx = options.indexOf(current);
    return options[(idx + direction + options.length) % options.length];
  }, []);

  const commitToHistory = useCallback(
    (instruction: string) => {
      const trimmed = instruction.trim();
      if (!trimmed) return;
      const deduped = history.filter((h) => h !== trimmed);
      deduped.unshift(trimmed);
      const updated = deduped.slice(0, 20);
      history.length = 0;
      history.push(...updated);
      saveHistory(updated);
    },
    [history],
  );

  const handleStart = useCallback(() => {
    if (!state.instruction.trim()) return;
    commitToHistory(state.instruction);
    setState((s) => ({ ...s, isLoading: true }));
    setTimeout(() => exit(), 500);
  }, [state.instruction, commitToHistory, exit]);

  const getHints = (): Array<{ label: string; value: string }> => {
    if (currentField === "instruction" || currentField === "url") {
      return [
        { label: "type", value: "input" },
        ...(history.length > 0 ? [{ label: "\u2191\u2193", value: "history" }] : []),
        { label: "tab", value: "next" },
        ...(canStart ? [{ label: "\u21b5", value: "start" }] : []),
        { label: "esc", value: "quit" },
      ];
    }
    if (currentField === "start") {
      return [
        ...(canStart ? [{ label: "\u21b5", value: "run tests" }] : []),
        { label: "tab", value: "back" },
        { label: "ctrl+d", value: "headed" },
        { label: "esc", value: "quit" },
      ];
    }
    return [
      { label: "\u2190\u2192", value: "change" },
      { label: "tab", value: "next" },
      ...(canStart ? [{ label: "\u21b5", value: "start" }] : []),
      { label: "esc", value: "quit" },
    ];
  };

  // ── Input handler ──────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.ctrl && input === "l") {
      setState((s) => ({ ...s, instruction: "", url: "", focusedField: 0 }));
      setHistoryIndex(-1);
      setHistoryDraft("");
      return;
    }
    if (key.ctrl && input === "d") {
      setState((s) => ({ ...s, headed: !s.headed }));
      return;
    }

    // History navigation
    if (currentField === "instruction" && history.length > 0) {
      if (key.upArrow) {
        setHistoryIndex((prev) => {
          const next = Math.min(prev + 1, history.length - 1);
          if (prev === -1) setHistoryDraft(state.instruction);
          setState((s) => ({ ...s, instruction: history[next] }));
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setHistoryIndex((prev) => {
          if (prev <= 0) {
            setState((s) => ({ ...s, instruction: historyDraft }));
            return -1;
          }
          const next = prev - 1;
          setState((s) => ({ ...s, instruction: history[next] }));
          return next;
        });
        return;
      }
    }

    // Field navigation
    if (currentField !== "instruction" && key.upArrow) {
      setState((s) => ({ ...s, focusedField: Math.max(0, s.focusedField - 1) }));
      return;
    }
    if (key.shift && key.tab) {
      setState((s) => ({ ...s, focusedField: Math.max(0, s.focusedField - 1) }));
      return;
    }
    if (currentField !== "instruction" && key.downArrow) {
      setState((s) => ({ ...s, focusedField: Math.min(FIELDS.length - 1, s.focusedField + 1) }));
      return;
    }
    if (key.tab) {
      setState((s) => ({ ...s, focusedField: (s.focusedField + 1) % FIELDS.length }));
      return;
    }

    // Text input
    if (currentField === "instruction" || currentField === "url") {
      if (key.return) {
        if (canStart) {
          handleStart();
        } else {
          setState((s) => ({ ...s, focusedField: FIELDS.indexOf("start") }));
        }
        return;
      }
      if (key.backspace || key.delete) {
        setState((s) => ({ ...s, [currentField]: s[currentField].slice(0, -1) }));
        if (currentField === "instruction") setHistoryIndex(-1);
      } else if (!key.ctrl && !key.meta && input && input.length === 1) {
        setState((s) => {
          const updated = s[currentField] + input;
          const patch: Partial<MenuState> = { [currentField]: updated };
          if (currentField === "instruction" && !s.url) {
            const urlMatch = updated.match(/(?:https?:\/\/|localhost[:/])\S+/i);
            if (urlMatch) patch.url = urlMatch[0];
          }
          return { ...s, ...patch };
        });
        if (currentField === "instruction") setHistoryIndex(-1);
      }
      return;
    }

    // Pill/toggle cycling
    if (key.leftArrow || key.rightArrow) {
      const dir = key.rightArrow ? 1 : -1;
      switch (currentField) {
        case "scope":
          setState((s) => ({ ...s, scope: cycleOption(SCOPES, s.scope, dir as 1 | -1) }));
          break;
        case "agent":
          setState((s) => ({ ...s, agent: cycleOption(AGENTS, s.agent, dir as 1 | -1) }));
          break;
        case "device":
          setState((s) => ({ ...s, device: cycleOption(DEVICES, s.device, dir as 1 | -1) }));
          break;
        case "mode":
          setState((s) => ({ ...s, mode: cycleOption(MODES, s.mode, dir as 1 | -1) }));
          break;
        case "headed":
          setState((s) => ({ ...s, headed: !s.headed }));
          break;
        case "a11y":
          setState((s) => ({ ...s, a11y: !s.a11y }));
          break;
        case "lighthouse":
          setState((s) => ({ ...s, lighthouse: !s.lighthouse }));
          break;
      }
      return;
    }

    // Enter
    if (key.return) {
      if (canStart) {
        handleStart();
      } else {
        setState((s) => ({ ...s, focusedField: FIELDS.indexOf("start") }));
      }
    }
  });

  // ── Loading screen ─────────────────────────────────────────────────

  if (state.isLoading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text color={C.brand} bold>
            {"\u25c6"} inspect
          </Text>
          <Text color={C.muted}> v0.1.0</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={C.brand}
          paddingX={2}
          paddingY={1}
        >
          <Box gap={1} marginBottom={1}>
            <Spinner label="Launching test agent..." color="magenta" />
          </Box>
          <Text color={C.text}>{state.instruction}</Text>
          {state.url && <Text color={C.cyan}>{state.url}</Text>}
          <Text color={C.dim}>
            {state.agent} \u00b7 {state.mode} \u00b7 {state.device}
            {state.headed ? " \u00b7 headed" : ""}
          </Text>
        </Box>
      </Box>
    );
  }

  // ── Main render ────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* ── Header ── */}
      <Box marginBottom={1} paddingX={1} gap={1}>
        <Text color={C.brand} bold>
          {"\u25c6"} inspect
        </Text>
        <Text color={C.muted}>v0.1.0</Text>
        <Text color={C.border}>{"\u2502"}</Text>
        <Text color={C.dim}>AI-Powered Browser Testing</Text>
        {availableAgents.length > 0 && (
          <>
            <Text color={C.border}>{"\u2502"}</Text>
            {availableAgents.map((a, i) => (
              <Text key={a} color={C.green}>
                {a}
                {i < availableAgents.length - 1 ? " " : ""}
              </Text>
            ))}
          </>
        )}
      </Box>

      {/* ── Instruction input ── */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={currentField === "instruction" ? C.brand : C.border}
        paddingX={1}
        marginX={1}
      >
        <Box>
          <Text color={currentField === "instruction" ? C.brand : C.muted}>{"\u276f"} </Text>
          <Box flexGrow={1}>
            {state.instruction ? (
              <Text color={C.text}>{state.instruction}</Text>
            ) : (
              <Text color={C.muted}>What to test? (e.g. "test the login flow")</Text>
            )}
            {currentField === "instruction" && (
              <Text backgroundColor={C.brand} color="white">
                {" "}
              </Text>
            )}
          </Box>
          {currentField === "instruction" && historyIndex >= 0 && (
            <Text color={C.muted}>
              {" "}
              {historyIndex + 1}/{history.length}
            </Text>
          )}
        </Box>
      </Box>

      {/* ── URL input ── */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={currentField === "url" ? C.cyan : C.border}
        paddingX={1}
        marginX={1}
        marginTop={0}
      >
        <Box>
          <Text color={currentField === "url" ? C.cyan : C.muted}>{"\u279c"} </Text>
          {state.url ? (
            <Text color={C.cyan}>{state.url}</Text>
          ) : (
            <Text color={C.muted}>Target URL (optional)</Text>
          )}
          {currentField === "url" && (
            <Text backgroundColor={C.cyan} color="white">
              {" "}
            </Text>
          )}
        </Box>
      </Box>

      <Divider />

      {/* ── Settings ── */}
      <Box flexDirection="column" paddingX={1} gap={0}>
        {/* Context */}
        <Box>
          <FieldLabel label="Context" focused={currentField === "scope"} />
          <Box marginLeft={1}>
            {SCOPES.map((s) => (
              <Pill
                key={s}
                label={s}
                active={s === state.scope}
                focused={currentField === "scope"}
              />
            ))}
          </Box>
        </Box>

        {/* Agent */}
        <Box>
          <FieldLabel label="Agent  " focused={currentField === "agent"} />
          <Box marginLeft={1}>
            {AGENTS.map((a) => (
              <Pill
                key={a}
                label={a}
                active={a === state.agent}
                focused={currentField === "agent"}
              />
            ))}
          </Box>
        </Box>

        {/* Device */}
        <Box>
          <FieldLabel label="Device " focused={currentField === "device"} />
          <Box marginLeft={1}>
            <Text
              backgroundColor={currentField === "device" ? C.accent : C.surface}
              color="white"
              bold={currentField === "device"}
            >
              {" "}
              {state.device}{" "}
            </Text>
            {currentField === "device" && <Text color={C.muted}> {"\u2190\u2192"} cycle</Text>}
          </Box>
        </Box>

        {/* Mode */}
        <Box>
          <FieldLabel label="Mode   " focused={currentField === "mode"} />
          <Box marginLeft={1}>
            {MODES.map((m) => (
              <Pill key={m} label={m} active={m === state.mode} focused={currentField === "mode"} />
            ))}
          </Box>
        </Box>

        {/* Toggles */}
        <Box gap={3} marginTop={0}>
          <Box>
            <Text color={currentField === "headed" ? C.brand : C.muted}>
              {currentField === "headed" ? "\u276f" : " "}{" "}
            </Text>
            <Toggle label="Headed" on={state.headed} focused={currentField === "headed"} />
          </Box>
          <Box>
            <Text color={currentField === "a11y" ? C.brand : C.muted}>
              {currentField === "a11y" ? "\u276f" : " "}{" "}
            </Text>
            <Toggle label="A11y" on={state.a11y} focused={currentField === "a11y"} />
          </Box>
          <Box>
            <Text color={currentField === "lighthouse" ? C.brand : C.muted}>
              {currentField === "lighthouse" ? "\u276f" : " "}{" "}
            </Text>
            <Toggle label="Perf" on={state.lighthouse} focused={currentField === "lighthouse"} />
          </Box>
        </Box>
      </Box>

      {/* ── Start Button ── */}
      <Box marginTop={1} paddingX={1}>
        {currentField === "start" ? (
          canStart ? (
            <Box>
              <Text backgroundColor={C.brand} color="white" bold>
                {"  \u25b6 Start Testing  "}
              </Text>
              <Text color={C.dim}> press enter</Text>
            </Box>
          ) : (
            <Box>
              <Text backgroundColor={C.red} color="white" bold>
                {"  \u26a0 Enter an instruction above  "}
              </Text>
            </Box>
          )
        ) : (
          <Text color={C.muted}>{"  \u25b6 Start Testing"}</Text>
        )}
      </Box>

      {/* ── Modeline ── */}
      <StatusBar items={getHints()} />
    </Box>
  );
}
