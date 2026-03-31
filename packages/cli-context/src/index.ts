/**
 * @inspect/cli-context
 * Unified context for all CLI commands - eliminates duplication of:
 * - Provider/API key configuration
 * - Browser launching setup
 * - Agent/Router initialization
 */

// Provider types
export type ProviderName = "anthropic" | "openai" | "gemini" | "deepseek" | "ollama";

// Mapping from user-friendly names to provider names
const AGENT_TO_PROVIDER: Record<string, ProviderName> = {
  claude: "anthropic",
  gpt: "openai",
  openai: "openai",
  gemini: "gemini",
  deepseek: "deepseek",
  ollama: "ollama",
  anthropic: "anthropic",
  google: "gemini",
};

// Environment variable mapping for each provider
const PROVIDER_KEY_MAP: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_AI_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  ollama: "OLLAMA_HOST", // Ollama doesn't need API key, uses host
};

// Exit codes for CLI commands
export const EXIT_CODES = {
  SUCCESS: 0,
  TEST_FAILURE: 1,
  CONFIG_ERROR: 2,
  AUTH_ERROR: 3,
  TIMEOUT_ERROR: 4,
  BROWSER_ERROR: 5,
  NETWORK_ERROR: 6,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Configuration for CLI context initialization
 */
export interface CLIContextConfig {
  /** Provider name or alias (e.g., "claude", "anthropic", "gpt", "openai") */
  agent?: string;
  /** Run in headed mode (show browser UI) */
  headed?: boolean;
  /** Browser viewport dimensions */
  viewport?: { width: number; height: number };
  /** Page navigation timeout in ms */
  timeout?: number;
  /** Wait until state for navigation */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  /** Custom API keys (overrides environment) */
  keys?: Partial<Record<ProviderName, string>>;
}

/**
 * Resolved provider configuration
 */
export interface ProviderConfig {
  name: ProviderName;
  apiKey: string | undefined;
  envVar: string;
}

/**
 * Browser session state
 */
export interface BrowserSession {
  browserManager: InstanceType<typeof import("@inspect/browser").BrowserManager>;
  page: unknown; // Playwright Page - typed loosely to avoid playwright dependency
  close: () => Promise<void>;
}

/**
 * Agent session state
 */
export interface AgentSession {
  router: import("@inspect/agent").AgentRouter;
  provider: ReturnType<import("@inspect/agent").AgentRouter["getProvider"]>;
  /** Convenience LLM function for simple chat interactions */
  llm: (messages: Array<{ role: string; content: string }>) => Promise<string>;
}

/**
 * CLIContext - Unified context for all CLI commands
 *
 * Provides a single entry point for:
 * - Provider resolution and API key management
 * - Browser lifecycle management
 * - Agent/Router initialization
 *
 * @example
 * ```typescript
 * const ctx = new CLIContext({ agent: "claude" });
 *
 * // Get provider config
 * const provider = ctx.resolveProvider();
 *
 * // Initialize browser
 * const browser = await ctx.launchBrowser();
 * await browser.page.goto("https://example.com");
 *
 * // Initialize agent
 * const agent = await ctx.createAgentSession();
 * const response = await agent.llm([{ role: "user", content: "Hello" }]);
 *
 * // Cleanup
 * await browser.close();
 * ```
 */
export class CLIContext {
  private config: Required<Omit<CLIContextConfig, "keys">> & { keys?: CLIContextConfig["keys"] };
  private _providerConfig: ProviderConfig | null = null;
  private _browserManager: InstanceType<typeof import("@inspect/browser").BrowserManager> | null =
    null;

  constructor(config: CLIContextConfig = {}) {
    this.config = {
      agent: config.agent ?? "anthropic",
      headed: config.headed ?? false,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      timeout: config.timeout ?? 30000,
      waitUntil: config.waitUntil ?? "domcontentloaded",
      keys: config.keys,
    };
  }

  /**
   * Resolve the provider name from user input
   * Handles aliases like "claude" -> "anthropic"
   */
  resolveProviderName(userInput?: string): ProviderName {
    const input = (userInput ?? this.config.agent).toLowerCase();
    return AGENT_TO_PROVIDER[input] ?? (input as ProviderName);
  }

  /**
   * Get provider configuration including API key
   * Caches the result for subsequent calls
   */
  resolveProvider(userInput?: string): ProviderConfig {
    const name = this.resolveProviderName(userInput ?? this.config.agent);

    // Return cached config only if the provider name matches
    if (this._providerConfig && this._providerConfig.name === name) {
      return this._providerConfig;
    }

    const envVar = PROVIDER_KEY_MAP[name];

    // Check custom keys first, then environment
    const apiKey = this.config.keys?.[name] ?? process.env[envVar];

    this._providerConfig = { name, apiKey, envVar };
    return this._providerConfig;
  }

  /**
   * Validate that required API key is available
   * Throws an error with helpful message if missing
   */
  requireApiKey(userInput?: string): string {
    const config = this.resolveProvider(userInput);

    // Ollama doesn't require API key
    if (config.name === "ollama") {
      return config.apiKey ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
    }

    if (!config.apiKey) {
      throw new Error(`No API key for ${config.name}. Set ${config.envVar}.`);
    }

    return config.apiKey;
  }

  /**
   * Launch a browser with configured settings
   * Returns a session object with page and cleanup function
   */
  async launchBrowser(options?: {
    headed?: boolean;
    viewport?: { width: number; height: number };
  }): Promise<BrowserSession> {
    const { BrowserManager } = await import("@inspect/browser");

    const browserManager = new BrowserManager();
    this._browserManager = browserManager;

    await browserManager.launchBrowser({
      headless: !(options?.headed ?? this.config.headed),
      viewport: options?.viewport ?? this.config.viewport,
    } as unknown);

    const page = await browserManager.newPage();

    return {
      browserManager,
      page,
      close: async () => {
        await browserManager.closeBrowser();
        this._browserManager = null;
      },
    };
  }

  /**
   * Navigate to a URL with configured settings
   */
  async navigateToUrl(
    page: BrowserSession["page"],
    url: string,
    options?: {
      timeout?: number;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    },
  ): Promise<void> {
    await page.goto(url, {
      waitUntil: options?.waitUntil ?? this.config.waitUntil,
      timeout: options?.timeout ?? this.config.timeout,
    });
  }

  /**
   * Create an agent session with the configured provider
   * Returns router, provider, and convenience LLM function
   */
  async createAgentSession(userInput?: string): Promise<AgentSession> {
    const { AgentRouter } = await import("@inspect/agent");

    const providerConfig = this.resolveProvider(userInput);
    const apiKey = this.requireApiKey(userInput);

    const router = new AgentRouter({
      keys: { [providerConfig.name]: apiKey } as Partial<Record<ProviderName, string>>,
      defaultProvider: providerConfig.name,
    });

    const provider = router.getProvider(providerConfig.name);

    // Convenience LLM function
    const llm = async (messages: Array<{ role: string; content: string }>) => {
      const response = await provider.chat(messages as unknown);
      return response.content;
    };

    return { router, provider, llm };
  }

  /**
   * Combined initialization - browser + agent in one call
   * Most common pattern for CLI commands
   */
  async initWithBrowserAndAgent(url?: string): Promise<{
    browser: BrowserSession;
    agent: AgentSession;
    provider: ProviderConfig;
  }> {
    const provider = this.resolveProvider();

    // Parallel initialization when URL is provided
    const [browser, agent] = await Promise.all([this.launchBrowser(), this.createAgentSession()]);

    if (url) {
      await this.navigateToUrl(browser.page, url);
    }

    return { browser, agent, provider };
  }

  /**
   * Cleanup any held resources
   */
  async cleanup(): Promise<void> {
    if (this._browserManager) {
      await this._browserManager.closeBrowser();
      this._browserManager = null;
    }
  }
}

// Re-export InspectCommand base class
export {
  InspectCommand,
  createCommand,
  type CommonCommandOptions,
  type CommandContext,
  type CommandResult,
  type CommandHandler,
  type InspectCommandConfig,
} from "./command.js";
