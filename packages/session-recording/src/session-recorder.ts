import { Effect, Layer, ServiceMap, Schema } from "effect";
import * as RecError from "./errors.js";

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
  maxDuration: 5 * 60 * 1000,
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

const RRWEB_CDN = "https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.18/dist/rrweb-all.min.js";

export interface RRWebEvent {
  readonly type: number;
  readonly data: unknown;
  readonly timestamp: number;
  readonly delay?: number;
}

export interface RecordingSession {
  readonly sessionId: string;
  readonly startTime: number;
  readonly events: RRWebEvent[];
  readonly stop: () => void;
}

interface PageLike {
  addScriptTag(options: { url: string }): Promise<void>;
  evaluate<R>(pageFunction: string | (() => R | Promise<R>)): Promise<R>;
  evaluate<R, Arg>(pageFunction: string | ((arg: Arg) => R | Promise<R>), arg: Arg): Promise<R>;
}

export class SessionRecorder extends ServiceMap.Service<SessionRecorder>()(
  "@inspect/session-recording/SessionRecorder",
  {
    make: Effect.gen(function* () {
      const recordings = new Map<string, RecordingSession>();

      const start = (page: PageLike, sessionId: string, config: Partial<RecordingConfig> = {}) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ sessionId });

          if (recordings.has(sessionId)) {
            return yield* new RecError.RecordingAlreadyActiveError({ sessionId });
          }

          const mergedConfig = { ...defaultRecordingConfig, ...config };
          const events: RRWebEvent[] = [];

          yield* Effect.tryPromise({
            try: () => page.addScriptTag({ url: RRWEB_CDN }),
            catch: (cause) => new RecError.RrwebLoadError({ cause }),
          });

          yield* Effect.tryPromise({
            try: () =>
              page.evaluate(
                `(function(cfg) {
                  var w = window;
                  w.__inspect_rrweb_events = [];
                  w.__inspect_rrweb_stop = null;
                  if (!w.rrweb) {
                    throw new Error("rrweb failed to load");
                  }
                  w.__inspect_rrweb_stop = w.rrweb.record({
                    emit: function(event) {
                      w.__inspect_rrweb_events.push(event);
                    },
                    sampling: cfg.sampling,
                    blockClass: cfg.blockClass,
                    ignoreClass: cfg.ignoreClass,
                    maskTextClass: cfg.maskTextClass,
                    maskAllInputs: cfg.maskAllInputs,
                    maskInputOptions: cfg.maskInputOptions,
                    recordCrossOriginIframes: true,
                  });
                  if (!w.__inspect_rrweb_stop) {
                    throw new Error("rrweb.record returned undefined");
                  }
                })`,
                mergedConfig,
              ),
            catch: (cause) => new RecError.RecordingStartError({ sessionId, cause }),
          });

          const session: RecordingSession = {
            sessionId,
            startTime: Date.now(),
            events,
            stop: () => {
              void page
                .evaluate(
                  `(function() {
                  var w = window;
                  if (w.__inspect_rrweb_stop) {
                    w.__inspect_rrweb_stop();
                    w.__inspect_rrweb_stop = null;
                  }
                })`,
                )
                .catch(() => {});
            },
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
            return yield* new RecError.RecordingNotFoundError({ sessionId });
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
            return yield* new RecError.RecordingNotFoundError({ sessionId });
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
            return yield* new RecError.RecordingNotFoundError({ sessionId });
          }

          const eventsJson = JSON.stringify(session.events);
          /* eslint-disable no-useless-escape */
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
  <script src="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/index.js"><\/script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@2.0.0-alpha.18/dist/style.css">
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
  <\/script>
</body>
</html>`;
          /* eslint-enable no-useless-escape */

          yield* Effect.tryPromise({
            try: async () => {
              const fs = await import("node:fs/promises");
              await fs.writeFile(outputPath, html, "utf-8");
            },
            catch: (cause) => new RecError.ReplayExportError({ sessionId, cause }),
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
