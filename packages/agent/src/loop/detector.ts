// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Loop Detector
// ──────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

/** An action in the history */
export interface ActionRecord {
  /** Action type (click, type, navigate, etc.) */
  type: string;
  /** Target element reference */
  ref?: string;
  /** Value (text typed, URL navigated to, etc.) */
  value?: string;
  /** Page URL at time of action */
  url: string;
  /** Timestamp */
  timestamp: number;
  /** Computed similarity hash */
  hash?: string;
}

/** Loop detection result */
export interface LoopDetection {
  /** Whether a loop was detected */
  detected: boolean;
  /** The pattern that's repeating */
  pattern?: ActionRecord[];
  /** How many times the pattern repeated */
  repetitions?: number;
  /** Confidence of the detection (0-1) */
  confidence: number;
  /** Type of loop */
  loopType?: "exact" | "similar" | "oscillating" | "stuck";
}

/** Nudge message to help break the loop */
export interface LoopNudge {
  message: string;
  severity: "info" | "warning" | "critical";
  suggestions: string[];
}

/**
 * Detects when the agent gets stuck in action loops.
 *
 * Uses action similarity hashing and sliding window analysis
 * to identify repeated patterns like:
 * - Exact loops: click A -> click B -> click A -> click B
 * - Oscillating: navigating back and forth between two pages
 * - Stuck: performing the same action repeatedly with no effect
 */
export class LoopDetector {
  private history: ActionRecord[] = [];
  private loopCount = 0;
  private lastDetection: LoopDetection | null = null;

  /**
   * Record a new action in the history.
   */
  record(action: Omit<ActionRecord, "hash" | "timestamp">): void {
    const record: ActionRecord = {
      ...action,
      timestamp: Date.now(),
      hash: this.computeHash(action),
    };
    this.history.push(record);

    // Keep history bounded
    if (this.history.length > 200) {
      this.history = this.history.slice(-100);
    }
  }

  /**
   * Detect if the agent is stuck in a loop.
   *
   * @param windowSize - Number of recent actions to analyze (default: 20)
   * @param minRepetitions - Minimum pattern repetitions to trigger (default: 2)
   */
  detectLoop(windowSize: number = 20, minRepetitions: number = 2): LoopDetection {
    if (this.history.length < 4) {
      return { detected: false, confidence: 0 };
    }

    const window = this.history.slice(-windowSize);

    // Check for exact repetition (same action repeated)
    const stuckCheck = this.detectStuck(window);
    if (stuckCheck.detected) {
      this.lastDetection = stuckCheck;
      this.loopCount++;
      return stuckCheck;
    }

    // Check for oscillating patterns (A -> B -> A -> B)
    const oscillatingCheck = this.detectOscillating(window);
    if (oscillatingCheck.detected) {
      this.lastDetection = oscillatingCheck;
      this.loopCount++;
      return oscillatingCheck;
    }

    // Check for longer repeating patterns
    const patternCheck = this.detectRepeatingPattern(window, minRepetitions);
    if (patternCheck.detected) {
      this.lastDetection = patternCheck;
      this.loopCount++;
      return patternCheck;
    }

    // Check for similar (not exact) repeated actions
    const similarCheck = this.detectSimilarActions(window);
    if (similarCheck.detected) {
      this.lastDetection = similarCheck;
      this.loopCount++;
      return similarCheck;
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * Get a nudge message to help break the detected loop.
   */
  getNudge(): LoopNudge {
    if (!this.lastDetection?.detected) {
      return {
        message: "No loop detected.",
        severity: "info",
        suggestions: [],
      };
    }

    const suggestions: string[] = [];
    const severity = this.loopCount >= 3 ? "critical" : this.loopCount >= 2 ? "warning" : "info";

    switch (this.lastDetection.loopType) {
      case "stuck":
        suggestions.push(
          "The same action is being repeated without effect. Try a different approach.",
          "Check if the element is actually interactive and visible.",
          "Try scrolling to find alternative elements.",
          "Take a screenshot to verify the current page state.",
        );
        break;

      case "oscillating":
        suggestions.push(
          "You are going back and forth. Stop and assess what you need to accomplish.",
          "If navigation keeps failing, try a different path to the target page.",
          "Check if a popup or modal is interfering with navigation.",
        );
        break;

      case "exact":
      case "similar":
        suggestions.push(
          "A repeating pattern has been detected. Break out of it.",
          "Try a completely different strategy to achieve the goal.",
          "If the current approach isn't working, consider if the test instruction might be ambiguous.",
          "Check if the page state has actually changed after each action.",
        );
        break;

      default:
        suggestions.push(
          "Something seems off. Re-evaluate the current situation.",
          "Try taking a screenshot and re-reading the instruction.",
        );
    }

    const pattern = this.lastDetection.pattern?.map(
      (a) => `${a.type}${a.ref ? `[${a.ref}]` : ""}`,
    ).join(" -> ") ?? "unknown";

    return {
      message: `Loop detected (type: ${this.lastDetection.loopType}, repetitions: ${this.lastDetection.repetitions}). Pattern: ${pattern}`,
      severity,
      suggestions,
    };
  }

  /**
   * Get the action history.
   */
  getHistory(): ActionRecord[] {
    return [...this.history];
  }

  /**
   * Get total number of loop detections.
   */
  getLoopCount(): number {
    return this.loopCount;
  }

  /**
   * Reset the detector state.
   */
  reset(): void {
    this.history = [];
    this.loopCount = 0;
    this.lastDetection = null;
  }

  // ── Detection strategies ─────────────────────────────────────────────

  /**
   * Detect when the same action is repeated 3+ times in a row.
   */
  private detectStuck(window: ActionRecord[]): LoopDetection {
    if (window.length < 3) return { detected: false, confidence: 0 };

    const last = window[window.length - 1];
    let count = 1;

    for (let i = window.length - 2; i >= 0; i--) {
      if (window[i].hash === last.hash) {
        count++;
      } else {
        break;
      }
    }

    if (count >= 3) {
      return {
        detected: true,
        pattern: [last],
        repetitions: count,
        confidence: Math.min(1, 0.6 + count * 0.1),
        loopType: "stuck",
      };
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * Detect A -> B -> A -> B oscillating patterns.
   */
  private detectOscillating(window: ActionRecord[]): LoopDetection {
    if (window.length < 4) return { detected: false, confidence: 0 };

    const last4 = window.slice(-4);
    if (
      last4[0].hash === last4[2].hash &&
      last4[1].hash === last4[3].hash &&
      last4[0].hash !== last4[1].hash
    ) {
      // Check if this continues further back
      let reps = 2;
      for (let i = window.length - 5; i >= 1; i -= 2) {
        if (
          window[i].hash === last4[1].hash &&
          window[i - 1]?.hash === last4[0].hash
        ) {
          reps++;
        } else {
          break;
        }
      }

      return {
        detected: true,
        pattern: [last4[0], last4[1]],
        repetitions: reps,
        confidence: Math.min(1, 0.7 + reps * 0.1),
        loopType: "oscillating",
      };
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * Detect longer repeating patterns (3+ actions that repeat).
   */
  private detectRepeatingPattern(
    window: ActionRecord[],
    minRepetitions: number,
  ): LoopDetection {
    // Try pattern lengths from 2 to window/2
    for (let patternLen = 2; patternLen <= Math.floor(window.length / 2); patternLen++) {
      const pattern = window.slice(-patternLen);
      const patternHashes = pattern.map((a) => a.hash);

      let reps = 1;
      let pos = window.length - patternLen * 2;

      while (pos >= 0) {
        const segment = window.slice(pos, pos + patternLen);
        const segHashes = segment.map((a) => a.hash);

        if (segHashes.every((h, i) => h === patternHashes[i])) {
          reps++;
          pos -= patternLen;
        } else {
          break;
        }
      }

      if (reps >= minRepetitions) {
        return {
          detected: true,
          pattern,
          repetitions: reps,
          confidence: Math.min(1, 0.5 + reps * 0.15),
          loopType: "exact",
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  /**
   * Detect actions that are similar but not identical
   * (e.g., clicking nearby elements of the same type).
   */
  private detectSimilarActions(window: ActionRecord[]): LoopDetection {
    if (window.length < 5) return { detected: false, confidence: 0 };

    const last5 = window.slice(-5);
    const types = last5.map((a) => a.type);
    const urls = last5.map((a) => a.url);

    // All same action type on same page
    if (types.every((t) => t === types[0]) && urls.every((u) => u === urls[0])) {
      // Check if refs are different but similar (probably trying the same thing)
      const uniqueRefs = new Set(last5.map((a) => a.ref).filter(Boolean));
      if (uniqueRefs.size <= 2) {
        return {
          detected: true,
          pattern: last5,
          repetitions: 5,
          confidence: 0.65,
          loopType: "similar",
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  // ── Hashing ──────────────────────────────────────────────────────────

  private computeHash(action: Omit<ActionRecord, "hash" | "timestamp">): string {
    const key = [action.type, action.ref ?? "", action.value ?? "", action.url].join("|");
    return createHash("md5").update(key).digest("hex").slice(0, 12);
  }
}
