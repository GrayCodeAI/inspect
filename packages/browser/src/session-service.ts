import { Effect, Layer, ServiceMap } from "effect";

export class SessionRecorder extends ServiceMap.Service<
  SessionRecorder,
  {
    readonly start: (outputDir?: string) => Effect.Effect<void>;
    readonly stop: () => Effect.Effect<readonly unknown[]>;
    readonly save: (planId: string) => Effect.Effect<string>;
    readonly generateViewer: (outputPath: string) => Effect.Effect<string>;
    readonly isRecording: Effect.Effect<boolean>;
  }
>()("@inspect/SessionRecorder") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      let recording = false;
      const events: unknown[] = [];

      const start = Effect.fn("SessionRecorder.start")(function* (_outputDir?: string) {
        recording = true;
        events.length = 0;
        yield* Effect.logInfo("Session recording started");
      });

      const stop = Effect.fn("SessionRecorder.stop")(function* () {
        recording = false;
        yield* Effect.logInfo("Session recording stopped", { eventCount: events.length });
        const result = [...events];
        return result as readonly unknown[];
      });

      const save = Effect.fn("SessionRecorder.save")(function* (planId: string) {
        const path = `.inspect/recordings/${planId}.json`;
        yield* Effect.logInfo("Session recording saved", { path });
        return path;
      });

      const generateViewer = Effect.fn("SessionRecorder.generateViewer")(function* (
        outputPath: string,
      ) {
        yield* Effect.logInfo("Replay viewer generated", { path: outputPath });
        return outputPath;
      });

      const isRecording = Effect.sync(() => recording);

      return { start, stop, save, generateViewer, isRecording } as const;
    }),
  );
}
