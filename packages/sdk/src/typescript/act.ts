// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Act Handler: Execute single natural-language actions
// ──────────────────────────────────────────────────────────────────────────────

import type {
  ElementSnapshot,
  PageSnapshot,
  TokenMetrics,
  AgentAction,
} from "@inspect/shared";

/** Options for the act operation */
export interface ActOptions {
  /** Variables to substitute in the instruction */
  variables?: Record<string, string>;
  /** Enable action cache (default: true) */
  useCache?: boolean;
  /** Maximum retries on failure (default: 2) */
  maxRetries?: number;
  /** Action timeout in ms (default: 15000) */
  timeoutMs?: number;
  /** Self-healing: attempt to find relocated elements (default: true) */
  selfHeal?: boolean;
}

/** Result of an act operation */
export interface ActResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Description of what was done */
  description: string;
  /** The action that was performed */
  action?: AgentAction;
  /** Element that was interacted with */
  element?: ElementSnapshot;
  /** Whether the result came from cache */
  cacheHit: boolean;
  /** Whether self-healing was used */
  healed: boolean;
  /** Token usage for this action */
  tokenUsage: TokenMetrics;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

/** LLM client interface for sending messages */
export interface LLMClient {
  chat(messages: Array<{ role: string; content: string }>, options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<{
    content: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>;
}

/** Cache interface for action caching */
export interface ActionCacheInterface {
  get(key: string): { action: AgentAction; elementDescription?: { role: string; name: string; tagName?: string; nearbyText?: string } } | undefined;
  set(key: string, value: { action: AgentAction; elementDescription?: { role: string; name: string; tagName?: string; nearbyText?: string } }): void;
}

/** Page interaction interface */
export interface PageInterface {
  getSnapshot(): Promise<PageSnapshot>;
  click(ref: string): Promise<void>;
  fill(ref: string, value: string): Promise<void>;
  selectOption(ref: string, value: string): Promise<void>;
  hover(ref: string): Promise<void>;
  press(key: string): Promise<void>;
  scrollTo(ref: string): Promise<void>;
  check(ref: string): Promise<void>;
  uncheck(ref: string): Promise<void>;
  url(): string;
}

/**
 * ActHandler executes single natural-language instructions as browser actions.
 * Includes LLM-based action resolution, caching, and self-healing.
 */
export class ActHandler {
  private llm: LLMClient;
  private cache: ActionCacheInterface | undefined;
  private defaultOptions: Required<Pick<ActOptions, "useCache" | "maxRetries" | "timeoutMs" | "selfHeal">>;

  constructor(
    llm: LLMClient,
    options?: {
      cache?: ActionCacheInterface;
      defaultTimeout?: number;
    },
  ) {
    this.llm = llm;
    this.cache = options?.cache;
    this.defaultOptions = {
      useCache: true,
      maxRetries: 2,
      timeoutMs: options?.defaultTimeout ?? 15_000,
      selfHeal: true,
    };
  }

  /**
   * Execute a natural-language action instruction.
   *
   * 1. Check cache for a matching action
   * 2. If no cache hit, send instruction + page snapshot to LLM
   * 3. Parse LLM response into an action
   * 4. Execute the action on the page
   * 5. Self-heal if the target element is not found
   *
   * @param page - Page to act on
   * @param instruction - Natural language instruction (e.g. "Click the Login button")
   * @param options - Action options
   * @returns The result of the action
   */
  async execute(
    page: PageInterface,
    instruction: string,
    options?: ActOptions,
  ): Promise<ActResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = performance.now();

    let tokenUsage: TokenMetrics = {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      inferenceTimeMs: 0,
      cost: 0,
    };

    // Substitute variables in instruction
    let resolvedInstruction = instruction;
    if (opts.variables) {
      for (const [key, value] of Object.entries(opts.variables)) {
        resolvedInstruction = resolvedInstruction.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          value,
        );
      }
    }

    // Step 1: Check cache
    const cacheKey = this.buildCacheKey(page.url(), resolvedInstruction);
    if (opts.useCache && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        try {
          await this.performAction(page, cached.action);
          return {
            success: true,
            description: cached.action.description,
            action: cached.action,
            cacheHit: true,
            healed: false,
            tokenUsage,
            durationMs: Math.round(performance.now() - startTime),
          };
        } catch {
          // Cache hit but action failed - element may have moved
          // Fall through to LLM-based resolution
        }
      }
    }

    // Step 2: Get page snapshot and resolve action via LLM
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const snapshot = await page.getSnapshot();
        const { action, element, usage } = await this.resolveAction(
          resolvedInstruction,
          snapshot,
        );

        tokenUsage = {
          promptTokens: tokenUsage.promptTokens + usage.promptTokens,
          completionTokens: tokenUsage.completionTokens + usage.completionTokens,
          reasoningTokens: 0,
          cachedInputTokens: 0,
          inferenceTimeMs: 0,
          cost: 0,
        };

        // Step 3: Execute the resolved action
        await this.performAction(page, action);

        // Cache the successful action
        if (opts.useCache && this.cache) {
          this.cache.set(cacheKey, {
            action,
            elementDescription: element
              ? { role: element.role, name: element.name, tagName: element.tagName }
              : undefined,
          });
        }

        return {
          success: true,
          description: action.description,
          action,
          element,
          cacheHit: false,
          healed: attempt > 0,
          tokenUsage,
          durationMs: Math.round(performance.now() - startTime),
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        if (attempt < opts.maxRetries && opts.selfHeal) {
          // Wait briefly before retry (exponential backoff)
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }

    return {
      success: false,
      description: `Failed to execute: ${resolvedInstruction}`,
      cacheHit: false,
      healed: false,
      tokenUsage,
      durationMs: Math.round(performance.now() - startTime),
      error: lastError,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Send instruction + snapshot to LLM and parse the action.
   */
  private async resolveAction(
    instruction: string,
    snapshot: PageSnapshot,
  ): Promise<{
    action: AgentAction;
    element?: ElementSnapshot;
    usage: { promptTokens: number; completionTokens: number };
  }> {
    // Build a compact snapshot representation
    const elementsDesc = snapshot.elements
      .filter((e) => e.interactable && e.visible)
      .slice(0, 100)
      .map(
        (e) =>
          `[${e.ref}] ${e.role} "${e.name}"${e.tagName ? ` (${e.tagName})` : ""}${e.value ? ` value="${e.value}"` : ""}`,
      )
      .join("\n");

    const prompt = `You are a browser automation agent. Given the current page state and instruction, determine the single best action to take.

Page URL: ${snapshot.url}
Page Title: ${snapshot.title}

Available interactive elements:
${elementsDesc}

Instruction: ${instruction}

Respond with a JSON object:
{
  "type": "click" | "fill" | "selectOption" | "hover" | "press" | "scroll" | "check" | "uncheck",
  "ref": "element reference ID (e.g. e1)",
  "value": "text to type or option to select (if applicable)",
  "description": "brief description of the action"
}

Respond ONLY with the JSON object, no other text.`;

    const response = await this.llm.chat(
      [{ role: "user", content: prompt }],
      { temperature: 0, maxTokens: 256 },
    );

    // Parse the action from LLM response
    const action = this.parseActionResponse(response.content);

    // Find the matching element
    const element = action.target
      ? snapshot.elements.find((e) => e.ref === action.target)
      : undefined;

    return {
      action,
      element,
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
      },
    };
  }

  /**
   * Parse the LLM response into an AgentAction.
   */
  private parseActionResponse(content: string): AgentAction {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = content.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr) as {
        type: string;
        ref?: string;
        value?: string;
        description?: string;
      };

      return {
        type: parsed.type,
        target: parsed.ref,
        value: parsed.value,
        description: parsed.description ?? `${parsed.type} on ${parsed.ref ?? "page"}`,
        timestamp: Date.now(),
      };
    } catch {
      throw new Error(`Failed to parse LLM action response: ${content.slice(0, 200)}`);
    }
  }

  /**
   * Execute a resolved action on the page.
   */
  private async performAction(
    page: PageInterface,
    action: AgentAction,
  ): Promise<void> {
    const ref = action.target;

    switch (action.type) {
      case "click":
        if (!ref) throw new Error("Click action requires a target ref");
        await page.click(ref);
        break;

      case "fill":
        if (!ref) throw new Error("Fill action requires a target ref");
        await page.fill(ref, action.value ?? "");
        break;

      case "selectOption":
        if (!ref) throw new Error("SelectOption action requires a target ref");
        await page.selectOption(ref, action.value ?? "");
        break;

      case "hover":
        if (!ref) throw new Error("Hover action requires a target ref");
        await page.hover(ref);
        break;

      case "press":
        await page.press(action.value ?? "Enter");
        break;

      case "scroll":
        if (ref) {
          await page.scrollTo(ref);
        }
        break;

      case "check":
        if (!ref) throw new Error("Check action requires a target ref");
        await page.check(ref);
        break;

      case "uncheck":
        if (!ref) throw new Error("Uncheck action requires a target ref");
        await page.uncheck(ref);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Build a cache key from URL and instruction.
   */
  private buildCacheKey(url: string, instruction: string): string {
    // Use URL origin + pathname (ignore query params) and instruction
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}::${instruction}`;
    } catch {
      return `${url}::${instruction}`;
    }
  }
}
