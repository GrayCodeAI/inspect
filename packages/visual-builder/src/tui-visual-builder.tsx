import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { VisualTestCase, VisualTestStepType } from "./visual-types.js";
import { VisualTestStep } from "./visual-types.js";

const PALETTE = {
  brand: "#a855f7",
  brandBright: "#c084fc",
  brandDim: "#7c3aed",
  orange: "#f97316",
  cyan: "#22d3ee",
  green: "#22c55e",
  greenDim: "#16a34a",
  red: "#ef4444",
  redDim: "#dc2626",
  yellow: "#eab308",
  yellowDim: "#ca8a04",
  blue: "#3b82f6",
  text: "#e2e8f0",
  dim: "#94a3b8",
  muted: "#64748b",
  subtle: "#475569",
  border: "#334155",
  surface: "#1e293b",
  bg: "#0f172a",
  white: "#f8fafc",
};

const ICONS = {
  pass: "\u2713",
  fail: "\u2717",
  pending: "\u25cb",
  arrow: "\u2192",
  diamond: "\u25c7",
  gem: "\u25c6",
  rightArrow: "\u276f",
  separator: "\u00b7",
  boxV: "\u2502",
  boxTee: "\u251c",
  gear: "\u2699",
  globe: "\u25ce",
};

const STEP_TYPE_COLORS: Record<VisualTestStepType, string> = {
  navigate: PALETTE.cyan,
  click: PALETTE.orange,
  type: PALETTE.yellow,
  select: PALETTE.blue,
  scroll: PALETTE.green,
  hover: PALETTE.brand,
  wait: PALETTE.muted,
  assert: PALETTE.green,
  screenshot: PALETTE.brandBright,
  extract: PALETTE.orange,
};

const STEP_TYPE_LABELS: Record<VisualTestStepType, string> = {
  navigate: "navigate",
  click: "click",
  type: "type",
  select: "select",
  scroll: "scroll",
  hover: "hover",
  wait: "wait",
  assert: "assert",
  screenshot: "screenshot",
  extract: "extract",
};

const AVAILABLE_STEP_TYPES: VisualTestStepType[] = [
  "navigate",
  "click",
  "type",
  "select",
  "scroll",
  "hover",
  "wait",
  "assert",
  "screenshot",
  "extract",
];

interface VisualBuilderPanelProps {
  testCases: VisualTestCase[];
  onAddCase: (name: string, url: string) => void;
  onRemoveCase: (caseId: string) => void;
  onAddStep: (caseId: string, step: VisualTestStep) => void;
  onRemoveStep: (caseId: string, stepId: string) => void;
  onMoveStepUp: (caseId: string, stepIndex: number) => void;
  onMoveStepDown: (caseId: string, stepIndex: number) => void;
  onGenerate: (caseId: string) => void;
  onDone: () => void;
}

type PanelView =
  | "cases"
  | "steps"
  | "step-detail"
  | "add-step-type"
  | "add-case-name"
  | "add-case-url";

export function TuiVisualBuilder({
  testCases,
  onAddCase,
  onRemoveCase,
  onAddStep,
  onRemoveStep,
  onMoveStepUp,
  onMoveStepDown,
  onGenerate,
  onDone,
}: VisualBuilderPanelProps): React.ReactElement {
  const { exit } = useApp();
  const [view, setView] = useState<PanelView>("cases");
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [inputBuffer, setInputBuffer] = useState("");
  const [pendingCaseName, setPendingCaseName] = useState("");
  const [_pendingCaseUrl, _setPendingCaseUrl] = useState("");

  const selectedCase = testCases[selectedCaseIndex];

  useInput(
    (
      input: string,
      key: {
        ctrl: boolean;
        escape: boolean;
        upArrow: boolean;
        downArrow: boolean;
        return: boolean;
        backspace: boolean;
        delete: boolean;
        meta: boolean;
      },
    ) => {
      if (key.ctrl && input === "c") {
        exit();
        return;
      }

      if (key.escape) {
        if (view === "steps") {
          setView("cases");
          return;
        }
        if (view === "step-detail" || view === "add-step-type") {
          setView("steps");
          return;
        }
        if (view === "add-case-name" || view === "add-case-url") {
          setView("cases");
          setInputBuffer("");
          return;
        }
        onDone();
        return;
      }

      if (view === "cases") {
        if (key.upArrow) {
          setSelectedCaseIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setSelectedCaseIndex((i) => Math.min(testCases.length - 1, i + 1));
          return;
        }
        if (key.return && selectedCase) {
          setSelectedStepIndex(0);
          setView("steps");
          return;
        }
        if (input === "n" || input === "N") {
          setView("add-case-name");
          setInputBuffer("");
          return;
        }
        if (input === "d" || input === "D") {
          if (selectedCase) {
            onRemoveCase(selectedCase.id);
            if (selectedCaseIndex >= testCases.length - 1) {
              setSelectedCaseIndex(Math.max(0, testCases.length - 2));
            }
          }
          return;
        }
        if (input === "g" || input === "G") {
          if (selectedCase) {
            onGenerate(selectedCase.id);
          }
          return;
        }
        return;
      }

      if (view === "steps") {
        if (!selectedCase) return;

        if (key.upArrow) {
          setSelectedStepIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setSelectedStepIndex((i) => Math.min(selectedCase.steps.length - 1, i + 1));
          return;
        }
        if (key.return && selectedCase.steps.length > 0) {
          setView("step-detail");
          return;
        }
        if (input === "a" || input === "A") {
          setPickerIndex(0);
          setView("add-step-type");
          return;
        }
        if (input === "d" || input === "D") {
          if (selectedCase.steps.length > 0) {
            const step = selectedCase.steps[selectedStepIndex];
            if (step) {
              onRemoveStep(selectedCase.id, step.id);
              setSelectedStepIndex((i) => Math.max(0, i - 1));
            }
          }
          return;
        }
        if (input === "k" || input === "K") {
          if (selectedStepIndex > 0) {
            onMoveStepUp(selectedCase.id, selectedStepIndex);
            setSelectedStepIndex((i) => i - 1);
          }
          return;
        }
        if (input === "j" || input === "J") {
          if (selectedStepIndex < selectedCase.steps.length - 1) {
            onMoveStepDown(selectedCase.id, selectedStepIndex);
            setSelectedStepIndex((i) => i + 1);
          }
          return;
        }
        if (input === "g" || input === "G") {
          onGenerate(selectedCase.id);
          return;
        }
        return;
      }

      if (view === "step-detail") {
        if (!selectedCase || selectedCase.steps.length === 0) return;
        const step = selectedCase.steps[selectedStepIndex];
        if (!step) return;

        if (input === "d" || input === "D") {
          onRemoveStep(selectedCase.id, step.id);
          setView("steps");
          setSelectedStepIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (input === "k" || input === "K") {
          if (selectedStepIndex > 0) {
            onMoveStepUp(selectedCase.id, selectedStepIndex);
            setSelectedStepIndex((i) => i - 1);
          }
          return;
        }
        if (input === "j" || input === "J") {
          if (selectedStepIndex < selectedCase.steps.length - 1) {
            onMoveStepDown(selectedCase.id, selectedStepIndex);
            setSelectedStepIndex((i) => i + 1);
          }
          return;
        }
        return;
      }

      if (view === "add-step-type") {
        if (key.upArrow) {
          setPickerIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setPickerIndex((i) => Math.min(AVAILABLE_STEP_TYPES.length - 1, i + 1));
          return;
        }
        if (key.return) {
          const selectedType = AVAILABLE_STEP_TYPES[pickerIndex];
          if (selectedType && selectedCase) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newStep = new (VisualTestStep as any)({
              id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              type: selectedType,
              target: selectedType === "navigate" ? "" : undefined,
              value: selectedType === "navigate" ? "" : undefined,
            });
            onAddStep(selectedCase.id, newStep);
            setView("steps");
          }
          return;
        }
        return;
      }

      if (view === "add-case-name") {
        if (key.return) {
          const name = inputBuffer.trim();
          if (name) {
            setPendingCaseName(name);
            setInputBuffer("");
            setView("add-case-url");
          }
          return;
        }
        if (key.backspace || key.delete) {
          setInputBuffer((b) => b.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setInputBuffer((b) => b + input);
          return;
        }
        return;
      }

      if (view === "add-case-url") {
        if (key.return) {
          const url = inputBuffer.trim();
          if (url) {
            onAddCase(pendingCaseName, url);
            setInputBuffer("");
            setView("cases");
          }
          return;
        }
        if (key.backspace || key.delete) {
          setInputBuffer((b) => b.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setInputBuffer((b) => b + input);
          return;
        }
        return;
      }
    },
  );

  if (view === "add-case-name") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color={PALETTE.brand} bold>
            {ICONS.diamond} New Test Case
          </Text>
        </Box>
        <Text color={PALETTE.text}>Test name:</Text>
        <Box borderStyle="round" borderColor={PALETTE.brand} paddingX={1}>
          <Text color={PALETTE.text}>
            {inputBuffer}
            <Text color={PALETTE.brand}>|</Text>
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[Enter]</Text> confirm
          </Text>
          <Text color={PALETTE.muted}>
            {" "}
            <Text color={PALETTE.dim}>[Esc]</Text> cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === "add-case-url") {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color={PALETTE.brand} bold>
            {ICONS.diamond} New Test Case
          </Text>
        </Box>
        <Text color={PALETTE.text}>
          Name: <Text color={PALETTE.cyan}>{pendingCaseName}</Text>
        </Text>
        <Text color={PALETTE.text}>Target URL:</Text>
        <Box borderStyle="round" borderColor={PALETTE.cyan} paddingX={1}>
          <Text color={PALETTE.cyan}>
            {inputBuffer}
            <Text color={PALETTE.brand}>|</Text>
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[Enter]</Text> confirm
          </Text>
          <Text color={PALETTE.muted}>
            {" "}
            <Text color={PALETTE.dim}>[Esc]</Text> cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === "add-step-type" && selectedCase) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color={PALETTE.brand} bold>
            {ICONS.diamond} Add Step
          </Text>
          <Text color={PALETTE.muted}> to {selectedCase.name}</Text>
        </Box>
        <Text color={PALETTE.text}>Select step type:</Text>
        {AVAILABLE_STEP_TYPES.map((type, index) => (
          <Box key={type} marginLeft={1}>
            <Text color={index === pickerIndex ? PALETTE.brand : PALETTE.dim}>
              {index === pickerIndex ? ICONS.gem : ICONS.pending}{" "}
              <Text color={STEP_TYPE_COLORS[type]}>{STEP_TYPE_LABELS[type]}</Text>
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[Enter]</Text> select
          </Text>
          <Text color={PALETTE.muted}>
            {" "}
            <Text color={PALETTE.dim}>[Esc]</Text> cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === "step-detail" && selectedCase && selectedCase.steps.length > 0) {
    const step = selectedCase.steps[selectedStepIndex];
    if (!step)
      return (
        <Box padding={1}>
          <Text color={PALETTE.red}>No step selected</Text>
        </Box>
      );

    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color={PALETTE.brand} bold>
            {ICONS.diamond} Step Details
          </Text>
          <Text color={PALETTE.muted}>
            {" "}
            ({selectedStepIndex + 1}/{selectedCase.steps.length})
          </Text>
        </Box>

        <Box
          borderStyle="round"
          borderColor={PALETTE.border}
          paddingX={1}
          flexDirection="column"
          gap={1}
        >
          <Box gap={2}>
            <Text color={PALETTE.dim}>Type </Text>
            <Text color={STEP_TYPE_COLORS[step.type]}>{step.type}</Text>
          </Box>
          {step.target && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>Target </Text>
              <Text color={PALETTE.cyan}>{step.target}</Text>
            </Box>
          )}
          {step.value && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>Value </Text>
              <Text color={PALETTE.orange}>{step.value}</Text>
            </Box>
          )}
          {step.assertion && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>Assert </Text>
              <Text color={PALETTE.green}>{step.assertion}</Text>
            </Box>
          )}
          {step.description && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>Desc </Text>
              <Text color={PALETTE.text}>{step.description}</Text>
            </Box>
          )}
          {step.timeout && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>Timeout </Text>
              <Text color={PALETTE.yellow}>{step.timeout}ms</Text>
            </Box>
          )}
          {step.screenshotBefore && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>Before </Text>
              <Text color={PALETTE.green}>{ICONS.pass} screenshot</Text>
            </Box>
          )}
          {step.screenshotAfter && (
            <Box gap={2}>
              <Text color={PALETTE.dim}>After </Text>
              <Text color={PALETTE.green}>{ICONS.pass} screenshot</Text>
            </Box>
          )}
        </Box>

        <Box marginTop={1} gap={2}>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[K]</Text> move up
          </Text>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[J]</Text> move down
          </Text>
          <Text color={PALETTE.red}>
            <Text color={PALETTE.dim}>[D]</Text> delete
          </Text>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[Esc]</Text> back
          </Text>
        </Box>
      </Box>
    );
  }

  if (view === "steps" && selectedCase) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color={PALETTE.brand} bold>
            {ICONS.diamond} {selectedCase.name}
          </Text>
          <Text color={PALETTE.muted}>
            {" "}
            {ICONS.boxV} {selectedCase.url}
          </Text>
        </Box>

        {selectedCase.steps.length === 0 && (
          <Box marginLeft={1}>
            <Text color={PALETTE.muted}>No steps yet. Press [A] to add a step.</Text>
          </Box>
        )}

        {selectedCase.steps.map((step, index) => (
          <Box key={step.id} marginLeft={1}>
            <Text color={index === selectedStepIndex ? PALETTE.brand : PALETTE.dim}>
              {index === selectedStepIndex ? ICONS.gem : ICONS.pending}{" "}
            </Text>
            <Text color={PALETTE.dim}>{index + 1}. </Text>
            <Text color={STEP_TYPE_COLORS[step.type]}>{step.type}</Text>
            {step.target && <Text color={PALETTE.cyan}> {step.target}</Text>}
            {step.value && <Text color={PALETTE.orange}> = "{step.value}"</Text>}
            {step.assertion && (
              <Text color={PALETTE.green}>
                {" "}
                {ICONS.arrow} {step.assertion}
              </Text>
            )}
          </Box>
        ))}

        <Box marginTop={1} gap={2}>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[A]</Text> add step
          </Text>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[D]</Text> delete step
          </Text>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[K/J]</Text> move
          </Text>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[G]</Text> generate
          </Text>
          <Text color={PALETTE.muted}>
            <Text color={PALETTE.dim}>[Esc]</Text> back
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={PALETTE.brand} bold>
          {ICONS.diamond} Visual Test Builder
        </Text>
        <Text color={PALETTE.muted}>
          {" "}
          {ICONS.boxV} {testCases.length} test case{testCases.length !== 1 ? "s" : ""}
        </Text>
      </Box>

      {testCases.length === 0 && (
        <Box marginLeft={1}>
          <Text color={PALETTE.muted}>No test cases. Press [N] to create one.</Text>
        </Box>
      )}

      {testCases.map((testCase, index) => (
        <Box key={testCase.id} marginLeft={1}>
          <Text color={index === selectedCaseIndex ? PALETTE.brand : PALETTE.dim}>
            {index === selectedCaseIndex ? ICONS.gem : ICONS.pending}{" "}
          </Text>
          <Text color={index === selectedCaseIndex ? PALETTE.text : PALETTE.muted}>
            {testCase.name}
          </Text>
          <Text color={PALETTE.dim}> {ICONS.separator} </Text>
          <Text color={PALETTE.cyan}>{testCase.url}</Text>
          <Text color={PALETTE.dim}> {ICONS.separator} </Text>
          <Text color={PALETTE.muted}>
            {testCase.steps.length} step{testCase.steps.length !== 1 ? "s" : ""}
          </Text>
        </Box>
      ))}

      <Box marginTop={1} gap={2}>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[N]</Text> new case
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[D]</Text> delete case
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[Enter]</Text> edit steps
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[G]</Text> generate code
        </Text>
        <Text color={PALETTE.muted}>
          <Text color={PALETTE.dim}>[Esc]</Text> exit
        </Text>
      </Box>
    </Box>
  );
}
