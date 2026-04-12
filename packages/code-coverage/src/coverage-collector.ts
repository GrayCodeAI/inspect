import { Effect, Layer, ServiceMap } from "effect";
import { CoverageCollectionError } from "./errors.js";

export interface CoverageRange {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly count: number;
}

export interface FunctionCoverage {
  readonly functionName: string;
  readonly ranges: ReadonlyArray<CoverageRange>;
  readonly isBlockCoverage: boolean;
}

export interface ScriptCoverage {
  readonly scriptId: string;
  readonly url: string;
  readonly functions: ReadonlyArray<FunctionCoverage>;
}

export type RawCoverageData = ReadonlyArray<ScriptCoverage>;

export interface CoverageCollector {
  readonly enable: (sessionId: string) => Effect.Effect<void, CoverageCollectionError>;
  readonly takePreciseCoverage: (
    sessionId: string,
  ) => Effect.Effect<RawCoverageData, CoverageCollectionError>;
  readonly stopPreciseCoverage: (sessionId: string) => Effect.Effect<void, CoverageCollectionError>;
  readonly collectAndStop: (
    sessionId: string,
  ) => Effect.Effect<RawCoverageData, CoverageCollectionError>;
}

export class CoverageCollectorService extends ServiceMap.Service<CoverageCollectorService>()(
  "@code-coverage/CoverageCollector",
  {
    make: Effect.gen(function* () {
      const sendCdpCommand = <T>(
        sessionId: string,
        method: string,
        params: Record<string, unknown> = {},
      ): Effect.Effect<T, CoverageCollectionError> =>
        Effect.tryPromise({
          try: async () => {
            const response = await fetch(`http://localhost:9222/json/exec?sessionId=${sessionId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ method, params }),
            });
            if (!response.ok) {
              throw new Error(`CDP command ${method} failed: ${response.statusText}`);
            }
            return (await response.json()) as T;
          },
          catch: (cause) =>
            new CoverageCollectionError({
              reason: `CDP command ${method} failed`,
              targetId: sessionId,
              cause: String(cause),
            }),
        });

      const enable = (sessionId: string): Effect.Effect<void, CoverageCollectionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });
          yield* sendCdpCommand<void>(sessionId, "Profiler.enable");
          yield* sendCdpCommand<void>(sessionId, "Profiler.startPreciseCoverage", {
            callCount: true,
            detailed: true,
          });
          yield* Effect.logDebug("Coverage collection enabled", { sessionId });
        }).pipe(Effect.withSpan("CoverageCollector.enable"));

      const takePreciseCoverage = (
        sessionId: string,
      ): Effect.Effect<RawCoverageData, CoverageCollectionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });
          const result = yield* sendCdpCommand<{
            result: ReadonlyArray<{
              scriptId: string;
              url: string;
              functions: ReadonlyArray<FunctionCoverage>;
            }>;
          }>(sessionId, "Profiler.takePreciseCoverage");
          yield* Effect.logDebug("Precise coverage data collected", {
            sessionId,
            scriptCount: result.result.length,
          });
          return result.result;
        }).pipe(Effect.withSpan("CoverageCollector.takePreciseCoverage"));

      const stopPreciseCoverage = (
        sessionId: string,
      ): Effect.Effect<void, CoverageCollectionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });
          yield* sendCdpCommand<void>(sessionId, "Profiler.stopPreciseCoverage");
          yield* sendCdpCommand<void>(sessionId, "Profiler.disable");
          yield* Effect.logDebug("Coverage collection stopped", { sessionId });
        }).pipe(Effect.withSpan("CoverageCollector.stopPreciseCoverage"));

      const collectAndStop = (
        sessionId: string,
      ): Effect.Effect<RawCoverageData, CoverageCollectionError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });
          const coverage = yield* takePreciseCoverage(sessionId);
          yield* stopPreciseCoverage(sessionId);
          return coverage;
        }).pipe(Effect.withSpan("CoverageCollector.collectAndStop"));

      return {
        enable,
        takePreciseCoverage,
        stopPreciseCoverage,
        collectAndStop,
      } as const satisfies CoverageCollector;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
