// ============================================================================
// @inspect/workflow - Action Observer (Recording to Workflow Blocks)
// ============================================================================

import { generateId } from "@inspect/shared";
import type {
  WorkflowBlock,
  WorkflowBlockType,
  AgentAction,
} from "@inspect/shared";

/** Recorded browser action */
export interface RecordedAction {
  /** Action type (click, type, navigate, scroll, etc.) */
  type: string;
  /** Timestamp of the action */
  timestamp: number;
  /** Target element selector or description */
  target?: string;
  /** Value typed or entered */
  value?: string;
  /** URL navigated to */
  url?: string;
  /** Coordinates of interaction */
  coordinates?: { x: number; y: number };
  /** Description of what happened */
  description: string;
  /** Page URL when action occurred */
  pageUrl?: string;
  /** Screenshot before action (base64) */
  screenshotBefore?: string;
  /** Screenshot after action (base64) */
  screenshotAfter?: string;
}

/** Observer state */
export type ObserverState = "idle" | "recording" | "paused";

/**
 * ActionObserver records browser actions and converts them into
 * workflow blocks. This enables users to create workflows by
 * demonstrating the desired actions in the browser.
 */
export class ActionObserver {
  private state: ObserverState = "idle";
  private recordedActions: RecordedAction[] = [];
  private startTime: number = 0;
  private pauseTime: number = 0;

  /**
   * Get the current observer state.
   */
  getState(): ObserverState {
    return this.state;
  }

  /**
   * Get the number of recorded actions.
   */
  getActionCount(): number {
    return this.recordedActions.length;
  }

  /**
   * Start recording browser actions.
   */
  startRecording(): void {
    if (this.state === "recording") {
      throw new Error("Already recording");
    }
    this.state = "recording";
    this.recordedActions = [];
    this.startTime = Date.now();
  }

  /**
   * Pause recording.
   */
  pauseRecording(): void {
    if (this.state !== "recording") {
      throw new Error("Not currently recording");
    }
    this.state = "paused";
    this.pauseTime = Date.now();
  }

  /**
   * Resume recording after pause.
   */
  resumeRecording(): void {
    if (this.state !== "paused") {
      throw new Error("Not currently paused");
    }
    this.state = "recording";
  }

  /**
   * Stop recording and return recorded actions.
   */
  stopRecording(): RecordedAction[] {
    if (this.state === "idle") {
      throw new Error("Not currently recording");
    }
    this.state = "idle";
    return [...this.recordedActions];
  }

  /**
   * Record a single action.
   */
  recordAction(action: RecordedAction): void {
    if (this.state !== "recording") return;
    this.recordedActions.push({
      ...action,
      timestamp: action.timestamp || Date.now(),
    });
  }

  /**
   * Record an AgentAction (from the agent package).
   */
  recordAgentAction(action: AgentAction): void {
    this.recordAction({
      type: action.type,
      timestamp: action.timestamp,
      target: action.target,
      value: action.value,
      coordinates: action.coordinates,
      description: action.description,
    });
  }

  /**
   * Convert recorded actions into workflow blocks.
   * Merges related actions and creates meaningful workflow steps.
   */
  actionsToBlocks(): WorkflowBlock[] {
    if (this.recordedActions.length === 0) return [];

    const blocks: WorkflowBlock[] = [];
    const mergedGroups = this.mergeRelatedActions(this.recordedActions);

    for (const group of mergedGroups) {
      const block = this.actionGroupToBlock(group);
      if (block) {
        blocks.push(block);
      }
    }

    // Link blocks sequentially
    for (let i = 0; i < blocks.length - 1; i++) {
      blocks[i].nextBlockId = blocks[i + 1].id;
    }

    return blocks;
  }

  /**
   * Get a natural language description of the recorded actions.
   */
  getRecordingSummary(): string {
    if (this.recordedActions.length === 0) {
      return "No actions recorded.";
    }

    const duration = Date.now() - this.startTime;
    const lines: string[] = [
      `Recorded ${this.recordedActions.length} actions over ${Math.round(duration / 1000)}s:`,
    ];

    for (let i = 0; i < this.recordedActions.length; i++) {
      const action = this.recordedActions[i];
      lines.push(`${i + 1}. ${action.description}`);
    }

    return lines.join("\n");
  }

  /**
   * Merge related sequential actions into groups.
   * For example, clicking a field then typing merges into a "fill field" group.
   */
  private mergeRelatedActions(
    actions: RecordedAction[],
  ): RecordedAction[][] {
    const groups: RecordedAction[][] = [];
    let currentGroup: RecordedAction[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const prevAction = currentGroup[currentGroup.length - 1];

      if (!prevAction) {
        currentGroup.push(action);
        continue;
      }

      // Merge click + type on same target into one group
      if (
        prevAction.type === "click" &&
        action.type === "type" &&
        this.isSameTarget(prevAction, action)
      ) {
        currentGroup.push(action);
        continue;
      }

      // Merge consecutive types on same target
      if (
        prevAction.type === "type" &&
        action.type === "type" &&
        this.isSameTarget(prevAction, action)
      ) {
        currentGroup.push(action);
        continue;
      }

      // Merge consecutive scrolls
      if (prevAction.type === "scroll" && action.type === "scroll") {
        currentGroup.push(action);
        continue;
      }

      // Start new group
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [action];
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Check if two actions target the same element.
   */
  private isSameTarget(a: RecordedAction, b: RecordedAction): boolean {
    if (a.target && b.target && a.target === b.target) return true;
    if (
      a.coordinates &&
      b.coordinates &&
      Math.abs(a.coordinates.x - b.coordinates.x) < 50 &&
      Math.abs(a.coordinates.y - b.coordinates.y) < 50
    ) {
      return true;
    }
    return false;
  }

  /**
   * Convert a group of related actions into a workflow block.
   */
  private actionGroupToBlock(
    group: RecordedAction[],
  ): WorkflowBlock | null {
    if (group.length === 0) return null;

    const primary = group[0];
    const blockId = generateId();

    // Navigation action
    if (primary.type === "navigate" || primary.type === "goto") {
      return {
        id: blockId,
        type: "task" as WorkflowBlockType,
        label: `Navigate to ${this.shortenUrl(primary.url ?? "")}`,
        parameters: {
          prompt: `Navigate to ${primary.url}`,
          url: primary.url ?? "",
        },
      };
    }

    // Click + type = fill in field
    if (group.length >= 2 && primary.type === "click") {
      const typeActions = group.filter((a) => a.type === "type");
      if (typeActions.length > 0) {
        const combinedText = typeActions
          .map((a) => a.value ?? "")
          .join("");
        return {
          id: blockId,
          type: "task" as WorkflowBlockType,
          label: `Fill in ${primary.target ?? "field"}`,
          parameters: {
            prompt: `Click on ${primary.target ?? "the element"} and type "${combinedText}"`,
          },
        };
      }
    }

    // Simple click
    if (primary.type === "click") {
      return {
        id: blockId,
        type: "task" as WorkflowBlockType,
        label: `Click ${primary.target ?? "element"}`,
        parameters: {
          prompt: primary.description || `Click on ${primary.target ?? "the element"}`,
        },
      };
    }

    // Type action
    if (primary.type === "type") {
      const allText = group
        .filter((a) => a.type === "type")
        .map((a) => a.value ?? "")
        .join("");
      return {
        id: blockId,
        type: "task" as WorkflowBlockType,
        label: `Type "${this.truncate(allText, 30)}"`,
        parameters: {
          prompt: `Type "${allText}" into ${primary.target ?? "the field"}`,
        },
      };
    }

    // Scroll actions
    if (primary.type === "scroll") {
      return {
        id: blockId,
        type: "task" as WorkflowBlockType,
        label: "Scroll page",
        parameters: {
          prompt: primary.description || "Scroll the page",
        },
      };
    }

    // Wait action
    if (primary.type === "wait") {
      return {
        id: blockId,
        type: "wait" as WorkflowBlockType,
        label: "Wait",
        parameters: {
          duration: 2000,
        },
      };
    }

    // Extract/observe action
    if (primary.type === "extract" || primary.type === "observe") {
      return {
        id: blockId,
        type: "data_extraction" as WorkflowBlockType,
        label: primary.description || "Extract data",
        parameters: {
          instruction: primary.description || "Extract data from the page",
        },
      };
    }

    // Default: create a task block from the action description
    return {
      id: blockId,
      type: "task" as WorkflowBlockType,
      label: this.truncate(primary.description, 50),
      parameters: {
        prompt: primary.description,
      },
    };
  }

  /**
   * Shorten a URL for display.
   */
  private shortenUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
    } catch {
      return this.truncate(url, 40);
    }
  }

  /**
   * Truncate a string with ellipsis.
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
  }
}
