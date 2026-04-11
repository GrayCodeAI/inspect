import { Schema } from "effect";

export class RagError extends Schema.ErrorClass<RagError>("RagError")({
  _tag: Schema.tag("RagError"),
  reason: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `RAG operation failed: ${this.reason}`;
}

export class RetrievalError extends Schema.ErrorClass<RetrievalError>("RetrievalError")({
  _tag: Schema.tag("RetrievalError"),
  query: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to retrieve documents for query: ${this.query}`;
}

export class EmbeddingError extends Schema.ErrorClass<EmbeddingError>("EmbeddingError")({
  _tag: Schema.tag("EmbeddingError"),
  provider: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Embedding generation failed via ${this.provider}`;
}

export class DocumentLoadError extends Schema.ErrorClass<DocumentLoadError>(
  "DocumentLoadError",
)({
  _tag: Schema.tag("DocumentLoadError"),
  source: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Failed to load document from ${this.source}`;
}

export class VectorStoreError extends Schema.ErrorClass<VectorStoreError>("VectorStoreError")({
  _tag: Schema.tag("VectorStoreError"),
  operation: Schema.String,
  cause: Schema.Unknown,
}) {
  message = `Vector store operation "${this.operation}" failed`;
}
