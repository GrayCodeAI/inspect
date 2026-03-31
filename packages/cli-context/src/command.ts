// ──────────────────────────────────────────────────────────────────────────────
// @inspect/cli-context - InspectCommand Base Class
// ──────────────────────────────────────────────────────────────────────────────

import type { Command } from "commander";
import { CLIContext, type ProviderName, type BrowserSession, type AgentSession, EXIT_CODES } from "./index.js";

/**
 * Common options that most Inspect commands share.
 * Commands can extend this interface for their specific options.
 */
export interface CommonCommandOptions {
  /** AI provider to use */
  agent?: string;
  /** Run in headed mode (show browser) */
  headed?: boolean;
  /** Enable verbose output */
  verbose?: boolean;
  /** Output as JSON */
  json?: boolean;
  /** Target URL */
  url?: string;
  /** Browser to use */
  browser?: "chromium" | "firefox" | "webkit";
  /** Device preset */
  device?: string;
  /** Custom config path */
  config?: string;
}

/**
 * Context provided to command handlers.
 * Includes browser, agent, and provider ready to use.
 */
export interface CommandContext {
  /** CLI context with provider/browser setup */
  cli: CLIContext;
  /** Browser session (if --url or launchBrowser=true) */
  browser?: BrowserSession;
  /** Agent session with LLM access */
  agent?: AgentSession;
  /** Resolved provider config */
  provider: {
    name: ProviderName;
    apiKey: string | undefined;
    envVar: string;
  };
  /** Common options */
  options: CommonCommandOptions;
  /** Raw command arguments */
  args: string[];
}

/**
 * Result from a command handler.
 */
export interface CommandResult {
  /** Exit code (defaults to SUCCESS) */
  exitCode?: number;
  /** Optional output data (for --json mode) */
  data?: unknown;
  /** Error if command failed */
  error?: Error;
}

/**
 * Handler function type for Inspect commands.
 */
export type CommandHandler<TOptions extends CommonCommandOptions> = (
  ctx: CommandContext,
  options: TOptions
) => Promise<CommandResult | void>;

/**
 * Configuration for creating an Inspect command.
 */
export interface InspectCommandConfig<TOptions extends CommonCommandOptions> {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Command aliases */
  aliases?: string[];
  /** Command-specific options (added to common options) */
  options?: (cmd: Command) => void;
  /** Handler function */
  handler: CommandHandler<TOptions>;
  /** Auto-launch browser if URL is provided */
  autoLaunchBrowser?: boolean;
  /** Auto-create agent session */
  autoCreateAgent?: boolean;
  /** Examples for help text */
  examples?: string[];
}

/**
 * InspectCommand - Base class for standardized CLI commands.
 * 
 * Provides:
 * - Common options (--agent, --headed, --verbose, --json, --url)
 * - Unified provider resolution via CLIContext
 * - Automatic browser/agent initialization
 * - Standard error handling with exit codes
 * - JSON output mode
 * 
 * @example
 * ```typescript
 * const testCommand = new InspectCommand({
 *   name: "test",
 *   description: "Run AI-powered browser tests",
 *   options: (cmd) => {
 *     cmd.option("-m, --message <text>", "Test instruction");
 *     cmd.option("--a11y", "Include accessibility audit");
 *   },
 *   handler: async (ctx, options) => {
 *     const { agent, browser, provider } = ctx;
 *     // ... test logic
 *     return { exitCode: EXIT_CODES.SUCCESS };
 *   },
 *   examples: [
 *     "$ inspect test -m 'test login flow' --url https://myapp.com",
 *   ],
 * });
 * 
 * testCommand.register(program);
 * ```
 */
export class InspectCommand<TOptions extends CommonCommandOptions = CommonCommandOptions> {
  private config: InspectCommandConfig<TOptions>;

  constructor(config: InspectCommandConfig<TOptions>) {
    this.config = config;
  }

  /**
   * Register this command with a Commander program.
   */
  register(program: Command): void {
    const cmd = program
      .command(this.config.name)
      .description(this.config.description);

    // Add aliases
    if (this.config.aliases) {
      for (const alias of this.config.aliases) {
        cmd.alias(alias);
      }
    }

    // Add common options
    this.addCommonOptions(cmd);

    // Add command-specific options
    if (this.config.options) {
      this.config.options(cmd);
    }

    // Add examples to help
    if (this.config.examples && this.config.examples.length > 0) {
      cmd.addHelpText("after", `\nExamples:\n${this.config.examples.map(e => `  ${e}`).join("\n")}\n`);
    }

    // Set up action handler
    cmd.action(async (opts: TOptions) => {
      await this.execute(opts, cmd.args);
    });
  }

  /**
   * Add common options to the command.
   */
  private addCommonOptions(cmd: Command): void {
    cmd
      .option("-a, --agent <agent>", "AI provider: claude, gpt, gemini, deepseek, ollama", "claude")
      .option("--headed", "Run browser in headed (visible) mode")
      .option("--verbose", "Enable detailed output")
      .option("--json", "Output as JSON")
      .option("--url <url>", "Target URL")
      .option("--browser <browser>", "Browser: chromium, firefox, webkit", "chromium")
      .option("--device <device>", "Device preset (e.g., iphone-15, desktop-chrome)", "desktop-chrome")
      .option("--config <path>", "Path to config file");
  }

  /**
   * Execute the command with context setup.
   */
  private async execute(options: TOptions, args: string[]): Promise<void> {
    const cli = new CLIContext({
      agent: options.agent,
      headed: options.headed,
    });

    let browser: BrowserSession | undefined;
    let agent: AgentSession | undefined;

    try {
      // Resolve provider
      const provider = cli.resolveProvider(options.agent);
      cli.requireApiKey(options.agent);

      // Auto-launch browser if configured
      if (this.config.autoLaunchBrowser && options.url) {
        browser = await cli.launchBrowser({
          headed: options.headed,
        });
        await cli.navigateToUrl(browser.page, options.url);
      }

      // Auto-create agent session if configured
      if (this.config.autoCreateAgent !== false) {
        agent = await cli.createAgentSession(options.agent);
      }

      // Build context
      const ctx: CommandContext = {
        cli,
        browser,
        agent,
        provider,
        options,
        args,
      };

      // Execute handler
      const result = await this.config.handler(ctx, options);

      // Handle result
      if (result?.error) {
        throw result.error;
      }

      // JSON output
      if (options.json && result?.data) {
        console.log(JSON.stringify(result.data, null, 2));
      }

      process.exit(result?.exitCode ?? EXIT_CODES.SUCCESS);

    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      // Error output
      if (options.json) {
        console.log(JSON.stringify({ error: error.message, success: false }, null, 2));
      } else {
        console.error(`\nError: ${error.message}`);
        if (options.verbose && error.stack) {
          console.error(error.stack);
        }
        this.printTroubleshooting(error);
      }

      await cli.cleanup();
      process.exit(EXIT_CODES.TEST_FAILURE);
    } finally {
      await cli.cleanup();
    }
  }

  /**
   * Print troubleshooting hints based on error type.
   */
  private printTroubleshooting(error: Error): void {
    const msg = error.message.toLowerCase();
    console.error("\nTroubleshooting:");
    
    if (msg.includes("api") || msg.includes("key") || msg.includes("401") || msg.includes("403")) {
      console.error("  → Check your API key: inspect doctor");
      console.error("  → Set the key: export ANTHROPIC_API_KEY=sk-...");
    } else if (msg.includes("browser") || msg.includes("playwright") || msg.includes("launch")) {
      console.error("  → Install browsers: npx playwright install");
      console.error("  → Check setup: inspect doctor");
    } else if (msg.includes("timeout") || msg.includes("navigation")) {
      console.error("  → Increase timeout or check URL reachability");
    } else {
      console.error("  → Run diagnostics: inspect doctor");
      console.error("  → Try with --verbose for more details");
    }
  }
}

/**
 * Helper to create and register a command in one call.
 */
export function createCommand<TOptions extends CommonCommandOptions>(
  config: InspectCommandConfig<TOptions>
): InspectCommand<TOptions> {
  return new InspectCommand(config);
}
