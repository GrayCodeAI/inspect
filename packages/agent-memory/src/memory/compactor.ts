// ============================================================================
// @inspect/agent - Message Compactor
//
// Compresses old conversation history to stay within LLM context window.
// Keeps recent steps full, summarizes older ones.
// Inspired by Browser Use's maybe_compact_messages.
// ============================================================================

export interface CompactorConfig {
  /** Max messages before compaction triggers. Default: 20 */
  maxMessages?: number;
  /** Number of recent messages to keep full. Default: 6 */
  keepRecent?: number;
  /** Max token estimate for history. Default: 8000 */
  maxTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * MessageCompactor compresses conversation history.
 *
 * Strategy:
 * - Keep system prompt (always)
 * - Keep last N messages full (recent context)
 * - Summarize older messages into a single "[Previous context]" block
 */
export class MessageCompactor {
  private config: Required<CompactorConfig>;

  constructor(config: CompactorConfig = {}) {
    this.config = {
      maxMessages: config.maxMessages ?? 20,
      keepRecent: config.keepRecent ?? 6,
      maxTokens: config.maxTokens ?? 8000,
    };
  }

  /**
   * Compact messages if they exceed limits.
   * Returns compacted messages array.
   */
  compact(messages: ChatMessage[]): ChatMessage[] {
    // Check if compaction needed
    const tokenEstimate = this.estimateTokens(messages);
    if (messages.length <= this.config.maxMessages && tokenEstimate <= this.config.maxTokens) {
      return messages;
    }

    // Separate system prompt
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    if (nonSystem.length <= this.config.keepRecent) {
      return messages;
    }

    // Split into old (to summarize) and recent (to keep)
    const oldMessages = nonSystem.slice(0, nonSystem.length - this.config.keepRecent);
    const recentMessages = nonSystem.slice(nonSystem.length - this.config.keepRecent);

    // Summarize old messages
    const summary = this.summarize(oldMessages);

    const compacted: ChatMessage[] = [
      ...systemMessages,
      { role: "user", content: `[Previous context - ${oldMessages.length} messages summarized]\n${summary}` },
      ...recentMessages,
    ];

    return compacted;
  }

  /**
   * Check if compaction is needed.
   */
  needsCompaction(messages: ChatMessage[]): boolean {
    return messages.length > this.config.maxMessages || this.estimateTokens(messages) > this.config.maxTokens;
  }

  /**
   * Estimate token count for messages.
   */
  estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  }

  private summarize(messages: ChatMessage[]): string {
    const actions: string[] = [];
    const results: string[] = [];

    for (const msg of messages) {
      const content = msg.content;

      // Extract key information
      if (msg.role === "assistant") {
        // Agent's actions/decisions
        const lines = content.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines.slice(0, 3)) {
          if (line.length < 200) actions.push(line.trim());
        }
      } else if (msg.role === "user") {
        // Results/observations
        if (content.includes("Step") || content.includes("pass") || content.includes("fail")) {
          const lines = content.split("\n").filter((l) =>
            l.includes("Step") || l.includes("✓") || l.includes("✗") || l.includes("Navigat") || l.includes("Click"),
          );
          results.push(...lines.slice(0, 3).map((l) => l.trim()));
        }
      }
    }

    const parts: string[] = [];
    if (actions.length > 0) {
      parts.push("Actions taken: " + actions.slice(0, 5).join("; "));
    }
    if (results.length > 0) {
      parts.push("Results: " + results.slice(0, 5).join("; "));
    }

    return parts.join("\n") || "Previous steps executed (details compacted to save context).";
  }
}
