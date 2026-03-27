import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Suggestion {
  text: string;
  source: "history" | "flow" | "common";
  description?: string;
}

// Common test instructions that users frequently type
const COMMON_INSTRUCTIONS = [
  "test the login flow",
  "test the signup process",
  "test the checkout flow",
  "test the search functionality",
  "test the navigation menu",
  "test form validation",
  "test the homepage loads correctly",
  "test responsive layout on mobile",
  "test dark mode toggle",
  "test the API error handling",
  "test the user profile page",
  "test the settings page",
  "verify all links work",
  "check accessibility compliance",
  "test the payment flow",
];

/**
 * Get suggestions based on partial input text.
 * Searches: instruction history, saved flows, common instructions.
 */
export function getSuggestions(
  partial: string,
  maxResults: number = 5,
): Suggestion[] {
  if (!partial || partial.length < 2) return [];

  const lower = partial.toLowerCase();
  const results: Suggestion[] = [];
  const seen = new Set<string>();

  // 1. Search instruction history (highest priority)
  const history = loadHistory();
  for (const item of history) {
    if (item.toLowerCase().includes(lower) && !seen.has(item)) {
      results.push({ text: item, source: "history", description: "from history" });
      seen.add(item);
    }
    if (results.length >= maxResults) return results;
  }

  // 2. Search saved flows
  const flows = loadFlowNames();
  for (const flow of flows) {
    if (flow.name.toLowerCase().includes(lower) && !seen.has(flow.instruction)) {
      results.push({
        text: flow.instruction,
        source: "flow",
        description: `flow: ${flow.name}`,
      });
      seen.add(flow.instruction);
    }
    if (results.length >= maxResults) return results;
  }

  // 3. Match common instructions
  for (const common of COMMON_INSTRUCTIONS) {
    if (common.toLowerCase().includes(lower) && !seen.has(common)) {
      results.push({ text: common, source: "common" });
      seen.add(common);
    }
    if (results.length >= maxResults) return results;
  }

  return results;
}

function loadHistory(): string[] {
  try {
    const histPath = join(process.cwd(), ".inspect", "history.json");
    if (existsSync(histPath)) {
      return JSON.parse(readFileSync(histPath, "utf-8"));
    }
  } catch {}
  return [];
}

interface FlowInfo {
  name: string;
  instruction: string;
}

function loadFlowNames(): FlowInfo[] {
  try {
    const flowsDir = join(process.cwd(), ".inspect", "flows");
    if (!existsSync(flowsDir)) return [];

    const files = readdirSync(flowsDir).filter(f => f.endsWith(".json"));
    const flows: FlowInfo[] = [];

    for (const file of files.slice(0, 20)) {
      try {
        const content = JSON.parse(readFileSync(join(flowsDir, file), "utf-8"));
        if (content.instruction) {
          flows.push({
            name: file.replace(".json", ""),
            instruction: content.instruction,
          });
        }
      } catch {
        continue;
      }
    }

    return flows;
  } catch {
    return [];
  }
}
