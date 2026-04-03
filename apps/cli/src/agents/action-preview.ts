// ──────────────────────────────────────────────────────────────────────────────
// ActionPreview - Show AI-planned actions before execution (Stagehand-style)
// ──────────────────────────────────────────────────────────────────────────────

import chalk from "chalk";

export interface PlannedAction {
  /** What the AI plans to do */
  description: string;
  /** CSS selector or element ref */
  target?: string;
  /** Value to type/select */
  value?: string;
  /** Expected outcome */
  expectedOutcome?: string;
  /** Confidence score 0-1 from the LLM */
  confidence?: number;
}

/**
 * Display planned actions for user review before execution.
 * Returns false if user cancels.
 */
export async function previewActions(
  actions: PlannedAction[],
  options?: { autoApprove?: boolean; verbose?: boolean },
): Promise<boolean> {
  if (actions.length === 0) {
    console.log(chalk.yellow("  No actions planned."));
    return false;
  }

  console.log(chalk.blue("\n─── Preview: Planned Actions ───\n"));

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    console.log(chalk.cyan(`  ${i + 1}. ${action.description}`));
    if (action.target) console.log(chalk.dim(`     Target: ${action.target}`));
    if (action.value) console.log(chalk.dim(`     Value: ${action.value}`));
    if (action.expectedOutcome) console.log(chalk.dim(`     Expected: ${action.expectedOutcome}`));
    if (action.confidence !== undefined) {
      const bar =
        "█".repeat(Math.round(action.confidence * 10)) +
        "░".repeat(10 - Math.round(action.confidence * 10));
      const color =
        action.confidence > 0.7 ? chalk.green : action.confidence > 0.4 ? chalk.yellow : chalk.red;
      console.log(color(`     Confidence: [${bar}] ${(action.confidence * 100).toFixed(0)}%`));
    }
    console.log();
  }

  if (options?.autoApprove) {
    console.log(chalk.dim("  Auto-approved (--yes flag)\n"));
    return true;
  }

  // Ask for confirmation
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>((resolve) => {
    rl.question(chalk.yellow(`  Execute these ${actions.length} action(s)? [Y/n/details]: `), (a) =>
      resolve(a.trim().toLowerCase()),
    );
  });
  rl.close();

  if (answer === "n" || answer === "no") {
    console.log(chalk.red("  Cancelled by user."));
    return false;
  }

  if (answer === "details" || answer === "d") {
    console.log(chalk.dim("\n  Showing detailed action plan...\n"));
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(chalk.cyan(`  Action ${i + 1}:`));
      console.log(`    Description:  ${action.description}`);
      if (action.target) console.log(`    Selector:     ${action.target}`);
      if (action.value) console.log(`    Value:        ${action.value}`);
      if (action.expectedOutcome) console.log(`    Expect:       ${action.expectedOutcome}`);
      console.log();
    }
    // Re-ask after showing details
    return previewActions(actions, options);
  }

  return true;
}

/**
 * Generate a plan of actions from the instruction using LLM,
 * without executing anything.
 */
export async function generatePlan(
  instruction: string,
  deps: {
    llm: (messages: Array<{ role: string; content: string }>) => Promise<string>;
    pageSnapshot: string;
  },
): Promise<PlannedAction[]> {
  const { llm, pageSnapshot } = deps;

  const response = await llm([
    {
      role: "system",
      content: [
        "You are a test planning assistant. Given a user instruction and a page snapshot,",
        "generate a step-by-step action plan for testing the page.",
        "Respond with ONLY a JSON array of objects with these fields:",
        '[{ "description": "what to do", "target": "selector or null", "value": "input value or null", "expectedOutcome": "what should happen", "confidence": 0.0-1.0 }]',
      ].join(" "),
    },
    {
      role: "user",
      content: `Instruction: ${instruction}\n\nPage Snapshot:\n${pageSnapshot.slice(0, 6000)}`,
    },
  ]);

  try {
    const jsonStr = response
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(jsonStr) as PlannedAction[];
  } catch {
    // Fallback: create a single-step plan
    return [
      {
        description: instruction,
        expectedOutcome: "Application behaves correctly",
        confidence: 0.5,
      },
    ];
  }
}
