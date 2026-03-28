// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - Context Compaction
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMMessage } from "../providers/base.js";
import type { LLMProvider } from "../providers/base.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/compaction");

/** Compaction options */
export interface CompactionOptions {
  /** Token threshold that triggers compaction (default: 80000) */
  threshold?: number;
  /** Number of recent messages to always keep (default: 10) */
  keepLast?: number;
  /** Characters per token estimate (default: 4) */
  charsPerToken?: number;
  /** Maximum tokens for the summary itself (default: 2000) */
  summaryMaxTokens?: number;
}

/** Result of a compaction operation */
export interface CompactionResult {
  /** The generated summary text */
  summary: string;
  /** Number of messages that were compacted */
  compactedCount: number;
  /** Estimated tokens before compaction */
  tokensBefore: number;
  /** Estimated tokens after compaction */
  tokensAfter: number;
  /** Number of messages remaining */
  messagesRemaining: number;
}

/**
 * Handles context compaction by summarizing older messages
 * when the conversation approaches the model's token limit.
 *
 * Uses an LLM to generate intelligent summaries that preserve
 * key information (assertions, errors found, important state).
 */
export class ContextCompactor {
  private readonly options: Required<CompactionOptions>;

  constructor(options?: CompactionOptions) {
    this.options = {
      threshold: options?.threshold ?? 80_000,
      keepLast: options?.keepLast ?? 10,
      charsPerToken: options?.charsPerToken ?? 4,
      summaryMaxTokens: options?.summaryMaxTokens ?? 2000,
    };
  }

  /**
   * Check if the messages need compaction based on estimated token count.
   */
  shouldCompact(messages: LLMMessage[]): boolean {
    return this.estimateTokens(messages) > this.options.threshold;
  }

  /**
   * Compact messages by summarizing older ones using an LLM.
   *
   * @param messages - The full conversation history
   * @param llm - An LLM provider to generate the summary
   * @returns The compaction result with summary text
   */
  async compact(
    messages: LLMMessage[],
    llm: LLMProvider,
  ): Promise<CompactionResult> {
    const tokensBefore = this.estimateTokens(messages);

    if (messages.length <= this.options.keepLast) {
      return {
        summary: "",
        compactedCount: 0,
        tokensBefore,
        tokensAfter: tokensBefore,
        messagesRemaining: messages.length,
      };
    }

    const toCompact = messages.slice(0, -this.options.keepLast);
    const toKeep = messages.slice(-this.options.keepLast);

    const summary = await this.generateSummary(toCompact, llm);

    const tokensAfter = this.estimateTokens([
      { role: "system", content: summary },
      ...toKeep,
    ]);

    return {
      summary,
      compactedCount: toCompact.length,
      tokensBefore,
      tokensAfter,
      messagesRemaining: toKeep.length + 1, // +1 for summary message
    };
  }

  /**
   * Create a lightweight summary without using an LLM.
   * Useful as a fallback when the LLM is unavailable.
   */
  compactLocal(messages: LLMMessage[]): CompactionResult {
    const tokensBefore = this.estimateTokens(messages);

    if (messages.length <= this.options.keepLast) {
      return {
        summary: "",
        compactedCount: 0,
        tokensBefore,
        tokensAfter: tokensBefore,
        messagesRemaining: messages.length,
      };
    }

    const toCompact = messages.slice(0, -this.options.keepLast);
    const toKeep = messages.slice(-this.options.keepLast);

    const summary = this.extractKeyInfo(toCompact);

    const tokensAfter = this.estimateTokens([
      { role: "system", content: summary },
      ...toKeep,
    ]);

    return {
      summary,
      compactedCount: toCompact.length,
      tokensBefore,
      tokensAfter,
      messagesRemaining: toKeep.length + 1,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private estimateTokens(messages: LLMMessage[]): number {
    let totalChars = 0;

    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else {
        for (const part of msg.content) {
          if (part.type === "text") {
            totalChars += part.text.length;
          } else if (part.type === "image_base64") {
            totalChars += 4000; // Image token estimate
          }
        }
      }
      totalChars += 20; // Role/metadata overhead
    }

    return Math.ceil(totalChars / this.options.charsPerToken);
  }

  private async generateSummary(
    messages: LLMMessage[],
    llm: LLMProvider,
  ): Promise<string> {
    const formatted = this.formatMessagesForSummary(messages);

    const summaryPrompt: LLMMessage[] = [
      {
        role: "system",
        content: `You are a conversation summarizer for a browser testing agent. Summarize the following conversation history, preserving:

1. **Key findings**: Any bugs, errors, or issues discovered
2. **Actions taken**: What was clicked, typed, navigated to
3. **Assertions made**: What was verified and whether it passed/failed
4. **Current state**: Where the agent is in the testing process
5. **Important context**: Login status, form state, navigation history

Be concise but don't lose critical information. Output a structured summary.`,
      },
      {
        role: "user",
        content: `Summarize this conversation (${messages.length} messages):\n\n${formatted}`,
      },
    ];

    try {
      const response = await llm.chat(summaryPrompt, undefined, {
        maxTokens: this.options.summaryMaxTokens,
        temperature: 0,
      });
      return response.content;
    } catch (error) {
      logger.warn("LLM summary generation failed, falling back to local extraction", { err: error instanceof Error ? error.message : String(error) });
      return this.extractKeyInfo(messages);
    }
  }

  private formatMessagesForSummary(messages: LLMMessage[]): string {
    const lines: string[] = [];

    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      const content = typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((p) => p.type === "text")
            .map((p) => (p as { text: string }).text)
            .join("\n");

      // Truncate very long messages
      const truncated = content.length > 500
        ? content.slice(0, 500) + "... [truncated]"
        : content;

      lines.push(`[${role}]: ${truncated}`);
    }

    return lines.join("\n\n");
  }

  /**
   * Extract key information from messages without using an LLM.
   * Looks for patterns like assertions, errors, URLs, and actions.
   */
  private extractKeyInfo(messages: LLMMessage[]): string {
    const urls = new Set<string>();
    const actions: string[] = [];
    const errors: string[] = [];
    const assertions: string[] = [];

    for (const msg of messages) {
      const content = typeof msg.content === "string"
        ? msg.content
        : msg.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join(" ");

      // Extract URLs
      const urlMatches = content.match(/https?:\/\/[^\s"'<>]+/g);
      if (urlMatches) {
        for (const url of urlMatches) urls.add(url);
      }

      // Extract actions (look for JSON action objects)
      const actionMatch = content.match(/"action"\s*:\s*"(\w+)"/g);
      if (actionMatch) {
        actions.push(...actionMatch.map((a) => a.replace(/"action"\s*:\s*"/, "").replace(/"/, "")));
      }

      // Extract errors
      if (content.toLowerCase().includes("error") || content.toLowerCase().includes("fail")) {
        const errorLine = content.split("\n").find(
          (l) => l.toLowerCase().includes("error") || l.toLowerCase().includes("fail"),
        );
        if (errorLine) {
          errors.push(errorLine.trim().slice(0, 200));
        }
      }

      // Extract assertions
      if (content.includes("assert") || content.includes("verify") || content.includes("expect")) {
        const assertLine = content.split("\n").find(
          (l) => l.includes("assert") || l.includes("verify") || l.includes("expect"),
        );
        if (assertLine) {
          assertions.push(assertLine.trim().slice(0, 200));
        }
      }
    }

    const parts: string[] = ["## Conversation Summary (auto-extracted)"];

    if (urls.size > 0) {
      parts.push(`\nPages visited: ${Array.from(urls).join(", ")}`);
    }

    if (actions.length > 0) {
      const unique = [...new Set(actions)];
      parts.push(`\nActions performed: ${unique.join(", ")} (${actions.length} total)`);
    }

    if (errors.length > 0) {
      parts.push(`\nErrors found:\n${errors.map((e) => `- ${e}`).join("\n")}`);
    }

    if (assertions.length > 0) {
      parts.push(`\nAssertions:\n${assertions.map((a) => `- ${a}`).join("\n")}`);
    }

    parts.push(`\n${messages.length} messages compacted.`);

    return parts.join("\n");
  }
}
