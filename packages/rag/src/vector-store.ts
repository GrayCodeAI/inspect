import { Effect, Layer, ServiceMap } from "effect";
import { VectorStoreError } from "./errors.js";
import type { Embedding } from "./embeddings.js";
import type { Document } from "./document-loader.js";

export interface SearchResult {
  readonly document: Document;
  readonly embedding: Embedding;
  readonly score: number;
}

class InMemoryVectorStore {
  private storeEntries: Array<{ document: Document; embedding: Embedding }> = [];

  add(document: Document, embedding: Embedding): void {
    this.storeEntries.push({ document, embedding });
  }

  addMany(entries: ReadonlyArray<{ document: Document; embedding: Embedding }>): void {
    this.storeEntries.push(...entries);
  }

  search(queryVector: ReadonlyArray<number>, topK: number): SearchResult[] {
    const scored = this.storeEntries.map(({ document, embedding }) => ({
      document,
      embedding,
      score: cosineSimilarity(queryVector, embedding.vector),
    }));

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  size(): number {
    return this.storeEntries.length;
  }

  clear(): void {
    this.storeEntries = [];
  }
}

function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

export class VectorStore extends ServiceMap.Service<VectorStore>()("@rag/VectorStore", {
  make: Effect.gen(function* () {
    const store = new InMemoryVectorStore();

    const add = Effect.fn("VectorStore.add")(function* (document: Document, embedding: Embedding) {
      store.add(document, embedding);
      return yield* Effect.void;
    });

    const addMany = Effect.fn("VectorStore.addMany")(function* (
      entries: ReadonlyArray<{ document: Document; embedding: Embedding }>,
    ) {
      store.addMany(entries);
      return yield* Effect.void;
    });

    const search = Effect.fn("VectorStore.search")(function* (
      queryVector: ReadonlyArray<number>,
      topK: number = 5,
    ) {
      if (topK <= 0) {
        return yield* new VectorStoreError({
          operation: "search",
          cause: "topK must be positive",
        });
      }
      return store.search(queryVector, topK);
    });

    const size = Effect.fn("VectorStore.size")(function* () {
      return store.size();
    });

    const clear = Effect.fn("VectorStore.clear")(function* () {
      store.clear();
      return yield* Effect.void;
    });

    return { add, addMany, search, size, clear } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}
