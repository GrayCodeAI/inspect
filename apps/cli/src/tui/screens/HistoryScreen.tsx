import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface HistoryEntry {
  file: string;
  url: string;
  title: string;
  score: number;
  passed: number;
  failed: number;
  total: number;
  duration: number;
  timestamp: string;
  tokens?: number;
}

interface HistoryScreenProps {
  onDone: () => void;
}

function loadHistory(): HistoryEntry[] {
  const dir = join(process.cwd(), ".inspect", "reports");
  if (!existsSync(dir)) return [];

  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const entries: HistoryEntry[] = [];

    for (const file of files.slice(0, 50)) {
      try {
        const data = JSON.parse(readFileSync(join(dir, file), "utf-8"));
        entries.push({
          file,
          url: data.url ?? "",
          title: data.title ?? "",
          score: data.summary?.overallScore ?? 0,
          passed: data.summary?.passed ?? 0,
          failed: data.summary?.failed ?? 0,
          total: data.summary?.total ?? 0,
          duration: data.summary?.duration ?? 0,
          timestamp: data.timestamp ?? "",
          tokens: data.cost?.tokens,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return entries;
  } catch {
    return [];
  }
}

function fmtMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return PALETTE.green;
  if (score >= 50) return PALETTE.yellow;
  return PALETTE.red;
}

export function HistoryScreen({ onDone }: HistoryScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(entries.length - 1, i + 1));
      return;
    }
    if (key.return) {
      setShowDetail((v) => !v);
      return;
    }
    if (key.escape || input === "q" || input === "Q") {
      if (showDetail) {
        setShowDetail(false);
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
        <Text color={PALETTE.brand} bold>{ICONS.diamond} Test History</Text>
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
              <Text color={scoreColor(selected.score)} bold>{selected.score}/100</Text>
              <Text color={PALETTE.text} bold>{selected.title || selected.url}</Text>
            </Box>

            <Box gap={2}>
              <Box width={20}><Text color={PALETTE.dim}>URL</Text></Box>
              <Text color={PALETTE.cyan}>{selected.url}</Text>
            </Box>
            <Box gap={2}>
              <Box width={20}><Text color={PALETTE.dim}>Date</Text></Box>
              <Text color={PALETTE.text}>{fmtDate(selected.timestamp)}</Text>
            </Box>
            <Box gap={2}>
              <Box width={20}><Text color={PALETTE.dim}>Duration</Text></Box>
              <Text color={PALETTE.amber}>{fmtMs(selected.duration)}</Text>
            </Box>
            <Box gap={2}>
              <Box width={20}><Text color={PALETTE.dim}>Steps</Text></Box>
              <Text>
                <Text color={PALETTE.green}>{selected.passed} passed</Text>
                {selected.failed > 0 && <Text color={PALETTE.red}> {selected.failed} failed</Text>}
                <Text color={PALETTE.muted}> / {selected.total} total</Text>
              </Text>
            </Box>
            {selected.tokens && (
              <Box gap={2}>
                <Box width={20}><Text color={PALETTE.dim}>Tokens</Text></Box>
                <Text color={PALETTE.amber}>{selected.tokens.toLocaleString()}</Text>
              </Box>
            )}
            <Box gap={2}>
              <Box width={20}><Text color={PALETTE.dim}>Report file</Text></Box>
              <Text color={PALETTE.muted}>{selected.file}</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color={PALETTE.muted}><Text color={PALETTE.dim}>[Q/Esc]</Text> back to list</Text>
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
              <Box key={entry.file} borderStyle="round" borderColor={border} paddingX={1} marginBottom={0}>
                <Box width={8}>
                  <Text color={sc} bold>{entry.score}/100</Text>
                </Box>
                <Box width={30}>
                  <Text color={PALETTE.text} wrap="truncate-end">{entry.title || entry.url}</Text>
                </Box>
                <Box width={12}>
                  <Text color={PALETTE.green}>{entry.passed}{ICONS.pass}</Text>
                  {entry.failed > 0 && <Text color={PALETTE.red}> {entry.failed}{ICONS.fail}</Text>}
                </Box>
                <Box width={8}>
                  <Text color={PALETTE.amber}>{fmtMs(entry.duration)}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={PALETTE.muted}>{fmtDate(entry.timestamp)}</Text>
                </Box>
              </Box>
            );
          })}

          <Box marginTop={1} gap={2}>
            <Text color={PALETTE.muted}><Text color={PALETTE.dim}>[{ICONS.arrow}/{ICONS.arrow}]</Text> select</Text>
            <Text color={PALETTE.muted}><Text color={PALETTE.dim}>[Enter]</Text> details</Text>
            <Text color={PALETTE.muted}><Text color={PALETTE.dim}>[Q]</Text> back</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
