import type { Page } from "playwright";
import type { eventWithTime } from "@rrweb/types";
import { Effect, Predicate } from "effect";
import { FileSystem } from "effect/FileSystem";
import { RecorderInjectionError, SessionLoadError } from "./errors.js";
import type { CollectResult } from "./types.js";

const evaluateRuntime = (page: Page, fnName: string): Effect.Effect<unknown, RecorderInjectionError> =>
  Effect.tryPromise({
    try: () => page.evaluate(`typeof ${fnName} === 'function' ? ${fnName}() : null`),
    catch: (cause) => new RecorderInjectionError({ cause: String(cause) }),
  });

export const collectEvents = Effect.fn("Recorder.collectEvents")(function* (page: Page) {
  const events = yield* evaluateRuntime(page, "getEvents").pipe(
    Effect.catchCause((cause) => new RecorderInjectionError({ cause: String(cause) }).asEffect()),
  );
  const total = yield* evaluateRuntime(page, "getEventCount").pipe(
    Effect.catchCause((cause) => new RecorderInjectionError({ cause: String(cause) }).asEffect()),
  );
  return { events, total: total + events.length } satisfies CollectResult;
});

export const collectAllEvents = Effect.fn("Recorder.collectAllEvents")(function* (page: Page) {
  return yield* evaluateRuntime(page, "getAllEvents").pipe(
    Effect.catchCause((cause) => new RecorderInjectionError({ cause: String(cause) }).asEffect()),
  );
});

const isRrwebEvent = (value: unknown): value is eventWithTime =>
  Predicate.isObject(value) && "type" in value && "timestamp" in value;

export const loadSession = Effect.fn("Recorder.loadSession")(function* (sessionPath: string) {
  const fileSystem = yield* FileSystem;
  const content = yield* fileSystem
    .readFileString(sessionPath)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        new SessionLoadError({ path: sessionPath, cause: String(error) }).asEffect(),
      ),
    );

  const lines = content.trim().split("\n");
  const events = yield* Effect.forEach(lines, (line, index) =>
    Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(line);
        if (!isRrwebEvent(parsed)) {
          throw new Error("Missing required 'type' and 'timestamp' fields");
        }
        return parsed;
      },
      catch: (cause) =>
        new SessionLoadError({
          path: sessionPath,
          cause: `Invalid rrweb event at line ${index + 1}: ${String(cause)}`,
        }),
    }),
  );

  return events;
});

export class SessionRecorder {
  constructor(private page: Page) {}

  async inject(): Promise<void> {
    await this.page.addScriptTag({
      content: `
        window.__rrwebEvents__ = [];
        window.__rrwebMaxEvents__ = 100000;
      `,
    });
  }

  async start(): Promise<void> {
    await this.page.evaluate(() => {
      if (typeof rrweb !== "undefined") {
        rrweb.record({
          emit(event) {
            if (window.__rrwebEvents__.length < window.__rrwebMaxEvents__) {
              window.__rrwebEvents__.push(event);
            }
          },
          checkoutEveryNms: 60000,
        });
      }
    });
  }

  async getEvents(): Promise<eventWithTime[]> {
    return this.page.evaluate(() => window.__rrwebEvents__ || []);
  }

  async stop(): Promise<eventWithTime[]> {
    return this.getEvents();
  }
}
