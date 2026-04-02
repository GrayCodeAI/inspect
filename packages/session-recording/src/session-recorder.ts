/* eslint-disable require-yield */
import { Effect, Layer, ServiceMap, Schema } from "effect";
import * as Error from "./errors.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RRWebEvent = any;

export const RecordingConfig = Schema.Struct({
  maxDuration: Schema.Number,
  maxEvents: Schema.Number,
  blockClass: Schema.String,
  ignoreClass: Schema.String,
  maskTextClass: Schema.String,
  maskAllInputs: Schema.Boolean,
  maskInputOptions: Schema.Unknown,
  sampling: Schema.Unknown,
});

export type RecordingConfig = typeof RecordingConfig.Type;

export const defaultRecordingConfig: RecordingConfig = {
  maxDuration: 5 * 60 * 1000, // 5 minutes
  maxEvents: 10000,
  blockClass: "rr-block",
  ignoreClass: "rr-ignore",
  maskTextClass: "rr-mask",
  maskAllInputs: true,
  maskInputOptions: {
    password: true,
    creditCard: true,
    email: true,
  },
  sampling: {
    scroll: 100,
    mousemove: 50,
    mouseInteraction: true,
  },
};

export interface RecordingSession {
  readonly sessionId: string;
  readonly startTime: number;
  readonly events: RRWebEvent[];
  readonly stop: () => void;
}

export class SessionRecorder extends ServiceMap.Service<SessionRecorder>()(
  "@inspect/session-recording/SessionRecorder",
  {
    make: Effect.gen(function* () {
      const recordings = new Map<string, RecordingSession>();

      const start = (sessionId: string, config: Partial<RecordingConfig> = {}) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });

          if (recordings.has(sessionId)) {
            return yield* new Error.RecordingAlreadyActiveError({ sessionId });
          }

          const mergedConfig = { ...defaultRecordingConfig, ...config };
          const events: RRWebEvent[] = [];

          const rrweb = yield* Effect.tryPromise({
            try: () => import("rrweb"),
            catch: (cause) => new Error.RrwebLoadError({ cause }),
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stopFn = (rrweb as any).record({
            emit: (event: RRWebEvent) => {
              events.push(event);
              if (events.length >= mergedConfig.maxEvents) {
                stopFn?.();
              }
            },
            sampling: mergedConfig.sampling,
            blockClass: mergedConfig.blockClass,
            ignoreClass: mergedConfig.ignoreClass,
            maskTextClass: mergedConfig.maskTextClass,
            maskAllInputs: mergedConfig.maskAllInputs,
            maskInputOptions: mergedConfig.maskInputOptions,
          });

          if (!stopFn) {
            return yield* new Error.RecordingStartError({
              sessionId,
              cause: "rrweb.record returned undefined",
            });
          }

          const session: RecordingSession = {
            sessionId,
            startTime: Date.now(),
            events,
            stop: stopFn as () => void,
          };

          recordings.set(sessionId, session);

          yield* Effect.logInfo("Session recording started", {
            sessionId,
            maxEvents: mergedConfig.maxEvents,
          });

          return session;
        }).pipe(Effect.withSpan("SessionRecorder.start"));

      const stop = (sessionId: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });

          const session = recordings.get(sessionId);
          if (!session) {
            return yield* new Error.RecordingNotFoundError({ sessionId });
          }

          session.stop();
          recordings.delete(sessionId);

          yield* Effect.logInfo("Session recording stopped", {
            sessionId,
            eventCount: session.events.length,
            duration: Date.now() - session.startTime,
          });

          return session;
        }).pipe(Effect.withSpan("SessionRecorder.stop"));

      const getEvents = (sessionId: string) =>
        Effect.gen(function* () {
          const session = recordings.get(sessionId);
          if (!session) {
            return yield* new Error.RecordingNotFoundError({ sessionId });
          }
          return session.events;
        }).pipe(Effect.withSpan("SessionRecorder.getEvents"));

      const isActive = (sessionId: string) => recordings.has(sessionId);

      const getActiveSessions = () => Array.from(recordings.keys());

      const clear = (sessionId: string) =>
        Effect.gen(function* () {
          const session = recordings.get(sessionId);
          if (session) {
            session.stop();
            recordings.delete(sessionId);
          }
          yield* Effect.logInfo("Session recording cleared", { sessionId });
        }).pipe(Effect.withSpan("SessionRecorder.clear"));

      const exportToHtml = (sessionId: string, outputPath: string) =>
        Effect.gen(function* () {
          const session = recordings.get(sessionId);
          if (!session) {
            return yield* new Error.RecordingNotFoundError({ sessionId });
          }

          const eventsJson = JSON.stringify(session.events);
          const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Session Replay - ${sessionId}</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #replay-container { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="replay-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css">
  <script>
    const events = ${eventsJson};
    new rrwebPlayer({
      target: document.getElementById('replay-container'),
      props: {
        events,
        width: window.innerWidth,
        height: window.innerHeight,
      }
    });
  </script>
</body>
</html>`;

          yield* Effect.tryPromise({
            try: async () => {
              const fs = await import("node:fs/promises");
              await fs.writeFile(outputPath, html, "utf-8");
            },
            catch: (cause) => new Error.ReplayExportError({ sessionId, cause }),
          });

          yield* Effect.logInfo("Session replay exported", { sessionId, outputPath });

          return outputPath;
        }).pipe(Effect.withSpan("SessionRecorder.exportToHtml"));

      return {
        start,
        stop,
        getEvents,
        isActive,
        getActiveSessions,
        clear,
        exportToHtml,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
