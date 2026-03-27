// ──────────────────────────────────────────────────────────────────────────────
// @inspect/sdk - Main Inspect SDK Class
// ──────────────────────────────────────────────────────────────────────────────

import type {
  BrowserConfig,
  AgentConfig,
  LLMProvider as LLMProviderConfig,
  ScreenshotOptions,
  TokenMetrics,
  FunctionMetrics,
  AgentAction,
  PageSnapshot,
  ViewportConfig,
} from "@inspect/shared";
import { DEFAULT_BROWSER_CONFIG, DEFAULT_AGENT_CONFIG, DEFAULT_VIEWPORT } from "@inspect/shared";

import {
  ActHandler,
  type ActResult,
  type ActOptions,
  type LLMClient,
  type PageInterface,
  type ActionCacheInterface,
} from "./act.js";
import {
  ExtractHandler,
  type ExtractResult,
  type ExtractOptions,
  type SchemaLike,
} from "./extract.js";
import {
  ObserveHandler,
  type ObserveResult,
  type ObserveOptions,
  type ActionSuggestion,
} from "./observe.js";
import {
  AgentHandler,
  type AgentResult,
  type AgentOptions,
  type AgentStep,
  type AgentStreamEvent,
} from "./agent.js";

// ── Re-exports ──────────────────────────────────────────────────────────────

export { ActHandler, type ActResult, type ActOptions } from "./act.js";
export {
  ExtractHandler,
  type ExtractResult,
  type ExtractOptions,
  type SchemaLike,
} from "./extract.js";
export {
  ObserveHandler,
  type ObserveResult,
  type ObserveOptions,
  type ActionSuggestion,
} from "./observe.js";
export {
  AgentHandler,
  type AgentResult,
  type AgentOptions,
  type AgentStep,
  type AgentStreamEvent,
} from "./agent.js";
export type { LLMClient, PageInterface, ActionCacheInterface } from "./act.js";

// ── Config helper ───────────────────────────────────────────────────────────

/** Inspect configuration object shape for defineConfig */
export interface InspectConfig {
  agent?: { primary?: string; mode?: string; fallback?: string };
  devices?: string[];
  browser?: { type?: string; headless?: boolean; slowMo?: number };
  git?: { scope?: string; maxFiles?: number; maxDiffChars?: number };
  a11y?: { enabled?: boolean; standard?: string };
  visual?: { enabled?: boolean; threshold?: number; viewports?: string[] };
  timeouts?: { test?: number; step?: number; navigation?: number };
  maxSteps?: number;
  url?: string;
}

/**
 * Define an Inspect configuration with type checking.
 * Used in inspect.config.ts files.
 */
export function defineConfig(config: InspectConfig): InspectConfig {
  return config;
}

// ── SDK Configuration ───────────────────────────────────────────────────────

/** Configuration for the Inspect SDK */
export interface InspectSDKConfig {
  /** API key for the LLM provider */
  apiKey?: string;
  /** LLM provider configuration */
  llm?: Partial<LLMProviderConfig>;
  /** Browser configuration overrides */
  browser?: Partial<BrowserConfig>;
  /** Agent configuration overrides */
  agent?: Partial<AgentConfig>;
  /** Base URL for navigation */
  baseUrl?: string;
  /** Enable action caching (default: true) */
  enableCache?: boolean;
  /** Enable self-healing selectors (default: true) */
  enableSelfHealing?: boolean;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
  /** Custom environment variables */
  env?: Record<string, string>;
  /** Project root directory (for cache storage) */
  projectRoot?: string;
}

/** History entry tracking all operations */
export interface HistoryEntry {
  /** Operation type */
  type: "act" | "extract" | "observe" | "agent" | "navigate" | "screenshot";
  /** Instruction or URL */
  input: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Token usage */
  tokenUsage: TokenMetrics;
  /** Duration in ms */
  durationMs: number;
  /** Timestamp */
  timestamp: number;
  /** Result summary */
  resultSummary?: string;
  /** Error if failed */
  error?: string;
}

/**
 * Inspect is the main SDK entry point. It provides a high-level API
 * for browser automation powered by AI:
 *
 * - `act(instruction)` - Execute a single action
 * - `extract(instruction, schema?)` - Extract structured data
 * - `observe(instruction)` - Get action suggestions
 * - `agent(instruction)` - Run a multi-step autonomous agent
 * - `navigate(url)` - Navigate to a URL
 * - `screenshot()` - Capture a screenshot
 *
 * Usage:
 * ```typescript
 * const inspect = new Inspect({ apiKey: "sk-..." });
 * await inspect.init();
 * await inspect.navigate("https://example.com");
 * await inspect.act("Click the login button");
 * const data = await inspect.extract("Get all product prices");
 * await inspect.close();
 * ```
 */
export class Inspect {
  private config: InspectSDKConfig;
  private browserConfig: BrowserConfig;
  private agentConfig: AgentConfig;
  private llmClient: LLMClient | null = null;
  private page: PageInterface | null = null;
  private actHandler: ActHandler | null = null;
  private extractHandler: ExtractHandler | null = null;
  private observeHandler: ObserveHandler | null = null;
  private agentHandler: AgentHandler | null = null;
  private cache: SimpleActionCache | null = null;
  private historyEntries: HistoryEntry[] = [];
  private metricsData: {
    total: TokenMetrics;
    perFunction: FunctionMetrics;
  };
  private initialized: boolean = false;
  private browserManager: unknown = null;
  private browserContext: unknown = null;

  constructor(config: InspectSDKConfig = {}) {
    this.config = config;

    // Merge browser config with defaults
    this.browserConfig = {
      ...DEFAULT_BROWSER_CONFIG,
      ...config.browser,
    } as BrowserConfig;

    // Merge agent config with defaults
    this.agentConfig = {
      ...DEFAULT_AGENT_CONFIG,
      ...config.agent,
    } as AgentConfig;

    // Initialize empty metrics
    const emptyMetrics: TokenMetrics = {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      inferenceTimeMs: 0,
      cost: 0,
    };

    this.metricsData = {
      total: { ...emptyMetrics },
      perFunction: {
        act: { ...emptyMetrics },
        extract: { ...emptyMetrics },
        observe: { ...emptyMetrics },
        agent: { ...emptyMetrics },
      },
    };
  }

  /**
   * Initialize the SDK: set up browser, LLM client, and handlers.
   * Must be called before any other operations.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Resolve API key from config or environment
    const apiKey =
      this.config.apiKey ??
      this.config.env?.ANTHROPIC_API_KEY ??
      process.env.ANTHROPIC_API_KEY ??
      process.env.OPENAI_API_KEY ??
      "";

    // Initialize LLM client
    this.llmClient = this.createLLMClient(apiKey);

    // Initialize action cache
    if (this.config.enableCache !== false) {
      this.cache = new SimpleActionCache();
    }

    // Initialize browser
    try {
      const { BrowserManager } = await import("@inspect/browser");
      const manager = new BrowserManager();
      this.browserManager = manager;
      this.browserContext = await manager.launchBrowser(this.browserConfig);
      this.page = await this.createPageInterface(manager);
    } catch {
      // Browser module may not be available - use a stub
      // This allows the SDK to work in testing/planning modes without a browser
      if (this.config.verbose) {
        console.warn(
          "[inspect] @inspect/browser not available. Browser operations will fail. " +
            "Install @inspect/browser for full functionality.",
        );
      }
    }

    // Initialize handlers
    this.actHandler = new ActHandler(this.llmClient, {
      cache: this.cache ?? undefined,
      defaultTimeout: this.browserConfig.actionTimeout,
    });
    this.extractHandler = new ExtractHandler(this.llmClient);
    this.observeHandler = new ObserveHandler(this.llmClient);
    this.agentHandler = new AgentHandler(this.llmClient, {
      actHandler: this.actHandler,
      extractHandler: this.extractHandler,
      observeHandler: this.observeHandler,
    });

    this.initialized = true;
  }

  /**
   * Execute a single action on the current page.
   *
   * @param instruction - Natural language instruction (e.g. "Click the Submit button")
   * @param options - Action options
   * @returns Action result
   */
  async act(instruction: string, options?: ActOptions): Promise<ActResult> {
    this.ensureInitialized();
    this.ensurePage();

    const result = await this.actHandler!.execute(this.page!, instruction, options);

    this.recordMetrics("act", result.tokenUsage);
    this.addHistory(
      "act",
      instruction,
      result.success,
      result.tokenUsage,
      result.durationMs,
      result.error,
    );

    return result;
  }

  /**
   * Extract structured data from the current page.
   *
   * @param instruction - What to extract (e.g. "Extract all product names and prices")
   * @param schema - Optional Zod schema for validation
   * @param options - Extraction options
   * @returns Extraction result with typed data
   */
  async extract<T = unknown>(
    instruction: string,
    schema?: SchemaLike,
    options?: ExtractOptions,
  ): Promise<ExtractResult<T>> {
    this.ensureInitialized();
    this.ensurePage();

    const result = await this.extractHandler!.execute<T>(this.page!, instruction, {
      ...options,
      schema,
    });

    this.recordMetrics("extract", result.tokenUsage);
    this.addHistory(
      "extract",
      instruction,
      result.success,
      result.tokenUsage,
      result.durationMs,
      result.error,
    );

    return result;
  }

  /**
   * Observe the current page and get action suggestions.
   *
   * @param instruction - Context about what you're trying to do
   * @param options - Observation options
   * @returns Observation result with action suggestions
   */
  async observe(instruction: string, options?: ObserveOptions): Promise<ObserveResult> {
    this.ensureInitialized();
    this.ensurePage();

    const result = await this.observeHandler!.execute(this.page!, instruction, options);

    this.recordMetrics("observe", result.tokenUsage);
    this.addHistory(
      "observe",
      instruction,
      result.success,
      result.tokenUsage,
      result.durationMs,
      result.error,
    );

    return result;
  }

  /**
   * Run a multi-step autonomous agent to accomplish a goal.
   *
   * @param instruction - High-level goal description
   * @param options - Agent execution options
   * @returns Complete agent execution result
   */
  async agent(instruction: string, options?: AgentOptions): Promise<AgentResult> {
    this.ensureInitialized();
    this.ensurePage();

    const result = await this.agentHandler!.execute(this.page!, instruction, options);

    this.recordMetrics("agent", result.tokenUsage);
    this.addHistory(
      "agent",
      instruction,
      result.success,
      result.tokenUsage,
      result.durationMs,
      result.error,
    );

    return result;
  }

  /**
   * Navigate to a URL.
   *
   * @param url - Target URL (absolute or relative to baseUrl)
   */
  async navigate(url: string): Promise<void> {
    this.ensureInitialized();
    this.ensurePage();

    const startTime = performance.now();
    const resolvedUrl = this.resolveUrl(url);

    try {
      // Use the underlying browser page to navigate
      const pageObj = this.page as unknown as { navigate?: (url: string) => Promise<void> };
      if (pageObj.navigate) {
        await pageObj.navigate(resolvedUrl);
      } else {
        // Fallback: use the page interface methods
        // The actual navigation is handled by the browser module
        throw new Error(
          "Page does not support navigation. Ensure @inspect/browser is initialized.",
        );
      }

      this.addHistory(
        "navigate",
        resolvedUrl,
        true,
        emptyTokenUsage(),
        Math.round(performance.now() - startTime),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.addHistory(
        "navigate",
        resolvedUrl,
        false,
        emptyTokenUsage(),
        Math.round(performance.now() - startTime),
        msg,
      );
      throw error;
    }
  }

  /**
   * Capture a screenshot of the current page.
   *
   * @param options - Screenshot options (fullPage, format, etc.)
   * @returns Base64-encoded screenshot data
   */
  async screenshot(options?: ScreenshotOptions): Promise<string> {
    this.ensureInitialized();
    this.ensurePage();

    const startTime = performance.now();

    try {
      const snapshot = await this.page!.getSnapshot();
      const screenshotData = snapshot.screenshot ?? "";

      this.addHistory(
        "screenshot",
        options?.fullPage ? "full page" : "viewport",
        true,
        emptyTokenUsage(),
        Math.round(performance.now() - startTime),
      );

      return screenshotData;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.addHistory(
        "screenshot",
        "screenshot",
        false,
        emptyTokenUsage(),
        Math.round(performance.now() - startTime),
        msg,
      );
      throw error;
    }
  }

  /**
   * Close the SDK: clean up browser and resources.
   */
  async close(): Promise<void> {
    if (!this.initialized) return;

    try {
      if (this.browserManager) {
        const manager = this.browserManager as { close?: () => Promise<void> };
        if (manager.close) {
          await manager.close();
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    this.browserManager = null;
    this.browserContext = null;
    this.page = null;
    this.initialized = false;
  }

  /**
   * Crawl a website and extract content.
   *
   * @param url - Starting URL to crawl
   * @param options - Crawl options
   * @returns Crawl results
   */
  async crawl(
    url: string,
    options?: {
      depth?: number;
      maxPages?: number;
      format?: "json" | "csv" | "jsonl";
      extractContent?: boolean;
      exclude?: string[];
      include?: string[];
    },
  ): Promise<{ pagesCrawled: number; errorCount: number; results: unknown[] }> {
    const { WebCrawler } = await import("@inspect/data");

    const crawler = new WebCrawler({
      startUrl: url,
      maxDepth: options?.depth ?? 3,
      maxPages: options?.maxPages ?? 100,
      extractContent: options?.extractContent ?? false,
      excludePatterns: options?.exclude ?? [],
      includePatterns: options?.include ?? [],
    });

    const job = await crawler.crawl();
    const output = crawler.export(options?.format ?? "json");

    return {
      pagesCrawled: job.pagesCrawled,
      errorCount: job.errorCount,
      results: JSON.parse(output),
    };
  }

  /**
   * Track changes on a set of URLs.
   *
   * @param urls - URLs to monitor
   * @param options - Tracking options
   * @returns Change diffs detected
   */
  async track(
    urls: string[],
    options?: {
      interval?: number;
      onDiff?: (diff: unknown) => void;
    },
  ): Promise<{ urlsMonitored: number; diffs: unknown[] }> {
    const { ChangeTracker } = await import("@inspect/data");
    const diffs: unknown[] = [];

    const tracker = new ChangeTracker({
      urls,
      interval: (options?.interval ?? 60) * 1000,
      onDiff: (diff: unknown) => {
        diffs.push(diff);
        options?.onDiff?.(diff);
      },
    });

    await tracker.snapshotAll();

    return { urlsMonitored: urls.length, diffs };
  }

  /**
   * Start a network fault injection proxy.
   *
   * @param options - Proxy options
   * @returns Proxy server handle
   */
  async createProxy(options?: {
    port?: number;
    upstream?: string;
    preset?: string;
    latency?: number;
  }): Promise<{
    status: () => Record<string, unknown>;
    addFault: (type: string, attributes: Record<string, unknown>) => void;
    stop: () => Promise<void>;
  }> {
    const { ProxyServer } = await import("@inspect/quality");

    const server = new ProxyServer({
      port: options?.port ?? 8888,
      upstream: options?.upstream ?? "localhost:80",
      name: "sdk-proxy",
    });

    if (options?.preset) {
      server.applyPreset(options.preset);
    }

    if (options?.latency) {
      server.addToxic({
        type: "latency",
        name: "sdk-latency",
        attributes: { latency: options.latency },
      });
    }

    await server.start();

    return {
      status: () => server.getStatus() as unknown as Record<string, unknown>,
      addFault: (type: string, attributes: Record<string, unknown>) => {
        server.addToxic({ type: type as any, name: `sdk-${type}`, attributes });
      },
      stop: async () => {
        await server.stop();
      },
    };
  }

  /**
   * Get aggregate token usage and cost metrics.
   */
  get metrics(): { total: TokenMetrics; perFunction: FunctionMetrics } {
    return {
      total: { ...this.metricsData.total },
      perFunction: {
        act: { ...this.metricsData.perFunction.act },
        extract: { ...this.metricsData.perFunction.extract },
        observe: { ...this.metricsData.perFunction.observe },
        agent: { ...this.metricsData.perFunction.agent },
      },
    };
  }

  /**
   * Get the execution history.
   */
  get history(): HistoryEntry[] {
    return [...this.historyEntries];
  }

  /**
   * Get the current page URL.
   */
  get currentUrl(): string {
    return this.page?.url() ?? "";
  }

  /**
   * Check if the SDK is initialized.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("Inspect SDK is not initialized. Call init() first.");
    }
  }

  private ensurePage(): void {
    if (!this.page) {
      throw new Error(
        "No browser page available. Ensure @inspect/browser is installed and init() was called.",
      );
    }
  }

  private resolveUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    if (this.config.baseUrl) {
      const base = this.config.baseUrl.endsWith("/")
        ? this.config.baseUrl.slice(0, -1)
        : this.config.baseUrl;
      const path = url.startsWith("/") ? url : `/${url}`;
      return `${base}${path}`;
    }
    return url;
  }

  private createLLMClient(apiKey: string): LLMClient {
    const providerName = this.config.llm?.name ?? "anthropic";
    const model = this.config.llm?.model ?? "claude-sonnet-4-20250514";
    const baseUrl = this.config.llm?.baseUrl;
    const timeout = this.config.llm?.timeout ?? 60_000;

    return {
      async chat(
        messages: Array<{ role: string; content: string }>,
        options?: { temperature?: number; maxTokens?: number },
      ) {
        const url = resolveProviderUrl(providerName, baseUrl);
        const body = buildRequestBody(providerName, model, messages, options);

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Set auth header based on provider
        if (providerName === "anthropic") {
          headers["x-api-key"] = apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(`LLM API error (${response.status}): ${errorText.slice(0, 500)}`);
        }

        const data = (await response.json()) as Record<string, unknown>;
        return parseProviderResponse(providerName, data);
      },
    };
  }

  private async createPageInterface(browserManager: unknown): Promise<PageInterface> {
    const manager = browserManager as {
      getPage?: () => Promise<unknown>;
      newPage?: () => Promise<unknown>;
    };

    // Try to get or create a page
    let rawPage: unknown;
    if (manager.newPage) {
      rawPage = await manager.newPage();
    } else if (manager.getPage) {
      rawPage = await manager.getPage();
    }

    if (!rawPage) {
      throw new Error("Failed to create a browser page");
    }

    // Wrap the raw Playwright page in our PageInterface
    return createPageWrapper(rawPage);
  }

  private recordMetrics(fn: "act" | "extract" | "observe" | "agent", tokens: TokenMetrics): void {
    this.metricsData.total.promptTokens += tokens.promptTokens;
    this.metricsData.total.completionTokens += tokens.completionTokens;
    this.metricsData.total.reasoningTokens += tokens.reasoningTokens;
    this.metricsData.total.cachedInputTokens += tokens.cachedInputTokens;
    this.metricsData.total.inferenceTimeMs += tokens.inferenceTimeMs;
    this.metricsData.total.cost += tokens.cost;

    this.metricsData.perFunction[fn].promptTokens += tokens.promptTokens;
    this.metricsData.perFunction[fn].completionTokens += tokens.completionTokens;
    this.metricsData.perFunction[fn].reasoningTokens += tokens.reasoningTokens;
    this.metricsData.perFunction[fn].cachedInputTokens += tokens.cachedInputTokens;
    this.metricsData.perFunction[fn].inferenceTimeMs += tokens.inferenceTimeMs;
    this.metricsData.perFunction[fn].cost += tokens.cost;
  }

  private addHistory(
    type: HistoryEntry["type"],
    input: string,
    success: boolean,
    tokenUsage: TokenMetrics,
    durationMs: number,
    error?: string,
  ): void {
    this.historyEntries.push({
      type,
      input,
      success,
      tokenUsage,
      durationMs,
      timestamp: Date.now(),
      error,
    });
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Simple in-memory action cache */
class SimpleActionCache implements ActionCacheInterface {
  private store = new Map<
    string,
    {
      action: AgentAction;
      elementDescription?: { role: string; name: string; tagName?: string; nearbyText?: string };
    }
  >();
  private maxEntries = 1000;

  get(key: string) {
    return this.store.get(key);
  }

  set(
    key: string,
    value: {
      action: AgentAction;
      elementDescription?: { role: string; name: string; tagName?: string; nearbyText?: string };
    },
  ) {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value as string;
      this.store.delete(firstKey);
    }
    this.store.set(key, value);
  }
}

function emptyTokenUsage(): TokenMetrics {
  return {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    inferenceTimeMs: 0,
    cost: 0,
  };
}

/** Resolve API endpoint URL for a provider */
function resolveProviderUrl(provider: string, baseUrl?: string): string {
  if (baseUrl) return baseUrl;

  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "google":
      return "https://generativelanguage.googleapis.com/v1beta/models";
    case "deepseek":
      return "https://api.deepseek.com/v1/chat/completions";
    case "groq":
      return "https://api.groq.com/openai/v1/chat/completions";
    case "mistral":
      return "https://api.mistral.ai/v1/chat/completions";
    default:
      return "https://api.openai.com/v1/chat/completions";
  }
}

/** Build provider-specific request body */
function buildRequestBody(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; maxTokens?: number },
): Record<string, unknown> {
  if (provider === "anthropic") {
    // Anthropic format: separate system message
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    return {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0,
      system: systemMessages.map((m) => m.content).join("\n\n") || undefined,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === "system" ? "user" : m.role,
        content: m.content,
      })),
    };
  }

  // OpenAI-compatible format
  return {
    model,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };
}

/** Parse provider-specific response */
function parseProviderResponse(
  provider: string,
  data: Record<string, unknown>,
): {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
} {
  if (provider === "anthropic") {
    const content = data.content as Array<{ type: string; text?: string }>;
    const text =
      content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("") ?? "";

    const usage = data.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
        }
      | undefined;

    return {
      content: text,
      usage: {
        promptTokens: usage?.input_tokens ?? 0,
        completionTokens: usage?.output_tokens ?? 0,
        totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      },
    };
  }

  // OpenAI-compatible response
  const choices = data.choices as Array<{
    message?: { content?: string };
  }>;
  const text = choices?.[0]?.message?.content ?? "";

  const usage = data.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;

  return {
    content: text,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}

/** Wrap a raw Playwright page in our PageInterface */
function createPageWrapper(rawPage: unknown): PageInterface {
  const page = rawPage as {
    url(): string;
    goto(url: string): Promise<void>;
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    selectOption(selector: string, value: string): Promise<void>;
    hover(selector: string): Promise<void>;
    press(selector: string, key: string): Promise<void>;
    check(selector: string): Promise<void>;
    uncheck(selector: string): Promise<void>;
    evaluate(fn: string | ((...args: unknown[]) => unknown)): Promise<unknown>;
    screenshot(options?: unknown): Promise<Buffer>;
    title(): Promise<string>;
    locator(selector: string): { scrollIntoViewIfNeeded(): Promise<void> };
    getByRole?(role: string, options?: { name?: string }): unknown;
    accessibility?: { snapshot(): Promise<unknown> };
  };

  return {
    async getSnapshot(): Promise<PageSnapshot> {
      const url = page.url();
      const title = await page.title();

      // Try to get a basic snapshot from the page
      let elements: PageSnapshot["elements"] = [];
      try {
        const accessibleTree = await page.evaluate(`
          (function() {
            const elements = [];
            let counter = 0;
            const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY']);
            const interactiveRoles = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox', 'menuitem', 'tab', 'switch', 'slider']);

            function walk(node, depth) {
              if (depth > 20 || elements.length > 200) return;
              if (node.nodeType !== 1) return;

              const el = node;
              const tag = el.tagName;
              const role = el.getAttribute('role') || el.tagName.toLowerCase();
              const name = el.getAttribute('aria-label') || el.innerText?.slice(0, 100) || el.getAttribute('placeholder') || '';
              const rect = el.getBoundingClientRect();
              const visible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
              const interactable = interactiveTags.has(tag) || interactiveRoles.has(role) || el.hasAttribute('onclick') || el.hasAttribute('tabindex');

              if (visible && (interactable || el.innerText?.trim())) {
                counter++;
                elements.push({
                  ref: 'e' + counter,
                  role: role,
                  name: name.trim().slice(0, 200),
                  xpath: '',
                  bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  visible: visible,
                  interactable: interactable,
                  tagName: tag.toLowerCase(),
                  textContent: el.innerText?.trim().slice(0, 300) || undefined,
                  value: el.value || undefined,
                  cssSelector: buildSelector(el)
                });
              }

              for (const child of el.children) {
                walk(child, depth + 1);
              }
            }

            function buildSelector(el) {
              if (el.id) return '#' + el.id;
              let sel = el.tagName.toLowerCase();
              if (el.className && typeof el.className === 'string') {
                sel += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
              }
              return sel;
            }

            walk(document.body, 0);
            return elements;
          })()
        `);

        if (Array.isArray(accessibleTree)) {
          elements = accessibleTree as PageSnapshot["elements"];
        }
      } catch {
        // Fallback to empty elements
      }

      // Capture screenshot
      let screenshot: string | undefined;
      try {
        const buffer = await page.screenshot({ type: "png" });
        screenshot = buffer.toString("base64");
      } catch {
        // Screenshot may fail in some contexts
      }

      return {
        url,
        title,
        elements,
        timestamp: Date.now(),
        screenshot,
      };
    },

    async click(ref: string) {
      await page.click(`[data-ref="${ref}"], [aria-label="${ref}"]`).catch(async () => {
        // Fallback: try evaluating ref as a selector
        await page.click(ref);
      });
    },

    async fill(ref: string, value: string) {
      await page.fill(`[data-ref="${ref}"], [aria-label="${ref}"]`, value).catch(async () => {
        await page.fill(ref, value);
      });
    },

    async selectOption(ref: string, value: string) {
      await page.selectOption(`[data-ref="${ref}"]`, value).catch(async () => {
        await page.selectOption(ref, value);
      });
    },

    async hover(ref: string) {
      await page.hover(`[data-ref="${ref}"]`).catch(async () => {
        await page.hover(ref);
      });
    },

    async press(key: string) {
      await page.press("body", key);
    },

    async scrollTo(ref: string) {
      try {
        const locator = page.locator(`[data-ref="${ref}"]`);
        await locator.scrollIntoViewIfNeeded();
      } catch {
        await page.evaluate(
          `document.querySelector('[data-ref="${ref}"]')?.scrollIntoView({ behavior: 'smooth' })`,
        );
      }
    },

    async check(ref: string) {
      await page.check(`[data-ref="${ref}"]`).catch(async () => {
        await page.check(ref);
      });
    },

    async uncheck(ref: string) {
      await page.uncheck(`[data-ref="${ref}"]`).catch(async () => {
        await page.uncheck(ref);
      });
    },

    url(): string {
      return page.url();
    },

    // Extra: support navigate for the Inspect class
    ...(page.goto ? { navigate: (url: string) => page.goto(url) } : {}),
  } as PageInterface;
}
