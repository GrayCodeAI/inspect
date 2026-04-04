/**
 * Context Compaction
 *
 * Intelligently compresses context window when approaching limits.
 * Uses summarization and history truncation.
 */

import type { LLMProvider } from "@inspect/llm";

export interface CompactionConfig {
  /** Trigger threshold (tokens) */
  tokenThreshold: number;
  /** Character limit */
  charLimit: number;
  /** Keep last N messages intact */
  keepLastN: number;
  /** Max summary size (tokens) */
  summaryMaxTokens: number;
  /** Enable LLM-based summarization */
  useLLMSummarization: boolean;
  /** LLM provider for summarization */
  llmProvider?: LLMProvider;
  /** Model for summarization */
  summaryModel: string;
  /** Callback on compaction */
  onCompaction?: (result: CompactionResult) => void;
}

export interface CompactionResult {
  /** Whether compaction occurred */
  didCompact: boolean;
  /** Messages before compaction */
  messagesBefore: number;
  /** Messages after compaction */
  messagesAfter: number;
  /** Tokens removed */
  tokensRemoved: number;
  /** Characters removed */
  charsRemoved: number;
  /** Summary generated */
  summary?: string;
  /** Compaction ratio */
  ratio: number;
  /** Timestamp */
  timestamp: number;
}

export interface CompactionMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  tokens?: number;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  tokenThreshold: 8000,
  charLimit: 30000,
  keepLastN: 5,
  summaryMaxTokens: 500,
  useLLMSummarization: true,
  summaryModel: "claude-haiku-4-5",
};

/**
 * Context Compactor for managing context window
 */
export class ContextCompactor {
  private config: CompactionConfig;
  private compactionHistory: CompactionResult[] = [];

  constructor(config: Partial<CompactionConfig> = {}) {
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  }

  /**
   * Check if compaction is needed
   */
  shouldCompact(messages: CompactionMessage[]): boolean {
    const totalTokens = this.estimateTokens(messages);
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);

    return totalTokens > this.config.tokenThreshold || totalChars > this.config.charLimit;
  }

  /**
   * Compact messages
   */
  async compact(messages: CompactionMessage[]): Promise<{
    messages: CompactionMessage[];
    result: CompactionResult;
  }> {
    const beforeCount = messages.length;
    const beforeTokens = this.estimateTokens(messages);
    const beforeChars = messages.reduce((sum, m) => sum + m.content.length, 0);

    // Keep last N messages intact
    const keepIndex = Math.max(0, messages.length - this.config.keepLastN);
    const toSummarize = messages.slice(0, keepIndex);
    const toKeep = messages.slice(keepIndex);

    // Generate summary
    let summary: string | undefined;
    if (this.config.useLLMSummarization && this.config.llmProvider) {
      summary = await this.summarizeWithLLM(toSummarize);
    } else {
      summary = this.summarizeHeuristic(toSummarize);
    }

    // Create summary message
    const summaryMessage: CompactionMessage = {
      id: `summary-${Date.now()}`,
      role: "system",
      content: `[Previous context summarized]: ${summary}`,
      timestamp: Date.now(),
      tokens: this.estimateTokenCount(summary),
    };

    // Combine
    const compactedMessages = [summaryMessage, ...toKeep];

    // Calculate results
    const afterTokens = this.estimateTokens(compactedMessages);
    const afterChars = compactedMessages.reduce((sum, m) => sum + m.content.length, 0);

    const result: CompactionResult = {
      didCompact: true,
      messagesBefore: beforeCount,
      messagesAfter: compactedMessages.length,
      tokensRemoved: beforeTokens - afterTokens,
      charsRemoved: beforeChars - afterChars,
      summary,
      ratio: beforeTokens / Math.max(1, afterTokens),
      timestamp: Date.now(),
    };

    this.compactionHistory.push(result);
    this.config.onCompaction?.(result);

    return { messages: compactedMessages, result };
  }

  /**
   * Summarize using LLM
   */
  private async summarizeWithLLM(messages: CompactionMessage[]): Promise<string> {
    if (!this.config.llmProvider) {
      return this.summarizeHeuristic(messages);
    }

    const _prompt = `
Summarize the following conversation history concisely. Focus on:
1. Key facts learned
2. Actions taken
3. Current state/goals
4. Any errors encountered

History:
${messages.map((m) => `${m.role}: ${m.content.slice(0, 500)}`).join("\n\n")}

Summary (keep under ${this.config.summaryMaxTokens} tokens):
`;

    try {
      // Placeholder - would call LLM
      return `Summary of ${messages.length} messages`;
    } catch {
      return this.summarizeHeuristic(messages);
    }
  }

  /**
   * Heuristic summarization (no LLM)
   */
  private summarizeHeuristic(messages: CompactionMessage[]): string {
    const actions = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content.slice(0, 100))
      .slice(-5);

    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content.slice(0, 100))
      .slice(-3);

    return [
      `Previous ${messages.length} messages:`,
      userMessages.length > 0 ? `User asked about: ${userMessages.join("; ")}` : "",
      actions.length > 0 ? `Actions taken: ${actions.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");
  }

  /**
   * Estimate tokens for messages
   */
  private estimateTokens(messages: CompactionMessage[]): number {
    return messages.reduce((sum, m) => {
      if (m.tokens) return sum + m.tokens;
      return sum + this.estimateTokenCount(m.content);
    }, 0);
  }

  /**
   * Estimate token count for text
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get compaction history
   */
  getHistory(): CompactionResult[] {
    return [...this.compactionHistory];
  }

  /**
   * Get compaction statistics
   */
  getStats(): {
    totalCompactions: number;
    totalTokensRemoved: number;
    totalCharsRemoved: number;
    averageRatio: number;
  } {
    const total = this.compactionHistory.length;
    const tokensRemoved = this.compactionHistory.reduce((sum, r) => sum + r.tokensRemoved, 0);
    const charsRemoved = this.compactionHistory.reduce((sum, r) => sum + r.charsRemoved, 0);
    const avgRatio =
      total > 0 ? this.compactionHistory.reduce((sum, r) => sum + r.ratio, 0) / total : 0;

    return {
      totalCompactions: total,
      totalTokensRemoved: tokensRemoved,
      totalCharsRemoved: charsRemoved,
      averageRatio: avgRatio,
    };
  }

  /**
   * Reset history
   */
  reset(): void {
    this.compactionHistory = [];
  }
}
