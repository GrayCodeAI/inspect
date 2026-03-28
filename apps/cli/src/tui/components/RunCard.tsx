import React from "react";
import { Box, Text } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import type { DashboardRunState } from "@inspect/shared";

interface RunCardProps {
  run: DashboardRunState;
  selected?: boolean;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

function statusIcon(run: DashboardRunState): { icon: string; color: string } {
  switch (run.status) {
    case "queued":
      return { icon: ICONS.pending, color: PALETTE.muted };
    case "running":
      return { icon: ICONS.running, color: PALETTE.amber };
    case "completed":
      return { icon: ICONS.pass, color: PALETTE.green };
    case "failed":
      return { icon: ICONS.fail, color: PALETTE.red };
    case "cancelled":
      return { icon: ICONS.cross, color: PALETTE.muted };
  }
}

function phaseLabel(run: DashboardRunState): string {
  if (run.status !== "running") return run.status;
  return `${run.phase} (${run.currentStep}/${run.totalSteps})`;
}

export function RunCard({ run, selected }: RunCardProps): React.ReactElement {
  const { icon, color } = statusIcon(run);
  const borderColor = selected ? PALETTE.brand : PALETTE.border;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
    >
      {/* Row 1: Status + device + agent */}
      <Box gap={1}>
        <Text color={color}>{icon}</Text>
        <Text color={PALETTE.text} bold>
          {run.device}
        </Text>
        <Text color={PALETTE.muted}>{ICONS.boxV}</Text>
        <Text color={PALETTE.orange}>{run.agent}</Text>
        <Text color={PALETTE.muted}>{ICONS.boxV}</Text>
        <Text color={PALETTE.dim}>{run.browser}</Text>
        <Box flexGrow={1} />
        <Text color={PALETTE.muted}>
          {formatElapsed(run.elapsed)} {ICONS.separator} {run.tokenCount} tok
        </Text>
      </Box>

      {/* Row 2: Phase + current activity */}
      <Box gap={1}>
        <Text color={PALETTE.dim}>{phaseLabel(run)}</Text>
        {run.agentActivity && run.status === "running" && (
          <>
            <Text color={PALETTE.muted}>{ICONS.arrow}</Text>
            <Text color={PALETTE.cyan}>{run.agentActivity.description}</Text>
          </>
        )}
      </Box>

      {/* Row 3: Test name (truncated) */}
      <Box>
        <Text color={PALETTE.textDim} wrap="truncate-end">
          {run.testName}
        </Text>
      </Box>

      {/* Row 4: Screenshot indicator */}
      {run.screenshot && (
        <Box gap={1}>
          <Text color={PALETTE.dim}>{ICONS.gem} screenshot captured</Text>
        </Box>
      )}
    </Box>
  );
}
