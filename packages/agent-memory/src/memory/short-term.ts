// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Short-Term Memory (Message Manager)
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMMessage } from "@inspect/llm";

/** Options for the message manager */
export interface MessageManagerOptions {
  /** Maximum estimated tokens before compaction triggers */
  maxTokens?: number;
  /** Number of recent messages to always preserve during compaction */
  preserveRecent?: number;
  /** Characters per token estimate (for token counting) */
  charsPerToken?: number;
}

/**
 * Manages the short-term conversation history for the agent loop.
 *
 * Tracks messages, estimates token usage, and supports compaction
 * to keep the context within the model's token limit.
 */
export class MessageManager {
  private messages: LLMMessage[] = [];
  private readonly maxTokens: number;
  private readonly preserveRecent: number;
  private readonly charsPerToken: number;

  constructor(options?: MessageManagerOptions) {
    this.maxTokens = options?.maxTokens ?? 100_000;
    this.preserveRecent = options?.preserveRecent ?? 10;
    this.charsPerToken = options?.charsPerToken ?? 4;
  }

  /**
   * Add a message to the conversation history.
   */
  add(message: LLMMessage): void {
    this.messages.push(message);
  }

  /**
   * Add a user message with text content.
   */
  addUser(content: string): void {
    this.add({ role: "user", content });
  }

  /**
   * Add an assistant message with text content.
   */
  addAssistant(content: string): void {
    this.add({ role: "assistant", content });
  }

  /**
   * Add a system message.
   */
  addSystem(content: string): void {
    this.add({ role: "system", content });
  }

  /**
   * Add a tool result message.
   */
  addToolResult(content: string): void {
    this.add({ role: "tool", content });
  }

  /**
   * Get the current conversation history as formatted messages.
   */
  getHistory(): LLMMessage[] {
    return [...this.messages];
  }

  /**
   * Get only the most recent N messages.
   */
  getRecent(count: number): LLMMessage[] {
    return this.messages.slice(-count);
  }

  /**
   * Estimate the total token count of all messages.
   */
  estimateTokens(): number {
    let totalChars = 0;

    for (const msg of this.messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content as Array<{ type: string; text?: string }>) {
          if (part.type === "text" && part.text) {
            totalChars += part.text.length;
          } else if (part.type === "image_base64") {
            totalChars += 4000;
          }
        }
      }
      totalChars += 20;
    }

    return Math.ceil(totalChars / this.charsPerToken);
  }

  /**
   * Check whether the conversation needs compaction.
   */
  needsCompaction(): boolean {
    return this.estimateTokens() > this.maxTokens * 0.8;
  }

  /**
   * Compact old messages by summarizing them into a single message.
   * Returns the summary that was generated (for use with an LLM summarizer).
   *
   * Call this with a summary produced by ContextCompactor.
   */
  compact(summary: string): void {
    if (this.messages.length <= this.preserveRecent) {
      return; // Nothing to compact
    }

    const keepCount = this.preserveRecent;
    const oldMessages = this.messages.slice(0, -keepCount);
    const recentMessages = this.messages.slice(-keepCount);

    // Replace old messages with a summary
    const summaryMessage: LLMMessage = {
      role: "system",
      content: `[Conversation Summary - ${oldMessages.length} messages compacted]\n\n${summary}`,
    };

    this.messages = [summaryMessage, ...recentMessages];
  }

  /**
   * Get the messages that would be compacted (for summarization).
   */
  getCompactableMessages(): LLMMessage[] {
    if (this.messages.length <= this.preserveRecent) {
      return [];
    }
    return this.messages.slice(0, -this.preserveRecent);
  }

  /**
   * Get total message count.
   */
  get length(): number {
    return this.messages.length;
  }

  /**
   * Clear all messages.
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Remove the last message (useful for retry logic).
   */
  removeLast(): LLMMessage | undefined {
    return this.messages.pop();
  }

  /**
   * Find messages by role.
   */
  findByRole(role: LLMMessage["role"]): LLMMessage[] {
    return this.messages.filter((m) => m.role === role);
  }
}
