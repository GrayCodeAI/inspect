import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { PALETTE, ICONS } from "../../utils/theme.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

interface TestBuilderScreenProps {
  onDone: (test: BuiltTest | null) => void;
}

export interface BuiltTest {
  name: string;
  url: string;
  steps: BuiltStep[];
  devices: string[];
  agent: string;
}

interface BuiltStep {
  action: string;
  target: string;
  value: string;
  assertion: string;
}

type BuilderPhase =
  | "name"
  | "url"
  | "steps"
  | "step-action"
  | "step-target"
  | "step-value"
  | "step-assertion"
  | "step-edit-menu"
  | "devices"
  | "agent"
  | "export"
  | "review";

type EditField = "target" | "value" | "assertion";
type ExportFormat = "vitest" | "jest" | "workflow";

const ACTIONS = ["click", "type", "navigate", "scroll", "wait", "verify", "select", "hover"];
const DEVICES = [
  "desktop-chrome",
  "desktop-firefox",
  "desktop-safari",
  "iphone-15",
  "pixel-8",
  "ipad-pro",
];
const AGENTS = ["claude", "gpt", "gemini", "deepseek"];
const EXPORT_FORMATS: ExportFormat[] = ["vitest", "jest", "workflow"];

/**
 * Generate vitest test file
 */
function generateVitestTest(test: BuiltTest): string {
  const steps = test.steps.map((s) => `    // ${s.action} - ${s.target}`).join("\n");
  return `import { describe, it, expect } from "vitest";
import { inspect } from "@inspect/expect-vitest";

describe("${test.name}", () => {
  it("should pass", async () => {
    const { page } = inspect();
    await page.goto("${test.url}");

${steps}
  });
});
`;
}

/**
 * Generate jest test file
 */
function generateJestTest(test: BuiltTest): string {
  const steps = test.steps.map((s) => `    // ${s.action} - ${s.target}`).join("\n");
  return `describe("${test.name}", () => {
  it("should pass", async () => {
    const { page } = inspect();
    await page.goto("${test.url}");

${steps}
  });
});
`;
}

/**
 * Generate YAML workflow
 */
function generateWorkflowYaml(test: BuiltTest): string {
  const stepYaml = test.steps
    .map(
      (s) => `  - action: ${s.action}
    target: ${s.target}
    ${s.value ? `value: "${s.value}"` : ""}
    ${s.assertion ? `assertion: "${s.assertion}"` : ""}`,
    )
    .join("\n");

  return `name: ${test.name}
url: ${test.url}
devices: [${test.devices.join(", ")}]
agent: ${test.agent}
steps:
${stepYaml}
`;
}

export function TestBuilderScreen({ onDone }: TestBuilderScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [phase, setPhase] = useState<BuilderPhase>("name");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [steps, setSteps] = useState<BuiltStep[]>([]);
  const [currentStep, setCurrentStep] = useState<Partial<BuiltStep>>({});
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set(["desktop-chrome"]));
  const [agent, setAgent] = useState("claude");
  const [inputBuffer, setInputBuffer] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [editingField, setEditingField] = useState<EditField | undefined>(undefined);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("vitest");
  const [exportPath, setExportPath] = useState("");

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (key.escape) {
      onDone(null);
      return;
    }

    // Text input phases
    if (
      phase === "name" ||
      phase === "url" ||
      phase === "step-target" ||
      phase === "step-value" ||
      phase === "step-assertion"
    ) {
      if (key.return) {
        const val = inputBuffer.trim();

        // Handle step field editing (coming from step-edit-menu)
        if (editingField && phase === "step-target") {
          setSteps((s) => {
            const next = [...s];
            next[selectedStepIndex] = {
              ...next[selectedStepIndex],
              [editingField]: val,
            };
            return next;
          });
          setInputBuffer("");
          setPhase("steps");
          setEditingField(undefined);
          return;
        }

        switch (phase) {
          case "name":
            if (val) {
              setName(val);
              setInputBuffer("");
              setPhase("url");
            }
            break;
          case "url":
            if (val) {
              setUrl(val);
              setInputBuffer("");
              setPhase("steps");
            }
            break;
          case "step-target":
            setCurrentStep((s) => ({ ...s, target: val }));
            setInputBuffer("");
            setPhase("step-value");
            break;
          case "step-value":
            setCurrentStep((s) => ({ ...s, value: val }));
            setInputBuffer("");
            setPhase("step-assertion");
            break;
          case "step-assertion": {
            const newStep: BuiltStep = {
              action: currentStep.action ?? "click",
              target: currentStep.target ?? "",
              value: currentStep.value ?? "",
              assertion: val,
            };
            setSteps((s) => [...s, newStep]);
            setCurrentStep({});
            setInputBuffer("");
            setPhase("steps");
            setSelectedStepIndex(steps.length); // Select newly added step
            break;
          }
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

    // Picker phases
    if (phase === "step-action") {
      if (key.upArrow) setPickerIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setPickerIndex((i) => Math.min(ACTIONS.length - 1, i + 1));
      if (key.return) {
        setCurrentStep({ action: ACTIONS[pickerIndex] });
        setPickerIndex(0);
        setPhase("step-target");
      }
      return;
    }

    if (phase === "step-edit-menu") {
      if (key.upArrow) setPickerIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setPickerIndex((i) => Math.min(2, i + 1));
      if (key.return) {
        const fields: EditField[] = ["target", "value", "assertion"];
        setEditingField(fields[pickerIndex]);
        setInputBuffer(steps[selectedStepIndex]?.[fields[pickerIndex]] ?? "");
        setPhase("step-target"); // Reuse input phase
        setPickerIndex(0);
      }
      return;
    }

    if (phase === "devices") {
      if (key.upArrow) setPickerIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setPickerIndex((i) => Math.min(DEVICES.length - 1, i + 1));
      if (input === " ") {
        const device = DEVICES[pickerIndex];
        setSelectedDevices((d) => {
          const next = new Set(d);
          if (next.has(device)) next.delete(device);
          else next.add(device);
          return next;
        });
      }
      if (key.return) {
        setPickerIndex(0);
        setPhase("agent");
      }
      return;
    }

    if (phase === "agent") {
      if (key.upArrow) setPickerIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setPickerIndex((i) => Math.min(AGENTS.length - 1, i + 1));
      if (key.return) {
        setAgent(AGENTS[pickerIndex]);
        setPhase("review");
      }
      return;
    }

    if (phase === "export") {
      if (key.upArrow) setPickerIndex((i) => Math.max(0, i - 1));
      if (key.downArrow) setPickerIndex((i) => Math.min(EXPORT_FORMATS.length - 1, i + 1));
      if (key.return) {
        setExportFormat(EXPORT_FORMATS[pickerIndex]);
        setPhase("review");
      }
      return;
    }

    // Steps overview — navigation, editing, reordering, duplication
    if (phase === "steps") {
      if (key.upArrow && steps.length > 0) {
        setSelectedStepIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow && steps.length > 0) {
        setSelectedStepIndex((i) => Math.min(steps.length - 1, i + 1));
        return;
      }

      if (input === "a" || input === "A") {
        setPhase("step-action");
        return;
      }

      // Edit selected step (E)
      if ((input === "e" || input === "E") && steps.length > 0) {
        setPickerIndex(0);
        setPhase("step-edit-menu");
        setInputBuffer("");
        return;
      }

      // Duplicate selected step (D)
      if ((input === "d" || input === "D") && steps.length > 0) {
        const stepToDuplicate = steps[selectedStepIndex];
        setSteps((s) => [...s, { ...stepToDuplicate }]);
        setSelectedStepIndex(steps.length);
        return;
      }

      // Reorder: Ctrl+Up
      if (key.ctrl && key.upArrow && selectedStepIndex > 0) {
        setSteps((s) => {
          const next = [...s];
          [next[selectedStepIndex - 1], next[selectedStepIndex]] = [
            next[selectedStepIndex],
            next[selectedStepIndex - 1],
          ];
          return next;
        });
        setSelectedStepIndex((i) => i - 1);
        return;
      }

      // Reorder: Ctrl+Down
      if (key.ctrl && key.downArrow && selectedStepIndex < steps.length - 1) {
        setSteps((s) => {
          const next = [...s];
          [next[selectedStepIndex], next[selectedStepIndex + 1]] = [
            next[selectedStepIndex + 1],
            next[selectedStepIndex],
          ];
          return next;
        });
        setSelectedStepIndex((i) => i + 1);
        return;
      }

      if (input === "r" || input === "R") {
        setPhase("review");
        return;
      }

      if (input === "x" || input === "X") {
        setPhase("export");
        setPickerIndex(0);
        return;
      }

      if (key.backspace && steps.length > 0) {
        setSteps((s) => s.slice(0, -1));
        if (selectedStepIndex >= steps.length - 1 && selectedStepIndex > 0) {
          setSelectedStepIndex((i) => i - 1);
        }
        return;
      }
    }

    // Review
    if (phase === "review") {
      if (key.return) {
        onDone({
          name,
          url,
          steps,
          devices: [...selectedDevices],
          agent,
        });
        return;
      }
      if (input === "b" || input === "B") {
        setPhase("steps");
        return;
      }
      if (input === "x" || input === "X") {
        // Export test
        const content =
          exportFormat === "vitest"
            ? generateVitestTest({ name, url, steps, devices: [...selectedDevices], agent })
            : exportFormat === "jest"
              ? generateJestTest({ name, url, steps, devices: [...selectedDevices], agent })
              : generateWorkflowYaml({ name, url, steps, devices: [...selectedDevices], agent });

        const ext = exportFormat === "workflow" ? "yaml" : "ts";
        const defaultPath = resolve(
          process.cwd(),
          ".inspect",
          `${name.replace(/\s+/g, "-")}.${ext}`,
        );

        try {
          const dir = dirname(defaultPath);
          mkdirSync(dir, { recursive: true });
          writeFileSync(defaultPath, content);
          setExportPath(defaultPath);
        } catch {
          // Silent fail for export
        }
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={PALETTE.brand} bold>
          {ICONS.diamond} Test Builder
        </Text>
        <Text color={PALETTE.muted}> — build a test step by step</Text>
      </Box>

      {/* Progress indicator */}
      <Box marginBottom={1} gap={1}>
        {["name", "url", "steps", "devices", "agent", "review"].map((p) => (
          <Text
            key={p}
            color={
              phase === p || (phase.startsWith("step-") && p === "steps")
                ? PALETTE.brand
                : PALETTE.dim
            }
          >
            {phase === p || (phase.startsWith("step-") && p === "steps")
              ? ICONS.gem
              : ICONS.pending}{" "}
            {p}
          </Text>
        ))}
      </Box>

      {/* Phase content */}
      {phase === "name" && (
        <Box flexDirection="column">
          <Text color={PALETTE.text}>Test name:</Text>
          <Box borderStyle="round" borderColor={PALETTE.brand} paddingX={1}>
            <Text color={PALETTE.text}>
              {inputBuffer}
              <Text color={PALETTE.brand}>|</Text>
            </Text>
          </Box>
        </Box>
      )}

      {phase === "url" && (
        <Box flexDirection="column">
          <Text color={PALETTE.text}>Target URL:</Text>
          <Box borderStyle="round" borderColor={PALETTE.brand} paddingX={1}>
            <Text color={PALETTE.cyan}>
              {inputBuffer}
              <Text color={PALETTE.brand}>|</Text>
            </Text>
          </Box>
        </Box>
      )}

      {(phase === "steps" || phase.startsWith("step-")) && (
        <Box flexDirection="column">
          <Text color={PALETTE.text} bold>
            Steps ({steps.length}):
          </Text>
          {steps.map((s, i) => (
            <Box
              key={i}
              gap={1}
              marginLeft={1}
              borderStyle={i === selectedStepIndex && phase === "steps" ? "round" : undefined}
              borderColor={i === selectedStepIndex && phase === "steps" ? PALETTE.brand : undefined}
              paddingX={i === selectedStepIndex && phase === "steps" ? 1 : 0}
            >
              <Text
                color={i === selectedStepIndex && phase === "steps" ? PALETTE.brand : PALETTE.dim}
              >
                {i === selectedStepIndex && phase === "steps" ? ICONS.gem : `${i + 1}.`}
              </Text>
              <Text color={PALETTE.orange}>{s.action}</Text>
              {s.target && <Text color={PALETTE.cyan}>{s.target}</Text>}
              {s.value && <Text color={PALETTE.text}>= "{s.value}"</Text>}
              {s.assertion && (
                <Text color={PALETTE.green}>
                  {ICONS.arrow} {s.assertion}
                </Text>
              )}
            </Box>
          ))}

          {phase === "steps" && steps.length > 0 && (
            <Box marginTop={1} gap={1} flexWrap="wrap">
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[↑↓]</Text> navigate
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[E]</Text> edit
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[D]</Text> duplicate
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[Ctrl+↑↓]</Text> reorder
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[A]</Text> add
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[X]</Text> export
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[R]</Text> review
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[Bksp]</Text> remove
              </Text>
            </Box>
          )}

          {phase === "steps" && steps.length === 0 && (
            <Box marginTop={1} gap={2}>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[A]</Text> add step
              </Text>
              <Text color={PALETTE.muted}>
                <Text color={PALETTE.dim}>[R]</Text> review
              </Text>
            </Box>
          )}

          {phase === "step-action" && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={PALETTE.text}>Select action:</Text>
              {ACTIONS.map((a, i) => (
                <Box key={a} marginLeft={1}>
                  <Text color={i === pickerIndex ? PALETTE.brand : PALETTE.dim}>
                    {i === pickerIndex ? ICONS.gem : ICONS.pending} {a}
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {phase === "step-edit-menu" && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={PALETTE.text}>Edit field:</Text>
              {["target", "value", "assertion"].map((field, i) => (
                <Box key={field} marginLeft={1}>
                  <Text color={i === pickerIndex ? PALETTE.brand : PALETTE.dim}>
                    {i === pickerIndex ? ICONS.gem : ICONS.pending} {field}
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {phase === "step-target" && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={PALETTE.text}>Target (selector, text, or ref):</Text>
              <Box borderStyle="round" borderColor={PALETTE.cyan} paddingX={1}>
                <Text color={PALETTE.cyan}>
                  {inputBuffer}
                  <Text color={PALETTE.brand}>|</Text>
                </Text>
              </Box>
            </Box>
          )}

          {phase === "step-value" && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={PALETTE.text}>Value (text to type, or empty):</Text>
              <Box borderStyle="round" borderColor={PALETTE.orange} paddingX={1}>
                <Text color={PALETTE.orange}>
                  {inputBuffer}
                  <Text color={PALETTE.brand}>|</Text>
                </Text>
              </Box>
              <Text color={PALETTE.muted}>Press Enter to skip</Text>
            </Box>
          )}

          {phase === "step-assertion" && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={PALETTE.text}>Assertion (what to verify, or empty):</Text>
              <Box borderStyle="round" borderColor={PALETTE.green} paddingX={1}>
                <Text color={PALETTE.green}>
                  {inputBuffer}
                  <Text color={PALETTE.brand}>|</Text>
                </Text>
              </Box>
              <Text color={PALETTE.muted}>Press Enter to skip</Text>
            </Box>
          )}
        </Box>
      )}

      {phase === "devices" && (
        <Box flexDirection="column">
          <Text color={PALETTE.text}>Select devices (Space to toggle, Enter to confirm):</Text>
          {DEVICES.map((d, i) => (
            <Box key={d} marginLeft={1}>
              <Text color={i === pickerIndex ? PALETTE.brand : PALETTE.dim}>
                {selectedDevices.has(d) ? ICONS.pass : ICONS.pending} {d}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {phase === "agent" && (
        <Box flexDirection="column">
          <Text color={PALETTE.text}>Select AI agent:</Text>
          {AGENTS.map((a, i) => (
            <Box key={a} marginLeft={1}>
              <Text color={i === pickerIndex ? PALETTE.brand : PALETTE.dim}>
                {i === pickerIndex ? ICONS.gem : ICONS.pending} {a}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {phase === "export" && (
        <Box flexDirection="column">
          <Text color={PALETTE.text}>Export format:</Text>
          {EXPORT_FORMATS.map((fmt, i) => (
            <Box key={fmt} marginLeft={1}>
              <Text color={i === pickerIndex ? PALETTE.brand : PALETTE.dim}>
                {i === pickerIndex ? ICONS.gem : ICONS.pending} {fmt}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {phase === "review" && (
        <Box flexDirection="column">
          <Box borderStyle="round" borderColor={PALETTE.brand} paddingX={1} flexDirection="column">
            <Text color={PALETTE.brand} bold>
              Review Test
            </Text>
            <Box gap={2}>
              <Box width={15}>
                <Text color={PALETTE.dim}>Name</Text>
              </Box>
              <Text color={PALETTE.text}>{name}</Text>
            </Box>
            <Box gap={2}>
              <Box width={15}>
                <Text color={PALETTE.dim}>URL</Text>
              </Box>
              <Text color={PALETTE.cyan}>{url}</Text>
            </Box>
            <Box gap={2}>
              <Box width={15}>
                <Text color={PALETTE.dim}>Agent</Text>
              </Box>
              <Text color={PALETTE.orange}>{agent}</Text>
            </Box>
            <Box gap={2}>
              <Box width={15}>
                <Text color={PALETTE.dim}>Devices</Text>
              </Box>
              <Text color={PALETTE.text}>{[...selectedDevices].join(", ")}</Text>
            </Box>
            <Box gap={2}>
              <Box width={15}>
                <Text color={PALETTE.dim}>Steps</Text>
              </Box>
              <Text color={PALETTE.text}>{steps.length}</Text>
            </Box>
            <Box gap={2}>
              <Box width={15}>
                <Text color={PALETTE.dim}>Export Format</Text>
              </Box>
              <Text color={PALETTE.text}>{exportFormat}</Text>
            </Box>
            {exportPath && (
              <Box gap={2}>
                <Box width={15}>
                  <Text color={PALETTE.green}>Exported to</Text>
                </Box>
                <Text color={PALETTE.cyan}>{exportPath}</Text>
              </Box>
            )}
          </Box>

          <Box marginTop={1} gap={2} flexWrap="wrap">
            <Text color={PALETTE.green}>
              <Text color={PALETTE.dim}>[Enter]</Text> run test
            </Text>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>[X]</Text> export
            </Text>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>[B]</Text> back to edit
            </Text>
            <Text color={PALETTE.muted}>
              <Text color={PALETTE.dim}>[Esc]</Text> cancel
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
