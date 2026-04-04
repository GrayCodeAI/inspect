// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - DOM Mutation Watchdog
// ──────────────────────────────────────────────────────────────────────────────

import type { Watchdog, WatchdogEvent } from "./manager.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/watchdog-dom");

/** A tracked DOM mutation */
export interface DOMMutation {
  /** Type of change */
  type: "added" | "removed" | "attribute" | "text";
  /** Target element description */
  target: string;
  /** What changed */
  detail: string;
  /** When it happened */
  timestamp: number;
  /** Whether this might indicate a layout shift */
  possibleLayoutShift: boolean;
}

/** Page interface for DOM observation */
interface PageLike {
  evaluate<T>(fn: string | ((...args: unknown[]) => T)): Promise<T>;
}

/**
 * Watchdog that monitors DOM mutations to detect unexpected changes,
 * layout shifts, and dynamic content updates.
 *
 * Useful for detecting elements appearing/disappearing, detecting
 * async content loads, and identifying layout instability.
 */
export class DOMWatchdog implements Watchdog {
  readonly type = "dom_mutation" as const;
  private page: PageLike | null = null;
  private mutations: DOMMutation[] = [];
  private pendingEvents: WatchdogEvent[] = [];
  private observerInstalled = false;
  private significantMutationCount = 0;
  private mutationThreshold = 50; // Alert after this many mutations in a short period

  constructor(page?: PageLike) {
    this.page = page ?? null;
  }

  setPage(page: PageLike): void {
    this.page = page;
  }

  start(): void {
    this.mutations = [];
    this.pendingEvents = [];
    this.observerInstalled = false;
    this.significantMutationCount = 0;
    this.installObserver();
  }

  stop(): void {
    this.removeObserver();
  }

  check(): WatchdogEvent | null {
    return this.pendingEvents.shift() ?? null;
  }

  /**
   * Install a MutationObserver on the page.
   */
  async installObserver(): Promise<void> {
    if (!this.page || this.observerInstalled) return;

    try {
      await this.page.evaluate(`
        (() => {
          if (window.__inspectDOMObserver) return;

          window.__inspectDOMMutations = [];

          const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              const target = mutation.target;
              const targetDesc = target.nodeName + (target.id ? '#' + target.id : '') +
                (target.className && typeof target.className === 'string' ? '.' + target.className.split(' ')[0] : '');

              if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                  if (node.nodeType === 1) {
                    window.__inspectDOMMutations.push({
                      type: 'added',
                      target: targetDesc,
                      detail: node.nodeName + (node.id ? '#' + node.id : ''),
                      timestamp: Date.now(),
                      possibleLayoutShift: true,
                    });
                  }
                }
                for (const node of mutation.removedNodes) {
                  if (node.nodeType === 1) {
                    window.__inspectDOMMutations.push({
                      type: 'removed',
                      target: targetDesc,
                      detail: node.nodeName + (node.id ? '#' + node.id : ''),
                      timestamp: Date.now(),
                      possibleLayoutShift: true,
                    });
                  }
                }
              } else if (mutation.type === 'attributes') {
                window.__inspectDOMMutations.push({
                  type: 'attribute',
                  target: targetDesc,
                  detail: mutation.attributeName + ': ' + (mutation.oldValue ?? '(new)') + ' -> ' + (target.getAttribute?.(mutation.attributeName) ?? '(removed)'),
                  timestamp: Date.now(),
                  possibleLayoutShift: ['style', 'class', 'hidden'].includes(mutation.attributeName ?? ''),
                });
              }

              // Cap stored mutations
              if (window.__inspectDOMMutations.length > 200) {
                window.__inspectDOMMutations = window.__inspectDOMMutations.slice(-100);
              }
            }
          });

          observer.observe(document.body, {
            childList: true,
            attributes: true,
            subtree: true,
            attributeOldValue: true,
          });

          window.__inspectDOMObserver = observer;
        })()
      `);

      this.observerInstalled = true;
    } catch (error) {
      logger.debug("Failed to install DOM observer, page may not be ready", {
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Collect mutations from the page.
   */
  async collectMutations(): Promise<DOMMutation[]> {
    if (!this.page || !this.observerInstalled) return [];

    try {
      const mutations = (await this.page.evaluate(`
        (() => {
          const mutations = window.__inspectDOMMutations ?? [];
          window.__inspectDOMMutations = [];
          return mutations;
        })()
      `)) as DOMMutation[];

      this.mutations.push(...mutations);

      // Check for significant mutation bursts
      const recentMutations = mutations.filter((m) => Date.now() - m.timestamp < 1000);

      if (recentMutations.length > this.mutationThreshold) {
        this.pendingEvents.push({
          type: "dom_mutation",
          timestamp: Date.now(),
          message: `Rapid DOM mutations detected: ${recentMutations.length} changes in 1 second`,
          severity: "warning",
          blocking: false,
          data: {
            mutationCount: recentMutations.length,
            samples: recentMutations.slice(0, 5),
          },
          suggestedAction: "wait_for_stability",
        });
      }

      // Check for layout shifts
      const layoutShifts = mutations.filter((m) => m.possibleLayoutShift);
      if (layoutShifts.length > 10) {
        this.pendingEvents.push({
          type: "dom_mutation",
          timestamp: Date.now(),
          message: `Possible layout instability: ${layoutShifts.length} layout-affecting changes`,
          severity: "info",
          blocking: false,
          data: { layoutShifts: layoutShifts.slice(0, 5) },
        });
      }

      return mutations;
    } catch (error) {
      logger.debug("Failed to collect DOM mutations", {
        err: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get all recorded mutations.
   */
  getMutations(): DOMMutation[] {
    return [...this.mutations];
  }

  /**
   * Wait for the DOM to stabilize (no mutations for a given period).
   */
  async waitForStability(timeout: number = 5000, stableFor: number = 500): Promise<boolean> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const mutations = await this.collectMutations();

      if (mutations.length === 0) {
        // No mutations in this check; wait a bit and check again
        await new Promise((r) => setTimeout(r, stableFor));
        const moreMutations = await this.collectMutations();
        if (moreMutations.length === 0) {
          return true; // Stable!
        }
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    return false; // Timed out
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async removeObserver(): Promise<void> {
    if (!this.page || !this.observerInstalled) return;

    try {
      await this.page.evaluate(`
        (() => {
          if (window.__inspectDOMObserver) {
            window.__inspectDOMObserver.disconnect();
            delete window.__inspectDOMObserver;
            delete window.__inspectDOMMutations;
          }
        })()
      `);
    } catch (error) {
      logger.debug("Failed to remove DOM observer, page may be gone", {
        err: error instanceof Error ? error.message : String(error),
      });
    }

    this.observerInstalled = false;
  }
}
