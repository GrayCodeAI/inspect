export interface ReplayValidationStep {
  eventIndex: number;
  action: string;
  status: "pass" | "fail" | "skip";
  reason?: string;
  screenshotPath?: string;
  duration: number;
}

export interface ReplayValidationResult {
  sessionId: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  steps: ReplayValidationStep[];
  status: "pass" | "fail" | "partial";
  duration: number;
  startedAt: number;
  completedAt: number;
}

export interface RRWebEvent {
  type: number;
  data: unknown;
  timestamp: number;
  delay?: number;
}

interface PageLike {
  goto(url: string): Promise<void>;
  evaluate<R>(pageFunction: string | (() => R | Promise<R>)): Promise<R>;
  evaluate<R, Arg>(pageFunction: string | ((arg: Arg) => R | Promise<R>), arg: Arg): Promise<R>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
}

interface ClickData {
  x?: number;
  y?: number;
  id?: string;
}

interface InputData {
  text?: string;
  id?: string;
}

interface ExtractedAction {
  type: "navigate" | "click" | "type" | "scroll" | "wait";
  data: Record<string, unknown>;
}

/**
 * ReplayValidator replays rrweb recorded sessions on a live browser page
 * and validates that actions complete successfully.
 */
export class ReplayValidator {
  private sessionId: string;
  private events: RRWebEvent[];
  private outputDir: string;

  constructor(sessionId: string, events: RRWebEvent[], outputDir: string = ".inspect/replays") {
    this.sessionId = sessionId;
    this.events = events;
    this.outputDir = outputDir;
  }

  /**
   * Play back and validate all recorded actions
   */
  async validate(page: PageLike, baseUrl: string): Promise<ReplayValidationResult> {
    const startedAt = Date.now();
    const results: ReplayValidationStep[] = [];
    let passedSteps = 0;
    let failedSteps = 0;
    const skippedSteps = 0;

    // Extract actionable events from rrweb stream
    const actions = this.extractActions();

    // Play back each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const stepStartTime = Date.now();

      try {
        await this.validateStep(page, action, i);
        results.push({
          eventIndex: i,
          action: action.type,
          status: "pass",
          duration: Date.now() - stepStartTime,
        });
        passedSteps++;
      } catch (err) {
        results.push({
          eventIndex: i,
          action: action.type,
          status: "fail",
          reason: err instanceof Error ? err.message : String(err),
          duration: Date.now() - stepStartTime,
        });
        failedSteps++;
      }
    }

    const completedAt = Date.now();

    const status: "pass" | "fail" | "partial" =
      failedSteps === 0 ? "pass" : passedSteps > 0 ? "partial" : "fail";

    return {
      sessionId: this.sessionId,
      totalSteps: actions.length,
      passedSteps,
      failedSteps,
      skippedSteps,
      steps: results,
      status,
      duration: completedAt - startedAt,
      startedAt,
      completedAt,
    };
  }

  /**
   * Validate a single action step
   */
  private async validateStep(
    page: PageLike,
    action: ExtractedAction,
    stepIndex: number,
  ): Promise<void> {
    switch (action.type) {
      case "navigate": {
        const url = action.data.url as string;
        if (!url) throw new Error("Navigate action missing URL");
        await page.goto(url);
        break;
      }

      case "click": {
        const data = action.data as ClickData;
        if (data.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (page.evaluate as any)(
            `(id) => {
              const el = document.getElementById(id);
              if (!el) throw new Error(\`Element #\${id} not found\`);
              el.click();
            }`,
            data.id,
          );
        } else if (data.x !== undefined && data.y !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (page.evaluate as any)(
            `(x, y) => {
              const el = document.elementFromPoint(x, y);
              if (!el) throw new Error(\`No element at (\${x}, \${y})\`);
              el.click();
            }`,
            data.x,
            data.y,
          );
        } else {
          throw new Error("Click action missing ID or coordinates");
        }
        break;
      }

      case "type": {
        const data = action.data as InputData;
        if (!data.id) throw new Error("Type action missing element ID");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (page.evaluate as any)(
          `(id, text) => {
            const el = document.getElementById(id);
            if (!el) throw new Error(\`Input #\${id} not found\`);
            el.focus();
            el.value = text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }`,
          data.id,
          data.text || "",
        );
        break;
      }

      case "scroll": {
        const data = action.data as { x?: number; y?: number };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (page.evaluate as any)(
          `(x, y) => {
            window.scrollBy(x, y);
          }`,
          data.x || 0,
          data.y || 0,
        );
        break;
      }

      case "wait": {
        // Wait 500ms for any animations/DOM updates
        await new Promise((r) => setTimeout(r, 500));
        break;
      }
    }

    // Add a small delay between actions
    await new Promise((r) => setTimeout(r, 100));
  }

  /**
   * Extract actionable events from rrweb stream
   */
  private extractActions(): ExtractedAction[] {
    const actions: ExtractedAction[] = [];

    for (const event of this.events) {
      if (event.type === 3 && typeof event.data === "object" && event.data !== null) {
        const data = event.data as Record<string, unknown>;
        const incrementalType = data.source;

        if (incrementalType === 2) {
          // Mouse interaction
          const interactionData = data.data as Record<string, unknown>;
          const type = interactionData.type;

          if (type === 2) {
            // click
            actions.push({
              type: "click",
              data: {
                x: (interactionData.x as number) || 0,
                y: (interactionData.y as number) || 0,
              },
            });
          }
        } else if (incrementalType === 5) {
          // Input event
          actions.push({
            type: "type",
            data: {
              text: ((data.data as Record<string, unknown>) || {}).text as string,
            },
          });
        } else if (incrementalType === 3) {
          // Scroll
          actions.push({
            type: "scroll",
            data: {
              x: ((data.data as Record<string, unknown>) || {}).x as number,
              y: ((data.data as Record<string, unknown>) || {}).y as number,
            },
          });
        }
      } else if (event.type === 2) {
        // FullSnapshot - typically the initial page load
        actions.push({
          type: "navigate",
          data: {
            url: "about:blank",
          },
        });
      }
    }

    return actions;
  }
}
