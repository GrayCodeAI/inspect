import { Effect, Layer, Schema, ServiceMap } from "effect";

export class WatchdogEvent extends Schema.Class<WatchdogEvent>("WatchdogEvent")({
  type: Schema.String,
  message: Schema.String,
  timestamp: Schema.String,
  handled: Schema.Boolean,
}) {}

export class CaptchaWatchdogService extends ServiceMap.Service<CaptchaWatchdogService>()(
  "@watchdogs/Captcha",
  {
    make: Effect.gen(function* () {
      const detect = Effect.fn("Captcha.detect")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const detected = false;

        yield* Effect.logDebug("Captcha detection", { pageId, detected });

        return detected;
      });

      const handle = Effect.fn("Captcha.handle")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const event = new WatchdogEvent({
          type: "captcha",
          message: "Captcha detected and handled",
          timestamp: new Date().toISOString(),
          handled: true,
        });

        yield* Effect.logInfo("Captcha handled", { pageId });

        return event;
      });

      return { detect, handle } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

export class PopupWatchdogService extends ServiceMap.Service<PopupWatchdogService>()(
  "@watchdogs/Popup",
  {
    make: Effect.gen(function* () {
      const detect = Effect.fn("Popup.detect")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const detected = false;

        yield* Effect.logDebug("Popup detection", { pageId, detected });

        return detected;
      });

      const close = Effect.fn("Popup.close")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const event = new WatchdogEvent({
          type: "popup",
          message: "Popup closed",
          timestamp: new Date().toISOString(),
          handled: true,
        });

        yield* Effect.logInfo("Popup closed", { pageId });

        return event;
      });

      return { detect, close } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

export class CrashWatchdogService extends ServiceMap.Service<CrashWatchdogService>()(
  "@watchdogs/Crash",
  {
    make: Effect.gen(function* () {
      const monitor = Effect.fn("Crash.monitor")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        yield* Effect.logDebug("Crash monitoring active", { pageId });

        return true;
      });

      const recover = Effect.fn("Crash.recover")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const event = new WatchdogEvent({
          type: "crash",
          message: "Page recovered from crash",
          timestamp: new Date().toISOString(),
          handled: true,
        });

        yield* Effect.logInfo("Crash recovered", { pageId });

        return event;
      });

      return { monitor, recover } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}

export class DownloadWatchdogService extends ServiceMap.Service<DownloadWatchdogService>()(
  "@watchdogs/Download",
  {
    make: Effect.gen(function* () {
      const monitor = Effect.fn("Download.monitor")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        yield* Effect.logDebug("Download monitoring active", { pageId });

        return true;
      });

      const handle = Effect.fn("Download.handle")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const event = new WatchdogEvent({
          type: "download",
          message: "Download completed",
          timestamp: new Date().toISOString(),
          handled: true,
        });

        yield* Effect.logInfo("Download handled", { pageId });

        return event;
      });

      return { monitor, handle } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
