import React from "react";
import { Box, Text } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import type { DashboardFlakinessReport } from "@inspect/shared";

interface FlakinessPanelProps {
  report: DashboardFlakinessReport | null;
}

function recColor(rec: string): string {
  if (rec === "stable") return PALETTE.green;
  if (rec === "flaky") return PALETTE.amber;
  if (rec === "broken") return PALETTE.red;
  return PALETTE.muted;
}

function recIcon(rec: string): string {
  if (rec === "stable") return ICONS.pass;
  if (rec === "flaky") return ICONS.warn;
  if (rec === "broken") return ICONS.fail;
  return ICONS.info;
}

export function FlakinessPanel({ report }: FlakinessPanelProps): React.ReactElement {
  if (!report || report.totalTests === 0) {
    return (
      <Box borderStyle="round" borderColor={PALETTE.border} paddingX={1}>
        <Text color={PALETTE.muted}>No flakiness data yet (need 2+ runs per test)</Text>
      </Box>
    );
  }

  const sortedEntries = [...report.entries].sort((a, b) => b.score - a.score);
  const top5 = sortedEntries.slice(0, 5);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.border} paddingX={1}>
      <Box marginBottom={1} gap={2}>
        <Text color={PALETTE.brand} bold>{ICONS.chart} Flakiness</Text>
        <Text color={PALETTE.green}>{report.stableTests} stable</Text>
        <Text color={PALETTE.amber}>{report.flakyTests} flaky</Text>
        <Text color={PALETTE.red}>{report.brokenTests} broken</Text>
      </Box>

      {top5.map((entry, i) => (
        <Box key={i} gap={1}>
          <Text color={recColor(entry.recommendation)}>{recIcon(entry.recommendation)}</Text>
          <Box width={40}>
            <Text color={PALETTE.text} wrap="truncate-end">{entry.testName}</Text>
          </Box>
          <Text color={PALETTE.dim}>score:{entry.score}</Text>
          <Text color={PALETTE.dim}>pass:{Math.round(entry.passRate * 100)}%</Text>
          <Text color={PALETTE.dim}>runs:{entry.totalRuns}</Text>
        </Box>
      ))}
    </Box>
  );
}
