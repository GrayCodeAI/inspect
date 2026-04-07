import { Effect, FileSystem, Layer, Option, Path, Schema, ServiceMap } from "effect";

import { BUILTIN_PLUGINS } from "./builtin-plugins.js";
import { InvalidPluginManifestError, PluginLoadError } from "./plugin-errors.js";
import { PluginRegistry } from "./plugin-registry.js";
import { PluginManifest, type PluginHookName, type PluginInfo } from "./plugin-types.js";

const PluginManifestSchema = PluginManifest;

export class PluginLoader extends ServiceMap.Service<PluginLoader>()(
  "@plugin-marketplace/PluginLoader",
  {
    make: Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const registry = yield* PluginRegistry;

      const validateManifest = Effect.fn("PluginLoader.validateManifest")(function* (
        manifest: unknown,
      ) {
        const result = yield* Schema.decodeUnknownEffect(PluginManifestSchema)(manifest).pipe(
          Effect.catchTag("SchemaError", (parseError) =>
            new InvalidPluginManifestError({
              reason: `Schema validation failed: ${String(parseError)}`,
            }).asEffect(),
          ),
        );

        if (result.hooks.length === 0) {
          return yield* new InvalidPluginManifestError({
            reason: "Plugin must define at least one hook",
          });
        }

        return result;
      });

      const loadFromPath = Effect.fn("PluginLoader.loadFromPath")(function* (pluginPath: string) {
        const startTime = Date.now();

        const manifestPath = path.join(pluginPath, "plugin.json");

        const manifestContent = yield* fileSystem.readFileString(manifestPath).pipe(
          Effect.catchTags({
            PlatformError: () =>
              new PluginLoadError({
                name: "unknown",
                version: "unknown",
                cause: `Failed to read manifest at ${manifestPath}`,
              }).asEffect(),
          }),
        );

        const parsedManifest = yield* Effect.try({
          try: () => JSON.parse(manifestContent),
          catch: (cause) =>
            new InvalidPluginManifestError({ reason: `Invalid manifest JSON: ${String(cause)}` }),
        });

        const manifest = yield* Schema.decodeUnknownEffect(PluginManifestSchema)(
          parsedManifest,
        ).pipe(
          Effect.catchTag("SchemaError", (parseError) =>
            new InvalidPluginManifestError({
              reason: `Schema validation failed: ${String(parseError)}`,
            }).asEffect(),
          ),
        );

        const handlerModulePath = manifest.hooks[0]!.handler.split(":")[0] ?? "index";
        const modulePath = path.join(pluginPath, handlerModulePath);

        const module = yield* Effect.tryPromise({
          try: async () => await import(modulePath),
          catch: (cause) =>
            new PluginLoadError({
              name: manifest.name,
              version: manifest.version,
              cause: String(cause),
            }),
        });

        const hooks: Record<PluginHookName, Array<(...args: unknown[]) => unknown>> = {
          beforeTest: [],
          afterTest: [],
          beforeStep: [],
          afterStep: [],
          onError: [],
          onAssertion: [],
          onNavigation: [],
          onScreenshot: [],
        };

        for (const hook of manifest.hooks) {
          const hookName = hook.name as PluginHookName;
          const handlerName = hook.handler.split(":")[1] ?? "default";
          const handler = (module as Record<string, (...args: unknown[]) => unknown>)[handlerName];

          if (typeof handler !== "function") {
            return yield* new PluginLoadError({
              name: manifest.name,
              version: manifest.version,
              cause: `Handler "${handlerName}" not found or not a function`,
            });
          }

          hooks[hookName].push(handler);
        }

        yield* registry.register(manifest, hooks, pluginPath);

        const loadTime = Date.now() - startTime;

        const pluginInfo: PluginInfo = {
          manifest,
          status: "loaded",
          loadTime,
          error: Option.none(),
          path: pluginPath,
        };

        yield* Effect.logInfo("Plugin loaded", {
          name: manifest.name,
          version: manifest.version,
          loadTime,
        });

        return pluginInfo;
      });

      const loadFromDirectory = Effect.fn("PluginLoader.loadFromDirectory")(function* (
        dir: string,
      ) {
        const entries = yield* fileSystem.readDirectory(dir).pipe(
          Effect.catchTags({
            PlatformError: () => Effect.succeed([] as readonly string[]),
          }),
        );

        const pluginDirs = entries.filter((entry) => !entry.startsWith("."));

        const results = yield* Effect.forEach(
          pluginDirs,
          (entry) => {
            const pluginPath = path.join(dir, entry);
            return loadFromPath(pluginPath).pipe(
              Effect.catchTag("PluginLoadError", () =>
                Effect.succeed<PluginInfo | undefined>(undefined),
              ),
              Effect.catchTag("InvalidPluginManifestError", () =>
                Effect.succeed<PluginInfo | undefined>(undefined),
              ),
            );
          },
          { concurrency: "unbounded" },
        );

        return results.filter((result): result is PluginInfo => result !== undefined);
      });

      const loadBuiltin = Effect.fn("PluginLoader.loadBuiltin")(function* () {
        const results = yield* Effect.forEach(
          BUILTIN_PLUGINS,
          (plugin) =>
            Effect.gen(function* () {
              const hooks: Partial<Record<PluginHookName, Array<(...args: unknown[]) => unknown>>> =
                {};

              for (const hook of plugin.manifest.hooks) {
                const hookName = hook.name as PluginHookName;
                const handlerName = hook.handler;
                const handler = plugin.handlers[handlerName];
                if (typeof handler === "function") {
                  const existingHooks = hooks[hookName] ?? [];
                  hooks[hookName] = [...existingHooks, handler];
                }
              }

              yield* registry.register(
                plugin.manifest,
                hooks as Record<PluginHookName, Array<(...args: unknown[]) => unknown>>,
                `builtin:${plugin.manifest.name}`,
              );

              const pluginInfo: PluginInfo = {
                manifest: plugin.manifest,
                status: "loaded",
                loadTime: 0,
                error: Option.none(),
                path: `builtin:${plugin.manifest.name}`,
              };

              yield* Effect.logInfo("Built-in plugin loaded", { name: plugin.manifest.name });

              return pluginInfo;
            }),
          { concurrency: "unbounded" },
        );

        return results;
      });

      return {
        validateManifest,
        loadFromPath,
        loadFromDirectory,
        loadBuiltin,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(PluginRegistry.layer));
}
