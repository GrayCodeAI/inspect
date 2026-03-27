// ============================================================================
// AI Failure Analysis — LLM explains WHY tests fail, not just that they failed
// ============================================================================

import type { TestStep, TestReport, LLMCall, ProgressCallback } from "./types.js";

export interface FailureAnalysis {
  stepId: number;
  description: string;
  error: string;
  rootCause: string;
  suggestion: string;
  category: "element-not-found" | "timeout" | "assertion-failed" | "navigation" | "network" | "auth" | "dynamic-content" | "unknown";
  confidence: number;
}

export interface AnalysisReport {
  failures: FailureAnalysis[];
  summary: string;
  topIssues: string[];
}

/**
 * Analyze all failed test steps and explain root causes via LLM.
 */
export async function analyzeFailures(
  report: TestReport,
  llm: LLMCall,
  onProgress: ProgressCallback,
): Promise<AnalysisReport> {
  const failedSteps = report.results.filter(s => s.status === "fail" && s.error);

  if (failedSteps.length === 0) {
    return { failures: [], summary: "All tests passed — no failures to analyze.", topIssues: [] };
  }

  onProgress("info", `Analyzing ${failedSteps.length} failure(s)...`);

  const failures: FailureAnalysis[] = [];

  // Analyze each failure — batch if there are many
  if (failedSteps.length <= 5) {
    // Analyze individually for detailed results
    for (const step of failedSteps) {
      const analysis = await analyzeSingleFailure(step, report, llm);
      failures.push(analysis);
      onProgress("info", `  [${step.id}] ${analysis.category}: ${analysis.rootCause.slice(0, 80)}`);
    }
  } else {
    // Batch analyze for efficiency
    const batchAnalysis = await analyzeBatchFailures(failedSteps, report, llm);
    failures.push(...batchAnalysis);
    for (const a of batchAnalysis.slice(0, 5)) {
      onProgress("info", `  [${a.stepId}] ${a.category}: ${a.rootCause.slice(0, 80)}`);
    }
    if (batchAnalysis.length > 5) {
      onProgress("info", `  ... and ${batchAnalysis.length - 5} more`);
    }
  }

  // Generate summary
  const summary = generateSummary(failures);
  const topIssues = extractTopIssues(failures);

  onProgress("done", `Failure analysis: ${failures.length} root cause(s) identified`);

  return { failures, summary, topIssues };
}

/**
 * Classify failure without LLM (fast, pattern-based).
 */
export function classifyFailure(step: TestStep): FailureAnalysis["category"] {
  const error = (step.error ?? "").toLowerCase();

  if (error.includes("not found") || error.includes("no element") || error.includes("could not find")) {
    return "element-not-found";
  }
  if (error.includes("timeout") || error.includes("timed out") || error.includes("exceeded")) {
    return "timeout";
  }
  if (error.includes("assert") || error.includes("expect") || error.includes("verification")) {
    return "assertion-failed";
  }
  if (error.includes("navigation") || error.includes("goto") || error.includes("navigate") || error.includes("404") || error.includes("net::")) {
    return "navigation";
  }
  if (error.includes("network") || error.includes("fetch") || error.includes("xhr") || error.includes("api") || error.includes("500") || error.includes("502")) {
    return "network";
  }
  if (error.includes("auth") || error.includes("login") || error.includes("permission") || error.includes("forbidden") || error.includes("401") || error.includes("403")) {
    return "auth";
  }
  if (error.includes("stale") || error.includes("detached") || error.includes("removed") || error.includes("changed")) {
    return "dynamic-content";
  }

  return "unknown";
}

async function analyzeSingleFailure(
  step: TestStep,
  report: TestReport,
  llm: LLMCall,
): Promise<FailureAnalysis> {
  const category = classifyFailure(step);

  const contextSteps = report.results
    .filter(s => Math.abs(s.id - step.id) <= 2)
    .map(s => `  Step ${s.id} [${s.status}]: ${s.description}${s.error ? ` — ${s.error}` : ""}`)
    .join("\n");

  const response = await llm([{
    role: "user",
    content: `You are a test failure analyst. Analyze this test failure and explain the root cause.

Failed step:
  ID: ${step.id}
  Action: ${step.action}
  Description: ${step.description}
  Target: ${step.target ?? "none"}
  Error: ${step.error}
  Duration: ${step.duration ?? 0}ms

Surrounding steps:
${contextSteps}

URL: ${report.url}
Category: ${category}

Respond with JSON:
{
  "rootCause": "One sentence explaining why this failed",
  "suggestion": "One sentence suggesting how to fix it",
  "confidence": 0.0-1.0
}`,
  }]);

  try {
    let json = response.trim();
    const match = json.match(/\{[\s\S]*\}/);
    if (match) json = match[0];
    const parsed = JSON.parse(json) as { rootCause: string; suggestion: string; confidence?: number };

    return {
      stepId: step.id,
      description: step.description,
      error: step.error ?? "",
      rootCause: parsed.rootCause,
      suggestion: parsed.suggestion,
      category,
      confidence: parsed.confidence ?? 0.7,
    };
  } catch {
    return {
      stepId: step.id,
      description: step.description,
      error: step.error ?? "",
      rootCause: getDefaultRootCause(category, step),
      suggestion: getDefaultSuggestion(category),
      category,
      confidence: 0.5,
    };
  }
}

async function analyzeBatchFailures(
  steps: TestStep[],
  report: TestReport,
  llm: LLMCall,
): Promise<FailureAnalysis[]> {
  const stepSummaries = steps.map(s =>
    `Step ${s.id} [${s.action}]: "${s.description}" — Error: ${s.error} (${s.duration ?? 0}ms)`,
  ).join("\n");

  const response = await llm([{
    role: "user",
    content: `Analyze these ${steps.length} test failures on ${report.url} and explain each root cause.

Failures:
${stepSummaries}

Respond with a JSON array:
[{"stepId": 1, "rootCause": "...", "suggestion": "...", "confidence": 0.8}, ...]`,
  }]);

  try {
    let json = response.trim();
    const match = json.match(/\[[\s\S]*\]/);
    if (match) json = match[0];
    const parsed = JSON.parse(json) as Array<{ stepId: number; rootCause: string; suggestion: string; confidence?: number }>;

    return parsed.map(p => {
      const step = steps.find(s => s.id === p.stepId) ?? steps[0];
      return {
        stepId: p.stepId,
        description: step.description,
        error: step.error ?? "",
        rootCause: p.rootCause,
        suggestion: p.suggestion,
        category: classifyFailure(step),
        confidence: p.confidence ?? 0.7,
      };
    });
  } catch {
    // Fallback: classify without LLM
    return steps.map(step => ({
      stepId: step.id,
      description: step.description,
      error: step.error ?? "",
      rootCause: getDefaultRootCause(classifyFailure(step), step),
      suggestion: getDefaultSuggestion(classifyFailure(step)),
      category: classifyFailure(step),
      confidence: 0.4,
    }));
  }
}

function getDefaultRootCause(category: FailureAnalysis["category"], step: TestStep): string {
  switch (category) {
    case "element-not-found": return `Element "${step.target ?? step.description}" not found — may have moved, been renamed, or not yet loaded`;
    case "timeout": return "Operation timed out — page may be slow to load or element is behind a loading state";
    case "assertion-failed": return "Page state did not match expected condition after action";
    case "navigation": return "Page failed to navigate — URL may be broken, redirected, or blocked";
    case "network": return "Network request failed — API may be down, rate-limited, or returning errors";
    case "auth": return "Authentication required — test may need login credentials to access this page";
    case "dynamic-content": return "Element was removed or changed after being found — dynamic content or SPA re-render";
    default: return `Step failed: ${step.error ?? "unknown error"}`;
  }
}

function getDefaultSuggestion(category: FailureAnalysis["category"]): string {
  switch (category) {
    case "element-not-found": return "Try using a more resilient selector (aria-label, role, text content) or add a wait for the element";
    case "timeout": return "Increase timeout, add explicit wait for network idle, or check if the page requires auth";
    case "assertion-failed": return "Verify the expected state is correct, check if the page changed since test was written";
    case "navigation": return "Verify the URL is correct and accessible, check for redirects or auth requirements";
    case "network": return "Check if the API is running, verify network connectivity, check for rate limiting";
    case "auth": return "Provide authentication cookies or credentials via --cookies flag";
    case "dynamic-content": return "Add a wait for the element to stabilize, or use the self-healing selector strategy";
    default: return "Review the error message and check the page state at the time of failure";
  }
}

function generateSummary(failures: FailureAnalysis[]): string {
  if (failures.length === 0) return "No failures to analyze.";

  const categories = new Map<string, number>();
  for (const f of failures) {
    categories.set(f.category, (categories.get(f.category) ?? 0) + 1);
  }

  const parts = Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `${count} ${cat.replace(/-/g, " ")}`);

  return `${failures.length} failure(s): ${parts.join(", ")}`;
}

function extractTopIssues(failures: FailureAnalysis[]): string[] {
  // Deduplicate similar root causes
  const seen = new Set<string>();
  const issues: string[] = [];

  for (const f of failures.sort((a, b) => b.confidence - a.confidence)) {
    const key = f.category + ":" + f.rootCause.slice(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(`[${f.category}] ${f.rootCause}`);
    }
  }

  return issues.slice(0, 5);
}
