import React from "react";
import { Box, Text } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import type { DashboardLogEntry } from "@inspect/shared";

interface LogStreamProps {
  logs: DashboardLogEntry[];
  maxLines?: number;
  filterRunId?: string | null;
}

function levelColor(level: DashboardLogEntry["level"]): string {
  switch (level) {
    case "error":
      return PALETTE.red;
    case "warn":
      return PALETTE.amber;
    case "info":
      return PALETTE.cyan;
    case "debug":
      return PALETTE.muted;
  }
}

function levelIcon(level: DashboardLogEntry["level"]): string {
  switch (level) {
    case "error":
      return ICONS.fail;
    case "warn":
      return ICONS.warn;
    case "info":
      return ICONS.info;
    case "debug":
      return ICONS.pending;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

export function LogStream({ logs, maxLines = 8, filterRunId }: LogStreamProps): React.ReactElement {
  let filtered = filterRunId ? logs.filter((l) => l.runId === filterRunId) : logs;
  const visible = filtered.slice(-maxLines);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.border} paddingX={1}>
      <Box marginBottom={0}>
        <Text color={PALETTE.dim} bold>
          Logs {filterRunId ? `(${filterRunId.slice(0, 12)})` : "(all)"}
        </Text>
      </Box>
      {visible.length === 0 ? (
        <Text color={PALETTE.muted}>No log entries yet</Text>
      ) : (
        visible.map((entry, i) => (
          <Box key={i} gap={1}>
            <Text color={PALETTE.muted}>{formatTime(entry.timestamp)}</Text>
            <Text color={levelColor(entry.level)}>{levelIcon(entry.level)}</Text>
            <Text color={PALETTE.dim}>[{entry.runId.slice(0, 12)}]</Text>
            <Text color={PALETTE.text} wrap="truncate-end">
              {entry.message}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}
