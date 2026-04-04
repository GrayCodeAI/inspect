// ============================================================================
// PlaywrightBrowserGymEnvironment — Real browser execution for eval benchmarks
// Connects the BrowserGymEnvironment interface to @inspect/browser
// ============================================================================

import type { ConsoleMessage, Page } from "playwright";
import type { BrowserManager, AriaSnapshotBuilder } from "@inspect/browser";
import type {
  BrowserGymEnvironment,
  BrowserGymObservation,
  BrowserGymAction,
  BrowserGymTask,
} from "./browsergym.js";

export class PlaywrightBrowserGymEnvironment implements BrowserGymEnvironment {
  private browserManager: BrowserManager | null = null;
  private page: Page | null = null;
  private snapshotBuilder: AriaSnapshotBuilder | null = null;
  private currentTask: BrowserGymTask | null = null;
  private stepCount = 0;
  private lastError: string | undefined;
  private consoleMessages: string[] = [];

  /**
   * Reset the environment: launch browser, navigate to task URL, return initial observation.
   */
  async reset(task: BrowserGymTask): Promise<BrowserGymObservation> {
    // Close any existing browser
    if (this.browserManager) {
      await this.close();
    }

    this.currentTask = task;
    this.stepCount = 0;
    this.lastError = undefined;
    this.consoleMessages = [];

    // Launch browser
    const { BrowserManager } = await import("@inspect/browser");
    this.browserManager = new BrowserManager();
    await this.browserManager.launchBrowser({
      headless: true,
      viewport: { width: 1280, height: 720 },
    });
    this.page = await this.browserManager.newPage();

    // Capture console messages
    this.page.on("console", (msg: ConsoleMessage) => {
      this.consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Navigate to start URL
    if (task.startUrl) {
      await this.page.goto(task.startUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    }

    return this.captureObservation();
  }

  /**
   * Execute an action and return the next observation + reward.
   */
  async step(action: BrowserGymAction): Promise<{
    observation: BrowserGymObservation;
    reward: number;
    done: boolean;
    info: Record<string, unknown>;
  }> {
    this.stepCount++;
    this.lastError = undefined;
    let reward = 0;
    let done = false;

    try {
      await this.executeAction(action);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      reward = -0.1; // Small penalty for failed actions
    }

    // Check if agent signaled completion
    if (action.type === "done") {
      done = true;
      reward = 0; // Reward determined by task evaluator, not action success
    }

    // Check step limit
    if (this.currentTask && this.stepCount >= this.currentTask.maxSteps) {
      done = true;
    }

    const observation = await this.captureObservation();

    return {
      observation,
      reward,
      done,
      info: {
        stepCount: this.stepCount,
        success: action.type === "done" && !this.lastError,
        error: this.lastError,
      },
    };
  }

  /**
   * Close the browser and clean up.
   */
  async close(): Promise<void> {
    if (this.browserManager) {
      try {
        await this.browserManager.closeBrowser();
      } catch {
        // Ignore cleanup errors
      }
      this.browserManager = null;
      this.page = null;
      this.snapshotBuilder = null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async executeAction(action: BrowserGymAction): Promise<void> {
    if (!this.page) throw new Error("No browser page — call reset() first");

    switch (action.type) {
      case "click":
        if (!action.target) throw new Error("Click requires a target selector");
        await this.page.click(action.target, { timeout: 10000 });
        break;

      case "type":
        if (!action.target) throw new Error("Type requires a target selector");
        await this.page.fill(action.target, action.value ?? "");
        break;

      case "scroll":
        if (action.target) {
          await this.page.locator(action.target).scrollIntoViewIfNeeded();
        } else {
          const amount = action.amount ?? 300;
          const dir = action.direction ?? "down";
          const deltaY = dir === "up" ? -amount : dir === "down" ? amount : 0;
          const deltaX = dir === "left" ? -amount : dir === "right" ? amount : 0;
          await this.page.mouse.wheel(deltaX, deltaY);
        }
        break;

      case "navigate":
        if (!action.value) throw new Error("Navigate requires a URL in value");
        await this.page.goto(action.value, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        break;

      case "select":
        if (!action.target) throw new Error("Select requires a target selector");
        await this.page.selectOption(action.target, action.value ?? "");
        break;

      case "hover":
        if (!action.target) throw new Error("Hover requires a target selector");
        await this.page.hover(action.target);
        break;

      case "wait":
        await new Promise((r) => setTimeout(r, action.amount ?? 1000));
        break;

      case "done":
        // No-op — handled by the step() method
        break;

      case "noop":
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    // Wait for any navigation/network to settle
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
  }

  private async captureObservation(): Promise<BrowserGymObservation> {
    if (!this.page) {
      return { url: "", title: "", domSnapshot: "", error: "No page" };
    }

    try {
      const url = this.page.url();
      const title = await this.page.title();

      // Build ARIA snapshot for DOM representation
      let domSnapshot = "";
      try {
        const { AriaSnapshotBuilder } = await import("@inspect/browser");
        this.snapshotBuilder = new AriaSnapshotBuilder();
        await this.snapshotBuilder.buildTree(this.page);
        domSnapshot = this.snapshotBuilder.getFormattedTree();
      } catch {
        // Fallback: get page text content
        domSnapshot = await this.page.evaluate("document.body?.innerText?.slice(0, 5000) ?? ''");
      }

      // Capture screenshot
      let screenshot: string | undefined;
      try {
        const buffer = await this.page.screenshot({ type: "png" });
        screenshot = buffer.toString("base64");
      } catch {
        // Screenshot may fail
      }

      return {
        url,
        title,
        domSnapshot,
        screenshot,
        error: this.lastError,
        console: this.consoleMessages.slice(-20),
      };
    } catch (error) {
      return {
        url: "",
        title: "",
        domSnapshot: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
