// ──────────────────────────────────────────────────────────────────────────────
// DOCX Ingestor Service
// ──────────────────────────────────────────────────────────────────────────────

import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import { DocumentIngestionError } from "./errors.js";

export class DocxDocument extends Schema.Class<DocxDocument>("DocxDocument")({
  content: Schema.String,
  paragraphs: Schema.Array(Schema.String),
  wordCount: Schema.Number,
}) {}

export interface DocxIngestorService {
  readonly extract: (filePath: string) => Effect.Effect<DocxDocument, DocumentIngestionError>;
}

export class DocxIngestor extends ServiceMap.Service<
  DocxIngestor,
  DocxIngestorService
>()("@inspect/DocxIngestor") {
  static layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const extract = (filePath: string) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan({ filePath });

          const exists = fsSync.existsSync(filePath);
          if (!exists) {
            return yield* new DocumentIngestionError({
              message: `DOCX file not found: ${filePath}`,
              documentType: "docx",
            });
          }

          yield* Effect.logInfo("DOCX file loaded", { path: filePath });

          const content = yield* Effect.tryPromise({
            try: () => fs.readFile(filePath, "utf-8"),
            catch: (cause) =>
              new DocumentIngestionError({
                message: `Failed to read file: ${filePath}`,
                documentType: "docx",
                cause,
              }),
          });

          const textContent = content
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          const paragraphs = textContent
            .split(/\n\s*\n/)
            .filter((p) => p.trim().length > 0);

          const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;

          const document = new DocxDocument({
            content: textContent,
            paragraphs,
            wordCount,
          });

          yield* Effect.logInfo("DOCX extracted successfully", {
            path: filePath,
            wordCount,
            paragraphCount: paragraphs.length,
          });

          return document;
        }).pipe(
          Effect.catchTag("DocumentIngestionError", Effect.fail),
          Effect.matchEffect({
            onSuccess: (doc) => Effect.succeed(doc),
            onFailure: (cause) =>
              Effect.fail(
                new DocumentIngestionError({
                  message: `Failed to extract DOCX: ${String(cause)}`,
                  documentType: "docx",
                  cause,
                }),
              ),
          }),
          Effect.withSpan("DocxIngestor.extract"),
        );

      return { extract } as const;
    }),
  );
}
