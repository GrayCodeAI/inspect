// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Prompt Builder
// ──────────────────────────────────────────────────────────────────────────────

/** Configuration for building the system prompt */
export interface PromptConfig {
  /** Scope strategy: what parts of the app to test */
  scope: "full" | "changed" | "component" | "custom";
  /** Changed files (for scope: "changed") */
  changedFiles?: string[];
  /** Component path (for scope: "component") */
  componentPath?: string;
  /** Coverage data from previous runs */
  coverageData?: CoverageInfo;
  /** Specialist mode */
  specialist?: "ux" | "security" | "a11y" | "performance" | null;
  /** Whether we're replaying a saved flow */
  replayFlow?: SavedFlow | null;
  /** Custom instructions to append */
  customInstructions?: string;
  /** Available tools list */
  availableTools?: string[];
  /** Max steps allowed */
  maxSteps?: number;
  /** Whether screenshots are enabled */
  screenshotsEnabled?: boolean;
}

/** Coverage information from previous test runs */
export interface CoverageInfo {
  /** Percentage of lines covered */
  lineCoverage: number;
  /** Percentage of branches covered */
  branchCoverage: number;
  /** Uncovered files */
  uncoveredFiles: string[];
  /** Uncovered functions */
  uncoveredFunctions: string[];
}

/** A saved test flow for replay */
export interface SavedFlow {
  /** Flow name */
  name: string;
  /** Original steps */
  steps: Array<{
    action: string;
    ref?: string;
    value?: string;
    assertion?: string;
  }>;
  /** Whether to strictly follow or adapt */
  mode: "strict" | "adaptive";
}

/** Context for building user prompts */
export interface UserPromptContext {
  /** Current page URL */
  currentUrl: string;
  /** Page title */
  pageTitle?: string;
  /** Console errors */
  consoleErrors?: string[];
  /** Network failures */
  networkFailures?: string[];
  /** Previous actions taken */
  previousActions?: string[];
  /** Current step number */
  stepNumber?: number;
  /** Total expected steps */
  totalSteps?: number;
}

/**
 * Builds system and user prompts for the testing agent.
 * Assembles context-aware prompts based on scope strategy,
 * changed files, coverage data, and specialist modes.
 */
export class PromptBuilder {
  /**
   * Build the system prompt based on configuration.
   */
  buildSystemPrompt(config: PromptConfig): string {
    const sections: string[] = [];

    // Core identity
    sections.push(this.buildIdentity());

    // Scope section
    sections.push(this.buildScope(config));

    // Coverage guidance
    if (config.coverageData) {
      sections.push(this.buildCoverageGuidance(config.coverageData));
    }

    // Tools documentation
    if (config.availableTools?.length) {
      sections.push(this.buildToolsDocs(config.availableTools));
    }

    // Replay guidance
    if (config.replayFlow) {
      sections.push(this.buildReplayGuidance(config.replayFlow));
    }

    // Constraints
    sections.push(this.buildConstraints(config));

    // Custom instructions
    if (config.customInstructions) {
      sections.push(`## Custom Instructions\n${config.customInstructions}`);
    }

    return sections.join("\n\n");
  }

  /**
   * Build the user prompt for a specific test instruction.
   */
  buildUserPrompt(
    instruction: string,
    context: UserPromptContext,
    snapshot?: string,
  ): string {
    const parts: string[] = [];

    // Current state
    parts.push(`## Current State`);
    parts.push(`URL: ${context.currentUrl}`);
    if (context.pageTitle) {
      parts.push(`Title: ${context.pageTitle}`);
    }
    if (context.stepNumber !== undefined) {
      const total = context.totalSteps ? `/${context.totalSteps}` : "";
      parts.push(`Step: ${context.stepNumber}${total}`);
    }

    // Errors and failures
    if (context.consoleErrors?.length) {
      parts.push("");
      parts.push(`## Console Errors`);
      for (const error of context.consoleErrors.slice(-5)) {
        parts.push(`- ${error}`);
      }
    }

    if (context.networkFailures?.length) {
      parts.push("");
      parts.push(`## Network Failures`);
      for (const failure of context.networkFailures.slice(-5)) {
        parts.push(`- ${failure}`);
      }
    }

    // Previous actions
    if (context.previousActions?.length) {
      parts.push("");
      parts.push(`## Recent Actions`);
      const recent = context.previousActions.slice(-10);
      for (const action of recent) {
        parts.push(`- ${action}`);
      }
    }

    // Accessibility snapshot
    if (snapshot) {
      parts.push("");
      parts.push(`## Page Accessibility Tree`);
      parts.push("```");
      parts.push(snapshot);
      parts.push("```");
    }

    // Test instruction
    parts.push("");
    parts.push(`## Instruction`);
    parts.push(instruction);

    return parts.join("\n");
  }

  // ── Private section builders ─────────────────────────────────────────────

  private buildIdentity(): string {
    return `## Identity
You are Inspect, an AI-powered browser testing agent. You interact with web applications through accessibility snapshots and browser actions.

## Core Capabilities
- Click elements, type text, navigate pages, take screenshots
- Read and understand ARIA accessibility trees
- Assert conditions and verify expected outcomes
- Handle authentication, file uploads, popups, and complex workflows
- Self-heal when selectors change by finding elements semantically

## Action Format
Respond with a JSON action object:
\`\`\`json
{
  "thought": "Brief reasoning about what to do next",
  "action": "click | type | navigate | screenshot | assert | scroll | select | hover | wait | done",
  "ref": "element reference (e.g., e15)",
  "value": "text to type or URL to navigate to",
  "assertion": "condition to verify (for assert action)"
}
\`\`\``;
  }

  private buildScope(config: PromptConfig): string {
    const parts: string[] = ["## Test Scope"];

    switch (config.scope) {
      case "full":
        parts.push("Test the entire application. Cover all major user flows, edge cases, and error handling.");
        break;

      case "changed":
        parts.push("Focus testing on recently changed code. The following files were modified:");
        if (config.changedFiles?.length) {
          for (const file of config.changedFiles) {
            parts.push(`- ${file}`);
          }
        }
        parts.push("\nTest flows that exercise these changes. Also run regression tests on related features.");
        break;

      case "component":
        parts.push(`Focus testing on the component at: ${config.componentPath ?? "unknown"}`);
        parts.push("Test all interactions, props/states, edge cases, and integration points.");
        break;

      case "custom":
        parts.push("Follow the specific test instructions provided.");
        break;
    }

    return parts.join("\n");
  }

  private buildCoverageGuidance(coverage: CoverageInfo): string {
    const parts: string[] = [
      "## Coverage Guidance",
      `Current line coverage: ${coverage.lineCoverage.toFixed(1)}%`,
      `Current branch coverage: ${coverage.branchCoverage.toFixed(1)}%`,
    ];

    if (coverage.uncoveredFiles.length > 0) {
      parts.push("\nUncovered files (prioritize testing these):");
      for (const file of coverage.uncoveredFiles.slice(0, 10)) {
        parts.push(`- ${file}`);
      }
    }

    if (coverage.uncoveredFunctions.length > 0) {
      parts.push("\nUncovered functions:");
      for (const fn of coverage.uncoveredFunctions.slice(0, 10)) {
        parts.push(`- ${fn}`);
      }
    }

    parts.push("\nDesign test flows that exercise uncovered code paths and branches.");

    return parts.join("\n");
  }

  private buildToolsDocs(tools: string[]): string {
    const parts = [
      "## Available Tools",
      "You can call the following tools during testing:",
    ];

    for (const tool of tools) {
      parts.push(`- ${tool}`);
    }

    return parts.join("\n");
  }

  private buildReplayGuidance(flow: SavedFlow): string {
    const parts = [
      "## Replaying Saved Flow",
      `Flow: ${flow.name}`,
      `Mode: ${flow.mode}`,
    ];

    if (flow.mode === "strict") {
      parts.push("\nFollow these steps exactly:");
    } else {
      parts.push("\nUse these steps as guidance, adapting to any UI changes:");
    }

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      let line = `${i + 1}. ${step.action}`;
      if (step.ref) line += ` [${step.ref}]`;
      if (step.value) line += ` "${step.value}"`;
      if (step.assertion) line += ` -> assert: ${step.assertion}`;
      parts.push(line);
    }

    return parts.join("\n");
  }

  private buildConstraints(config: PromptConfig): string {
    const parts = ["## Constraints"];

    if (config.maxSteps) {
      parts.push(`- Maximum ${config.maxSteps} actions allowed`);
    }

    parts.push("- Always verify your actions had the expected effect before proceeding");
    parts.push("- If an element is not found, try scrolling or waiting before giving up");
    parts.push("- Report any unexpected console errors or network failures");
    parts.push("- Take screenshots at key decision points");

    if (config.screenshotsEnabled) {
      parts.push("- Screenshots are enabled: capture before/after for important state changes");
    }

    return parts.join("\n");
  }
}
