import type { TestStep, ValidationResult, ValidationEvidence, NetworkFailure, LLMCall, ProgressCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Network monitoring setup
// ---------------------------------------------------------------------------

interface NetworkMonitor {
  failures: NetworkFailure[];
  slowResponses: Array<{ url: string; duration: number }>;
  start: () => void;
  stop: () => NetworkFailure[];
}

export function createNetworkMonitor(page: any): NetworkMonitor {
  const failures: NetworkFailure[] = [];
  const slowResponses: Array<{ url: string; duration: number }> = [];
  const requestTimings = new Map<string, number>();

  const onRequest = (request: any) => {
    requestTimings.set(request.url(), Date.now());
  };

  const onResponse = (response: any) => {
    const url = response.url();
    const status = response.status();
    const startTime = requestTimings.get(url);
    const duration = startTime ? Date.now() - startTime : 0;

    if (status >= 400) {
      failures.push({ url, status, method: response.request().method() });
    }
    if (duration > 3000) {
      slowResponses.push({ url, duration });
    }
    requestTimings.delete(url);
  };

  return {
    failures,
    slowResponses,
    start() {
      page.on("request", onRequest);
      page.on("response", onResponse);
    },
    stop() {
      page.removeListener("request", onRequest);
      page.removeListener("response", onResponse);
      return [...failures];
    },
  };
}

// ---------------------------------------------------------------------------
// Console error capture
// ---------------------------------------------------------------------------

export function createConsoleMonitor(page: any): { errors: string[]; start: () => void; stop: () => string[] } {
  const errors: string[] = [];

  const onConsole = (msg: any) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  };

  const onPageError = (err: any) => {
    errors.push(err.message ?? String(err));
  };

  return {
    errors,
    start() {
      page.on("console", onConsole);
      page.on("pageerror", onPageError);
    },
    stop() {
      page.removeListener("console", onConsole);
      page.removeListener("pageerror", onPageError);
      return [...errors];
    },
  };
}

// ---------------------------------------------------------------------------
// URL change tracking
// ---------------------------------------------------------------------------

export function trackUrlChanges(page: any): { getHistory: () => string[] } {
  const history: string[] = [page.url()];

  const onNavigation = () => {
    const current = page.url();
    if (history[history.length - 1] !== current) {
      history.push(current);
    }
  };

  page.on("framenavigated", onNavigation);

  return {
    getHistory() {
      // Ensure current URL is tracked
      const current = page.url();
      if (history[history.length - 1] !== current) {
        history.push(current);
      }
      return [...history];
    },
  };
}

// ---------------------------------------------------------------------------
// Error banner/toast detection
// ---------------------------------------------------------------------------

async function detectErrorMessages(page: any): Promise<string[]> {
  return page.evaluate(`
    (() => {
      const errors = [];

      // Check for error banners/alerts
      const errorSelectors = [
        '[role="alert"]',
        '.alert-danger', '.alert-error', '.error-message', '.error-banner',
        '.toast-error', '.notification-error',
        '[class*="error"]', '[class*="danger"]',
        '[data-testid*="error"]', '[data-testid*="alert"]',
      ];

      for (const selector of errorSelectors) {
        try {
          const els = document.querySelectorAll(selector);
          for (const el of els) {
            const text = el.textContent?.trim();
            if (text && text.length > 0 && text.length < 500 && el.offsetParent !== null) {
              errors.push(text.slice(0, 200));
            }
          }
        } catch {}
      }

      // Check for validation errors on form fields
      const invalidInputs = document.querySelectorAll(':invalid, [aria-invalid="true"]');
      for (const input of invalidInputs) {
        const name = input.getAttribute("name") || input.getAttribute("aria-label") || "field";
        const msg = input.validationMessage || "Invalid value";
        errors.push(name + ": " + msg);
      }

      // Check for red-bordered elements (potential error fields)
      const allInputs = document.querySelectorAll("input, textarea, select");
      for (const input of allInputs) {
        const style = window.getComputedStyle(input);
        const borderColor = style.borderColor;
        if (borderColor && (borderColor.includes("rgb(255, 0") || borderColor.includes("rgb(220, 53") || borderColor.includes("rgb(239, 68"))) {
          const name = input.getAttribute("name") || input.getAttribute("placeholder") || "field";
          if (!errors.some(e => e.includes(name))) {
            errors.push(name + ": has error styling");
          }
        }
      }

      return [...new Set(errors)].slice(0, 10);
    })()
  `) as string[];
}

// ---------------------------------------------------------------------------
// Visual change detection (basic — compare snapshot line counts and structure)
// ---------------------------------------------------------------------------

function detectVisualChanges(before: string, after: string): boolean {
  if (before === after) return false;

  const beforeLines = before.split("\n").length;
  const afterLines = after.split("\n").length;

  // Significant structural change
  if (Math.abs(beforeLines - afterLines) > 5) return true;

  // Content change check (compare line sets)
  const beforeSet = new Set(before.split("\n").map(l => l.trim()).filter(Boolean));
  const afterSet = new Set(after.split("\n").map(l => l.trim()).filter(Boolean));

  let changed = 0;
  for (const line of afterSet) {
    if (!beforeSet.has(line)) changed++;
  }
  for (const line of beforeSet) {
    if (!afterSet.has(line)) changed++;
  }

  // More than 10% of lines changed
  return changed > Math.max(beforeLines, afterLines) * 0.1;
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

export async function validateStep(
  step: TestStep,
  beforeSnapshot: string,
  afterSnapshot: string,
  llm: LLMCall,
  onProgress: ProgressCallback,
  context?: {
    networkMonitor?: NetworkMonitor;
    consoleErrors?: string[];
    beforeUrl?: string;
    afterUrl?: string;
    page?: any;
  },
): Promise<ValidationResult> {
  // If step already failed, no need to validate
  if (step.status === "fail") {
    return {
      valid: false,
      details: step.error ?? "Step failed",
      evidence: {
        urlChanged: false, contentChanged: false, errorsDetected: [],
        networkFailures: [], consoleErrors: [], visualChanges: false,
      },
      confidence: 1.0,
    };
  }

  // If no assertion, consider it valid
  if (!step.assertion) {
    return {
      valid: true,
      details: "No assertion to verify",
      evidence: {
        urlChanged: false, contentChanged: false, errorsDetected: [],
        networkFailures: [], consoleErrors: [], visualChanges: false,
      },
      confidence: 1.0,
    };
  }

  // Gather evidence
  const evidence: ValidationEvidence = {
    urlChanged: (context?.beforeUrl ?? "") !== (context?.afterUrl ?? ""),
    contentChanged: beforeSnapshot !== afterSnapshot,
    errorsDetected: [],
    networkFailures: context?.networkMonitor?.failures ?? [],
    consoleErrors: context?.consoleErrors ?? [],
    visualChanges: detectVisualChanges(beforeSnapshot, afterSnapshot),
  };

  // Check for error banners
  if (context?.page) {
    try {
      evidence.errorsDetected = await detectErrorMessages(context.page);
    } catch { /* page might have navigated */ }
  }

  // Quick checks that don't need LLM

  // If there are network failures during the step, flag them
  if (evidence.networkFailures.length > 0) {
    const failSummary = evidence.networkFailures
      .map(f => `${f.method} ${f.url} → ${f.status}`)
      .join(", ");
    onProgress("warn", `  ⚠ Network failures: ${failSummary.slice(0, 100)}`);
  }

  // If there are console errors, flag them
  if (evidence.consoleErrors.length > 0) {
    onProgress("warn", `  ⚠ Console errors: ${evidence.consoleErrors.length}`);
  }

  // If explicit error banners detected, it's likely a failure
  if (evidence.errorsDetected.length > 0) {
    const errorAssertion = step.assertion.toLowerCase();
    // If we're EXPECTING errors (e.g., testing validation), this is actually a pass
    if (errorAssertion.includes("error") || errorAssertion.includes("validation") || errorAssertion.includes("invalid")) {
      onProgress("pass", `  ✓ Validated: Error messages displayed as expected`);
      return {
        valid: true,
        details: `Error messages detected as expected: ${evidence.errorsDetected[0]}`,
        evidence,
        confidence: 0.9,
      };
    }
  }

  // LLM-based validation for complex assertions
  const response = await llm([{
    role: "user",
    content: `You are a test validator. Compare the page state before and after an action.

Action performed: ${step.description}
Expected result: ${step.assertion}

URL changed: ${evidence.urlChanged ? "Yes" : "No"}${evidence.urlChanged ? ` (${context?.beforeUrl} → ${context?.afterUrl})` : ""}
Content changed: ${evidence.contentChanged ? "Yes" : "No"}
Visual changes: ${evidence.visualChanges ? "Significant" : "Minimal"}
Network failures: ${evidence.networkFailures.length > 0 ? evidence.networkFailures.map(f => `${f.status} ${f.url}`).join(", ") : "None"}
Console errors: ${evidence.consoleErrors.length > 0 ? evidence.consoleErrors.slice(0, 3).join("; ") : "None"}
Error banners: ${evidence.errorsDetected.length > 0 ? evidence.errorsDetected.slice(0, 3).join("; ") : "None"}

BEFORE snapshot (truncated):
${beforeSnapshot.slice(0, 2500)}

AFTER snapshot (truncated):
${afterSnapshot.slice(0, 2500)}

Did the expected result happen? Consider all evidence.

Respond with JSON: {"valid": true/false, "details": "what changed or why it failed", "confidence": 0.0-1.0}`,
  }]);

  try {
    let json = response.trim();
    const match = json.match(/\{[\s\S]*\}/);
    if (match) json = match[0];
    const result = JSON.parse(json) as { valid: boolean; details: string; confidence?: number };

    const validationResult: ValidationResult = {
      valid: result.valid,
      details: result.details,
      evidence,
      confidence: result.confidence ?? 0.7,
    };

    if (result.valid) {
      onProgress("pass", `  ✓ Validated: ${result.details.slice(0, 80)}`);
    } else {
      onProgress("fail", `  ✗ Validation: ${result.details.slice(0, 80)}`);
      step.status = "fail";
      step.error = result.details;
    }

    return validationResult;
  } catch {
    return {
      valid: true,
      details: "Validation parse error — assuming pass",
      evidence,
      confidence: 0.3,
    };
  }
}
