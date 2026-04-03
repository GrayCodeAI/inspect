import { Effect, Layer, Option, Order, PubSub, ServiceMap } from "effect";

import { PluginHookError, PluginNotFoundError } from "./plugin-errors";
import type { PluginHookName, PluginInfo, PluginManifest, PluginStatus } from "./plugin-types";

interface HookEntry {
  priority: number;
  handler: (...args: unknown[]) => unknown;
}

interface StoredPlugin {
  manifest: PluginManifest;
  hooks: Map<PluginHookName, HookEntry[]>;
  status: PluginStatus;
  loadTime: number;
  error: Option.Option<string>;
  path: string;
}

export class PluginRegistry extends ServiceMap.Service<PluginRegistry>()(
  "@plugin-marketplace/PluginRegistry",
  {
    make: Effect.gen(function* () {
      const plugins = new Map<string, StoredPlugin>();
      const hookPubSub = yield* PubSub.unbounded<{
        hook: PluginHookName;
        plugin: string;
        result: unknown;
      }>();

      const toPluginInfo = (name: string, stored: StoredPlugin): PluginInfo => ({
        manifest: stored.manifest,
        status: stored.status,
        loadTime: stored.loadTime,
        error: stored.error,
        path: stored.path,
      });

      const getHooksFor = (hookName: PluginHookName): HookEntry[] => {
        const allHooks: HookEntry[] = [];

        for (const stored of plugins.values()) {
          if (stored.status === "disabled") continue;
          const hooks = stored.hooks.get(hookName);
          if (hooks) {
            allHooks.push(...hooks);
          }
        }

        const byPriority = Order.mapInput(Order.Number, (entry: HookEntry) => entry.priority);
        allHooks.sort(byPriority);
        return allHooks;
      };

      const register = Effect.fn("PluginRegistry.register")(function* (
        manifest: PluginManifest,
        hooks: Record<PluginHookName, Array<(...args: unknown[]) => unknown>>,
        path: string,
      ) {
        const storedHooks = new Map<PluginHookName, HookEntry[]>();

        for (const hook of manifest.hooks) {
          const handlers = hooks[hook.name] ?? [];
          storedHooks.set(
            hook.name,
            handlers.map((handler) => ({ priority: hook.priority, handler })),
          );
        }

        plugins.set(manifest.name, {
          manifest,
          hooks: storedHooks,
          status: "active",
          loadTime: Date.now(),
          error: Option.none(),
          path,
        });

        yield* Effect.logInfo("Plugin registered", {
          name: manifest.name,
          version: manifest.version,
        });
      });

      const unregister = Effect.fn("PluginRegistry.unregister")(function* (name: string) {
        const stored = plugins.get(name);
        if (!stored) {
          return yield* new PluginNotFoundError({ name });
        }

        plugins.delete(name);
        yield* Effect.logInfo("Plugin unregistered", { name });
      });

      const getPlugin = Effect.fn("PluginRegistry.getPlugin")(function* (name: string) {
        const stored = plugins.get(name);
        if (!stored) {
          return yield* new PluginNotFoundError({ name });
        }
        return toPluginInfo(name, stored);
      });

      const getAllPlugins = Effect.sync(() => {
        const result: PluginInfo[] = [];
        for (const [name, stored] of plugins) {
          result.push(toPluginInfo(name, stored));
        }
        return result as readonly PluginInfo[];
      });

      const enable = Effect.fn("PluginRegistry.enable")(function* (name: string) {
        const stored = plugins.get(name);
        if (!stored) {
          return yield* new PluginNotFoundError({ name });
        }
        stored.status = "active";
        yield* Effect.logInfo("Plugin enabled", { name });
      });

      const disable = Effect.fn("PluginRegistry.disable")(function* (name: string) {
        const stored = plugins.get(name);
        if (!stored) {
          return yield* new PluginNotFoundError({ name });
        }
        stored.status = "disabled";
        yield* Effect.logInfo("Plugin disabled", { name });
      });

      const emit = Effect.fn("PluginRegistry.emit")(function* (
        hookName: PluginHookName,
        context: unknown,
      ) {
        const hooks = getHooksFor(hookName);

        yield* Effect.forEach(
          hooks,
          (entry: HookEntry) =>
            Effect.promise(async () => {
              await entry.handler(context);
            }).pipe(
              Effect.catch(() =>
                Effect.logWarning("Hook execution failed", {
                  hook: hookName,
                }),
              ),
            ),
          { concurrency: 1 },
        );
      });

      const emitWithResult = Effect.fn("PluginRegistry.emitWithResult")(function* <T>(
        hookName: PluginHookName,
        context: unknown,
      ) {
        const hooks = getHooksFor(hookName);
        const results: T[] = [];

        yield* Effect.forEach(
          hooks,
          (entry: HookEntry) =>
            Effect.promise(async () => {
              const result = await entry.handler(context);
              return result as T;
            }).pipe(
              Effect.match({
                onSuccess: (result) => {
                  results.push(result);
                },
                onFailure: () =>
                  Effect.logWarning("Hook execution failed", {
                    hook: hookName,
                  }),
              }),
            ),
          { concurrency: 1 },
        );

        return results as readonly T[];
      });

      const setPluginStatus = Effect.fn("PluginRegistry.setPluginStatus")(function* (
        name: string,
        status: PluginStatus,
        error?: Option.Option<string>,
      ) {
        const stored = plugins.get(name);
        if (!stored) {
          return yield* new PluginNotFoundError({ name });
        }
        stored.status = status;
        stored.error = error ?? Option.none();
      });

      const stream = Effect.succeed(hookPubSub);

      return {
        register,
        unregister,
        getPlugin,
        getAllPlugins,
        emit,
        emitWithResult,
        enable,
        disable,
        getHooksFor,
        setPluginStatus,
        stream,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
