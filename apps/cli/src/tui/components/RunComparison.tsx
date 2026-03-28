import React from "react";
import { Box, Text } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import type { DashboardRunState } from "@inspect/shared";

interface RunComparisonProps {
  runs: DashboardRunState[];
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

function statusColor(status: string): string {
  if (status === "completed") return PALETTE.green;
  if (status === "failed" || status === "cancelled") return PALETTE.red;
  if (status === "running") return PALETTE.amber;
  return PALETTE.muted;
}

export function RunComparison({ runs }: RunComparisonProps): React.ReactElement {
  if (runs.length < 2) {
    return (
      <Box paddingX={1}>
        <Text color={PALETTE.muted}>Select 2+ completed runs to compare</Text>
      </Box>
    );
  }

  // Group steps by description across runs
  const stepMap = new Map<string, Array<{ device: string; status: string; duration?: number }>>();
  for (const run of runs) {
    for (const step of run.steps) {
      if (!stepMap.has(step.description)) {
        stepMap.set(step.description, []);
      }
      stepMap.get(step.description)!.push({
        device: run.device,
        status: step.status,
        duration: step.duration,
      });
    }
  }

  // Find inconsistencies (different status across devices)
  const inconsistencies: Array<{
    step: string;
    results: Array<{ device: string; status: string; duration?: number }>;
  }> = [];

  for (const [step, results] of stepMap) {
    const statuses = new Set(results.map((r) => r.status));
    if (statuses.size > 1) {
      inconsistencies.push({ step, results });
    }
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={PALETTE.border} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={PALETTE.brand} bold>
          {ICONS.chart} Run Comparison ({runs.length} runs)
        </Text>
      </Box>

      {/* Summary table */}
      <Box flexDirection="column">
        <Box gap={2} marginBottom={1}>
          <Box width={20}>
            <Text color={PALETTE.dim} bold>Device</Text>
          </Box>
          <Box width={10}>
            <Text color={PALETTE.dim} bold>Status</Text>
          </Box>
          <Box width={10}>
            <Text color={PALETTE.dim} bold>Duration</Text>
          </Box>
          <Box width={10}>
            <Text color={PALETTE.dim} bold>Tokens</Text>
          </Box>
          <Box width={10}>
            <Text color={PALETTE.dim} bold>Steps</Text>
          </Box>
        </Box>

        {runs.map((run) => (
          <Box key={run.runId} gap={2}>
            <Box width={20}>
              <Text color={PALETTE.text}>{run.device}</Text>
            </Box>
            <Box width={10}>
              <Text color={statusColor(run.status)}>
                {run.status === "completed" ? ICONS.pass : run.status === "failed" ? ICONS.fail : run.status} {run.status}
              </Text>
            </Box>
            <Box width={10}>
              <Text color={PALETTE.textDim}>{fmtMs(run.elapsed)}</Text>
            </Box>
            <Box width={10}>
              <Text color={PALETTE.textDim}>{run.tokenCount}</Text>
            </Box>
            <Box width={10}>
              <Text color={PALETTE.textDim}>{run.steps.length}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Inconsistencies */}
      {inconsistencies.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={PALETTE.amber} bold>
            {ICONS.warn} {inconsistencies.length} step(s) differ across devices:
          </Text>
          {inconsistencies.map((inc, i) => (
            <Box key={i} flexDirection="column" marginLeft={2}>
              <Text color={PALETTE.text}>{inc.step}</Text>
              {inc.results.map((r, j) => (
                <Box key={j} marginLeft={2}>
                  <Text color={PALETTE.dim}>{r.device}: </Text>
                  <Text color={statusColor(r.status)}>{r.status}</Text>
                  {r.duration !== undefined && (
                    <Text color={PALETTE.muted}> ({fmtMs(r.duration)})</Text>
                  )}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}

      {inconsistencies.length === 0 && (
        <Box marginTop={1}>
          <Text color={PALETTE.green}>
            {ICONS.pass} All steps consistent across devices
          </Text>
        </Box>
      )}
    </Box>
  );
}
