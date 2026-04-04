// ──────────────────────────────────────────────────────────────────────────────
// @inspect/core - Agent Tool Definitions
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMToolDefinition } from "@inspect/agent";

/** Tools that modify page state and require a snapshot refresh afterward */
export const VISUAL_TOOLS = new Set([
  "navigate",
  "click",
  "type",
  "select",
  "hover",
  "scroll",
  "keypress",
]);

/** Tools that are observation-only and do NOT require a snapshot refresh */
export const NON_VISUAL_TOOLS = new Set(["assert", "wait", "done", "totp", "screenshot"]);

/** Tools worth caching for replay (excludes observation-only tools) */
export const CACHEABLE_TOOLS = new Set([
  "navigate",
  "click",
  "type",
  "select",
  "hover",
  "scroll",
  "keypress",
]);

export const AGENT_TOOLS: LLMToolDefinition[] = [
  {
    name: "navigate",
    description: "Navigate the browser to a URL",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
  {
    name: "click",
    description: "Click an element by its reference ID from the ARIA snapshot",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID (e.g. 'e5')" },
      },
      required: ["ref"],
    },
  },
  {
    name: "type",
    description: "Type text into an input element",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
        text: { type: "string", description: "Text to type" },
        clear: { type: "boolean", description: "Clear existing text first (default true)" },
        pressEnter: { type: "boolean", description: "Press Enter after typing" },
      },
      required: ["ref", "text"],
    },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page",
    parameters: {
      type: "object",
      properties: {
        fullPage: { type: "boolean", description: "Capture the full scrollable page" },
        name: { type: "string", description: "Name for the screenshot" },
      },
    },
  },
  {
    name: "snapshot",
    description: "Refresh the ARIA accessibility tree for the current page",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "scroll",
    description: "Scroll the page",
    parameters: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Scroll direction",
        },
        amount: { type: "number", description: "Pixels to scroll (default 500)" },
      },
      required: ["direction"],
    },
  },
  {
    name: "select",
    description: "Select an option from a dropdown element",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Select element reference ID" },
        value: { type: "string", description: "Option value to select" },
      },
      required: ["ref", "value"],
    },
  },
  {
    name: "hover",
    description: "Hover over an element",
    parameters: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element reference ID" },
      },
      required: ["ref"],
    },
  },
  {
    name: "keypress",
    description: "Press a keyboard key (e.g. 'Enter', 'Tab', 'Escape')",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key to press" },
      },
      required: ["key"],
    },
  },
  {
    name: "wait",
    description: "Wait for a specified time in milliseconds",
    parameters: {
      type: "object",
      properties: {
        milliseconds: { type: "number", description: "Time to wait in ms (default 1000)" },
      },
    },
  },
  {
    name: "assert",
    description:
      "Record an assertion about the current page state. Use this to verify expected conditions.",
    parameters: {
      type: "object",
      properties: {
        condition: { type: "string", description: "What condition you are checking" },
        passed: { type: "boolean", description: "Whether the assertion passed" },
        evidence: { type: "string", description: "What you observed that supports the result" },
      },
      required: ["condition", "passed", "evidence"],
    },
  },
  {
    name: "totp",
    description: "Generate a TOTP (Time-based One-Time Password) code for 2FA authentication",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "done",
    description: "Signal that the test is complete. Call this when you have finished all testing.",
    parameters: {
      type: "object",
      properties: {
        passed: { type: "boolean", description: "Whether the overall test passed" },
        summary: { type: "string", description: "Summary of what was tested and findings" },
      },
      required: ["passed", "summary"],
    },
  },
];
