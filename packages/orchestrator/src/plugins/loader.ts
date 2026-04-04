// ============================================================================
// @inspect/core - Plugin System
//
// Discovers and loads custom test plugins from:
//   1. inspect.plugins/ directory
//   2. node_modules/@inspect-plugin/*
//   3. Explicit paths in inspect.config.ts
// ============================================================================

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getCwd } from "@inspect/shared";
import { pathToFileURL } from "node:url";
import { createLogger } from "@inspect/observability";

const logger = createLogger("core/plugins");

export interface InspectPlugin {
  /** Plugin name (unique identifier) */
  name: string;
  /** Plugin version */
  version?: string;
  /** Plugin description */
  description?: string;

  /** Called when plugin is loaded */
  setup?: (context: PluginContext) => void | Promise<void>;

  /** Called before each test run */
  beforeRun?: (runContext: RunContext) => void | Promise<void>;

  /** Called after each test run */
  afterRun?: (runContext: RunContext, result: RunResult) => void | Promise<void>;

  /** Called before each test step */
  beforeStep?: (stepContext: StepContext) => void | Promise<void>;

  /** Called after each test step */
  afterStep?: (stepContext: StepContext, result: StepResultContext) => void | Promise<void>;

  /** Register custom MCP tools */
  tools?: PluginTool[];

  /** Register custom assertions */
  assertions?: PluginAssertion[];

  /** Called when plugin is unloaded */
  teardown?: () => void | Promise<void>;
}

export interface PluginContext {
  /** Working directory */
  cwd: string;
  /** Inspect config (if loaded) */
  config: Record<string, unknown>;
  /** Register a hook */
  registerHook: (hook: string, fn: (...args: unknown[]) => void | Promise<void>) => void;
}

export interface RunContext {
  runId: string;
  instruction: string;
  url?: string;
  device: string;
  browser: string;
  agent: string;
}

export interface RunResult {
  status: "pass" | "fail" | "error" | "timeout";
  duration: number;
  steps: number;
}

export interface StepContext {
  runId: string;
  stepIndex: number;
  description: string;
  type: string;
}

export interface StepResultContext {
  status: "pass" | "fail" | "skipped";
  duration: number;
  error?: string;
}

export interface PluginTool {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface PluginAssertion {
  name: string;
  description: string;
  evaluate: (
    context: { pageContent: string; screenshot?: string },
    ...args: unknown[]
  ) => Promise<boolean>;
}

/**
 * PluginLoader discovers, loads, and manages Inspect plugins.
 */
export class PluginLoader {
  private plugins: Map<string, InspectPlugin> = new Map();
  private hooks: Map<string, Array<(...args: unknown[]) => void | Promise<void>>> = new Map();
  private cwd: string;

  constructor(cwd?: string) {
    this.cwd = cwd ?? getCwd();
  }

  /**
   * Discover and load all plugins from standard locations.
   */
  async loadAll(explicitPaths?: string[]): Promise<InspectPlugin[]> {
    const loaded: InspectPlugin[] = [];

    // 1. Load from inspect.plugins/ directory
    const pluginsDir = join(this.cwd, "inspect.plugins");
    if (existsSync(pluginsDir)) {
      const files = readdirSync(pluginsDir).filter(
        (f) => f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs"),
      );

      for (const file of files) {
        const plugin = await this.loadPlugin(join(pluginsDir, file));
        if (plugin) loaded.push(plugin);
      }
    }

    // 2. Load from explicit paths
    if (explicitPaths) {
      for (const p of explicitPaths) {
        const plugin = await this.loadPlugin(resolve(this.cwd, p));
        if (plugin) loaded.push(plugin);
      }
    }

    // 3. Load from node_modules/@inspect-plugin/*
    const nodeModulesDir = join(this.cwd, "node_modules", "@inspect-plugin");
    if (existsSync(nodeModulesDir)) {
      const dirs = readdirSync(nodeModulesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const dir of dirs) {
        const pkgPath = join(nodeModulesDir, dir);
        const plugin = await this.loadPlugin(pkgPath);
        if (plugin) loaded.push(plugin);
      }
    }

    // 4. Load from node_modules/inspect-plugin-* (unscoped)
    const nmDir = join(this.cwd, "node_modules");
    if (existsSync(nmDir)) {
      const dirs = readdirSync(nmDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith("inspect-plugin-"))
        .map((d) => d.name);

      for (const dir of dirs) {
        const pkgPath = join(nmDir, dir);
        const plugin = await this.loadPlugin(pkgPath);
        if (plugin) loaded.push(plugin);
      }
    }

    // Initialize all plugins
    const context = this.createPluginContext();
    for (const plugin of loaded) {
      if (plugin.setup) {
        await plugin.setup(context);
      }
    }

    return loaded;
  }

  /**
   * Load a single plugin from a file path.
   */
  async loadPlugin(filePath: string): Promise<InspectPlugin | null> {
    try {
      const fileUrl = pathToFileURL(resolve(filePath)).href;
      const mod = await import(fileUrl);
      const plugin: InspectPlugin = mod.default ?? mod;

      if (!plugin.name) {
        logger.warn("Plugin missing 'name', skipping.", { filePath });
        return null;
      }

      if (this.plugins.has(plugin.name)) {
        logger.warn("Plugin already loaded, skipping duplicate.", { pluginName: plugin.name });
        return null;
      }

      this.plugins.set(plugin.name, plugin);
      return plugin;
    } catch (err) {
      logger.warn("Failed to load plugin", {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Get all loaded plugins.
   */
  getPlugins(): InspectPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin by name.
   */
  getPlugin(name: string): InspectPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered custom tools across plugins.
   */
  getAllTools(): PluginTool[] {
    return this.getPlugins().flatMap((p) => p.tools ?? []);
  }

  /**
   * Get all registered custom assertions across plugins.
   */
  getAllAssertions(): PluginAssertion[] {
    return this.getPlugins().flatMap((p) => p.assertions ?? []);
  }

  /**
   * Execute a lifecycle hook across all plugins.
   */
  async executeHook(hook: string, ...args: unknown[]): Promise<void> {
    for (const plugin of this.plugins.values()) {
      const fn = (plugin as unknown as Record<string, unknown>)[hook];
      if (typeof fn === "function") {
        await fn.call(plugin, ...args);
      }
    }

    // Also execute registered hooks
    const hookFns = this.hooks.get(hook) ?? [];
    for (const fn of hookFns) {
      await fn(...args);
    }
  }

  /**
   * Unload all plugins.
   */
  async unloadAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.teardown) {
        await plugin.teardown();
      }
    }
    this.plugins.clear();
    this.hooks.clear();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private createPluginContext(): PluginContext {
    return {
      cwd: this.cwd,
      config: {},
      registerHook: (hook: string, fn: (...args: unknown[]) => void | Promise<void>) => {
        const existing = this.hooks.get(hook) ?? [];
        existing.push(fn);
        this.hooks.set(hook, existing);
      },
    };
  }
}

/**
 * Helper for plugin authors: define a plugin with type safety.
 */
export function definePlugin(plugin: InspectPlugin): InspectPlugin {
  return plugin;
}
