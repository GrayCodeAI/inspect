import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PluginLoader } from "./loader.js";
import { existsSync, mkdirSync, writeFileSync, rmdirSync } from "node:fs";
import { join } from "node:path";

// Mock the logger to avoid actual logging during tests
jest.mock("@inspect/observability", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Helper to create a temporary plugin file
function createPluginFile(dir: string, name: string, content: string): string {
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe("PluginLoader", () => {
  let tempDir: string;
  let loader: PluginLoader;

  beforeEach(() => {
    // Create a temporary directory for test plugins
    tempDir = join(__dirname, "temp-plugins");
    mkdirSync(tempDir, { recursive: true });

    // Restore the mocked logger
    jest.clearAllMocks();

    loader = new PluginLoader(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmdirSync(tempDir, { recursive: true });
    }
  });

  describe("loadAll", () => {
    it("should discover and load plugins from inspect.plugins directory", async () => {
      // Create a simple plugin
      const pluginContent = `
        export default {
          name: "test-plugin",
          setup() {
            console.log("Setting up test plugin");
          }
        };
      `;
      createPluginFile(tempDir, "my-plugin.ts", pluginContent);

      // Create the inspect.plugins directory and place the plugin there
      const pluginsDir = join(tempDir, "inspect.plugins");
      mkdirSync(pluginsDir);
      const pluginPath = join(pluginsDir, "test-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("test-plugin");
    });

    it("should load plugins from explicit paths", async () => {
      const pluginContent = `
        export default {
          name: "explicit-plugin",
          setup() {}
        };
      `;
      const pluginPath = join(tempDir, "explicit-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      const plugins = await loader.loadAll([pluginPath]);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("explicit-plugin");
    });

    it("should load plugins from node_modules/@inspect-plugin/*", async () => {
      // Create a mock node_modules structure
      const nodeModulesDir = join(tempDir, "node_modules", "@inspect-plugin");
      mkdirSync(nodeModulesDir, { recursive: true });

      const pluginContent = `
        export default {
          name: "scoped-plugin",
          setup() {}
        };
      `;
      const pluginDir = join(nodeModulesDir, "test-scoped");
      mkdirSync(pluginDir);
      writeFileSync(join(pluginDir, "index.js"), pluginContent);

      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("scoped-plugin");
    });

    it("should load plugins from node_modules/inspect-plugin-*", async () => {
      // Create a mock node_modules structure
      const nodeModulesDir = join(tempDir, "node_modules");
      mkdirSync(nodeModulesDir, { recursive: true });

      const pluginContent = `
        export default {
          name: "unscoped-plugin",
          setup() {}
        };
      `;
      const pluginDir = join(nodeModulesDir, "inspect-plugin-test");
      mkdirSync(pluginDir);
      writeFileSync(join(pluginDir, "index.js"), pluginContent);

      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("unscoped-plugin");
    });

    it("should skip files without a name", async () => {
      const pluginContent = `
        // Missing name property
        export default {
          version: "1.0.0"
        };
      `;
      const pluginPath = join(tempDir, "invalid-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(0);
    });

    it("should skip duplicate plugins", async () => {
      const pluginContent = `
        export default {
          name: "duplicate-plugin",
          setup() {}
        };
      `;
      createPluginFile(tempDir, "plugin1.ts", pluginContent);
      createPluginFile(tempDir, "plugin2.ts", pluginContent);

      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(1);
    });

    it("should handle errors during plugin loading gracefully", async () => {
      const invalidContent = "this is not valid javascript";
      createPluginFile(tempDir, "broken-plugin.ts", invalidContent);

      const plugins = await loader.loadAll();

      expect(plugins).toHaveLength(0);
    });

    it("should initialize plugins after loading", async () => {
      const pluginContent = `
        export default {
          name: "initializable-plugin",
          setup(context) {
            context.registerHook("test-hook", () => console.log("hook called"));
          }
        };
      `;
      const pluginPath = join(tempDir, "init-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      const plugins = await loader.loadAll([pluginPath]);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("initializable-plugin");
    });
  });

  describe("loadPlugin", () => {
    it("should load a single plugin from a file path", async () => {
      const pluginContent = `
        export default {
          name: "single-plugin",
          setup() {}
        };
      `;
      const pluginPath = join(tempDir, "single-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      const plugin = await loader.loadPlugin(pluginPath);

      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe("single-plugin");
    });

    it("should return null for invalid plugin files", async () => {
      const pluginPath = join(tempDir, "non-existent.ts");

      const plugin = await loader.loadPlugin(pluginPath);

      expect(plugin).toBeNull();
    });

    it("should handle import errors gracefully", async () => {
      const invalidContent = "export default { name: ";
      const pluginPath = join(tempDir, "syntax-error.ts");
      writeFileSync(pluginPath, invalidContent);

      const plugin = await loader.loadPlugin(pluginPath);

      expect(plugin).toBeNull();
    });
  });

  describe("getPlugins", () => {
    it("should return all loaded plugins", async () => {
      const pluginContent = `
        export default {
          name: "plugin-1",
          setup() {}
        };
      `;
      const pluginPath = join(tempDir, "plugin1.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const plugins = loader.getPlugins();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("plugin-1");
    });
  });

  describe("getPlugin", () => {
    it("should return a specific plugin by name", async () => {
      const pluginContent = `
        export default {
          name: "specific-plugin",
          setup() {}
        };
      `;
      const pluginPath = join(tempDir, "specific-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const plugin = loader.getPlugin("specific-plugin");

      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe("specific-plugin");
    });

    it("should return undefined for non-existent plugin", () => {
      const plugin = loader.getPlugin("non-existent");
      expect(plugin).toBeUndefined();
    });
  });

  describe("getAllTools", () => {
    it("should return all custom tools from all plugins", async () => {
      const pluginContent = `
        export default {
          name: "tool-plugin",
          tools: [
            { name: "tool1", description: "Tool 1", handler: async () => {} },
            { name: "tool2", description: "Tool 2", handler: async () => {} }
          ]
        };
      `;
      const pluginPath = join(tempDir, "tool-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("tool1");
      expect(tools[1].name).toBe("tool2");
    });

    it("should return empty array when no plugins have tools", async () => {
      const pluginContent = `
        export default {
          name: "no-tools-plugin",
          setup() {}
        };
      `;
      const pluginPath = join(tempDir, "no-tools.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const tools = loader.getAllTools();

      expect(tools).toHaveLength(0);
    });
  });

  describe("getAllAssertions", () => {
    it("should return all custom assertions from all plugins", async () => {
      const pluginContent = `
        export default {
          name: "assertion-plugin",
          assertions: [
            { 
              name: "assert1", 
              description: "Assertion 1",
              evaluate: async () => true 
            }
          ]
        };
      `;
      const pluginPath = join(tempDir, "assertion-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const assertions = loader.getAllAssertions();

      expect(assertions).toHaveLength(1);
      expect(assertions[0].name).toBe("assert1");
    });

    it("should return empty array when no plugins have assertions", async () => {
      const pluginContent = `
        export default {
          name: "no-assertions-plugin",
          setup() {}
        };
      `;
      const pluginPath = join(tempDir, "no-assertions.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const assertions = loader.getAllAssertions();

      expect(assertions).toHaveLength(0);
    });
  });

  describe("executeHook", () => {
    it("should execute a lifecycle hook across all plugins", async () => {
      const plugin1Content = `
        export default {
          name: "plugin-1",
          async beforeRun() {
            return "result1";
          }
        };
      `;
      const plugin2Content = `
        export default {
          name: "plugin-2",
          async beforeRun() {
            return "result2";
          }
        };
      `;
      const plugin1Path = join(tempDir, "plugin1.ts");
      const plugin2Path = join(tempDir, "plugin2.ts");
      writeFileSync(plugin1Path, plugin1Content);
      writeFileSync(plugin2Path, plugin2Content);

      await loader.loadAll([plugin1Path, plugin2Path]);

      // Mock the hook execution to capture results
      const results: string[] = [];
      const originalConsoleLog = console.log;
      console.log = jest.fn((msg) => results.push(msg));

      await loader.executeHook("beforeRun");

      console.log = originalConsoleLog;

      expect(results).toHaveLength(2);
      expect(results).toContain("result1");
      expect(results).toContain("result2");
    });

    it("should execute registered hooks", async () => {
      const hookFn = jest.fn();
      loader.executeHook("custom-hook", "arg1", "arg2");
      expect(hookFn).not.toHaveBeenCalled();

      // Register a hook
      const context = loader["createPluginContext"]();
      context.registerHook("custom-hook", hookFn);

      await loader.executeHook("custom-hook", "arg1", "arg2");

      expect(hookFn).toHaveBeenCalledWith("arg1", "arg2");
    });
  });

  describe("unloadAll", () => {
    it("should unload all plugins and call teardown if defined", async () => {
      const pluginContent = `
        export default {
          name: "teardown-plugin",
          setup() {},
          teardown() {
            console.log("teardown called");
          }
        };
      `;
      const pluginPath = join(tempDir, "teardown-plugin.ts");
      writeFileSync(pluginPath, pluginContent);

      await loader.loadAll([pluginPath]);
      const teardownMock = jest.fn();
      const plugin = loader.getPlugin("teardown-plugin");
      if (plugin) {
        (plugin as { teardown?: () => void }).teardown = teardownMock;
      }

      await loader.unloadAll();

      expect(teardownMock).toHaveBeenCalled();
      expect(loader.getPlugins()).toHaveLength(0);
    });

    it("should clear hooks when unloading", async () => {
      const hookFn = jest.fn();
      const context = loader["createPluginContext"]();
      context.registerHook("test-hook", hookFn);

      await loader.unloadAll();

      const hooks = loader["hooks"].get("test-hook");
      expect(hooks).toBeUndefined();
    });
  });
});
