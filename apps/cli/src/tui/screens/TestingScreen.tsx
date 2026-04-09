import React, { useEffect, useState, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { TestPlanStep } from "@inspect/shared";
import { Spinner } from "../components/Spinner.js";
import { StatusBar } from "../components/StatusBar.js";
import { PALETTE, ICONS } from "../../utils/theme.js";
import { useSupervisorExecution } from "../../hooks/use-supervisor-execution.js";
import { formatElapsed } from "../services/test-execution.js";

interface TestExecutionConfig {
  instruction: string;
  prompt: string;
  agent: string;
  mode: string;
  headed: boolean;
  url?: string;
  devices: string[];
  a11y: boolean;
  lighthouse: boolean;
}

interface TestResults {
  instruction: string;
  status: "passed" | "failed";
  steps: TestPlanStep[];
  totalDuration: number;
  tokenCount: number;
  agent: string;
  device: string;
  timestamp: string;
}

interface TestingScreenProps {
  config: TestExecutionConfig;
  onComplete: (results: TestResults) => void;
}

const VISIBLE_STEP_COUNT = 10;
const SCROLL_OFFSET_STEP = 1;

function getStatusIcon(status: string): string {
  if (status === "passed") return ICONS.pass;
  if (status === "failed") return ICONS.fail;
  if (status === "active") return ICONS.running;
  return ICONS.pending;
}

function getStatusColor(status: string): string {
  if (status === "passed") return PALETTE.green;
  if (status === "failed") return PALETTE.red;
  if (status === "active") return PALETTE.yellow;
  return PALETTE.muted;
}

export function TestingScreen({ config, onComplete }: TestingScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [scrollOffset, setScrollOffset] = useState(0);

  const { executedPlan, phase, elapsed, run, abort } = useSupervisorExecution({
    instruction: config.instruction,
    baseUrl: config.url,
    isHeadless: !config.headed,
    onComplete: (report) => {
      const results: TestResults = {
        instruction: config.instruction,
        status: report.status,
        steps: [],
        totalDuration: elapsed * 1000,
        tokenCount: 0,
        agent: config.agent,
        device: config.devices[0],
        timestamp: new Date().toISOString(),
      };
      onComplete(results);
    },
  });

  useEffect(() => {
    run();
  }, []);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      abort();
      exit();
      return;
    }
    if (key.upArrow) {
      setScrollOffset((s) => Math.max(0, s - SCROLL_OFFSET_STEP));
    }
    if (key.downArrow) {
      setScrollOffset((s) => {
        const stepCount = executedPlan?.steps.length ?? 0;
        return Math.min(stepCount - 1, s + SCROLL_OFFSET_STEP);
      });
    }
  });

  const steps = executedPlan?.steps ?? [];
  const visibleSteps = steps.slice(scrollOffset, scrollOffset + VISIBLE_STEP_COUNT);
  const completedCount = steps.filter((s) => s.status === "passed" || s.status === "failed").length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Box>
          <Text bold color={PALETTE.brand}>
            {ICONS.diamond} Inspect
          </Text>
          <Text color={PALETTE.subtle}> | </Text>
          <Text color={PALETTE.orange}>{config.agent}</Text>
          <Text color={PALETTE.subtle}> | </Text>
          <Text color={PALETTE.cyan}>{config.mode}</Text>
          <Text color={PALETTE.subtle}> | </Text>
          <Text color={PALETTE.amber}>{config.devices[0]}</Text>
        </Box>
        <Box>
          <Text color={PALETTE.muted}>
            {formatElapsed(elapsed)} {ICONS.separator} 0 tokens
          </Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color={PALETTE.muted}>Instruction: </Text>
        <Text color={PALETTE.text}>{config.instruction}</Text>
      </Box>

      <Box marginBottom={1}>
        {phase !== "done" && (
          <Spinner label={getPhaseLabel(phase, completedCount, steps.length)} color="magenta" />
        )}
        {phase === "done" && (
          <Text color={PALETTE.green} bold>
            {ICONS.pass} Test complete
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        {visibleSteps.map((step) => (
          <Box key={step.id} marginLeft={1}>
            <Box width={3}>
              <Text color={getStatusColor(step.status)}>{getStatusIcon(step.status)}</Text>
            </Box>
            <Box flexDirection="column">
              <Text color={getStatusColor(step.status)}>{step.instruction}</Text>
              {step.summary && step.status !== "pending" && (
                <Text color={PALETTE.dim}> Assert: {step.summary}</Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>

      <StatusBar
        items={[
          { label: "Phase", value: phase },
          { label: "Steps", value: `${completedCount}/${steps.length}` },
          { label: "Esc", value: "cancel" },
        ]}
      />
    </Box>
  );
}

function getPhaseLabel(phase: string, currentStep: number, totalSteps: number): string {
  if (phase === "planning") return "Planning test steps...";
  if (phase === "executing") return `Executing step ${currentStep + 1}/${totalSteps}...`;
  if (phase === "reporting") return "Generating report...";
  return "Ready...";
}
