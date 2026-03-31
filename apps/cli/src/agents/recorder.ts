// ============================================================================
// Record-and-Playback — Capture user browser actions and generate test steps
// ============================================================================

import type { Page, Frame, CDPSession } from "./playwright-types.js";
import type { TestStep, ProgressCallback } from "./types.js";
import { safeEvaluate } from "./evaluate.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordedAction {
  type: string;
  target: string;
  value?: string;
  timestamp: number;
  selector?: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Recording listeners
// ---------------------------------------------------------------------------

/**
 * Attach listeners for click, input, change, submit, and navigation events
 * on the given page. Returns a stop function that removes all listeners.
 */
export async function startRecording(
  page: Page,
  onAction: (action: RecordedAction) => void,
): Promise<() => void> {
  const listeners: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];
  let cdpSession: CDPSession | null = null;
  let stopped = false;

  // Helper to get the current page URL safely
  const currentUrl = (): string => {
    try {
      return page.url() as string;
    } catch {
      return "";
    }
  };

  // -----------------------------------------------------------------------
  // 1. Inject in-page listeners via page.evaluate for DOM events
  // -----------------------------------------------------------------------
  await safeEvaluate(
    page,
    `(() => {
      if (window.__inspectRecording) return;
      window.__inspectRecording = true;
      window.__inspectActions = [];

      function describeElement(el) {
        const tag = el.tagName?.toLowerCase() ?? "";
        const text = (el.textContent ?? "").trim().slice(0, 80);
        const label = el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("id") || "";
        const type = el.getAttribute("type") || "";
        return label || text || (tag + (type ? "[type=" + type + "]" : ""));
      }

      function buildSelector(el) {
        if (el.id) return "#" + el.id;
        if (el.getAttribute("data-testid")) return "[data-testid=\\"" + el.getAttribute("data-testid") + "\\"]";
        if (el.getAttribute("aria-label")) return "[aria-label=\\"" + el.getAttribute("aria-label") + "\\"]";
        if (el.getAttribute("name")) return "[name=\\"" + el.getAttribute("name") + "\\"]";
        const tag = el.tagName?.toLowerCase() ?? "div";
        const text = (el.textContent ?? "").trim().slice(0, 40);
        if (text) return tag + ':has-text("' + text.replace(/"/g, '\\\\"') + '")';
        return tag;
      }

      document.addEventListener("click", (e) => {
        const el = e.target;
        if (!el || !el.tagName) return;
        window.__inspectActions.push({
          type: "click",
          target: describeElement(el),
          selector: buildSelector(el),
          timestamp: Date.now(),
        });
      }, true);

      document.addEventListener("input", (e) => {
        const el = e.target;
        if (!el || !el.tagName) return;
        window.__inspectActions.push({
          type: "input",
          target: describeElement(el),
          value: el.value ?? "",
          selector: buildSelector(el),
          timestamp: Date.now(),
        });
      }, true);

      document.addEventListener("change", (e) => {
        const el = e.target;
        if (!el || !el.tagName) return;
        window.__inspectActions.push({
          type: "change",
          target: describeElement(el),
          value: el.value ?? "",
          selector: buildSelector(el),
          timestamp: Date.now(),
        });
      }, true);

      document.addEventListener("submit", (e) => {
        const form = e.target;
        if (!form || !form.tagName) return;
        const submitBtn = form.querySelector("[type=submit], button:not([type])");
        const target = submitBtn
          ? describeElement(submitBtn)
          : ("form" + (form.getAttribute("action") ? "[action=" + form.getAttribute("action") + "]" : ""));
        window.__inspectActions.push({
          type: "submit",
          target: target,
          selector: submitBtn ? buildSelector(submitBtn) : buildSelector(form),
          timestamp: Date.now(),
        });
      }, true);
    })()`,
    undefined,
  );

  // -----------------------------------------------------------------------
  // 2. Poll for in-page actions and forward them to the onAction callback
  // -----------------------------------------------------------------------
  const pollInterval = setInterval(async () => {
    if (stopped) return;
    try {
      const actions = await safeEvaluate<RecordedAction[]>(
        page,
        `(() => {
          const a = window.__inspectActions ?? [];
          window.__inspectActions = [];
          return a;
        })()`,
        [],
      );
      const url = currentUrl();
      for (const action of actions) {
        onAction({ ...action, url: action.url || url });
      }
    } catch {
      // page may have navigated — silently skip
    }
  }, 250);

  // -----------------------------------------------------------------------
  // 3. Listen for page-level navigation events
  // -----------------------------------------------------------------------
  const onFrameNavigated = (frame: unknown): void => {
    if (stopped) return;
    try {
      if ((frame as Frame) === page.mainFrame()) {
        const url = (frame as Frame).url() as string;
        onAction({
          type: "navigation",
          target: url,
          timestamp: Date.now(),
          url,
        });
      }
    } catch {
      // ignore
    }
  };
  page.on("framenavigated", onFrameNavigated);
  listeners.push({ event: "framenavigated", handler: onFrameNavigated });

  // -----------------------------------------------------------------------
  // 4. CDP session for low-level mouse/keyboard events (optional, best-effort)
  // -----------------------------------------------------------------------
  try {
    cdpSession = await page.context().newCDPSession(page);
    await cdpSession.send("DOM.enable");
    await cdpSession.send("Input.setInterceptDrags", { enabled: false }).catch(() => {});

    cdpSession.on("DOM.attributeModified", (params: Record<string, unknown>) => {
      if (stopped) return;
      onAction({
        type: "attribute-modified",
        target: `node:${params.nodeId}`,
        value: `${params.name}=${params.value}`,
        timestamp: Date.now(),
        url: currentUrl(),
      });
    });
  } catch {
    // CDP may not be available in all browsers — recording still works via DOM events
    cdpSession = null;
  }

  // -----------------------------------------------------------------------
  // 5. Return stop function
  // -----------------------------------------------------------------------
  return () => {
    stopped = true;
    clearInterval(pollInterval);

    for (const { event, handler } of listeners) {
      try {
        (page.off as (event: string, handler: (...args: unknown[]) => void) => void)(
          event,
          handler,
        );
      } catch {
        // ignore
      }
    }

    if (cdpSession) {
      try {
        cdpSession.detach();
      } catch {
        // ignore
      }
    }

    // Clean up in-page state
    safeEvaluate(
      page,
      `(() => { window.__inspectRecording = false; window.__inspectActions = []; })()`,
      undefined,
    ).catch(() => {});
  };
}

// ---------------------------------------------------------------------------
// Convert recorded actions to TestStep array
// ---------------------------------------------------------------------------

/**
 * Convert RecordedActions to TestStep array.
 *   - click    -> click
 *   - input    -> fill
 *   - change   -> fill
 *   - submit   -> click (on submit button)
 *   - navigation -> navigate
 */
export function actionsToTestSteps(actions: RecordedAction[]): TestStep[] {
  const steps: TestStep[] = [];
  let id = 1;

  // Deduplicate consecutive input events on the same target (keep last value)
  const deduped = deduplicateInputs(actions);

  for (const action of deduped) {
    const step = actionToStep(action, id);
    if (step) {
      steps.push(step);
      id++;
    }
  }

  return steps;
}

function actionToStep(action: RecordedAction, id: number): TestStep | null {
  switch (action.type) {
    case "click":
      return {
        id,
        action: "click",
        description: `Click on "${action.target}"`,
        target: action.selector ?? action.target,
        status: "pending",
      };

    case "input":
    case "change":
      return {
        id,
        action: "fill",
        description: `Fill "${action.target}" with "${truncate(action.value ?? "", 40)}"`,
        target: action.selector ?? action.target,
        value: action.value,
        status: "pending",
      };

    case "submit":
      return {
        id,
        action: "click",
        description: `Submit form via "${action.target}"`,
        target: action.selector ?? action.target,
        status: "pending",
      };

    case "navigation":
      return {
        id,
        action: "navigate",
        description: `Navigate to ${action.target}`,
        target: action.target,
        status: "pending",
      };

    case "attribute-modified":
      // Attribute changes are informational — skip as standalone steps
      return null;

    default:
      return {
        id,
        action: action.type as string,
        description: `${action.type} on "${action.target}"`,
        target: action.selector ?? action.target,
        value: action.value,
        status: "pending",
      };
  }
}

/**
 * Merge consecutive input events on the same selector into a single event
 * with the last captured value (avoids generating a step per keystroke).
 */
function deduplicateInputs(actions: RecordedAction[]): RecordedAction[] {
  if (actions.length === 0) return [];

  const result: RecordedAction[] = [];
  let pending: RecordedAction | null = null;

  for (const action of actions) {
    if (action.type === "input") {
      if (pending && pending.type === "input" && pending.selector === action.selector) {
        // Same input field — update the value
        pending = { ...action };
      } else {
        if (pending) result.push(pending);
        pending = { ...action };
      }
    } else {
      if (pending) {
        result.push(pending);
        pending = null;
      }
      result.push(action);
    }
  }

  if (pending) result.push(pending);

  return result;
}

// ---------------------------------------------------------------------------
// Convert recorded actions to YAML workflow
// ---------------------------------------------------------------------------

/**
 * Convert RecordedActions to a YAML workflow string compatible with the
 * Inspect workflow engine.
 */
export function actionsToYAML(actions: RecordedAction[]): string {
  const deduped = deduplicateInputs(actions);
  const lines: string[] = [
    "# Inspect recorded workflow",
    `# Recorded at ${new Date().toISOString()}`,
    "",
    "name: Recorded Session",
    "steps:",
  ];

  for (const action of deduped) {
    const block = actionToYAMLBlock(action);
    if (block) {
      lines.push(...block);
    }
  }

  return lines.join("\n") + "\n";
}

function actionToYAMLBlock(action: RecordedAction): string[] | null {
  switch (action.type) {
    case "click":
      return [
        `  - type: click`,
        `    target: ${yamlString(action.selector ?? action.target)}`,
        `    description: ${yamlString(`Click on "${action.target}"`)}`,
      ];

    case "input":
    case "change":
      return [
        `  - type: fill`,
        `    target: ${yamlString(action.selector ?? action.target)}`,
        `    value: ${yamlString(action.value ?? "")}`,
        `    description: ${yamlString(`Fill "${action.target}"`)}`,
      ];

    case "submit":
      return [
        `  - type: click`,
        `    target: ${yamlString(action.selector ?? action.target)}`,
        `    description: ${yamlString(`Submit form via "${action.target}"`)}`,
      ];

    case "navigation":
      return [
        `  - type: navigate`,
        `    target: ${yamlString(action.target)}`,
        `    description: ${yamlString(`Navigate to ${action.target}`)}`,
      ];

    case "attribute-modified":
      return null;

    default:
      return [
        `  - type: ${action.type}`,
        `    target: ${yamlString(action.selector ?? action.target)}`,
        ...(action.value ? [`    value: ${yamlString(action.value)}`] : []),
      ];
  }
}

/**
 * Escape a value for inline YAML. Wraps in double quotes if it contains
 * special characters.
 */
function yamlString(value: string): string {
  if (/[\]:#[{}&*!|>'"%@`,?]/.test(value) || value.includes("\n")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return value || '""';
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

// ---------------------------------------------------------------------------
// Full record session
// ---------------------------------------------------------------------------

/**
 * Navigate to a URL, start recording actions for the given duration,
 * then stop and return the collected actions.
 */
export async function recordSession(
  page: Page,
  url: string,
  duration: number,
  onProgress: ProgressCallback,
): Promise<RecordedAction[]> {
  const actions: RecordedAction[] = [];

  onProgress("info", `Navigating to ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  onProgress("info", `Recording for ${Math.round(duration / 1000)}s — interact with the page`);

  const stop = await startRecording(page, (action) => {
    actions.push(action);
    onProgress(
      "step",
      `  [${action.type}] ${action.target}${action.value ? ` = "${truncate(action.value, 30)}"` : ""}`,
    );
  });

  // Wait for the specified duration
  await new Promise<void>((resolve) => setTimeout(resolve, duration));

  stop();

  onProgress("done", `Recording complete — captured ${actions.length} action(s)`);

  return actions;
}
