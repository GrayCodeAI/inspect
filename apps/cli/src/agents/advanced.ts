// ============================================================================
// Advanced Testing Agent — PDF, email, scheduling, self-healing selectors
// ============================================================================

import type { LLMCall, TestPlan } from "./types.js";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PDFTestResult {
  url: string;
  pages: number;
  textContent: string;
  hasImages: boolean;
  issues: string[];
}

export interface EmailTestResult {
  found: boolean;
  subject?: string;
  body?: string;
  from?: string;
  to?: string;
}

export interface ScheduleConfig {
  cron: string;
  url: string;
  tiers: string[];
  notify?: string;
}

export interface SelfHealResult {
  original: string;
  healed: string;
  confidence: number;
  strategy: string;
}

// ---------------------------------------------------------------------------
// PDF download testing
// ---------------------------------------------------------------------------

export async function testPDFDownload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  url: string,
): Promise<PDFTestResult> {
  const issues: string[] = [];
  const tempDir = join(tmpdir(), `inspect-pdf-${randomBytes(8).toString("hex")}`);

  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  let downloadPath = "";

  try {
    // Set up download handler and trigger the download
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.click(`a[href="${url}"], a[href*="${url}"]`).catch(async () => {
        // If no clickable link found, navigate directly
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      }),
    ]);

    if (download) {
      downloadPath = join(tempDir, download.suggestedFilename() || "download.pdf");
      await download.saveAs(downloadPath);
    } else {
      // Fallback: try to fetch the PDF directly via page context
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (response) {
        const buffer = await response.body();
        downloadPath = join(tempDir, "download.pdf");
        writeFileSync(downloadPath, buffer);
      }
    }

    if (!downloadPath || !existsSync(downloadPath)) {
      return {
        url,
        pages: 0,
        textContent: "",
        hasImages: false,
        issues: ["Failed to download PDF file"],
      };
    }

    // Read the file
    const fileBuffer = readFileSync(downloadPath);
    const fileContent = fileBuffer.toString("latin1");

    // Verify PDF header
    if (!fileContent.startsWith("%PDF")) {
      issues.push("File does not have a valid PDF header (%PDF magic bytes missing)");
      cleanup(downloadPath, tempDir);
      return {
        url,
        pages: 0,
        textContent: "",
        hasImages: false,
        issues,
      };
    }

    // Count pages by matching /Type /Page (but not /Type /Pages)
    const pageMatches = fileContent.match(/\/Type\s*\/Page(?!\s*s)\b/g);
    const pageCount = pageMatches ? pageMatches.length : 0;

    if (pageCount === 0) {
      issues.push("Could not determine page count from PDF structure");
    }

    // Extract text content from PDF streams
    // Simple extraction: look for text between BT...ET blocks and parenthesized strings
    const textChunks: string[] = [];
    const textBlockRegex = /BT\s([\s\S]*?)ET/g;
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = textBlockRegex.exec(fileContent)) !== null) {
      const block = blockMatch[1];
      // Extract parenthesized text strings: Tj and TJ operators
      const stringRegex = /\(([^)]*)\)\s*Tj/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = stringRegex.exec(block)) !== null) {
        const decoded = decodePDFString(strMatch[1]);
        if (decoded.trim()) {
          textChunks.push(decoded.trim());
        }
      }
      // Also handle TJ arrays: [(text) num (text) ...] TJ
      const tjArrayRegex = /\[((?:\([^)]*\)|[^])*?)\]\s*TJ/gi;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjArrayRegex.exec(block)) !== null) {
        const arrayContent = tjMatch[1];
        const innerStringRegex = /\(([^)]*)\)/g;
        let innerMatch: RegExpExecArray | null;
        while ((innerMatch = innerStringRegex.exec(arrayContent)) !== null) {
          const decoded = decodePDFString(innerMatch[1]);
          if (decoded.trim()) {
            textChunks.push(decoded.trim());
          }
        }
      }
    }

    const textContent = textChunks.join(" ").slice(0, 10_000); // Cap at 10KB

    // Detect images: look for /Subtype /Image in the file
    const hasImages = /\/Subtype\s*\/Image/i.test(fileContent);

    // Additional checks
    if (fileBuffer.length < 100) {
      issues.push("PDF file is suspiciously small (less than 100 bytes)");
    }

    if (textChunks.length === 0) {
      issues.push("No extractable text found — PDF may be image-only or encrypted");
    }

    // Check for encryption
    if (/\/Encrypt\b/.test(fileContent)) {
      issues.push("PDF is encrypted — text extraction may be incomplete");
    }

    cleanup(downloadPath, tempDir);

    return {
      url,
      pages: pageCount,
      textContent,
      hasImages,
      issues,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`PDF download/parse error: ${message}`);
    cleanup(downloadPath, tempDir);
    return {
      url,
      pages: 0,
      textContent: "",
      hasImages: false,
      issues,
    };
  }
}

function decodePDFString(raw: string): string {
  // Handle common PDF escape sequences
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function cleanup(filePath: string, dirPath: string): void {
  try {
    if (filePath && existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
  try {
    if (dirPath && existsSync(dirPath)) {
      // Best-effort directory removal
      const { rmdirSync } = require("node:fs"); // eslint-disable-line @typescript-eslint/no-require-imports
      rmdirSync(dirPath, { recursive: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Email testing via Mailhog
// ---------------------------------------------------------------------------

export async function checkEmailReceived(
  mailhogUrl: string,
  recipientEmail: string,
  timeout?: number,
): Promise<EmailTestResult> {
  const maxWait = timeout ?? 30_000;
  const pollInterval = 2_000;
  const startTime = Date.now();

  // Normalize the base URL
  const baseUrl = mailhogUrl.replace(/\/+$/, "");
  const searchUrl = `${baseUrl}/api/v2/search?kind=to&query=${encodeURIComponent(recipientEmail)}`;

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(searchUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        await sleep(pollInterval);
        continue;
      }

      const data = (await response.json()) as MailhogSearchResponse;

      if (data.total > 0 && data.items && data.items.length > 0) {
        const item = data.items[0];

        const subject = item.Content?.Headers?.Subject?.[0] ?? undefined;
        const from = item.Content?.Headers?.From?.[0] ?? undefined;
        const to = item.Content?.Headers?.To?.[0] ?? undefined;
        const body = item.Content?.Body ?? undefined;

        return {
          found: true,
          subject,
          body,
          from,
          to,
        };
      }
    } catch {
      // Fetch failed — Mailhog might not be ready yet
    }

    await sleep(pollInterval);
  }

  return { found: false };
}

/** Internal Mailhog API response shape */
interface MailhogSearchResponse {
  total: number;
  count: number;
  start: number;
  items: Array<{
    ID: string;
    Content: {
      Headers: Record<string, string[]>;
      Body: string;
      Size: number;
      MIME?: unknown;
    };
    Created: string;
    From: { Relays: unknown; Mailbox: string; Domain: string };
    To: Array<{ Relays: unknown; Mailbox: string; Domain: string }>;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Schedule configuration
// ---------------------------------------------------------------------------

export function createScheduleConfig(
  url: string,
  cron: string,
  options?: { tiers?: string[]; notify?: string },
): ScheduleConfig {
  return {
    cron,
    url,
    tiers: options?.tiers ?? ["quick"],
    notify: options?.notify,
  };
}

export function generateCronExpression(
  frequency: "hourly" | "daily" | "weekly" | "monthly",
): string {
  switch (frequency) {
    case "hourly":
      return "0 * * * *";
    case "daily":
      return "0 9 * * *";
    case "weekly":
      return "0 9 * * 1";
    case "monthly":
      return "0 9 1 * *";
    default:
      return "0 9 * * *";
  }
}

// ---------------------------------------------------------------------------
// Self-healing selectors
// ---------------------------------------------------------------------------

export async function selfHealSelector(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  failedSelector: string,
  description: string,
  snapshot: string,
  llm: LLMCall,
): Promise<SelfHealResult> {
  // Strategy 1: Try relaxing the selector (remove pseudo-classes, nth-child, etc.)
  const relaxed = relaxSelector(failedSelector);
  if (relaxed !== failedSelector) {
    const found = await safeQuerySelector(page, relaxed);
    if (found) {
      return {
        original: failedSelector,
        healed: relaxed,
        confidence: 0.7,
        strategy: "relaxed-selector",
      };
    }
  }

  // Strategy 2: Try partial text matching
  const textContent = extractTextFromSelector(failedSelector);
  if (textContent) {
    // Try text= selector
    const textSelector = `text=${textContent}`;
    const found = await safeQuerySelector(page, textSelector);
    if (found) {
      return {
        original: failedSelector,
        healed: textSelector,
        confidence: 0.65,
        strategy: "partial-text",
      };
    }

    // Try partial text with :has-text()
    const hasTextSelector = `:has-text("${textContent}")`;
    const foundHasText = await safeQuerySelector(page, hasTextSelector);
    if (foundHasText) {
      return {
        original: failedSelector,
        healed: hasTextSelector,
        confidence: 0.6,
        strategy: "has-text",
      };
    }
  }

  // Strategy 3: Try aria-label based selector
  const ariaLabel = extractAriaHint(failedSelector, description);
  if (ariaLabel) {
    const ariaSelector = `[aria-label="${ariaLabel}"]`;
    const found = await safeQuerySelector(page, ariaSelector);
    if (found) {
      return {
        original: failedSelector,
        healed: ariaSelector,
        confidence: 0.6,
        strategy: "aria-label",
      };
    }
  }

  // Strategy 4: Try role-based selector from description
  const roleSelector = buildRoleSelector(description);
  if (roleSelector) {
    const found = await safeQuerySelector(page, roleSelector);
    if (found) {
      return {
        original: failedSelector,
        healed: roleSelector,
        confidence: 0.55,
        strategy: "role-based",
      };
    }
  }

  // Strategy 5: Ask LLM for a new selector based on the current snapshot
  const llmPrompt = `You are a browser test automation expert. A CSS/Playwright selector has failed to find an element on the page.

Failed selector: ${failedSelector}
Element description: ${description}

Current page accessibility snapshot (ARIA tree):
${snapshot.slice(0, 8_000)}

Based on the snapshot above, suggest ONE alternative selector that would match the described element. The selector should be a valid Playwright selector (CSS, text=, role=, or [aria-label=] format).

Reply with ONLY the selector string, nothing else.`;

  try {
    const llmResponse = await llm([
      {
        role: "system",
        content: "You are a selector healing assistant. Reply with ONLY a single selector string.",
      },
      { role: "user", content: llmPrompt },
    ]);

    const suggestedSelector = llmResponse.trim().replace(/^["']|["']$/g, "");

    if (suggestedSelector && suggestedSelector.length > 0 && suggestedSelector.length < 500) {
      const found = await safeQuerySelector(page, suggestedSelector);
      if (found) {
        return {
          original: failedSelector,
          healed: suggestedSelector,
          confidence: 0.8,
          strategy: "llm-suggested",
        };
      }

      // LLM suggestion didn't work on the page, but return it with lower confidence
      return {
        original: failedSelector,
        healed: suggestedSelector,
        confidence: 0.3,
        strategy: "llm-suggested-unverified",
      };
    }
  } catch {
    // LLM call failed — fall through
  }

  // All strategies exhausted
  return {
    original: failedSelector,
    healed: failedSelector,
    confidence: 0,
    strategy: "none",
  };
}

// ---------------------------------------------------------------------------
// Self-healing test plans
// ---------------------------------------------------------------------------

export async function selfHealPlan(
  plan: TestPlan,
  failedStepId: number,
  error: string,
  snapshot: string,
  llm: LLMCall,
): Promise<TestPlan> {
  const failedStep = plan.steps.find((s) => s.id === failedStepId);
  if (!failedStep) {
    return plan;
  }

  const contextSteps = plan.steps
    .filter((s) => s.id >= failedStepId - 2 && s.id <= failedStepId + 2)
    .map(
      (s) =>
        `  Step ${s.id}: [${s.action}] ${s.description}${s.target ? ` (target: ${s.target})` : ""}${s.value ? ` (value: ${s.value})` : ""}${s.id === failedStepId ? " <-- FAILED" : ""}`,
    )
    .join("\n");

  const prompt = `You are a test plan healing assistant. A test step has failed during execution. Analyze the failure and suggest how to fix the plan.

Failed step:
  ID: ${failedStep.id}
  Action: ${failedStep.action}
  Description: ${failedStep.description}
  Target: ${failedStep.target ?? "none"}
  Value: ${failedStep.value ?? "none"}
  Error: ${error}

Surrounding steps:
${contextSteps}

Current page accessibility snapshot (ARIA tree):
${snapshot.slice(0, 6_000)}

Respond in JSON format with ONE of these strategies:
1. Fix the target selector: {"strategy": "fix-target", "target": "<new selector>", "description": "<updated description>"}
2. Change the action: {"strategy": "change-action", "action": "<new action>", "target": "<target>", "value": "<value>", "description": "<updated description>"}
3. Replace with multiple steps: {"strategy": "replace", "steps": [{"action": "<action>", "target": "<target>", "value": "<value>", "description": "<description>"}, ...]}
4. Skip and add alternative: {"strategy": "skip", "alternative": {"action": "<action>", "target": "<target>", "value": "<value>", "description": "<description>"}}

Reply with ONLY the JSON object, no other text.`;

  try {
    const llmResponse = await llm([
      {
        role: "system",
        content: "You are a test plan healing assistant. Reply with ONLY valid JSON.",
      },
      { role: "user", content: prompt },
    ]);

    // Parse the LLM response
    const jsonStr = extractJSON(llmResponse);
    const suggestion = JSON.parse(jsonStr) as HealSuggestion;

    const healedPlan: TestPlan = {
      ...plan,
      steps: [...plan.steps],
    };

    const stepIndex = healedPlan.steps.findIndex((s) => s.id === failedStepId);
    if (stepIndex === -1) {
      return plan;
    }

    switch (suggestion.strategy) {
      case "fix-target": {
        healedPlan.steps[stepIndex] = {
          ...healedPlan.steps[stepIndex],
          target: suggestion.target ?? healedPlan.steps[stepIndex].target,
          description: suggestion.description ?? healedPlan.steps[stepIndex].description,
          status: "pending",
          error: undefined,
          retries: (healedPlan.steps[stepIndex].retries ?? 0) + 1,
        };
        break;
      }

      case "change-action": {
        healedPlan.steps[stepIndex] = {
          ...healedPlan.steps[stepIndex],
          action: suggestion.action ?? healedPlan.steps[stepIndex].action,
          target: suggestion.target ?? healedPlan.steps[stepIndex].target,
          value: suggestion.value ?? healedPlan.steps[stepIndex].value,
          description: suggestion.description ?? healedPlan.steps[stepIndex].description,
          status: "pending",
          error: undefined,
          retries: (healedPlan.steps[stepIndex].retries ?? 0) + 1,
        };
        break;
      }

      case "replace": {
        if (suggestion.steps && suggestion.steps.length > 0) {
          const replacementSteps = suggestion.steps.map((s, i) => ({
            id: failedStepId * 100 + i, // Avoid ID collisions
            action: s.action,
            description: s.description,
            target: s.target,
            value: s.value,
            status: "pending" as const,
          }));
          healedPlan.steps.splice(stepIndex, 1, ...replacementSteps);
        }
        break;
      }

      case "skip": {
        // Mark original as skipped
        healedPlan.steps[stepIndex] = {
          ...healedPlan.steps[stepIndex],
          status: "skip",
          error: `Skipped: ${error}`,
        };

        // Insert alternative step after the skipped one
        if (suggestion.alternative) {
          const altStep = {
            id: failedStepId * 100,
            action: suggestion.alternative.action,
            description: suggestion.alternative.description,
            target: suggestion.alternative.target,
            value: suggestion.alternative.value,
            status: "pending" as const,
          };
          healedPlan.steps.splice(stepIndex + 1, 0, altStep);
        }
        break;
      }

      default:
        // Unknown strategy — return plan unchanged
        return plan;
    }

    return healedPlan;
  } catch {
    // LLM call or JSON parsing failed — return plan unchanged
    return plan;
  }
}

// ---------------------------------------------------------------------------
// Internal types for LLM healing suggestions
// ---------------------------------------------------------------------------

interface HealSuggestion {
  strategy: "fix-target" | "change-action" | "replace" | "skip";
  target?: string;
  action?: string;
  value?: string;
  description?: string;
  steps?: Array<{
    action: string;
    target?: string;
    value?: string;
    description: string;
  }>;
  alternative?: {
    action: string;
    target?: string;
    value?: string;
    description: string;
  };
}

// ---------------------------------------------------------------------------
// Selector healing utilities
// ---------------------------------------------------------------------------

function relaxSelector(selector: string): string {
  let relaxed = selector;

  // Remove :nth-child, :nth-of-type, etc.
  relaxed = relaxed.replace(/:nth-(?:child|of-type)\([^)]*\)/g, "");

  // Remove direct child combinators (>) and replace with descendant
  relaxed = relaxed.replace(/\s*>\s*/g, " ");

  // Remove :first-child, :last-child, :only-child
  relaxed = relaxed.replace(/:(?:first|last|only)-child/g, "");

  // Remove overly specific attribute selectors but keep data-testid and aria-*
  relaxed = relaxed.replace(/\[(?!data-testid|aria-|role)[a-z-]+=["'][^"']*["']\]/gi, "");

  return relaxed.trim();
}

function extractTextFromSelector(selector: string): string | null {
  // Extract text from text= selectors
  const textMatch = selector.match(/text=["']?([^"']+)["']?/i);
  if (textMatch) return textMatch[1];

  // Extract from :has-text("...")
  const hasTextMatch = selector.match(/:has-text\(["']([^"']+)["']\)/i);
  if (hasTextMatch) return hasTextMatch[1];

  // Extract from >> text= chained selectors
  const chainedTextMatch = selector.match(/>> text=["']?([^"']+)["']?/i);
  if (chainedTextMatch) return chainedTextMatch[1];

  return null;
}

function extractAriaHint(selector: string, description: string): string | null {
  // Try to derive from aria-label in the selector
  const ariaMatch = selector.match(/\[aria-label=["']([^"']+)["']\]/i);
  if (ariaMatch) return ariaMatch[1];

  // Try to derive a hint from the description
  // e.g. "Click the Submit button" -> "Submit"
  const buttonMatch = description.match(
    /(?:click|press|tap)\s+(?:the\s+)?["']?(\w[\w\s]*?)["']?\s*(?:button|link|tab|menu|icon)/i,
  );
  if (buttonMatch) return buttonMatch[1].trim();

  return null;
}

function buildRoleSelector(description: string): string | null {
  const lower = description.toLowerCase();

  // Map description keywords to ARIA roles and names
  const rolePatterns: Array<{ pattern: RegExp; role: string; nameGroup?: number }> = [
    {
      pattern: /(?:click|press|tap)\s+(?:the\s+)?["']?(.+?)["']?\s+button/i,
      role: "button",
      nameGroup: 1,
    },
    {
      pattern: /(?:click|press|tap)\s+(?:the\s+)?["']?(.+?)["']?\s+link/i,
      role: "link",
      nameGroup: 1,
    },
    {
      pattern:
        /(?:fill|type|enter)\s+(?:in(?:to)?\s+)?(?:the\s+)?["']?(.+?)["']?\s+(?:field|input|textbox)/i,
      role: "textbox",
      nameGroup: 1,
    },
    {
      pattern:
        /(?:select|choose)\s+.*?\s+(?:from\s+)?(?:the\s+)?["']?(.+?)["']?\s+(?:dropdown|select|combobox)/i,
      role: "combobox",
      nameGroup: 1,
    },
    {
      pattern: /(?:check|toggle)\s+(?:the\s+)?["']?(.+?)["']?\s+checkbox/i,
      role: "checkbox",
      nameGroup: 1,
    },
  ];

  for (const { pattern, role, nameGroup } of rolePatterns) {
    const match = lower.match(pattern);
    if (match && nameGroup !== undefined && match[nameGroup]) {
      const name = match[nameGroup].trim();
      return `role=${role}[name="${name}"]`;
    }
  }

  // Simple role extraction without name
  if (lower.includes("button")) return `role=button`;
  if (lower.includes("link")) return `role=link`;
  if (lower.includes("checkbox")) return `role=checkbox`;
  if (lower.includes("textbox") || lower.includes("input") || lower.includes("field"))
    return `role=textbox`;

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeQuerySelector(page: any, selector: string): Promise<boolean> {
  try {
    const element = await page.$(selector);
    return element !== null;
  } catch {
    return false;
  }
}

function extractJSON(text: string): string {
  // Try to find JSON object in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text.trim();
}
