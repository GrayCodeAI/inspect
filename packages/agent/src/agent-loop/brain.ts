/**
 * Agent Brain - Structured Thinking
 *
 * Simplified version for compilation. Full implementation in Phase 1.
 */

/**
 * Evaluation of previous action
 */
export interface ActionEvaluation {
  success: boolean;
  assessment: string;
  lesson?: string;
}

/**
 * Memory entry for persistent context
 */
export interface MemoryEntry {
  content: string;
  importance: number;
  category?: string;
}

/**
 * AgentBrain - Structured thinking output
 */
export interface AgentBrain {
  evaluation: ActionEvaluation;
  memory: MemoryEntry[];
  nextGoal: string;
  progress?: string;
  confidence?: number;
}

/**
 * Flash mode brain - minimal for token efficiency
 */
export interface FlashBrain {
  note?: string;
  action: string;
}

/**
 * Nudge types for loop detection
 */
export const NUDGE_TYPES = {
  REMINDER: "reminder",
  SUGGESTION: "suggestion",
  FORCE: "force",
} as const;

export type NudgeType = typeof NUDGE_TYPES[keyof typeof NUDGE_TYPES];

/**
 * Nudge configuration
 */
export interface NudgeConfig {
  type: NudgeType;
  message: string;
  repetitionThreshold: number;
  cooldownSteps: number;
}

/**
 * Predefined nudges for loop detection
 */
export const ESCALATING_NUDGES: NudgeConfig[] = [
  {
    type: NUDGE_TYPES.REMINDER,
    message: "⚠️ NOTICE: You may be repeating actions. Remember your goal and try a different approach.",
    repetitionThreshold: 5,
    cooldownSteps: 3,
  },
  {
    type: NUDGE_TYPES.SUGGESTION,
    message: "🔶 SUGGESTION: You're in a loop. Consider: (1) Check if task is already complete, (2) Try a completely different action, (3) Use the browser's search/navigation.",
    repetitionThreshold: 8,
    cooldownSteps: 5,
  },
  {
    type: NUDGE_TYPES.FORCE,
    message: "🛑 ACTION REQUIRED: You MUST try a different action type. Consider: clicking a different element, scrolling to find new content, or navigating to a different page.",
    repetitionThreshold: 12,
    cooldownSteps: 8,
  },
];

/**
 * Get appropriate nudge for current repetition count
 */
export function getNudgeForRepetition(count: number): NudgeConfig | null {
  for (let i = ESCALATING_NUDGES.length - 1; i >= 0; i--) {
    if (count >= ESCALATING_NUDGES[i].repetitionThreshold) {
      return ESCALATING_NUDGES[i];
    }
  }
  return null;
}

/**
 * Planning nudge when no plan exists
 */
export const PLANNING_NUDGE: NudgeConfig = {
  type: NUDGE_TYPES.SUGGESTION,
  message: "💡 Tip: Create a plan first! Break down the goal into smaller steps.",
  repetitionThreshold: 0,
  cooldownSteps: 0,
};
