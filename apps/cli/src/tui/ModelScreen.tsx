import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { ALL_MODELS, loadKeys, setActiveModel } from "./services/config-service.js";

interface Props {
  onDone: () => void;
}

export function ModelScreen({ onDone }: Props): React.ReactElement {
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const phaseRef = useRef<"wait" | "ready">("wait");

  const currentModel = loadKeys()._activeModel ?? "";

  useEffect(() => {
    const currentIdx = ALL_MODELS.findIndex((m) => m.id === currentModel);
    if (currentIdx >= 0) setIdx(currentIdx);
  }, [currentModel]);

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
      setActiveModel(model.id, model.provider);
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
