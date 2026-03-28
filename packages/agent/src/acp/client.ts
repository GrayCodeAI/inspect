// ──────────────────────────────────────────────────────────────────────────────
// @inspect/agent - ACP (Agent Communication Protocol) Client
// ──────────────────────────────────────────────────────────────────────────────

import type { LLMToolDefinition } from "../providers/base.js";
import { createLogger } from "@inspect/observability";

const logger = createLogger("agent/acp-client");

/** ACP connection configuration */
export interface ACPConfig {
  /** ACP server endpoint */
  endpoint: string;
  /** Authentication token */
  token: string;
  /** Agent identifier */
  agentId: string;
  /** Session timeout in ms */
  sessionTimeout?: number;
  /** Reconnect attempts on disconnect */
  maxReconnects?: number;
}

/** ACP event types emitted during agent execution */
export type ACPEventType = "thought" | "tool_call" | "tool_result" | "observation" | "action" | "error" | "done";

/** An event from the ACP stream */
export interface ACPEvent {
  type: ACPEventType;
  timestamp: number;
  /** Thinking / reasoning text */
  thought?: string;
  /** Tool being called */
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
  /** Result from a tool execution */
  toolResult?: {
    id: string;
    content: string;
    isError?: boolean;
  };
  /** Action to execute on the browser */
  action?: {
    type: string;
    ref?: string;
    value?: string;
    coordinates?: { x: number; y: number };
  };
  /** Observation from the browser state */
  observation?: string;
  /** Error details */
  error?: {
    code: string;
    message: string;
  };
  /** Whether this is the final event */
  done?: boolean;
  /** Result summary when done */
  result?: {
    success: boolean;
    summary: string;
  };
}

/** Session info returned from the server */
interface ACPSession {
  sessionId: string;
  agentId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * ACP (Agent Communication Protocol) client for communicating with
 * remote agent services. Supports streaming agent responses with
 * typed events for thoughts, tool calls, and results.
 */
export class ACPClient {
  private config: ACPConfig;
  private sessionId: string | null = null;
  private eventHandlers: Map<ACPEventType | "any", Array<(event: ACPEvent) => void>> = new Map();
  private abortController: AbortController | null = null;

  constructor(config: ACPConfig) {
    this.config = config;
  }

  /**
   * Verify the agent connection and authenticate.
   * Returns true if the connection is valid.
   */
  async checkAuth(): Promise<boolean> {
    try {
      const response = await this.request("GET", "/auth/verify");
      return response.ok;
    } catch (error) {
      logger.warn("ACP auth verification failed", { err: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Create a new session for agent interaction.
   */
  async createSession(): Promise<ACPSession> {
    const response = await this.request("POST", "/sessions", {
      agentId: this.config.agentId,
      timeout: this.config.sessionTimeout ?? 300_000,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ACPError(`Failed to create session: ${error}`, response.status);
    }

    const session = (await response.json()) as ACPSession;
    this.sessionId = session.sessionId;
    return session;
  }

  /**
   * Stream agent responses for a given prompt.
   * Yields ACPEvent objects as they arrive from the server.
   */
  async *stream(
    prompt: string,
    tools?: LLMToolDefinition[],
    context?: Record<string, unknown>,
  ): AsyncGenerator<ACPEvent> {
    if (!this.sessionId) {
      await this.createSession();
    }

    this.abortController = new AbortController();

    const response = await this.request(
      "POST",
      `/sessions/${this.sessionId}/stream`,
      {
        prompt,
        tools: tools?.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters,
        })),
        context,
      },
      { signal: this.abortController.signal },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new ACPError(`Stream failed: ${error}`, response.status);
    }

    if (!response.body) {
      throw new ACPError("No response body for stream", 0);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // SSE format
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            if (data === "[DONE]") return;

            let event: ACPEvent;
            try {
              event = JSON.parse(data);
            } catch (error) {
              logger.debug("Failed to parse ACP stream event", { err: error instanceof Error ? error.message : String(error) });
              continue;
            }

            // Emit to registered handlers
            this.emit(event);

            yield event;

            if (event.done) return;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Send a tool result back to the agent during a session.
   */
  async sendToolResult(toolCallId: string, result: string, isError?: boolean): Promise<void> {
    if (!this.sessionId) {
      throw new ACPError("No active session", 0);
    }

    const response = await this.request(
      "POST",
      `/sessions/${this.sessionId}/tool-result`,
      {
        toolCallId,
        content: result,
        isError: isError ?? false,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new ACPError(`Failed to send tool result: ${error}`, response.status);
    }
  }

  /**
   * Register an event handler for a specific event type.
   */
  onThought(handler: (event: ACPEvent) => void): void {
    this.on("thought", handler);
  }

  onToolCall(handler: (event: ACPEvent) => void): void {
    this.on("tool_call", handler);
  }

  onResult(handler: (event: ACPEvent) => void): void {
    this.on("done", handler);
  }

  onError(handler: (event: ACPEvent) => void): void {
    this.on("error", handler);
  }

  on(type: ACPEventType | "any", handler: (event: ACPEvent) => void): void {
    const handlers = this.eventHandlers.get(type) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(type, handlers);
  }

  /**
   * Cancel the current streaming request.
   */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Close the session and clean up.
   */
  async close(): Promise<void> {
    this.cancel();

    if (this.sessionId) {
      try {
        await this.request("DELETE", `/sessions/${this.sessionId}`);
      } catch (error) {
        logger.debug("Failed to close ACP session", { err: error instanceof Error ? error.message : String(error) });
      }
      this.sessionId = null;
    }

    this.eventHandlers.clear();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private emit(event: ACPEvent): void {
    // Call type-specific handlers
    const typeHandlers = this.eventHandlers.get(event.type) ?? [];
    for (const handler of typeHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn("ACP event handler failed", { err: error instanceof Error ? error.message : String(error) });
      }
    }

    // Call wildcard handlers
    const anyHandlers = this.eventHandlers.get("any") ?? [];
    for (const handler of anyHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn("ACP wildcard event handler failed", { err: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<Response> {
    const url = `${this.config.endpoint}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.token}`,
      "X-Agent-Id": this.config.agentId,
    };

    if (this.sessionId) {
      headers["X-Session-Id"] = this.sessionId;
    }

    return fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
  }
}

/** ACP-specific error */
export class ACPError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ACPError";
    this.statusCode = statusCode;
  }
}
