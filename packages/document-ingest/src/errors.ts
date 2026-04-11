// ──────────────────────────────────────────────────────────────────────────────
// Document Ingest Errors
// ──────────────────────────────────────────────────────────────────────────────

import { Schema } from "effect";

export class DocumentIngestionError extends Schema.ErrorClass<DocumentIngestionError>(
  "DocumentIngestionError",
)({
  _tag: Schema.tag("DocumentIngestionError"),
  documentType: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  get displayMessage(): string {
    return `Document ingestion error${this.documentType ? ` (${this.documentType})` : ""}: ${this.message}`;
  }
}
