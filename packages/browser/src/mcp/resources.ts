/**
 * MCP Resources — read-only data exposed to LLMs via MCP protocol.
 * Resources provide context about the current browser state.
 */

import type { Page } from "playwright";

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => Promise<unknown>;
}

/**
 * Create MCP resources for the current browser page.
 */
export function createPageResources(page: Page): MCPResource[] {
  return [
    {
      uri: "inspect://page/current",
      name: "Current Page Snapshot",
      description: "ARIA tree, URL, title, and console errors of the current page",
      mimeType: "application/json",
      read: async () => ({
        url: page.url(),
        title: await page.title(),
        timestamp: Date.now(),
      }),
    },
    {
      uri: "inspect://page/console",
      name: "Console Errors",
      description: "JavaScript errors and warnings from the browser console",
      mimeType: "application/json",
      read: async () => {
        try {
          const errors = await page.evaluate(() => {
            return (window as { __inspectConsoleErrors?: unknown[] }).__inspectConsoleErrors ?? [];
          });
          return { errors };
        } catch {
          return { errors: [] };
        }
      },
    },
    {
      uri: "inspect://page/network",
      name: "Network Requests",
      description: "Recent network requests made by the page",
      mimeType: "application/json",
      read: async () => {
        try {
          const requests = await page.evaluate(() => {
            return (
              (window as { __inspectNetworkRequests?: unknown[] }).__inspectNetworkRequests ?? []
            );
          });
          return { requests: requests.slice(-50) };
        } catch {
          return { requests: [] };
        }
      },
    },
    {
      uri: "inspect://page/performance",
      name: "Performance Metrics",
      description: "Core Web Vitals and performance metrics",
      mimeType: "application/json",
      read: async () => {
        try {
          const metrics = await page.evaluate(() => {
            const perf = performance.getEntriesByType(
              "navigation",
            )[0] as PerformanceNavigationTiming;
            return {
              loadTime: perf?.loadEventEnd - perf?.startTime,
              domContentLoaded: perf?.domContentLoadedEventEnd - perf?.startTime,
              ttfb: perf?.responseStart - perf?.startTime,
            };
          });
          return metrics;
        } catch {
          return {};
        }
      },
    },
  ];
}

/**
 * MCP Prompts — reusable prompt templates exposed via MCP protocol.
 */
export interface MCPPrompt {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  getMessages: (args: Record<string, string>) => Promise<Array<{ role: string; content: string }>>;
}

export function createPagePrompts(): MCPPrompt[] {
  return [
    {
      name: "generate_test",
      description: "Generate a test case for a given URL",
      arguments: [
        { name: "url", description: "URL to test", required: true },
        { name: "focus", description: "What to test (e.g., forms, navigation)", required: false },
      ],
      getMessages: async (args) => [
        {
          role: "user",
          content: `Generate a comprehensive test for ${args.url}${args.focus ? ` focusing on ${args.focus}` : ""}. Include functional, accessibility, and security checks.`,
        },
      ],
    },
    {
      name: "analyze_failure",
      description: "Analyze a test failure and suggest fixes",
      arguments: [
        { name: "error", description: "Error message", required: true },
        { name: "step", description: "Step that failed", required: true },
      ],
      getMessages: async (args) => [
        {
          role: "user",
          content: `A test step failed with error: "${args.error}" during step: "${args.step}". Analyze the failure and suggest specific fixes.`,
        },
      ],
    },
    {
      name: "generate_assertion",
      description: "Generate a test assertion for the current page state",
      arguments: [{ name: "description", description: "What to assert", required: true }],
      getMessages: async (args) => [
        {
          role: "user",
          content: `Generate a specific, actionable test assertion for: "${args.description}". Return a clear pass/fail criteria.`,
        },
      ],
    },
  ];
}
