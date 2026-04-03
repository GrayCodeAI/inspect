// ──────────────────────────────────────────────────────────────────────────────
// Workflow Builder API - No-code drag-and-drop workflow composition helpers
// Extends existing workflow system with visual composition utilities
// ──────────────────────────────────────────────────────────────────────────────

import type { WorkflowBlock, WorkflowBlockType } from "@inspect/shared";

/**
 * Create a workflow block from a human-readable description.
 */
export function createBlock(
  type: WorkflowBlockType,
  description: string,
  config?: Partial<WorkflowBlock>,
): WorkflowBlock {
  return {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    label: description,
    parameters: { prompt: description, ...(config?.parameters ?? {}) },
    nextBlockId: config?.nextBlockId,
    errorBlockId: config?.errorBlockId,
    maxRetries: config?.maxRetries,
    timeout: config?.timeout,
    continueOnFailure: config?.continueOnFailure,
  };
}

/**
 * Connect workflow blocks sequentially.
 */
export function chainBlocks(...blocks: WorkflowBlock[]): WorkflowBlock[] {
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].nextBlockId = blocks[i + 1].id;
  }
  return blocks;
}

/**
 * Pre-built block templates for common browser testing flows.
 */
export const BLOCK_TEMPLATES = {
  openUrl: (url?: string) =>
    createBlock("task", `Open browser and navigate to ${url ?? "target URL"}`, {
      parameters: { url: url ?? "${URL}", action: "navigate" },
    }),

  login: (username?: string) =>
    createBlock("task", "Log in with credentials", {
      parameters: {
        prompt: username
          ? `Log in as ${username} with the stored password`
          : "Log in with stored credentials",
        usernameField: "email, username, or login",
        passwordField: "password",
        submitButton: "Log in, Sign in, or Submit",
      },
    }),

  fillForm: (fields: { label: string; value: string }[]) =>
    createBlock("task", `Fill form fields: ${fields.map((f) => f.label).join(", ")}`, {
      parameters: {
        prompt: `Fill in the following fields:\n${fields.map((f) => `- ${f.label}: ${f.value}`).join("\n")}`,
      },
    }),

  assertVisible: (element: string) =>
    createBlock("validation", `Verify "${element}" is visible`, {
      parameters: { prompt: `Check that "${element}" is visible on the page` },
    }),

  assertText: (element: string, expected: string) =>
    createBlock("validation", `Verify "${element}" contains "${expected}"`, {
      parameters: { prompt: `Check that "${element}" contains text "${expected}"` },
    }),

  waitFor: (condition: string) =>
    createBlock("wait", `Wait for: ${condition}`, {
      parameters: { prompt: condition },
    }),

  screenshot: () =>
    createBlock("task", "Take a screenshot", {
      parameters: { action: "screenshot" },
    }),

  extract: (what: string) =>
    createBlock("data_extraction", `Extract: ${what}`, {
      parameters: { prompt: `Extract ${what} from the current page` },
    }),

  forEach: (selector: string, subBlocks: WorkflowBlock[]) =>
    createBlock("for_loop", `For each "${selector}"`, {
      parameters: { selector, subBlocks: JSON.stringify(subBlocks) },
    }),

  ifCondition: (condition: string) =>
    createBlock("conditional", `If: ${condition}`, {
      parameters: { condition },
    }),
};

/**
 * Build a complete workflow from a natural language description.
 */
export function buildWorkflow(description: string): WorkflowBlock[] {
  const lines = description.split("\n").filter((l) => l.trim());
  const blocks: WorkflowBlock[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("open") ||
      trimmed.startsWith("navigate") ||
      trimmed.startsWith("goto")
    ) {
      const url = trimmed.match(/https?:\/\/\S+/)?.[0];
      blocks.push(BLOCK_TEMPLATES.openUrl(url));
    } else if (trimmed.startsWith("log") && trimmed.includes("in")) {
      blocks.push(BLOCK_TEMPLATES.login());
    } else if (
      trimmed.startsWith("fill") ||
      trimmed.startsWith("type") ||
      trimmed.startsWith("enter")
    ) {
      blocks.push(BLOCK_TEMPLATES.fillForm([{ label: trimmed, value: "" }]));
    } else if (
      trimmed.startsWith("check") ||
      trimmed.startsWith("verify") ||
      trimmed.startsWith("assert")
    ) {
      const match = trimmed.match(/"([^"]+)"/);
      if (match && (trimmed.includes("visible") || trimmed.includes("appear"))) {
        blocks.push(BLOCK_TEMPLATES.assertVisible(match[1]));
      } else if (match && trimmed.includes("contain")) {
        const expectMatch = trimmed.match(/"?(contain|contains)\s+"?([^"]+)"?/);
        blocks.push(BLOCK_TEMPLATES.assertText(match[1], expectMatch?.[2] ?? ""));
      } else if (match) {
        blocks.push(BLOCK_TEMPLATES.assertVisible(match[1]));
      }
    } else if (trimmed.startsWith("wait")) {
      blocks.push(BLOCK_TEMPLATES.waitFor(trimmed));
    } else if (trimmed.startsWith("screenshot") || trimmed.startsWith("capture")) {
      blocks.push(BLOCK_TEMPLATES.screenshot());
    } else if (trimmed.startsWith("extract") || trimmed.startsWith("get")) {
      blocks.push(BLOCK_TEMPLATES.extract(trimmed));
    } else {
      blocks.push(createBlock("task", trimmed));
    }
  }

  return blocks.length > 0 ? chainBlocks(...blocks) : blocks;
}

/**
 * Export a workflow as YAML.
 */
export function workflowToYaml(blocks: WorkflowBlock[]): string {
  const lines: string[] = ["workflow:", "  blocks:"];

  for (const block of blocks) {
    lines.push(`    - id: "${block.id}"`);
    lines.push(`      type: ${block.type}`);
    lines.push(`      label: "${block.label}"`);
    if (block.parameters) {
      lines.push(`      parameters: ${JSON.stringify(block.parameters).replace(/"/g, "'")}`);
    }
    if (block.nextBlockId) {
      lines.push(`      next: "${block.nextBlockId}"`);
    }
  }

  return lines.join("\n");
}
