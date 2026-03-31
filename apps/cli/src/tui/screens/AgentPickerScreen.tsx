import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import figures from "figures";
import { Option } from "effect";
import { useNavigationStore } from "../stores/navigation.js";
import { usePreferencesStore } from "../stores/preferences.js";
import { detectAvailableAgents, type AgentBackend } from "@inspect/acp";
import { AGENT_PROVIDER_DISPLAY_NAMES } from "@inspect/shared";

const VISIBLE_COUNT = 15;

interface PickerItem {
  kind: "agent" | "model";
  key: string;
  label: string;
  sublabel?: string;
  isCurrent: boolean;
  isDisabled: boolean;
  agentBackend?: AgentBackend;
}

export const AgentPickerScreen = () => {
  const setScreen = useNavigationStore((state) => state.setScreen);
  const agentBackend = usePreferencesStore((state) => state.agentBackend);
  const setAgent = usePreferencesStore((state) => state.setAgent);

  const [agents, setAgents] = useState<PickerItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const installed = new Set(detectAvailableAgents());
    const allAgents = Object.keys(AGENT_PROVIDER_DISPLAY_NAMES) as AgentBackend[];
    const items: PickerItem[] = allAgents.map((backend) => ({
      kind: "agent",
      key: `agent-${backend}`,
      label: AGENT_PROVIDER_DISPLAY_NAMES[backend],
      sublabel: !installed.has(backend) ? "not installed" : undefined,
      isCurrent: backend === agentBackend,
      isDisabled: !installed.has(backend),
      agentBackend: backend,
    }));
    setAgents(items);
    const firstEnabled = items.findIndex((item) => !item.isDisabled);
    if (firstEnabled >= 0) setHighlightedIndex(firstEnabled);
  }, [agentBackend]);

  const selectItem = (item: PickerItem) => {
    if (item.isDisabled || item.kind !== "agent" || !item.agentBackend) return;
    setAgent(item.agentBackend);
    setScreen({ type: "main" });
  };

  useInput((input, key) => {
    const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
    const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");

    if (isDown || isUp) {
      setHighlightedIndex((previous) => {
        const direction = isDown ? 1 : -1;
        let next = previous + direction;
        while (next >= 0 && next < agents.length && agents[next]?.isDisabled) {
          next += direction;
        }
        if (next < 0 || next >= agents.length) return previous;
        return next;
      });
      return;
    }

    if (key.return) {
      const selected = agents[highlightedIndex];
      if (selected) selectItem(selected);
    }

    if (key.escape) {
      setScreen({ type: "main" });
    }
  });

  const installedCount = agents.filter((a) => !a.isDisabled).length;
  const visibleItems = agents.slice(0, VISIBLE_COUNT);

  return (
    <Box flexDirection="column" width="100%" paddingY={1}>
      <Box paddingX={1}>
        <Text bold>Agent Picker</Text>
        <Text dimColor> — {installedCount} installed</Text>
      </Box>

      <Box
        flexDirection="column"
        height={VISIBLE_COUNT}
        overflow="hidden"
        paddingX={1}
        marginTop={1}
      >
        {visibleItems.map((item, index) => {
          const isHighlighted = index === highlightedIndex;
          const pointer = isHighlighted ? `${figures.pointer} ` : "  ";
          const color = item.isDisabled ? "gray" : isHighlighted ? "cyan" : "white";

          return (
            <Text key={item.key} color={color} bold={isHighlighted} dimColor={item.isDisabled}>
              {pointer}
              {item.label}
              {item.isCurrent && <Text color="green"> {figures.tick}</Text>}
              {item.sublabel && <Text dimColor> {item.sublabel}</Text>}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};
