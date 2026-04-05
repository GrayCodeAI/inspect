import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { PROVIDERS, saveApiKey, validateApiKey } from "./services/config-service.js";

interface Props {
  onDone: () => void;
}

export function ConfigScreen({ onDone }: Props): React.ReactElement {
  const [phase, _setPhase] = useState<"wait" | "list" | "typing">("wait");
  const phaseRef = useRef<"wait" | "list" | "typing">("wait");
  const setPhase = (p: "wait" | "list" | "typing") => {
    phaseRef.current = p;
    _setPhase(p);
  };
  const [idx, setIdx] = useState(0);
  const [keyText, setKeyText] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (phase === "wait") {
      const t = setTimeout(() => setPhase("list"), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useInput((ch, key) => {
    const p = phaseRef.current;
    if (p === "wait") return;

    if (p === "list") {
      if (key.upArrow) {
        setIdx((i) => (i - 1 + PROVIDERS.length + 1) % (PROVIDERS.length + 1));
        return;
      }
      if (key.downArrow) {
        setIdx((i) => (i + 1) % (PROVIDERS.length + 1));
        return;
      }
      if (key.escape || (key.ctrl && ch === "c")) {
        onDone();
        return;
      }
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

    if (p === "typing") {
      if (key.escape) {
        setPhase("list");
        return;
      }
      if (key.return) {
        const trimmed = keyText.trim();
        const provider = PROVIDERS[selectedProvider];

        if (!trimmed) return;

        const validationError = validateApiKey(provider.key, trimmed);
        if (validationError) {
          setMsg(`✗ ${validationError}`);
          return;
        }

        const successMsg = saveApiKey(provider.key, trimmed, provider.defaultModel, provider.name);
        setMsg(successMsg);
        setKeyText("");
        setPhase("list");
        return;
      }
      if (key.backspace || key.delete) {
        setKeyText((k) => k.slice(0, -1));
        return;
      }
      if (ch && ch.length >= 1 && !key.ctrl && !key.meta) {
        setKeyText((k) => k + ch);
        return;
      }
      return;
    }
  });

  if (phase === "wait") {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text color="#64748b">Opening configuration...</Text>
      </Box>
    );
  }

  if (phase === "typing") {
    const p = PROVIDERS[selectedProvider];
    const hasKey = !!process.env[p.key];
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color="#f97316" bold>
            {" "}
            {p.name}
          </Text>
        </Box>
        <Text> </Text>
        <Text color="#94a3b8">
          {" "}
          Get key: <Text color="#22d3ee">{p.url}</Text>
        </Text>
        {hasKey && <Text color="#22c55e"> Current: ***{String(process.env[p.key]).slice(-4)}</Text>}
        <Text> </Text>
        <Text color="#eab308" bold>
          {" "}
          Paste your API key and press Enter:
        </Text>
        <Text> </Text>
        <Box paddingX={2}>
          <Text color="#f97316" bold>
            {">"}{" "}
          </Text>
          <Text color="white">
            {keyText.length > 4 ? "\u2022".repeat(keyText.length - 4) + keyText.slice(-4) : keyText}
          </Text>
          <Text backgroundColor="white" color="black">
            {" "}
          </Text>
        </Box>
        <Text> </Text>
        {msg && msg.startsWith("\u2717") && (
          <>
            <Text> </Text>
            <Text color="#ef4444"> {msg}</Text>
          </>
        )}
        <Text> </Text>
        <Text color="#64748b"> enter save · esc back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box>
        <Text color="#f97316" bold>
          {" "}
          Configuration
        </Text>
      </Box>
      <Text> </Text>

      {PROVIDERS.map((p, i) => {
        const active = i === idx;
        const hasKey = !!process.env[p.key];
        return (
          <Box key={p.key}>
            <Text color={active ? "#f97316" : "#334155"}> {active ? "❯ " : "  "}</Text>
            <Text color={active ? "white" : "#94a3b8"} bold={active}>
              {p.name.padEnd(22)}
            </Text>
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
        <Text color={idx === PROVIDERS.length ? "#f97316" : "#334155"}>
          {" "}
          {idx === PROVIDERS.length ? "❯ " : "  "}
        </Text>
        <Text
          color={idx === PROVIDERS.length ? "#22c55e" : "#64748b"}
          bold={idx === PROVIDERS.length}
        >
          ← Done
        </Text>
      </Box>

      {msg && (
        <>
          <Text> </Text>
          <Text color="#22c55e"> {msg}</Text>
        </>
      )}

      <Text> </Text>
      <Text color="#64748b"> ↑↓ select · enter open · esc done</Text>
    </Box>
  );
}
