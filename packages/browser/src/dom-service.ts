import { Effect, Layer, Schema, ServiceMap } from "effect";

export class AriaNode extends Schema.Class<AriaNode>("AriaNode")({
  role: Schema.String,
  name: Schema.String,
  value: Schema.optional(Schema.String),
  children: Schema.Array(Schema.Unknown),
  ref: Schema.String,
}) {}

export class DOMSnapshot extends Schema.Class<DOMSnapshot>("DOMSnapshot")({
  url: Schema.String,
  title: Schema.String,
  ariaTree: AriaNode,
  timestamp: Schema.Number,
}) {}

export class DOMCapture extends ServiceMap.Service<
  DOMCapture,
  {
    readonly capture: () => Effect.Effect<DOMSnapshot>;
    readonly captureAria: () => Effect.Effect<AriaNode>;
    readonly captureHybrid: () => Effect.Effect<DOMSnapshot>;
    readonly waitForStable: (timeoutMs?: number) => Effect.Effect<void>;
  }
>()("@inspect/DOMCapture") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const capture = () =>
        Effect.gen(function* () {
          return new DOMSnapshot({
            url: "",
            title: "",
            ariaTree: new AriaNode({ role: "root", name: "", children: [], ref: "root" }),
            timestamp: Date.now(),
          });
        });

      const captureAria = () =>
        Effect.gen(function* () {
          return new AriaNode({ role: "root", name: "", children: [], ref: "root" });
        });

      const captureHybrid = () =>
        Effect.gen(function* () {
          return new DOMSnapshot({
            url: "",
            title: "",
            ariaTree: new AriaNode({ role: "root", name: "", children: [], ref: "root" }),
            timestamp: Date.now(),
          });
        });

      const waitForStable = (timeoutMs?: number) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Waiting for DOM stability", { timeoutMs });
        });

      return { capture, captureAria, captureHybrid, waitForStable } as const;
    }),
  );
}
