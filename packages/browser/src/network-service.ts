import { Effect, Layer, Schema, ServiceMap } from "effect";

export class NetworkRequest extends Schema.Class<NetworkRequest>("NetworkRequest")({
  url: Schema.String,
  method: Schema.String,
  status: Schema.Number,
  type: Schema.String,
  duration: Schema.Number,
  size: Schema.Number,
}) {}

export class NetworkMonitor extends ServiceMap.Service<NetworkMonitor, {
  readonly start: () => Effect.Effect<void>;
  readonly stop: () => Effect.Effect<readonly NetworkRequest[]>;
  readonly getRequests: () => Effect.Effect<readonly NetworkRequest[]>;
  readonly getErrors: () => Effect.Effect<readonly string[]>;
  readonly waitForIdle: (timeoutMs?: number) => Effect.Effect<void>;
  readonly blockUrls: (patterns: readonly string[]) => Effect.Effect<void>;
}>()("@inspect/NetworkMonitor") {
  static layer = Layer.effect(this,
    Effect.gen(function* () {
      const requests: NetworkRequest[] = [];
      const errors: string[] = [];

      const start = () => Effect.gen(function* () {
        requests.length = 0;
        errors.length = 0;
        yield* Effect.logDebug("Network monitoring started");
      });

      const stop = () => Effect.gen(function* () {
        yield* Effect.logDebug("Network monitoring stopped", { requestCount: requests.length });
        return [...requests] as const;
      });

      const getRequests = () => Effect.sync(() => [...requests] as const);
      const getErrors = () => Effect.sync(() => [...errors] as const);

      const waitForIdle = (timeoutMs?: number) => Effect.gen(function* () {
        yield* Effect.logDebug("Waiting for network idle", { timeoutMs });
      });

      const blockUrls = (patterns: readonly string[]) => Effect.gen(function* () {
        yield* Effect.logDebug("URL blocking configured", { patternCount: patterns.length });
      });

      return { start, stop, getRequests, getErrors, waitForIdle, blockUrls } as const;
    }),
  );
}
