import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { RunCard } from "../components/RunCard.js";
import { LogStream } from "../components/LogStream.js";
import { RunComparison } from "../components/RunComparison.js";
import { FlakinessPanel } from "../components/FlakinessPanel.js";
import { useDashboardStore } from "../stores/dashboard.js";
import type { DashboardOrchestrator } from "@inspect/core";
import type { DashboardEvent } from "@inspect/shared";

interface DashboardScreenProps {
  orchestrator?: DashboardOrchestrator;
  onDone: () => void;
}

export function DashboardScreen({ orchestrator, onDone }: DashboardScreenProps): React.ReactElement {
  const { exit } = useApp();
  const { runs, summary, flakiness, logs, selectedRunId, handleEvent, selectRun, reset } =
    useDashboardStore();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showLogs, setShowLogs] = useState(true);
  const [filter, setFilter] = useState<"all" | "running" | "passed" | "failed">("all");
  const [notifications, setNotifications] = useState(true);
  const [showCompare, setShowCompare] = useState(false);

  // Subscribe to orchestrator events
  useEffect(() => {
    if (!orchestrator) return;

    // Hydrate initial state
    const snapshot = orchestrator.getSnapshot();
    for (const run of snapshot.runs) {
      handleEvent({ type: "run:started", data: run });
    }
    handleEvent({ type: "summary:updated", data: snapshot.summary });

    // Subscribe to live events
    const unsub = orchestrator.onEvent((event: DashboardEvent) => {
      handleEvent(event);

      // Terminal bell on run completion
      if (event.type === "run:completed" && notifications) {
        process.stdout.write("\x07");
      }
    });

    return () => {
      unsub();
    };
  }, [orchestrator]);

  const allRuns = Array.from(runs.values());
  const runList = allRuns.filter((run) => {
    if (filter === "all") return true;
    if (filter === "running") return run.status === "running" || run.status === "queued";
    if (filter === "passed") return run.status === "completed";
    if (filter === "failed") return run.status === "failed" || run.status === "cancelled";
    return true;
  });

  // Keep selectedIndex in bounds
  useEffect(() => {
    if (runList.length === 0) {
      setSelectedIndex(0);
      selectRun(null);
    } else if (selectedIndex >= runList.length) {
      const idx = runList.length - 1;
      setSelectedIndex(idx);
      selectRun(runList[idx].runId);
    } else {
      selectRun(runList[selectedIndex]?.runId ?? null);
    }
  }, [runList.length, selectedIndex]);

  useInput((input, key) => {
    // Navigation
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(runList.length - 1, i + 1));
      return;
    }

    // Toggle logs
    if (input === "l" || input === "L") {
      setShowLogs((v) => !v);
      return;
    }

    // Cycle filter
    if (input === "f" || input === "F") {
      const filters: Array<typeof filter> = ["all", "running", "passed", "failed"];
      setFilter((f) => {
        const idx = filters.indexOf(f);
        return filters[(idx + 1) % filters.length];
      });
      setSelectedIndex(0);
      return;
    }

    // Cancel selected run
    if (input === "c" || input === "C") {
      if (selectedRunId && orchestrator) {
        orchestrator.cancelRun(selectedRunId);
      }
      return;
    }

    // Cancel all
    if (input === "x" || input === "X") {
      orchestrator?.cancelAll();
      return;
    }

    // Toggle comparison view
    if (input === "d" || input === "D") {
      setShowCompare((v) => !v);
      return;
    }

    // Toggle notifications
    if (input === "n" || input === "N") {
      setNotifications((v) => !v);
      return;
    }

    // Clear completed
    if (input === "r" || input === "R") {
      orchestrator?.clearCompleted();
      reset();
      return;
    }

    // Quit dashboard
    if (key.escape || input === "q" || input === "Q") {
      onDone();
      return;
    }

    // Hard exit
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with progress bar + filter */}
      <Box gap={2}>
        <ProgressBar summary={summary} />
        <Text color={PALETTE.dim}>
          filter: <Text color={PALETTE.cyan}>{filter}</Text>
        </Text>
      </Box>

      <Box marginY={1} />

      {/* Run cards */}
      {runList.length === 0 ? (
        <Box paddingX={2} paddingY={1}>
          <Text color={PALETTE.muted}>
            No active runs. Spawn tests via the API or CLI to see them here.
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {runList.map((run, i) => (
            <RunCard key={run.runId} run={run} selected={i === selectedIndex} />
          ))}
        </Box>
      )}

      {/* Comparison overlay */}
      {showCompare && (
        <Box marginTop={1}>
          <RunComparison
            runs={allRuns.filter((r) => r.status === "completed" || r.status === "failed")}
          />
        </Box>
      )}

      {/* Flakiness panel (shown when there's data and not in compare mode) */}
      {flakiness && flakiness.totalTests > 0 && !showCompare && (
        <Box marginTop={1}>
          <FlakinessPanel report={flakiness} />
        </Box>
      )}

      {/* Log stream */}
      {showLogs && !showCompare && (
        <Box marginTop={1}>
          <LogStream logs={logs} filterRunId={selectedRunId} maxLines={6} />
        </Box>
      )}

      {/* Status bar */}
      <Box marginTop={1} gap={2}>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[{ICONS.arrow}/{ICONS.arrow}]</Text> select
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[F]</Text> filter
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[L]</Text> logs
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[C]</Text> cancel
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[D]</Text> compare
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[X]</Text> cancel all
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[N]</Text> notify {notifications ? "on" : "off"}
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[R]</Text> clear done
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[Q]</Text> back
        </Text>
      </Box>
    </Box>
  );
}
