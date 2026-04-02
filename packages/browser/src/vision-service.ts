import { Effect, Layer, ServiceMap } from "effect";

export class VisionService extends ServiceMap.Service<VisionService, {
  readonly captureScreenshot: (options?: { fullPage?: boolean }) => Effect.Effect<string>;
  readonly captureAnnotated: () => Effect.Effect<string>;
  readonly detectElements: () => Effect.Effect<readonly unknown[]>;
  readonly detectCaptcha: () => Effect.Effect<boolean>;
  readonly detectPopup: () => Effect.Effect<boolean>;
  readonly detectOverlay: () => Effect.Effect<boolean>;
  readonly visualDiff: (before: string, after: string) => Effect.Effect<number>;
}>()("@inspect/VisionService") {
  static layer = Layer.effect(this, 
    Effect.gen(function* () {
      const captureScreenshot = Effect.fn("VisionService.captureScreenshot")(function* (options?: { fullPage?: boolean }) {
        yield* Effect.annotateCurrentSpan({ fullPage: options?.fullPage });
        return "";
      });
      const captureAnnotated = Effect.fn("VisionService.captureAnnotated")(function* () {
        return "";
      });
      const detectElements = Effect.fn("VisionService.detectElements")(function* () {
        return [] as const;
      });
      const detectCaptcha = Effect.fn("VisionService.detectCaptcha")(function* () {
        return false;
      });
      const detectPopup = Effect.fn("VisionService.detectPopup")(function* () {
        return false;
      });
      const detectOverlay = Effect.fn("VisionService.detectOverlay")(function* () {
        return false;
      });
      const visualDiff = Effect.fn("VisionService.visualDiff")(function* (before: string, after: string) {
        yield* Effect.annotateCurrentSpan({ before, after });
        return 0;
      });
      return { captureScreenshot, captureAnnotated, detectElements, detectCaptcha, detectPopup, detectOverlay, visualDiff } as const;
    }),
  );
}
