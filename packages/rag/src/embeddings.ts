import { Config, ConfigProvider, Effect, Layer, Schema, ServiceMap } from "effect";
import { EmbeddingError } from "./errors.js";

export interface Embedding {
  readonly documentId: string;
  readonly vector: ReadonlyArray<number>;
  readonly chunkIndex: number;
}

const embeddingConfig = Config.all({
  provider: Config.withDefault(Config.string("EMBEDDING_PROVIDER"), "openai"),
  model: Config.withDefault(Config.string("EMBEDDING_MODEL"), "text-embedding-3-small"),
  apiKey: Config.string("OPENAI_API_KEY"),
  dimensions: Config.withDefault(Config.int("EMBEDDING_DIMENSIONS"), 1536),
});

export type EmbeddingConfig = Config.Success<typeof embeddingConfig>;

export class Embeddings extends ServiceMap.Service<Embeddings>()("@rag/Embeddings", {
  make: Effect.gen(function* () {
    const config = yield* embeddingConfig.parse(ConfigProvider.fromEnv());

    const generate = Effect.fn("Embeddings.generate")(
      function* (text: string, documentId: string, chunkIndex: number) {
        if (config.provider === "openai") {
          return yield* generateOpenAI(config.apiKey, config.model, text, documentId, chunkIndex);
        }

        return yield* new EmbeddingError({
          provider: config.provider,
          cause: `Unsupported embedding provider: ${config.provider}`,
        });
      },
    );

    const generateBatch = Effect.fn("Embeddings.generateBatch")(
      function* (
        texts: ReadonlyArray<{
          readonly text: string;
          readonly documentId: string;
          readonly chunkIndex: number;
        }>,
      ) {
        return yield* Effect.forEach(
          texts,
          ({ text, documentId, chunkIndex }: { text: string; documentId: string; chunkIndex: number }) =>
            generate(text, documentId, chunkIndex),
          {
            concurrency: "unbounded",
          },
        );
      },
    );

    return { generate, generateBatch } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

const generateOpenAI = Effect.fn("generateOpenAI")(
  function* (
    apiKey: string,
    model: string,
    text: string,
    documentId: string,
    chunkIndex: number,
  ) {
    return yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ input: text, model }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: ReadonlyArray<number> }>;
        };

        return {
          documentId,
          vector: data.data[0].embedding,
          chunkIndex,
        } satisfies Embedding;
      },
      catch: (cause: unknown) =>
        new EmbeddingError({
          provider: "openai",
          cause,
        }),
    });
  },
);
