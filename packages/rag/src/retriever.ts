import { Config, ConfigProvider, Effect, Layer, ServiceMap } from "effect";
import { RetrievalError } from "./errors.js";
import { Embeddings } from "./embeddings.js";
import { VectorStore } from "./vector-store.js";
import type { SearchResult } from "./vector-store.js";

const retrievalConfig = Config.all({
  topK: Config.withDefault(Config.int("RETRIEVAL_TOP_K"), 5),
  minScore: Config.withDefault(Config.number("RETRIEVAL_MIN_SCORE"), 0),
});

export class Retriever extends ServiceMap.Service<Retriever>()("@rag/Retriever", {
  make: Effect.gen(function* () {
    const embeddings = yield* Embeddings;
    const vectorStore = yield* VectorStore;
    const config = yield* retrievalConfig.parse(ConfigProvider.fromEnv());

    const retrieve = Effect.fn("Retriever.retrieve")(function* (query: string) {
      return yield* Effect.gen(function* () {
        const queryEmbedding = yield* embeddings.generate(query, "query", 0);

        const results = yield* vectorStore.search(queryEmbedding.vector, config.topK);

        const filtered = results.filter(
          (result: SearchResult) => result.score >= config.minScore,
        );

        return filtered;
      }).pipe(
        Effect.catchTag("EmbeddingError", (_error: unknown) =>
          new RetrievalError({ query, cause: _error }).asEffect(),
        ),
        Effect.catchTag("VectorStoreError", (_error: unknown) =>
          new RetrievalError({ query, cause: _error }).asEffect(),
        ),
      );
    });

    const retrieveWithScores = Effect.fn("Retriever.retrieveWithScores")(
      function* (query: string) {
        return yield* retrieve(query);
      },
    );

    return { retrieve, retrieveWithScores } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
