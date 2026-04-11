import { Effect, Layer, Schema, ServiceMap } from "effect";
import { DocumentLoadError } from "./errors.js";

export interface Document {
  readonly id: string;
  readonly content: string;
  readonly metadata: Record<string, string>;
  readonly source: string;
}

export type DocumentSource =
  | { readonly _tag: "File"; readonly path: string }
  | { readonly _tag: "Url"; readonly url: string }
  | { readonly _tag: "Raw"; readonly content: string; readonly metadata: Record<string, string> };

export class DocumentLoader extends ServiceMap.Service<DocumentLoader>()(
  "@rag/DocumentLoader",
  {
    make: Effect.gen(function* () {
      const loadFromFile = Effect.fn("DocumentLoader.loadFromFile")(
        function* (path: string) {
          return yield* Effect.tryPromise({
            try: async () => import("node:fs/promises").then((fs) => fs.readFile(path, "utf-8")),
            catch: (cause: unknown) => new DocumentLoadError({ source: path, cause }),
          }).pipe(
            Effect.map((content: string) => ({
              id: `file:${path}`,
              content,
              metadata: { path },
              source: path,
            })),
          );
        },
      );

      const loadFromUrl = Effect.fn("DocumentLoader.loadFromUrl")(function* (_url: string) {
        return yield* new DocumentLoadError({
          source: _url,
          cause: "HTTP loading not yet configured",
        });
      });

      const loadRaw = Effect.fn("DocumentLoader.loadRaw")(
        function* (content: string, metadata: Record<string, string>, id: string) {
          return {
            id,
            content,
            metadata,
            source: "raw",
          } as const satisfies Document;
        },
      );

      const load = Effect.fn("DocumentLoader.load")(function* (source: DocumentSource) {
        switch (source._tag) {
          case "File":
            return yield* loadFromFile(source.path);
          case "Url":
            return yield* loadFromUrl(source.url);
          case "Raw":
            return yield* loadRaw(source.content, source.metadata, source.metadata.id ?? "raw");
        }
      });

      const loadMany = Effect.fn("DocumentLoader.loadMany")(
        function* (sources: ReadonlyArray<DocumentSource>) {
          return yield* Effect.forEach(sources, (source: DocumentSource) => load(source), {
            concurrency: "unbounded",
          });
        },
      );

      return { load, loadMany, loadFromFile, loadFromUrl, loadRaw } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
