import React from "react";
import { Box, Text, useInput, useApp } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import { formatDuration, formatTimestamp } from "../services/history-service.js";
import { useHistoryStore } from "../stores/history.js";

interface HistoryScreenProps {
  onDone: () => void;
}

function scoreColor(score: number): string {
  if (score >= 80) return PALETTE.green;
  if (score >= 50) return PALETTE.yellow;
  return PALETTE.red;
}

export function HistoryScreen({ onDone }: HistoryScreenProps): React.ReactElement {
  const { exit } = useApp();
  const { entries, selectedIndex, showDetail, selectEntry, toggleDetail } = useHistoryStore();

  useInput((input, key) => {
    if (key.upArrow) {
      selectEntry(Math.max(0, selectedIndex - 1));
      return;
    }
    if (key.downArrow) {
      selectEntry(Math.min(entries.length - 1, selectedIndex + 1));
      return;
    }
    if (key.return) {
      toggleDetail();
      return;
    }
    if (key.escape || input === "q" || input === "Q") {
      if (showDetail) {
        toggleDetail();
      } else {
        onDone();
      }
      return;
    }
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  const selected = entries[selectedIndex];

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box gap={2} marginBottom={1}>
        <Text color={PALETTE.brand} bold>
          {ICONS.diamond} Test History
        </Text>
        <Text color={PALETTE.muted}>{entries.length} reports</Text>
      </Box>

      {entries.length === 0 ? (
        <Box paddingX={2} paddingY={1}>
          <Text color={PALETTE.muted}>No test reports found in .inspect/reports/</Text>
        </Box>
      ) : showDetail && selected ? (
        /* Detail view */
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor={PALETTE.brand} paddingX={1} flexDirection="column">
            <Box gap={1} marginBottom={1}>
              <Text color={scoreColor(selected.score)} bold>
                {selected.score}/100
              </Text>
              <Text color={PALETTE.text} bold>
                {selected.title || selected.url}
              </Text>
            </Box>

            <Box gap={2}>
              <Box width={20}>
                <Text color={PALETTE.dim}>URL</Text>
              </Box>
              <Text color={PALETTE.cyan}>{selected.url}</Text>
            </Box>
            <Box gap={2}>
              <Box width={20}>
                <Text color={PALETTE.dim}>Date</Text>
              </Box>
              <Text color={PALETTE.text}>{formatTimestamp(selected.timestamp)}</Text>
            </Box>
            <Box gap={2}>
              <Box width={20}>
                <Text color={PALETTE.dim}>Duration</Text>
              </Box>
              <Text color={PALETTE.amber}>{formatDuration(selected.duration)}</Text>
            </Box>
            <Box gap={2}>
              <Box width={20}>
                <Text color={PALETTE.dim}>Steps</Text>
              </Box>
              <Text>
                <Text color={PALETTE.green}>{selected.passed} passed</Text>
                {selected.failed > 0 && <Text color={PALETTE.red}> {selected.failed} failed</Text>}
                <Text color={PALETTE.muted}> / {selected.total} total</Text>
              </Text>
            </Box>
            {selected.tokens && (
              <Box gap={2}>
                <Box width={20}>
                  <Text color={PALETTE.dim}>Tokens</Text>
                </Box>
                <Text color={PALETTE.amber}>{selected.tokens.toLocaleString()}</Text>
              </Box>
            )}
            <Box gap={2}>
              <Box width={20}>
                <Text color={PALETTE.dim}>Report file</Text>
              </Box>
              <Text color={PALETTE.muted}>{selected.file}</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>[Q/Esc]</Text> back to list
            </Text>
          </Box>
        </Box>
      ) : (
        /* List view */
        <Box flexDirection="column">
          {entries.slice(0, 15).map((entry, i) => {
            const isSelected = i === selectedIndex;
            const border = isSelected ? PALETTE.brand : PALETTE.border;
            const sc = scoreColor(entry.score);

            return (
              <Box
                key={entry.file}
                borderStyle="round"
                borderColor={border}
                paddingX={1}
                marginBottom={0}
              >
                <Box width={8}>
                  <Text color={sc} bold>
                    {entry.score}/100
                  </Text>
                </Box>
                <Box width={30}>
                  <Text color={PALETTE.text} wrap="truncate-end">
                    {entry.title || entry.url}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text color={PALETTE.green}>
                    {entry.passed}
                    {ICONS.pass}
                  </Text>
                  {entry.failed > 0 && (
                    <Text color={PALETTE.red}>
                      {" "}
                      {entry.failed}
                      {ICONS.fail}
                    </Text>
                  )}
                </Box>
                <Box width={8}>
                  <Text color={PALETTE.amber}>{formatDuration(entry.duration)}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={PALETTE.muted}>{formatTimestamp(entry.timestamp)}</Text>
                </Box>
              </Box>
            );
          })}

          <Box marginTop={1} gap={2}>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>
                [{ICONS.arrow}/{ICONS.arrow}]
              </Text>{" "}
              select
            </Text>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>[Enter]</Text> details
            </Text>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>[Q]</Text> back
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
