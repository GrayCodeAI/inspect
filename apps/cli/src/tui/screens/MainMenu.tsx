import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
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
      <Text backgroundColor="magenta" color="white" bold>
        {" "}{label}{" "}
      </Text>
    );
  }
  return (
    <Text color={focused ? "white" : "gray"}>
      {" "}{label}{" "}
    </Text>
  );
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
      <Text color={focused ? "white" : "gray"}>{label} </Text>
      {on ? (
        <Text backgroundColor="green" color="white" bold> ON </Text>
      ) : (
        <Text color="gray" dimColor> OFF </Text>
      )}
    </Box>
  );
}

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

  const currentField = FIELDS[state.focusedField];

  const cycleOption = useCallback(
    <T,>(options: readonly T[], current: T, direction: 1 | -1): T => {
      const idx = options.indexOf(current);
      const nextIdx = (idx + direction + options.length) % options.length;
      return options[nextIdx];
    },
    [],
  );

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    // Navigate fields
    if (key.upArrow || (key.shift && key.tab)) {
      setState((s) => ({
        ...s,
        focusedField: Math.max(0, s.focusedField - 1),
      }));
      return;
    }

    if (key.downArrow || key.tab) {
      setState((s) => ({
        ...s,
        focusedField: Math.min(FIELDS.length - 1, s.focusedField + 1),
      }));
      return;
    }

    // Text input fields
    if (currentField === "instruction" || currentField === "url") {
      if (key.backspace || key.delete) {
        setState((s) => ({
          ...s,
          [currentField]: s[currentField].slice(0, -1),
        }));
      } else if (!key.ctrl && !key.meta && input && input.length === 1) {
        setState((s) => ({
          ...s,
          [currentField]: s[currentField] + input,
        }));
      }
      return;
    }

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

    // Enter on Start
    if (key.return && currentField === "start") {
      if (!state.instruction.trim()) return;
      setState((s) => ({ ...s, isLoading: true }));
      setTimeout(() => exit(), 500);
    }
  });

  if (state.isLoading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text color="magenta" bold>{"  "}inspect</Text>
          <Text color="gray"> v0.1.0</Text>
        </Box>
        <Box gap={1}>
          <Spinner label="Launching test agent..." color="magenta" />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Instruction: {state.instruction}</Text>
        </Box>
        {state.url && (
          <Box>
            <Text dimColor>URL: {state.url}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>Agent: {state.agent} | Mode: {state.mode} | Device: {state.device}</Text>
        </Box>
      </Box>
    );
  }

  const canStart = state.instruction.trim().length > 0;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box marginBottom={1} gap={1}>
        <Text color="magenta" bold>{"  "}inspect</Text>
        <Text color="gray">v0.1.0</Text>
        <Text color="gray">|</Text>
        <Text color="gray">AI-Powered Browser Testing</Text>
      </Box>

      {/* Instruction */}
      <Box flexDirection="column" marginBottom={0}>
        <Box>
          <Text color={currentField === "instruction" ? "magenta" : "gray"}>
            {currentField === "instruction" ? ">" : " "}
          </Text>
          <Text color={currentField === "instruction" ? "white" : "gray"} bold={currentField === "instruction"}>
            {" "}What to test
          </Text>
        </Box>
        <Box marginLeft={3}>
          {state.instruction ? (
            <Text color="white">{state.instruction}</Text>
          ) : (
            <Text color="gray" dimColor>describe what to test (e.g. "test the login flow")</Text>
          )}
          {currentField === "instruction" && <Text color="magenta">_</Text>}
        </Box>
      </Box>

      {/* URL */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={currentField === "url" ? "magenta" : "gray"}>
            {currentField === "url" ? ">" : " "}
          </Text>
          <Text color={currentField === "url" ? "white" : "gray"} bold={currentField === "url"}>
            {" "}Target URL
          </Text>
          <Text color="gray" dimColor> (optional)</Text>
        </Box>
        <Box marginLeft={3}>
          {state.url ? (
            <Text color="cyan">{state.url}</Text>
          ) : (
            <Text color="gray" dimColor>https://</Text>
          )}
          {currentField === "url" && <Text color="magenta">_</Text>}
        </Box>
      </Box>

      {/* Git Context */}
      <Box marginBottom={0}>
        <Text color={currentField === "scope" ? "magenta" : "gray"}>
          {currentField === "scope" ? ">" : " "}
        </Text>
        <Text color={currentField === "scope" ? "white" : "gray"} bold={currentField === "scope"}>
          {" "}Context{" "}
        </Text>
        {SCOPES.map((s) => (
          <Pill key={s} label={s} active={s === state.scope} focused={currentField === "scope"} />
        ))}
      </Box>

      {/* Agent */}
      <Box marginBottom={0}>
        <Text color={currentField === "agent" ? "magenta" : "gray"}>
          {currentField === "agent" ? ">" : " "}
        </Text>
        <Text color={currentField === "agent" ? "white" : "gray"} bold={currentField === "agent"}>
          {" "}Agent{"   "}
        </Text>
        {AGENTS.map((a) => (
          <Pill key={a} label={a} active={a === state.agent} focused={currentField === "agent"} />
        ))}
      </Box>

      {/* Device */}
      <Box marginBottom={0}>
        <Text color={currentField === "device" ? "magenta" : "gray"}>
          {currentField === "device" ? ">" : " "}
        </Text>
        <Text color={currentField === "device" ? "white" : "gray"} bold={currentField === "device"}>
          {" "}Device{"  "}
        </Text>
        <Text backgroundColor={currentField === "device" ? "magenta" : undefined} color="white" bold>
          {" "}{state.device}{" "}
        </Text>
        {currentField === "device" && <Text color="gray" dimColor> {"<"}/{">"} to cycle</Text>}
      </Box>

      {/* Mode */}
      <Box marginBottom={0}>
        <Text color={currentField === "mode" ? "magenta" : "gray"}>
          {currentField === "mode" ? ">" : " "}
        </Text>
        <Text color={currentField === "mode" ? "white" : "gray"} bold={currentField === "mode"}>
          {" "}Mode{"    "}
        </Text>
        {MODES.map((m) => (
          <Pill key={m} label={m} active={m === state.mode} focused={currentField === "mode"} />
        ))}
      </Box>

      {/* Toggles row */}
      <Box marginBottom={0} gap={3}>
        <Box>
          <Text color={currentField === "headed" ? "magenta" : "gray"}>
            {currentField === "headed" ? ">" : " "}
          </Text>
          <Text> </Text>
          <Toggle label="Headed" on={state.headed} focused={currentField === "headed"} />
        </Box>
        <Box>
          <Text color={currentField === "a11y" ? "magenta" : "gray"}>
            {currentField === "a11y" ? ">" : " "}
          </Text>
          <Text> </Text>
          <Toggle label="A11y" on={state.a11y} focused={currentField === "a11y"} />
        </Box>
        <Box>
          <Text color={currentField === "lighthouse" ? "magenta" : "gray"}>
            {currentField === "lighthouse" ? ">" : " "}
          </Text>
          <Text> </Text>
          <Toggle label="Lighthouse" on={state.lighthouse} focused={currentField === "lighthouse"} />
        </Box>
      </Box>

      {/* Start Button */}
      <Box marginTop={1}>
        {currentField === "start" ? (
          canStart ? (
            <Box>
              <Text backgroundColor="magenta" color="white" bold>
                {"  "}Start Testing{"  "}
              </Text>
              <Text color="gray"> press enter</Text>
            </Box>
          ) : (
            <Box>
              <Text backgroundColor="red" color="white" bold>
                {"  "}Enter an instruction above{"  "}
              </Text>
            </Box>
          )
        ) : (
          <Text color="gray" dimColor>
            {"  "}Start Testing
          </Text>
        )}
      </Box>

      {/* Status Bar */}
      <StatusBar
        items={[
          { label: "tab", value: "next" },
          { label: "shift+tab", value: "prev" },
          { label: "</>", value: "change" },
          { label: "enter", value: "run" },
          { label: "esc", value: "quit" },
        ]}
      />
    </Box>
  );
}
