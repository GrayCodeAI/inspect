import { Effect, Layer, Ref, ServiceMap } from "effect";
import { SandboxResourceExceededError, SecurityModeError } from "./errors.js";

export interface ResourceLimits {
  memoryMB: number;
  cpuTimeMs: number;
  networkRequests: number;
  diskIOBytes: number;
  allowedDomains?: string[];
}

export interface SandboxConfig {
  limits: ResourceLimits;
}

export interface SandboxResourceUsage {
  memoryUsed: number;
  cpuTimeMs: number;
  networkRequests: number;
  diskIOBytes: number;
}

export class Sandbox extends ServiceMap.Service<
  Sandbox,
  {
    readonly configure: (config: SandboxConfig) => Effect.Effect<void, SecurityModeError>;
    readonly execute: <T>(
      effect: Effect.Effect<T, SecurityModeError>,
    ) => Effect.Effect<T, SandboxResourceExceededError | SecurityModeError>;
    readonly getResourceUsage: Effect.Effect<SandboxResourceUsage, SecurityModeError>;
    readonly checkResourceLimit: (
      resource: keyof ResourceLimits,
      usage: number,
    ) => Effect.Effect<void, SandboxResourceExceededError | SecurityModeError>;
    readonly recordResourceUsage: (
      resource: keyof ResourceLimits,
      amount: number,
    ) => Effect.Effect<void, SecurityModeError | SandboxResourceExceededError>;
  }
>()("@inspect/security-modes/Sandbox") {
  static make = Effect.gen(function* () {
    const configRef = yield* Ref.make<SandboxConfig | null>(null);
    const usageRef = yield* Ref.make<SandboxResourceUsage>({
      memoryUsed: 0,
      cpuTimeMs: 0,
      networkRequests: 0,
      diskIOBytes: 0,
    });

    const configure = (config: SandboxConfig) =>
      Effect.gen(function* () {
        yield* Ref.set(configRef, config);
        yield* Ref.set(usageRef, {
          memoryUsed: 0,
          cpuTimeMs: 0,
          networkRequests: 0,
          diskIOBytes: 0,
        });

        yield* Effect.logInfo("Sandbox configured", {
          limits: config.limits,
        });
      }).pipe(Effect.withSpan("Sandbox.configure"));

    const execute = <T>(effect: Effect.Effect<T, SecurityModeError>) =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);

        if (!config) {
          return yield* new SecurityModeError({
            mode: "sandbox",
            reason: "Sandbox not configured",
            cause: null,
          });
        }

        const startTime = Date.now();

        const result = yield* effect.pipe(
          Effect.timeout(config.limits.cpuTimeMs),
          Effect.catchTag("TimeoutError", () =>
            new SandboxResourceExceededError({
              resource: "cpuTimeMs",
              limit: config.limits.cpuTimeMs,
              used: config.limits.cpuTimeMs,
            }).asEffect(),
          ),
        );

        const endTime = Date.now();

        yield* Ref.update(usageRef, (usage) => ({
          ...usage,
          cpuTimeMs: endTime - startTime,
        }));

        return result;
      }).pipe(Effect.withSpan("Sandbox.execute"));

    const getResourceUsage = Effect.gen(function* () {
      const usage = yield* Ref.get(usageRef);
      return usage;
    });

    const checkResourceLimit = (resource: keyof ResourceLimits, usage: number) =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);

        if (!config) {
          return yield* new SecurityModeError({
            mode: "sandbox",
            reason: "Sandbox not configured",
            cause: null,
          });
        }

        const limit = config.limits[resource] as number | undefined;

        if (limit !== undefined && usage > limit) {
          return yield* new SandboxResourceExceededError({
            resource,
            limit,
            used: usage,
          });
        }

        yield* Effect.logDebug("Resource limit check passed", {
          resource,
          usage,
          limit,
        });
        return void 0;
      }).pipe(Effect.withSpan("Sandbox.checkResourceLimit"));

    const recordResourceUsage = (resource: keyof ResourceLimits, amount: number) =>
      Effect.gen(function* () {
        yield* Ref.update(usageRef, (usage) => {
          const key = resourceToUsageKey(resource);
          return {
            ...usage,
            [key]: usage[key] + amount,
          };
        });

        const config = yield* Ref.get(configRef);
        const usage = yield* Ref.get(usageRef);

        if (config) {
          const limit = config.limits[resource] as number | undefined;
          const currentUsage = usage[resourceToUsageKey(resource)];

          if (limit !== undefined && currentUsage > limit) {
            return yield* new SandboxResourceExceededError({
              resource,
              limit,
              used: currentUsage,
            });
          }
        }
      }).pipe(Effect.withSpan("Sandbox.recordResourceUsage"));

    return {
      configure,
      execute,
      getResourceUsage,
      checkResourceLimit,
      recordResourceUsage,
    } as const;
  });

  static layer = Layer.effect(this, this.make);
}

function resourceToUsageKey(resource: keyof ResourceLimits): keyof SandboxResourceUsage {
  switch (resource) {
    case "memoryMB":
      return "memoryUsed";
    case "cpuTimeMs":
      return "cpuTimeMs";
    case "networkRequests":
      return "networkRequests";
    case "diskIOBytes":
      return "diskIOBytes";
    case "allowedDomains":
      return "networkRequests";
  }
}
