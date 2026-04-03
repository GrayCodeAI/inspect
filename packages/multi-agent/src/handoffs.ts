// ──────────────────────────────────────────────────────────────────────────────
// Agent Handoffs — LLM-driven dynamic delegation protocol (OpenAI Agents SDK)
// Agents can autonomously decide to hand off tasks to specialized sub-agents
// with full context transfer and conversation history preservation
// ──────────────────────────────────────────────────────────────────────────────

export interface HandoffContext {
  readonly taskId: string;
  readonly fromAgent: string;
  readonly toAgent: string;
  readonly reason: string;
  readonly transferredState: Record<string, unknown>;
  readonly conversationHistory: Array<{ role: string; content: string }>;
  readonly timestamp: string;
}

export interface HandoffResult {
  readonly success: boolean;
  readonly result?: string;
  readonly returnedToSource: boolean;
  readonly context: HandoffContext;
}

export interface HandoffConfig {
  /** Agent name to hand off to */
  targetAgent: string;
  /** Trigger keywords or conditions that initiate handoff */
  triggers: string[];
  /** Custom prompt injected when handing off */
  handoffPrompt?: string;
  /** Fields to filter/strip from transferred state */
  inputFilter?: string[];
  /** Callback after handoff completes */
  onHandoff?: (context: HandoffContext, result: string) => void;
}

export class HandoffManager {
  private handoffs: Map<string, HandoffConfig> = new Map();
  private activeHandoffs: Map<string, HandoffContext> = new Map();

  /** Register a handoff rule. */
  register(name: string, config: HandoffConfig): void {
    this.handoffs.set(name, config);
  }

  /** Check if a message triggers any registered handoff. */
  checkHandoff(message: string): HandoffConfig | undefined {
    const lowerMsg = message.toLowerCase();
    for (const [, config] of this.handoffs) {
      if (config.triggers.some((t) => lowerMsg.includes(t.toLowerCase()))) {
        return config;
      }
    }
    return undefined;
  }

  /** Execute a handoff — transfer context to the target agent. */
  async execute(
    config: HandoffConfig,
    context: {
      taskId: string;
      fromAgent: string;
      message: string;
      state: Record<string, unknown>;
      history: Array<{ role: string; content: string }>;
    },
  ): Promise<HandoffContext> {
    const filteredState = config.inputFilter
      ? Object.fromEntries(
          Object.entries(context.state).filter(([k]) => !config.inputFilter!.includes(k)),
        )
      : context.state;

    const handoffContext: HandoffContext = {
      taskId: context.taskId,
      fromAgent: context.fromAgent,
      toAgent: config.targetAgent,
      reason: `Handoff triggered by: "${context.message.slice(0, 100)}"`,
      transferredState: filteredState,
      conversationHistory: context.history,
      timestamp: new Date().toISOString(),
    };

    this.activeHandoffs.set(context.taskId, handoffContext);

    config.onHandoff?.(handoffContext, "");

    return handoffContext;
  }

  /** Complete a handoff — return result and optionally return to source agent. */
  complete(taskId: string, result: string, returnToSource = true): HandoffResult {
    const context = this.activeHandoffs.get(taskId);
    if (!context) {
      return {
        success: false,
        result,
        returnedToSource: false,
        context: {
          taskId,
          fromAgent: "unknown",
          toAgent: "unknown",
          reason: "No active handoff found",
          transferredState: {},
          conversationHistory: [],
          timestamp: new Date().toISOString(),
        },
      };
    }

    const handoffResult: HandoffResult = {
      success: true,
      result,
      returnedToSource: returnToSource,
      context,
    };

    const config = this.handoffs.get(`${context.fromAgent}->${context.toAgent}`);
    config?.onHandoff?.(context, result);

    this.activeHandoffs.delete(taskId);

    return handoffResult;
  }

  /** Get active handoff for a task. */
  getActive(taskId: string): HandoffContext | undefined {
    return this.activeHandoffs.get(taskId);
  }

  /** List all registered handoff rules. */
  listRules(): Array<{ name: string; target: string; triggers: string[] }> {
    return Array.from(this.handoffs.entries()).map(([name, c]) => ({
      name,
      target: c.targetAgent,
      triggers: c.triggers,
    }));
  }
}
