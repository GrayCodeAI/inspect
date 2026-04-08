import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { PluginLoader } from "./plugins/loader.js";

describe("PluginLoader", () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  describe("load", () => {
    it("should load a plugin from a file path", async () => {
      // Mock a plugin module
      const pluginPath = "/mock/plugins/test-plugin.js";
      const pluginModule = {
        default: class TestPlugin {
          name = "TestPlugin";
          async initialize() {
            return { ready: true };
          }
          async execute(context: any) {
            return { success: true, result: "test" };
          }
        },
      };

      // Mock require
      const originalRequire = require;
      (require as any) = (module: string) => {
        if (module === pluginPath) return pluginModule;
        return originalRequire(module);
      };

      const plugin = await loader.load(pluginPath);

      // Restore require
      (require as any) = originalRequire;

      expect(plugin).toBeInstanceOf(Object);
      expect(plugin.name).toEqual("TestPlugin");
      expect(plugin.execute).toBeInstanceOf(Function);
    });

    it("should handle load errors gracefully", async () => {
      const pluginPath = "/mock/plugins/broken-plugin.js";
      const originalRequire = require;
      (require as any) = () => {
        throw new Error("Failed to load module");
      };

      const result = await loader.load(pluginPath);
      expect(result).toBeNull();

      (require as any) = originalRequire;
    });

    it("should cache loaded plugins", async () => {
      const pluginPath = "/mock/plugins/test-plugin.js";
      const pluginModule = { default: class {} };

      const originalRequire = require;
      (require as any) = (module: string) => {
        if (module === pluginPath) return pluginModule;
        return originalRequire(module);
      };

      const plugin1 = await loader.load(pluginPath);
      const plugin2 = await loader.load(pluginPath);

      expect(plugin1).toBe(plugin2); // Same instance
    });
  });

  describe("loadFromDirectory", () => {
    it("should load all plugins from a directory", async () => {
      const pluginDir = "/mock/plugins";
      const pluginFiles = ["/mock/plugins/plugin1.js", "/mock/plugins/plugin2.js"];

      // Mock directory reading
      const originalReaddir = require("fs").readdir;
      const originalStat = require("fs").stat;
      (require("fs") as any).readdir = (dir: string) => {
        if (dir === pluginDir) return ["plugin1.js", "plugin2.js"];
        return [];
      };
      (require("fs") as any).stat = (path: string) => {
        if (path === "/mock/plugins/plugin1.js" || path === "/mock/plugins/plugin2.js") {
          return { isFile: () => true };
        }
        return { isFile: () => false };
      };

      // Mock plugin modules
      const plugin1Module = {
        default: class {
          name = "Plugin1";
        },
      };
      const plugin2Module = {
        default: class {
          name = "Plugin2";
        },
      };
      const originalRequire = require;
      (require as any) = (module: string) => {
        if (module === "/mock/plugins/plugin1.js") return plugin1Module;
        if (module === "/mock/plugins/plugin2.js") return plugin2Module;
        return originalRequire(module);
      };

      const plugins = await loader.loadFromDirectory(pluginDir);
      expect(plugins).toHaveLength(2);
      expect(plugins[0].name).toEqual("Plugin1");
      expect(plugins[1].name).toEqual("Plugin2");

      // Restore
      (require as any) = originalRequire;
      (require("fs") as any).readdir = originalReaddir;
      (require("fs") as any).stat = originalStat;
    });

    it("should handle errors when loading plugins from directory", async () => {
      const pluginDir = "/mock/plugins";
      const originalReaddir = require("fs").readdir;
      (require("fs") as any).readdir = () => ["plugin1.js", "plugin2.js"];

      // Mock a read error
      const originalReadFile = require("fs").readFile;
      (require("fs") as any).readFile = () => {
        throw new Error("Failed to read file");
      };

      const plugins = await loader.loadFromDirectory(pluginDir);
      expect(plugins).toHaveLength(0);

      // Restore
      (require("fs") as any).readdir = originalReaddir;
      (require("fs") as any).readFile = originalReadFile;
    });
  });

  describe("unload", () => {
    it("should unload a plugin by path", async () => {
      const pluginPath = "/mock/plugins/test-plugin.js";
      const pluginModule = {
        default: class {
          name = "TestPlugin";
        },
      };
      const originalRequire = require;
      (require as any) = (module: string) => {
        if (module === pluginPath) return pluginModule;
        return originalRequire(module);
      };

      const plugin = await loader.load(pluginPath);
      expect(loader.isLoaded(pluginPath)).toBe(true);

      loader.unload(pluginPath);
      expect(loader.isLoaded(pluginPath)).toBe(false);

      (require as any) = originalRequire;
    });

    it("should do nothing if plugin is not loaded", async () => {
      loader.unload("/nonexistent/plugin.js");
      // Should not throw
    });
  });

  describe("clear", () => {
    it("should remove all loaded plugins", async () => {
      const pluginPath1 = "/mock/plugins/plugin1.js";
      const pluginPath2 = "/mock/plugins/plugin2.js";
      const plugin1Module = {
        default: class {
          name = "Plugin1";
        },
      };
      const plugin2Module = {
        default: class {
          name = "Plugin2";
        },
      };
      const originalRequire = require;
      (require as any) = (module: string) => {
        if (module === pluginPath1) return plugin1Module;
        if (module === pluginPath2) return plugin2Module;
        return originalRequire(module);
      };

      await loader.load(pluginPath1);
      await loader.load(pluginPath2);

      expect(loader.isLoaded(pluginPath1)).toBe(true);
      expect(loader.isLoaded(pluginPath2)).toBe(true);

      loader.clear();

      expect(loader.isLoaded(pluginPath1)).toBe(false);
      expect(loader.isLoaded(pluginPath2)).toBe(false);

      (require as any) = originalRequire;
    });
  });
});
