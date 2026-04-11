import { Effect, Layer, Option, Schema, ServiceMap } from "effect";

// ─────────────────────────────────────────────────────────────────────────────
// ClockService — Playwright-style time manipulation for testing
//
// Provides pause/resume/setSystemTime APIs that map to Playwright's clock
// manipulation capabilities, enabling deterministic testing of time-dependent
// behavior (deadlines, animations, sessions, timeouts).
//
// API:
//   - install(): Initialize clock manipulation
//   - pause(): Freeze time in the page context
//   - resume(): Resume normal time flow
//   - setSystemTime(ms | Date): Jump to a specific timestamp
//   - fastForward(ms): Advance time by a specified amount
//   - restore(): Restore real-time clock
// ─────────────────────────────────────────────────────────────────────────────

export class ClockError extends Schema.ErrorClass<ClockError>("ClockError")({
  _tag: Schema.tag("ClockError"),
  reason: Schema.String,
}) {
  get message() {
    return this.reason;
  }
}

export class ClockNotInstalledError extends Schema.ErrorClass<ClockNotInstalledError>(
  "ClockNotInstalledError",
)({
  _tag: Schema.tag("ClockNotInstalledError"),
}) {
  message = "Clock is not installed. Call clock.install() before using clock methods.";
}

export interface ClockState {
  readonly installed: boolean;
  readonly paused: boolean;
  readonly currentTime: Option.Option<number>;
}

export class ClockService extends ServiceMap.Service<
  ClockService,
  {
    readonly install: () => Effect.Effect<void, ClockError>;
    readonly pause: () => Effect.Effect<void, ClockError | ClockNotInstalledError>;
    readonly resume: () => Effect.Effect<void, ClockError | ClockNotInstalledError>;
    readonly setSystemTime: (
      time: number | Date,
    ) => Effect.Effect<void, ClockError | ClockNotInstalledError>;
    readonly fastForward: (
      ms: number,
    ) => Effect.Effect<void, ClockError | ClockNotInstalledError>;
    readonly restore: () => Effect.Effect<void, ClockError | ClockNotInstalledError>;
    readonly getState: () => Effect.Effect<ClockState>;
  }
>()("@inspect/ClockService") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      let installed = false;
      let paused = false;
      let currentTime: Option.Option<number> = Option.none();

      const install = () =>
        Effect.gen(function* () {
          installed = true;
          yield* Effect.logDebug("Clock installed");
        });

      const pause = () =>
        Effect.gen(function* () {
          if (!installed) {
            return yield* new ClockNotInstalledError();
          }
          paused = true;
          yield* Effect.logDebug("Clock paused");
        });

      const resume = () =>
        Effect.gen(function* () {
          if (!installed) {
            return yield* new ClockNotInstalledError();
          }
          paused = false;
          yield* Effect.logDebug("Clock resumed");
        });

      const setSystemTime = (time: number | Date) =>
        Effect.gen(function* () {
          if (!installed) {
            return yield* new ClockNotInstalledError();
          }
          const timestamp = time instanceof Date ? time.getTime() : time;
          currentTime = Option.some(timestamp);
          yield* Effect.logDebug("System time set", { timestamp, iso: new Date(timestamp).toISOString() });
        });

      const fastForward = (ms: number) =>
        Effect.gen(function* () {
          if (!installed) {
            return yield* new ClockNotInstalledError();
          }
          const current = Option.getOrElse(currentTime, () => Date.now());
          const newTime = current + ms;
          currentTime = Option.some(newTime);
          yield* Effect.logDebug("Time fast-forwarded", { ms, newTimestamp: newTime });
        });

      const restore = () =>
        Effect.gen(function* () {
          if (!installed) {
            return yield* new ClockNotInstalledError();
          }
          paused = false;
          currentTime = Option.none();
          yield* Effect.logDebug("Clock restored to real time");
        });

      const getState = () =>
        Effect.sync(
          (): ClockState => ({
            installed,
            paused,
            currentTime,
          }),
        );

      return { install, pause, resume, setSystemTime, fastForward, restore, getState } as const;
    }),
  );

  /**
   * Playwright-integrated layer — uses page.clock() API for real time manipulation.
   * Requires a Playwright Page to be available in the Effect context.
   */
  static playwrightLayer = (
    getPage: Effect.Effect<{ clock: PlaywrightClock }, never, never>,
  ) =>
    Layer.effect(
      this,
      Effect.gen(function* () {
        const page = yield* getPage;

        const install = () =>
          Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => page.clock.install(),
              catch: (cause) =>
                new ClockError({
                  reason: `Failed to install clock: ${String(cause)}`,
                }),
            });
            yield* Effect.logDebug("Playwright clock installed");
          });

        const pause = () =>
          Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => page.clock.pause(),
              catch: (cause) =>
                new ClockError({
                  reason: `Failed to pause clock: ${String(cause)}`,
                }),
            });
            yield* Effect.logDebug("Playwright clock paused");
          });

        const resume = () =>
          Effect.gen(function* () {
            yield* install();
            yield* Effect.logDebug("Playwright clock resumed (re-installed)");
          });

        const setSystemTime = (time: number | Date) =>
          Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => page.clock.setSystemTime(time),
              catch: (cause) =>
                new ClockError({
                  reason: `Failed to set system time: ${String(cause)}`,
                }),
            });
            yield* Effect.logDebug("Playwright system time set", { time });
          });

        const fastForward = (ms: number) =>
          Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => page.clock.fastForward(ms),
              catch: (cause) =>
                new ClockError({
                  reason: `Failed to fast-forward clock: ${String(cause)}`,
                }),
            });
            yield* Effect.logDebug("Playwright time fast-forwarded", { ms });
          });

        const restore = () =>
          Effect.gen(function* () {
            yield* Effect.tryPromise({
              try: () => page.clock.restore(),
              catch: (cause) =>
                new ClockError({
                  reason: `Failed to restore clock: ${String(cause)}`,
                }),
            });
            yield* Effect.logDebug("Playwright clock restored to real time");
          });

        const getState = () =>
          Effect.sync((): ClockState => ({
            installed: true,
            paused: false,
            currentTime: Option.none(),
          }));

        return { install, pause, resume, setSystemTime, fastForward, restore, getState } as const;
      }),
    );
}

interface PlaywrightClock {
  install(): Promise<void>;
  pause(): Promise<void>;
  setSystemTime(time: number | Date): Promise<void>;
  fastForward(ticks: number | string): Promise<void>;
  restore(): Promise<void>;
}
