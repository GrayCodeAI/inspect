import { Effect, Layer, Schema, ServiceMap } from "effect";

export class DOMAttribute extends Schema.Class<DOMAttribute>("DOMAttribute")({
  name: Schema.String,
  value: Schema.String,
}) {}

export class DOMNode extends Schema.Class<DOMNode>("DOMNode")({
  id: Schema.String,
  tagName: Schema.String,
  attributes: Schema.Array(DOMAttribute),
  children: Schema.Array(Schema.Any),
  textContent: Schema.optional(Schema.String),
}) {}

export class DOMTree extends Schema.Class<DOMTree>("DOMTree")({
  root: DOMNode,
  url: Schema.String,
  title: Schema.String,
  timestamp: Schema.String,
}) {}

export class BrowserDOMService extends ServiceMap.Service<BrowserDOMService>()(
  "@browser/DOMService",
  {
    make: Effect.gen(function* () {
      const collect = Effect.fn("DOMService.collect")(function* (pageId: string) {
        yield* Effect.annotateCurrentSpan({ pageId });

        const tree = new DOMTree({
          root: new DOMNode({
            id: "root",
            tagName: "html",
            attributes: [],
            children: [],
          }),
          url: "",
          title: "",
          timestamp: new Date().toISOString(),
        });

        yield* Effect.logDebug("DOM tree collected", { pageId });

        return tree;
      });

      const getHash = Effect.fn("DOMService.getHash")(function* (tree: DOMTree) {
        yield* Effect.annotateCurrentSpan({ action: "getHash" });

        const hash = `hash-${JSON.stringify(tree).length}`;

        yield* Effect.logDebug("DOM hash calculated", { hash });

        return hash;
      });

      const serialize = Effect.fn("DOMService.serialize")(function* (tree: DOMTree) {
        yield* Effect.annotateCurrentSpan({ action: "serialize" });

        const serialized = JSON.stringify(tree);

        yield* Effect.logDebug("DOM serialized", { length: serialized.length });

        return serialized;
      });

      const deserialize = Effect.fn("DOMService.deserialize")(function* (_data: string) {
        yield* Effect.annotateCurrentSpan({ action: "deserialize" });

        const tree = new DOMTree({
          root: new DOMNode({
            id: "root",
            tagName: "html",
            attributes: [],
            children: [],
          }),
          url: "",
          title: "",
          timestamp: new Date().toISOString(),
        });

        return tree;
      });

      return { collect, getHash, serialize, deserialize } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
