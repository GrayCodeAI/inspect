import { Effect, Layer, Schema, ServiceMap } from "effect";

export class Screenshot extends Schema.Class<Screenshot>("Screenshot")({
  data: Schema.String,
  timestamp: Schema.String,
  url: Schema.String,
}) {}

export class VisionService extends ServiceMap.Service<VisionService>()("@browser/Vision", {
  make: Effect.gen(function* () {
    const captureScreenshot = Effect.fn("Vision.captureScreenshot")(function* (pageId: string) {
      yield* Effect.annotateCurrentSpan({ pageId });

      const screenshot = new Screenshot({
        data: "base64-encoded-data",
        timestamp: new Date().toISOString(),
        url: "current-url",
      });

      yield* Effect.logDebug("Screenshot captured", { url: screenshot.url });

      return screenshot;
    });

    const captureAnnotated = Effect.fn("Vision.captureAnnotated")(function* (pageId: string) {
      yield* Effect.annotateCurrentSpan({ pageId });

      const screenshot = new Screenshot({
        data: "annotated-base64-data",
        timestamp: new Date().toISOString(),
        url: "current-url",
      });

      yield* Effect.logDebug("Annotated screenshot captured", { url: screenshot.url });

      return screenshot;
    });

    const detectElements = Effect.fn("Vision.detectElements")(function* (_screenshot: Screenshot) {
      yield* Effect.annotateCurrentSpan({ action: "detectElements" });

      const elements = ["button", "input", "link"];

      yield* Effect.logDebug("Elements detected", { count: elements.length });

      return elements;
    });

    return { captureScreenshot, captureAnnotated, detectElements } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
