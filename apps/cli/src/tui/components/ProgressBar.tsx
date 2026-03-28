import React from "react";
import { Box, Text } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import type { DashboardSummary } from "@inspect/shared";

interface ProgressBarProps {
  summary: DashboardSummary;
  width?: number;
}

export function ProgressBar({ summary, width = 40 }: ProgressBarProps): React.ReactElement {
  const { totalRuns, passed, failed, running, queued } = summary;
  const completed = passed + failed;

  // Build the bar segments
  const ratio = totalRuns > 0 ? completed / totalRuns : 0;
  const passedRatio = totalRuns > 0 ? passed / totalRuns : 0;
  const failedRatio = totalRuns > 0 ? failed / totalRuns : 0;

  const passedChars = Math.round(passedRatio * width);
  const failedChars = Math.round(failedRatio * width);
  const runningChars = Math.min(
    width - passedChars - failedChars,
    totalRuns > 0 ? Math.max(running, 0) : 0,
  );
  const emptyChars = Math.max(0, width - passedChars - failedChars - runningChars);

  const bar =
    "\u2588".repeat(passedChars) +
    "\u2588".repeat(failedChars) +
    "\u2593".repeat(runningChars) +
    "\u2591".repeat(emptyChars);

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={PALETTE.brand} bold>
        {ICONS.diamond} Dashboard
      </Text>
      <Text color={PALETTE.muted}>{ICONS.boxV}</Text>
      <Text>
        <Text color={PALETTE.green}>{bar.slice(0, passedChars)}</Text>
        <Text color={PALETTE.red}>{bar.slice(passedChars, passedChars + failedChars)}</Text>
        <Text color={PALETTE.amber}>{bar.slice(passedChars + failedChars, passedChars + failedChars + runningChars)}</Text>
        <Text color={PALETTE.border}>{bar.slice(passedChars + failedChars + runningChars)}</Text>
      </Text>
      <Text color={PALETTE.text}>
        {completed}/{totalRuns}
      </Text>
      <Text color={PALETTE.green}>
        {passed}{ICONS.pass}
      </Text>
      <Text color={PALETTE.red}>
        {failed}{ICONS.fail}
      </Text>
      <Text color={PALETTE.amber}>
        {running}{ICONS.running}
      </Text>
      {queued > 0 && (
        <Text color={PALETTE.muted}>
          {queued}{ICONS.pending}
        </Text>
      )}
    </Box>
  );
}
