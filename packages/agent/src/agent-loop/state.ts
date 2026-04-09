/**
 * Agent Runtime State
 *
 * Manages:
 * - Current step and action history
 * - Token usage tracking
 * - Loop detection and stagnation detection
 * - Page context and network state
 */

// ============================================================================
// Action Result
// ============================================================================

export interface ActionResult {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  success: boolean;
  timestamp: number;
  error?: string;
}

// ============================================================================
// Loop Detector State
// ============================================================================

export interface LoopDetectorState {
  recentHashes: string[];
  repeatCount: number;
  lastActionHash: string | undefined;
  isLooping: boolean;
  loopDetectedAt?: number;
}

// ============================================================================
// Message Manager State
// ============================================================================

export interface CoreMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface MessageManagerState {
  messages: CoreMessage[];
  compressed: boolean;
  compressionRatio: number;
  originalTokenCount: number;
  compressedTokenCount: number;
  lastCompressionAt?: number;
}

// ============================================================================
// Cost Summary
// ============================================================================

export interface CostSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  costBreakdown: Record<string, number>;
}

// ============================================================================
// Full Agent State
// ============================================================================

export interface AgentState {
  agentId: string;
  step: number;
  stepIndex: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  messages: CoreMessage[];
  actions: ActionResult[];
  browserSnapshot: string | undefined;
  cost: CostSummary;
  loopDetection: LoopDetectorState;
  messageManager: MessageManagerState;
  lastActivityAt: number;
  createdAt: number;
  updatedAt: number;
  status: "active" | "paused" | "completed" | "failed" | "abandoned";
}

// ============================================================================
// Agent Runtime State (backward compat)
// ============================================================================

export class AgentRuntimeState {
  step = 0;
  failed = 0;
  stalled = false;
  state: Partial<AgentState> = {};

  constructor(agentId?: string) {
    this.state = {
      agentId: agentId || "unknown",
      step: 0,
      stepIndex: 0,
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0,
      messages: [],
      actions: [],
      cost: {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        costBreakdown: {},
      },
      loopDetection: {
        recentHashes: [],
        repeatCount: 0,
        lastActionHash: undefined,
        isLooping: false,
      },
      messageManager: {
        messages: [],
        compressed: false,
        compressionRatio: 0,
        originalTokenCount: 0,
        compressedTokenCount: 0,
      },
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "active",
    };
  }

  reset() {
    this.step = 0;
    this.failed = 0;
  }

  getFullState(): AgentState {
    return this.state as AgentState;
  }

  updateState(partial: Partial<AgentState>) {
    this.state = { ...this.state, ...partial, updatedAt: Date.now() };
  }
}

// Type exports (no values - these are interfaces)
